import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

let cached: string | null | undefined;

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findOnWindowsPath(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const result = spawnSync("where.exe", ["ffmpeg"], { encoding: "utf8" });
    const line = result.stdout?.trim().split(/\r?\n/).find(Boolean);
    if (line && exists(line)) return line;
  } catch {
    /* ignore */
  }
  return null;
}

function candidatePaths(): string[] {
  const paths: string[] = [];
  const execDir = process.execPath ? path.dirname(process.execPath) : "";

  if (process.env.FFMPEG_PATH) {
    paths.push(process.env.FFMPEG_PATH);
  }

  if (execDir) {
    paths.push(path.join(execDir, "ffmpeg.exe"));
    paths.push(path.join(execDir, "resources", "ffmpeg.exe"));
  }

  if (process.resourcesPath) {
    paths.push(path.join(process.resourcesPath, "ffmpeg.exe"));
    paths.push(
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "ffmpeg-static",
        "ffmpeg.exe",
      ),
    );
  }

  try {
    const mod = require("ffmpeg-static") as string | { default?: string };
    const fromPkg = typeof mod === "string" ? mod : mod?.default;
    if (fromPkg) paths.push(fromPkg);
  } catch {
    /* not installed */
  }

  const onPath = findOnWindowsPath();
  if (onPath) paths.push(onPath);

  return paths;
}

export function resolveFfmpegBin(): string | null {
  if (cached !== undefined) return cached;

  for (const candidate of candidatePaths()) {
    if (candidate && exists(candidate)) {
      cached = candidate;
      return cached;
    }
  }

  cached = null;
  return null;
}

export function ffmpegRtspInputArgs(transport: "tcp" | "udp" = "tcp"): string[] {
  return [
    "-rtsp_transport",
    transport,
    "-timeout",
    "5000000",
    "-probesize",
    "32768",
    "-analyzeduration",
    "100000",
  ];
}
