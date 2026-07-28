#!/usr/bin/env node
/**
 * Publish release files to the frontend public/downloads directory.
 * Copies: portable zip, NSIS installer, and latest.yml (for auto-update).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");
const destDir = path.resolve(root, "../frontend/public/downloads");

const filesToCopy = [
  "BuktiScanAgent-portable.zip",
  "BuktiScanAgent-Setup.exe",
  "latest.yml",
];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Created directory: ${destDir}`);
}

let ok = 0;
let missing = 0;
for (const name of filesToCopy) {
  const src = path.join(releaseDir, name);
  const dest = path.join(destDir, name);
  if (!fs.existsSync(src)) {
    console.warn(`⚠ Not found (skipping): ${name}`);
    missing++;
    continue;
  }
  fs.copyFileSync(src, dest);
  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  console.log(`✓ Copied ${name} (${size} MB) → ${dest}`);
  ok++;
}

console.log(`\nDone: ${ok} copied, ${missing} missing.`);
if (missing > 0) process.exit(1);
