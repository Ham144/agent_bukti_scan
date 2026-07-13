import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { buildLocalClipPath, buildMonthlyClipDir } from "./clip-storage";
import { ffmpegRtspInputArgs, resolveFfmpegBin } from "./ffmpeg-bin";

/** Wait up to 15s for first RTSP data — Hikvision often needs >2s after reconnect. */
const RECORD_VERIFY_MS = 15_000;
/** Bytes required to consider first segment "alive" (substream may be low bitrate). */
const RECORD_VERIFY_MIN_BYTES = 8_192;
/** Full segment threshold for concat list. */
const RECORD_MIN_BYTES = 65_536;
const SEGMENT_MAX_RETRIES = 8;
const SEGMENT_RETRY_DELAY_MS = 600;
const STOP_WAIT_MS = 4_000;
/** Cooldown after stopping previous stream on same CCTV. */
const POST_CCTV_STOP_MS = 1_500;

interface RecordingSession {
  key: string;
  scanId: string;
  invoiceNumber: string;
  rtspUrl: string;
  partsDir: string;
  outputPath: string;
  segmentIndex: number;
  segmentRetries: number;
  transport: "tcp" | "udp";
  lastFfmpegError: string;
  stopping: boolean;
  proc: ChildProcess | null;
}

export function safeInvoiceName(invoiceNumber: string): string {
  return invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function segmentTransportForRetry(retry: number): "tcp" | "udp" {
  return retry % 2 === 0 ? "tcp" : "udp";
}

export function isFirstSegmentReady(
  bytes: number,
  segmentIndex: number,
): boolean {
  if (segmentIndex > 0) return true;
  return bytes >= RECORD_VERIFY_MIN_BYTES;
}

export class LocalRecorder {
  private sessions = new Map<string, RecordingSession>();

  private sessionKey(cctvConfigId: string, invoiceNumber: string): string {
    return `${cctvConfigId}:${invoiceNumber}`;
  }

  private getPartsDir(clipsDir: string, invoiceNumber: string): string {
    const dir = path.join(
      clipsDir,
      "_parts",
      safeInvoiceName(invoiceNumber),
    );
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private getSegmentPath(partsDir: string, index: number): string {
    return path.join(partsDir, `seg_${String(index).padStart(3, "0")}.ts`);
  }

  private clipByteSize(filePath: string): number {
    try {
      if (fs.existsSync(filePath)) return fs.statSync(filePath).size;
    } catch {
      /* ignore */
    }
    return 0;
  }

  private listSegmentFiles(partsDir: string): string[] {
    if (!fs.existsSync(partsDir)) return [];
    return fs
      .readdirSync(partsDir)
      .filter((name) => /^seg_\d+\.ts$/.test(name))
      .sort()
      .map((name) => path.join(partsDir, name))
      .filter((filePath) => this.clipByteSize(filePath) >= RECORD_MIN_BYTES);
  }

  private buildSegmentArgs(
    rtspUrl: string,
    segmentPath: string,
    transport: "tcp" | "udp",
  ): string[] {
    return [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...ffmpegRtspInputArgs(transport),
      "-i",
      rtspUrl.trim(),
      "-c",
      "copy",
      "-f",
      "mpegts",
      segmentPath,
    ];
  }

  private async waitForProcessExit(
    proc: ChildProcess,
    timeoutMs: number,
  ): Promise<void> {
    if (proc.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
        resolve();
      }, timeoutMs);
      proc.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private async concatSegments(
    partsDir: string,
    outputPath: string,
  ): Promise<void> {
    const segments = this.listSegmentFiles(partsDir);
    if (segments.length === 0) {
      throw new Error("Tidak ada segmen video untuk digabung");
    }
    if (segments.length === 1) {
      fs.copyFileSync(segments[0], outputPath);
      return;
    }

    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin) throw new Error("FFmpeg tidak tersedia");

    const listPath = path.join(partsDir, "concat.txt");
    const listBody = segments
      .map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, listBody);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegBin,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          outputPath,
        ],
        { stdio: ["ignore", "ignore", "ignore"] },
      );
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error("Gagal menggabungkan segmen video"));
      });
    });
  }

  private cleanupParts(partsDir: string): void {
    try {
      fs.rmSync(partsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  private spawnSegment(session: RecordingSession): void {
    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin || session.stopping) return;

    session.transport = segmentTransportForRetry(session.segmentRetries);

    const segmentPath = this.getSegmentPath(
      session.partsDir,
      session.segmentIndex,
    );
    const proc = spawn(
      ffmpegBin,
      this.buildSegmentArgs(session.rtspUrl, segmentPath, session.transport),
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    session.proc = proc;

    const stderrChunks: Buffer[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (stderrChunks.length > 8) stderrChunks.shift();
    });

    proc.on("exit", () => {
      session.proc = null;
      if (session.stopping) return;

      const errText = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (errText) session.lastFfmpegError = errText.slice(-240);

      const segmentSize = this.clipByteSize(segmentPath);
      if (segmentSize >= RECORD_MIN_BYTES) {
        session.segmentIndex += 1;
        session.segmentRetries = 0;
        setTimeout(() => this.spawnSegment(session), SEGMENT_RETRY_DELAY_MS);
        return;
      }

      try {
        if (fs.existsSync(segmentPath)) fs.unlinkSync(segmentPath);
      } catch {
        /* ignore */
      }

      session.segmentRetries += 1;
      if (session.segmentRetries >= SEGMENT_MAX_RETRIES) return;
      setTimeout(() => this.spawnSegment(session), SEGMENT_RETRY_DELAY_MS);
    });
  }

  private async waitForFirstSegment(session: RecordingSession): Promise<boolean> {
    const firstSegment = this.getSegmentPath(session.partsDir, 0);
    const deadline = Date.now() + RECORD_VERIFY_MS;

    while (Date.now() < deadline) {
      const bytes = this.clipByteSize(firstSegment);
      if (isFirstSegmentReady(bytes, session.segmentIndex)) return true;
      if (session.segmentRetries >= SEGMENT_MAX_RETRIES && !session.proc) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    return isFirstSegmentReady(
      this.clipByteSize(firstSegment),
      session.segmentIndex,
    );
  }

  private recordingErrorMessage(session: RecordingSession): string {
    const base =
      "CCTV tidak dapat diakses — pastikan kamera menyala dan stream RTSP tersedia";
    if (!session.lastFfmpegError) return base;
    const hint = session.lastFfmpegError.replace(/\s+/g, " ").slice(0, 120);
    return `${base} (${hint})`;
  }

  private async finalizeSession(session: RecordingSession): Promise<string | null> {
    session.stopping = true;

    if (session.proc && session.proc.exitCode === null) {
      session.proc.kill("SIGINT");
      await this.waitForProcessExit(session.proc, STOP_WAIT_MS);
    }

    const segments = this.listSegmentFiles(session.partsDir);
    if (segments.length > 0) {
      await this.concatSegments(session.partsDir, session.outputPath);
    }

    this.cleanupParts(session.partsDir);
    this.sessions.delete(session.key);

    return fs.existsSync(session.outputPath) ? session.outputPath : null;
  }

  async stopForCctv(cctvConfigId: string): Promise<void> {
    const prefix = `${cctvConfigId}:`;
    const keys = [...this.sessions.keys()].filter((k) => k.startsWith(prefix));
    await Promise.all(
      keys.map((key) => {
        const session = this.sessions.get(key);
        if (!session) return Promise.resolve();
        return this.finalizeSession(session);
      }),
    );
  }

  async stop(scanId: string): Promise<string | null> {
    const session = [...this.sessions.values()].find((s) => s.scanId === scanId);
    if (!session) return null;
    return this.finalizeSession(session);
  }

  isRecordingForCctv(cctvConfigId: string): boolean {
    const prefix = `${cctvConfigId}:`;
    return [...this.sessions.keys()].some((k) => k.startsWith(prefix));
  }

  getRecordingInvoiceForCctv(cctvConfigId: string): string | null {
    const prefix = `${cctvConfigId}:`;
    const session = [...this.sessions.values()].find((s) =>
      s.key.startsWith(prefix),
    );
    return session?.invoiceNumber ?? null;
  }

  getRecordingScanIdForCctv(cctvConfigId: string): string | null {
    const prefix = `${cctvConfigId}:`;
    const session = [...this.sessions.values()].find((s) =>
      s.key.startsWith(prefix),
    );
    return session?.scanId ?? null;
  }

  isRecording(scanId: string): boolean {
    return [...this.sessions.values()].some((s) => s.scanId === scanId);
  }

  hasActiveRecordings(): boolean {
    return this.sessions.size > 0;
  }

  async start(params: {
    scanId: string;
    cctvConfigId: string;
    invoiceNumber: string;
    rtspUrl: string;
    clipsDir: string;
  }): Promise<string> {
    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin) throw new Error("FFmpeg tidak tersedia");

    await this.stopForCctv(params.cctvConfigId);
    await new Promise((r) => setTimeout(r, POST_CCTV_STOP_MS));

    const monthlyDir = buildMonthlyClipDir(params.clipsDir);
    fs.mkdirSync(monthlyDir, { recursive: true });
    const outputPath = buildLocalClipPath(
      params.clipsDir,
      params.invoiceNumber,
    );
    const partsDir = this.getPartsDir(params.clipsDir, params.invoiceNumber);
    this.cleanupParts(partsDir);
    fs.mkdirSync(partsDir, { recursive: true });

    const key = this.sessionKey(params.cctvConfigId, params.invoiceNumber);
    const session: RecordingSession = {
      key,
      scanId: params.scanId,
      invoiceNumber: params.invoiceNumber,
      rtspUrl: params.rtspUrl,
      partsDir,
      outputPath,
      segmentIndex: 0,
      segmentRetries: 0,
      transport: "tcp",
      lastFfmpegError: "",
      stopping: false,
      proc: null,
    };

    this.sessions.set(key, session);
    this.spawnSegment(session);

    const ready = await this.waitForFirstSegment(session);
    if (!ready) {
      await this.finalizeSession(session);
      throw new Error(this.recordingErrorMessage(session));
    }

    return outputPath;
  }
}
