import { spawn } from "child_process";
import { ffmpegRtspInputArgs, resolveFfmpegBin } from "./ffmpeg-bin";

const FFMPEG_SNAPSHOT_MS = 8_000;

function isJpeg(buf: Buffer): boolean {
  return buf.length > 100 && buf[0] === 0xff && buf[1] === 0xd8;
}

export async function captureCctvSnapshot(rtspUrl: string): Promise<Buffer> {
  const ffmpegBin = resolveFfmpegBin();
  if (!ffmpegBin) {
    throw new Error("FFmpeg tidak ditemukan — install FFmpeg di PC kasir");
  }

  const errors: string[] = [];

  for (const transport of ["tcp", "udp"] as const) {
    try {
      return await captureFfmpeg(ffmpegBin, rtspUrl, transport);
    } catch (err) {
      errors.push(
        `${transport}${err instanceof Error ? `: ${err.message}` : ""}`,
      );
    }
  }

  throw new Error(
    `Snapshot gagal — ${errors.join(" | ")}. Pastikan kamera menyala dan RTSP benar.`,
  );
}

function captureFfmpeg(
  ffmpegBin: string,
  rtspUrl: string,
  transport: "tcp" | "udp",
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(ffmpegBin, [
      "-hide_banner",
      "-loglevel",
      "error",
      ...ffmpegRtspInputArgs(transport),
      "-i",
      rtspUrl.trim(),
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ]);

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("timeout"));
    }, FFMPEG_SNAPSHOT_MS);

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (isJpeg(buf)) {
        resolve(buf);
        return;
      }
      reject(new Error(`exit ${code ?? "unknown"}`));
    });
  });
}
