import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { monthlyClipsSubdir } from "./clip-storage";
import { listLocalClipFiles, resolveClipPath } from "./local-clips";
import { safeInvoiceName } from "./recorder";

describe("safeInvoiceName", () => {
  it("sanitizes special characters", () => {
    expect(safeInvoiceName("INV/001#x")).toBe("INV_001_x");
  });
});

describe("listLocalClipFiles", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("lists mp4 files in monthly subfolder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-clips-"));
    dirs.push(dir);
    const monthDir = path.join(dir, monthlyClipsSubdir());
    fs.mkdirSync(monthDir, { recursive: true });
    fs.writeFileSync(path.join(monthDir, "INV002.mp4"), Buffer.alloc(100_000));

    const clips = listLocalClipFiles(dir);
    expect(clips).toHaveLength(1);
    expect(clips[0].invoiceNumber).toBe("INV002");
  });

  it("lists mp4 files in clips dir", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-clips-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, "INV001.mp4"), Buffer.alloc(100_000));
    fs.writeFileSync(path.join(dir, "readme.txt"), "x");

    const clips = listLocalClipFiles(dir);
    expect(clips).toHaveLength(1);
    expect(clips[0].invoiceNumber).toBe("INV001");
  });

  it("returns empty for missing dir", () => {
    expect(listLocalClipFiles("/nonexistent/path")).toEqual([]);
  });

  it("lists files from both primary and secondary directories", () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-clips1-"));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-clips2-"));
    dirs.push(dir1, dir2);

    fs.writeFileSync(path.join(dir1, "INV001.mp4"), Buffer.alloc(100_000));
    fs.writeFileSync(path.join(dir2, "INV002.mp4"), Buffer.alloc(100_000));

    const clips = listLocalClipFiles(dir1, dir2);
    expect(clips).toHaveLength(2);
    const invoices = clips.map(c => c.invoiceNumber);
    expect(invoices).toContain("INV001");
    expect(invoices).toContain("INV002");
  });
});

describe("resolveClipPath", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("resolves clip in monthly subfolder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-resolve-month-"));
    dirs.push(dir);
    const monthDir = path.join(dir, monthlyClipsSubdir());
    fs.mkdirSync(monthDir, { recursive: true });
    const filePath = path.join(monthDir, "INV002.mp4");
    fs.writeFileSync(filePath, Buffer.alloc(70_000));

    expect(resolveClipPath(dir, "INV002")).toBe(filePath);
  });

  it("returns path when file large enough", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-resolve-"));
    dirs.push(dir);
    const filePath = path.join(dir, "INV001.mp4");
    fs.writeFileSync(filePath, Buffer.alloc(70_000));

    expect(resolveClipPath(dir, "INV001")).toBe(filePath);
  });

  it("returns null when file too small", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-small-"));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, "INV001.mp4"), Buffer.alloc(100));

    expect(resolveClipPath(dir, "INV001")).toBeNull();
  });

  it("resolves clip from secondary directory when not in primary", () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-resolve1-"));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "BuktiScan-resolve2-"));
    dirs.push(dir1, dir2);

    const filePath = path.join(dir2, "INV002.mp4");
    fs.writeFileSync(filePath, Buffer.alloc(70_000));

    expect(resolveClipPath(dir1, "INV002", dir2)).toBe(filePath);
    expect(resolveClipPath(dir1, "INV002")).toBeNull();
  });
});
