import fs from "fs";
import path from "path";
import {
  MONTHLY_CLIPS_DIR_PATTERN,
  safeInvoiceFileName,
} from "./clip-storage";

export const MIN_CLIP_BYTES = 65536;

export interface LocalClipFile {
  invoiceNumber: string;
  localClipPath: string;
  sizeBytes: number;
}

function isValidClipFile(filePath: string): LocalClipFile | null {
  const name = path.basename(filePath);
  if (!name.toLowerCase().endsWith(".mp4")) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < MIN_CLIP_BYTES) return null;
    return {
      invoiceNumber: name.replace(/\.mp4$/i, ""),
      localClipPath: filePath,
      sizeBytes: stat.size,
    };
  } catch {
    return null;
  }
}

function listMp4InDir(dir: string): LocalClipFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .map((filePath) => isValidClipFile(filePath))
    .filter((row): row is LocalClipFile => row !== null);
}

function listMonthlyClipDirs(clipsDir: string): string[] {
  if (!fs.existsSync(clipsDir)) return [];
  return fs
    .readdirSync(clipsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        MONTHLY_CLIPS_DIR_PATTERN.test(entry.name) &&
        entry.name !== "_parts",
    )
    .map((entry) => path.join(clipsDir, entry.name))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
}

export function listLocalClipFiles(clipsDir: string): LocalClipFile[] {
  if (!clipsDir || !fs.existsSync(clipsDir)) return [];

  const byInvoice = new Map<string, LocalClipFile>();

  for (const clip of listMp4InDir(clipsDir)) {
    byInvoice.set(clip.invoiceNumber, clip);
  }

  for (const monthDir of listMonthlyClipDirs(clipsDir)) {
    for (const clip of listMp4InDir(monthDir)) {
      if (!byInvoice.has(clip.invoiceNumber)) {
        byInvoice.set(clip.invoiceNumber, clip);
      }
    }
  }

  return [...byInvoice.values()];
}

export function resolveClipPath(
  clipsDir: string,
  invoiceNumber: string,
): string | null {
  const fileName = `${safeInvoiceFileName(invoiceNumber)}.mp4`;

  for (const monthDir of listMonthlyClipDirs(clipsDir)) {
    const monthlyPath = path.join(monthDir, fileName);
    const clip = isValidClipFile(monthlyPath);
    if (clip) return clip.localClipPath;
  }

  const legacyPath = path.join(clipsDir, fileName);
  const legacyClip = isValidClipFile(legacyPath);
  return legacyClip?.localClipPath ?? null;
}

export function findClipFilePath(
  clipsDir: string,
  invoiceSafe: string,
): string | null {
  return resolveClipPath(clipsDir, invoiceSafe);
}
