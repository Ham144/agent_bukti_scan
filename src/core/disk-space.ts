import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

/** Peringatan disk rendah di bawah 5 GB. */
export const DISK_LOW_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024;

export function resolveProbePath(targetPath: string): string | null {
  let probe = path.resolve(targetPath);
  if (fs.existsSync(probe)) {
    try {
      if (fs.statSync(probe).isFile()) {
        probe = path.dirname(probe);
      }
    } catch {
      return null;
    }
    return probe;
  }

  let parent = path.dirname(probe);
  while (parent !== probe) {
    if (fs.existsSync(parent)) return parent;
    parent = path.dirname(parent);
  }
  return null;
}

function getFreeBytesWindows(probe: string): number | null {
  const root = path.parse(probe).root;
  const driveLetter = root.replace(/[\\/:]/g, "").charAt(0);
  if (!driveLetter) return null;

  try {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `(Get-PSDrive -Name '${driveLetter}' -PSProvider FileSystem -ErrorAction Stop).Free`,
      ],
      { encoding: "utf8", timeout: 8_000, windowsHide: true },
    );
    const parsed = Number.parseInt(result.stdout?.trim() ?? "", 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function getFreeBytesForPath(targetPath: string): number | null {
  const probe = resolveProbePath(targetPath);
  if (!probe) return null;

  try {
    const statfs = (
      fs as typeof fs & {
        statfsSync?: (p: string) => { bfree: number; bsize: number };
      }
    ).statfsSync?.(probe);
    if (
      statfs &&
      typeof statfs.bfree === "number" &&
      typeof statfs.bsize === "number"
    ) {
      return statfs.bfree * statfs.bsize;
    }
  } catch {
    /* ignore */
  }

  if (process.platform === "win32") {
    return getFreeBytesWindows(probe);
  }

  return null;
}

export function isDiskLow(freeBytes: number | null): boolean {
  if (freeBytes == null) return false;
  return freeBytes < DISK_LOW_THRESHOLD_BYTES;
}

export function formatFreeBytes(freeBytes: number | null): string {
  if (freeBytes == null) return "—";
  const gb = freeBytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = freeBytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
}
