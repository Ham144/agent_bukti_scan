import fs from "fs";
import path from "path";

export const MONTHLY_CLIPS_DIR_PATTERN = /^\d{4}-\d{2}$/;

export function safeInvoiceFileName(invoiceNumber: string): string {
  return invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Subfolder per bulan, mis. `2025-06`. */
export function monthlyClipsSubdir(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function buildMonthlyClipDir(
  clipsDir: string,
  date: Date = new Date(),
): string {
  return path.join(clipsDir, monthlyClipsSubdir(date));
}

export function buildLocalClipPath(
  clipsDir: string,
  invoiceNumber: string,
  operatorName?: string | null,
  date: Date = new Date(),
): string {
  const safeInvoice = safeInvoiceFileName(invoiceNumber);
  const safeOperator = operatorName
    ? operatorName.replace(/[^a-zA-Z0-9_-]/g, "_")
    : "Operator";

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const timeStr = `${hh}${mm}${ss}`;

  const prefix = `${safeInvoice}--${safeOperator}--`;
  const monthlyDir = buildMonthlyClipDir(clipsDir, date);

  let matchCount = 0;
  if (fs.existsSync(monthlyDir)) {
    const files = fs.readdirSync(monthlyDir);
    for (const file of files) {
      if (file.startsWith(prefix) && file.toLowerCase().endsWith(".mp4")) {
        matchCount++;
      }
    }
  }

  const suffix = matchCount > 0 ? ` (${matchCount + 1})` : "";
  const baseName = `${prefix}${timeStr}${suffix}`;

  let fileName = `${baseName}.mp4`;
  let fullPath = path.join(monthlyDir, fileName);

  let counter = matchCount > 0 ? matchCount + 2 : 2;
  while (fs.existsSync(fullPath)) {
    fileName = `${prefix}${timeStr} (${counter}).mp4`;
    fullPath = path.join(monthlyDir, fileName);
    counter++;
  }

  return fullPath;
}

