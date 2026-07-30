import fs from "fs";
import http from "http";
import { findClipFilePath } from "./local-clips";

export const LOCAL_MEDIA_PORT = 19500;

export class LocalMediaServer {
  private server: http.Server | null = null;
  private clipsDir = "";
  private clipsDirSecondary = "";

  start(clipsDir: string, clipsDirSecondary?: string): void {
    if (this.server) {
      this.clipsDir = clipsDir;
      this.clipsDirSecondary = clipsDirSecondary || "";
      return;
    }

    this.clipsDir = clipsDir;
    this.clipsDirSecondary = clipsDirSecondary || "";
    this.server = http.createServer((req, res) => {
      // Izinkan CORS agar frontend web admin di luar host bisa memutar/mendownload video
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://127.0.0.1:${LOCAL_MEDIA_PORT}`);

      const clipMatch = url.pathname.match(/^\/clips\/(.+)\.mp4$/);
      if (!clipMatch) {
        res.writeHead(404);
        res.end();
        return;
      }

      const invoiceSafe = decodeURIComponent(clipMatch[1]);
      const filePath = findClipFilePath(this.clipsDir, invoiceSafe, this.clipsDirSecondary);
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const stat = fs.statSync(filePath);
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace("bytes=", "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": stat.size,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).pipe(res);
      }
    });

    this.server.listen(LOCAL_MEDIA_PORT, "0.0.0.0");
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.clipsDir = "";
      this.clipsDirSecondary = "";
    }
  }
}

export { buildLocalClipPath as clipFilePath } from "./clip-storage";
