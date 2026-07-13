import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "node_modules", "ffmpeg-static", "ffmpeg.exe");

if (fs.existsSync(dest)) {
  const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  process.stdout.write(`ffmpeg.exe sudah ada (${mb} MB)\n`);
  process.exit(0);
}

process.stdout.write("Mengunduh ffmpeg.exe (Windows x64) untuk bundle agent...\n");

const result = spawnSync(
  process.execPath,
  [path.join(root, "node_modules", "ffmpeg-static", "install.js")],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_platform: "win32",
      npm_config_arch: "x64",
    },
  },
);

if (result.status !== 0 || !fs.existsSync(dest)) {
  process.stderr.write(
    "Gagal mengunduh ffmpeg.exe. Cek koneksi internet lalu jalankan ulang pnpm ensure:ffmpeg:win\n",
  );
  process.exit(1);
}

const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
process.stdout.write(`ffmpeg.exe siap (${mb} MB)\n`);
