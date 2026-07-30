import { ChildProcess, spawn, spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { resolveGo2RtcBin } from "./go2rtc-bin";
import {
  go2rtcUpsertStreamQuery,
} from "./go2rtc-api";
import { GO2RTC_API_PORT, GO2RTC_API_BASE } from "./go2rtc-constants";
import { toGo2RtcRtspSource } from "./go2rtc-rtsp";

export { GO2RTC_API_PORT, GO2RTC_API_BASE };

const API_READY_TIMEOUT_MS = 20_000;
const API_READY_POLL_MS = 200;
const AUTO_RESTART_DELAY_MS = 3_000;
const IDLE_KILL_MS = 8_000;

export function go2rtcStreamName(cctvId: string): string {
  return `cctv_${cctvId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

export function go2rtcMjpegUrl(streamName: string): string {
  return `${GO2RTC_API_BASE}/api/stream.mjpeg?src=${encodeURIComponent(streamName)}`;
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Bunuh go2rtc.exe yatim dari sesi agent sebelumnya (Windows). */
function killStaleGo2RtcProcesses(): void {
  if (process.platform !== "win32") return;
  try {
    spawnSync("taskkill", ["/F", "/IM", "go2rtc.exe"], { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

export class Go2RtcPreviewManager {
  private proc: ChildProcess | null = null;
  private monitorStreams = new Map<string, string>();
  private cameraStream: { cctvId: string; rtspUrl: string } | null = null;
  private processError = "";
  private restartTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private monitorStarted = false;
  private configPath: string;
  private readyPromise: Promise<void> | null = null;
  private configFingerprint = "";

  constructor() {
    this.configPath = path.join(os.tmpdir(), "bukti-scan-go2rtc.yaml");
    this.writeConfig(new Map());
  }

  streamName(cctvId: string): string {
    return go2rtcStreamName(cctvId);
  }

  warmUp(cctvId: string, rtspUrl: string): void {
    this.monitorStreams.set(cctvId, rtspUrl);
    this.clearIdleTimer();
  }

  async start(): Promise<void> {
    this.monitorStarted = true;
    this.clearIdleTimer();
    await this.applyStreams();
  }

  async resync(): Promise<void> {
    this.clearIdleTimer();
    if (this.effectiveStreams().size === 0) return;
    await this.applyStreams();
  }

  async waitStreamReady(cctvId: string, timeoutMs = 12_000): Promise<void> {
    const name = go2rtcStreamName(cctvId);
    await this.waitStreamRegistered(name, timeoutMs);
  }

  stopAll(): void {
    this.monitorStarted = false;
    this.monitorStreams.clear();
    if (!this.cameraStream) {
      void this.scheduleIdleKill();
    } else {
      void this.applyStreams();
    }
  }

  stop(cctvId: string): void {
    if (!this.monitorStreams.has(cctvId)) return;
    this.monitorStreams.delete(cctvId);
    if (this.monitorStarted) {
      void this.applyStreams();
    }
  }

  async startCamera(cctvId: string, rtspUrl: string): Promise<void> {
    this.cameraStream = { cctvId, rtspUrl };
    this.clearIdleTimer();
    await this.applyStreams();
  }

  async stopCamera(cctvId: string): Promise<void> {
    if (this.cameraStream?.cctvId !== cctvId) return;
    this.cameraStream = null;
    if (this.effectiveStreams().size === 0) {
      void this.scheduleIdleKill();
    } else {
      await this.applyStreams();
    }
  }

  async refreshStream(cctvId: string, rtspUrl: string): Promise<void> {
    if (this.monitorStreams.has(cctvId)) {
      this.monitorStreams.set(cctvId, rtspUrl);
    }
    if (this.cameraStream?.cctvId === cctvId) {
      this.cameraStream = { cctvId, rtspUrl };
    }
    await this.applyStreams();
  }

  getLastError(_cctvId: string): string | null {
    if (this.processError) return this.processError.slice(0, 200);
    return null;
  }

  private effectiveStreams(): Map<string, string> {
    const all = new Map<string, string>();
    if (this.monitorStarted) {
      for (const [id, url] of this.monitorStreams) {
        all.set(id, url);
      }
    }
    if (this.cameraStream) {
      all.set(this.cameraStream.cctvId, this.cameraStream.rtspUrl);
    }
    return all;
  }

  private streamsFingerprint(streams: Map<string, string>): string {
    return [...streams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, url]) => `${id}\0${url}`)
      .join("\n");
  }

  private writeConfig(streams: Map<string, string>): void {
    const streamBlocks = [...streams.entries()]
      .map(([cctvId, url]) => {
        const name = go2rtcStreamName(cctvId);
        const src = yamlQuote(toGo2RtcRtspSource(url));
        return `  ${name}:\n    - ${src}`;
      })
      .join("\n");

    const yaml = [
      "api:",
      `  listen: "0.0.0.0:${GO2RTC_API_PORT}"`,
      "",
      "rtsp:",
      '  listen: "0.0.0.0:8554"',
      "",
      "webrtc:",
      '  listen: "0.0.0.0:8555"',
      "  ice_servers: []",
      "  filters:",
      "    loopback: true",
      "",
      "log:",
      "  level: info",
      "",
      streams.size > 0 ? "streams:" : "streams: {}",
      streamBlocks,
    ]
      .filter(Boolean)
      .join("\n");

    fs.writeFileSync(this.configPath, yaml, "utf8");
  }

  private async applyStreams(): Promise<void> {
    const streams = this.effectiveStreams();
    const fingerprint = this.streamsFingerprint(streams);

    if (streams.size === 0) {
      return;
    }

    const configChanged = fingerprint !== this.configFingerprint;
    if (configChanged) {
      this.writeConfig(streams);
      this.configFingerprint = fingerprint;
      this.killProcess();
      killStaleGo2RtcProcesses();
      await sleep(400);
    }

    await this.ensureProcess();

    for (const [cctvId, rtspUrl] of streams) {
      const name = go2rtcStreamName(cctvId);
      const src = toGo2RtcRtspSource(rtspUrl);
      await this.upsertStreamApi(name, src);
    }

    const names = [...streams.keys()].map((id) => go2rtcStreamName(id));
    await Promise.all(
      names.map((name) => this.waitStreamRegistered(name, 12_000)),
    );
  }

  private async upsertStreamApi(name: string, rtspSrc: string): Promise<void> {
    const q = go2rtcUpsertStreamQuery(name, rtspSrc);
    let res = await fetch(`${GO2RTC_API_BASE}/api/streams?${q}`, {
      method: "PUT",
    });
    if (!res.ok) {
      res = await fetch(`${GO2RTC_API_BASE}/api/streams?${q}`, {
        method: "PATCH",
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Gagal daftar stream ${name}: ${res.status}${body ? ` ${body.slice(0, 60)}` : ""}`,
      );
    }
  }

  private async ensureProcess(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    const go2rtcBin = resolveGo2RtcBin();
    if (!go2rtcBin) {
      this.processError =
        "go2rtc tidak tersedia — pastikan go2rtc.exe ada di folder agent";
      throw new Error(this.processError);
    }

    const ownsLiveProc =
      this.proc !== null && this.proc.exitCode === null && !this.proc.killed;

    if (ownsLiveProc && (await this.pingApi())) {
      return;
    }

    this.killProcess();
    if (await this.pingApi()) {
      killStaleGo2RtcProcesses();
      await sleep(400);
    }

    this.readyPromise = this.spawnAndWait(go2rtcBin);
    try {
      await this.readyPromise;
      this.processError = "";
    } finally {
      this.readyPromise = null;
    }
  }

  private spawnAndWait(go2rtcBin: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(go2rtcBin, ["-config", this.configPath], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        cwd: path.dirname(go2rtcBin),
      });

      this.proc = proc;
      const stderrChunks: Buffer[] = [];
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
        if (stderrChunks.length > 16) stderrChunks.shift();
      });

      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      proc.on("exit", (code) => {
        this.proc = null;
        const errText = Buffer.concat(stderrChunks).toString("utf8").trim();
        if (errText) this.processError = errText.slice(-400);

        if (this.effectiveStreams().size > 0 && !this.restartTimer) {
          this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            void this.applyStreams().catch(() => {});
          }, AUTO_RESTART_DELAY_MS);
        }
        if (!settled) {
          fail(
            new Error(this.processError || `go2rtc berhenti (kode ${code ?? "?"})`),
          );
        }
      });

      const deadline = Date.now() + API_READY_TIMEOUT_MS;
      const poll = () => {
        void this.pingApi().then((alive) => {
          if (alive) {
            ok();
            return;
          }
          if (Date.now() >= deadline) {
            proc.kill();
            fail(new Error("go2rtc tidak merespons di port 1984"));
            return;
          }
          setTimeout(poll, API_READY_POLL_MS);
        });
      };
      setTimeout(poll, 300);
    });
  }

  private pingApi(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`${GO2RTC_API_BASE}/api`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2_000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private async waitStreamRegistered(
    name: string,
    timeoutMs = 12_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.hasStream(name)) return;
      await sleep(200);
    }
    const listed = await this.listStreamNames();
    throw new Error(
      `Stream ${name} tidak ada di go2rtc (terdaftar: ${listed.join(", ") || "kosong"})`,
    );
  }

  private async listStreamNames(): Promise<string[]> {
    try {
      const res = await fetch(`${GO2RTC_API_BASE}/api/streams`);
      if (!res.ok) return [];
      const streams = (await res.json()) as Record<string, unknown>;
      return Object.keys(streams);
    } catch {
      return [];
    }
  }

  private async hasStream(name: string): Promise<boolean> {
    const names = await this.listStreamNames();
    return names.includes(name);
  }

  private scheduleIdleKill(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.effectiveStreams().size === 0) {
        this.configFingerprint = "";
        this.writeConfig(new Map());
        this.killProcess();
        killStaleGo2RtcProcesses();
      }
    }, IDLE_KILL_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private killProcess(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill();
    }
    this.proc = null;
  }
}
