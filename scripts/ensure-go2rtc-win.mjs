import { spawnSync } from "child_process";
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const destDir = path.join(root, "node_modules", "go2rtc-static");
const dest = path.join(destDir, "go2rtc.exe");

if (fs.existsSync(dest)) {
  const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  process.stdout.write(`go2rtc.exe sudah ada (${mb} MB)\n`);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

const url =
  "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.zip";
const zipPath = path.join(destDir, "go2rtc_win64.zip");

process.stdout.write("Mengunduh go2rtc.exe (Windows x64)...\n");

function download(downloadUrl, fileDest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(fileDest);
    const req = https.get(downloadUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        try {
          fs.unlinkSync(fileDest);
        } catch {
          /* ignore */
        }
        return download(res.headers.location, fileDest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", (err) => {
      try {
        fs.unlinkSync(fileDest);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

function extractZip(zipFile, outDir) {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zipFile.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      throw new Error("Gagal mengekstrak ZIP dengan PowerShell");
    }
    return;
  }

  const unzip = spawnSync("unzip", ["-o", zipFile, "-d", outDir], {
    stdio: "inherit",
  });
  if (unzip.status === 0) return;

  const bsdtar = spawnSync("tar", ["-xf", zipFile, "-C", outDir], {
    stdio: "inherit",
  });
  if (bsdtar.status === 0) return;

  throw new Error(
    "Gagal mengekstrak ZIP — install 'unzip' (apt install unzip) lalu jalankan ulang",
  );
}

try {
  await download(url, zipPath);

  process.stdout.write("Mengekstrak go2rtc.exe...\n");
  extractZip(zipPath, destDir);

  try {
    fs.unlinkSync(zipPath);
  } catch {
    /* ignore */
  }

  if (!fs.existsSync(dest)) {
    throw new Error("go2rtc.exe tidak ditemukan setelah ekstrak");
  }

  const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
  process.stdout.write(`go2rtc.exe siap (${mb} MB)\n`);
} catch (err) {
  process.stderr.write(
    `Gagal mengunduh go2rtc.exe: ${err.message}\nCek koneksi internet lalu jalankan ulang pnpm ensure:go2rtc:win\n`,
  );
  process.exit(1);
}
