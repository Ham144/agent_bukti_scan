import fs from "fs";
import http from "http";
import { findClipFilePath } from "./local-clips";

export const LOCAL_MEDIA_PORT = 19500;

export class LocalMediaServer {
  private server: http.Server | null = null;
  private clipsDir = "";

  start(clipsDir: string): void {
    if (this.server) {
      this.clipsDir = clipsDir;
      return;
    }

    this.clipsDir = clipsDir;
    this.server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${LOCAL_MEDIA_PORT}`);

      const clipMatch = url.pathname.match(/^\/clips\/(.+)\.mp4$/);
      if (!clipMatch) {
        res.writeHead(404);
        res.end();
        return;
      }

      const invoiceSafe = decodeURIComponent(clipMatch[1]);
      const filePath = findClipFilePath(this.clipsDir, invoiceSafe);
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

    this.server.listen(LOCAL_MEDIA_PORT, "127.0.0.1");
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.clipsDir = "";
    }
  }
}

export { buildLocalClipPath as clipFilePath } from "./clip-storage";
