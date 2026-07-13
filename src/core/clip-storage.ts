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
  date: Date = new Date(),
): string {
  return path.join(
    buildMonthlyClipDir(clipsDir, date),
    `${safeInvoiceFileName(invoiceNumber)}.mp4`,
  );
}
