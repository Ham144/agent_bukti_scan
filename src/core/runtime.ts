import fs from "fs";
import path from "path";
import { isAxiosError } from "axios";
import { AgentActiveRecording, AgentApiClient, AgentScannerConfig, AgentRecentScan } from "./api-client";
import { captureCctvSnapshot } from "./cctv-snapshot";
import { shouldReconnectSerial } from "./config-sync";
import { LocalMediaServer } from "./local-media-server";
import { Go2RtcPreviewManager, GO2RTC_API_BASE } from "./go2rtc-preview";
import { toPreviewSubstreamUrl } from "./rtsp-url";
import { AgentConfig, loadConfig, saveConfig } from "./config-store";
import { MONTHLY_CLIPS_DIR_PATTERN, monthlyClipsSubdir } from "./clip-storage";
import { listLocalClipFiles, resolveClipPath } from "./local-clips";
import {
  formatFreeBytes,
  getFreeBytesForPath,
  isDiskLow,
} from "./disk-space";
import { LocalRecorder } from "./recorder";
import { listSerialPorts, ListedSerialPort, SerialManager } from "./serial";
import {
  buildCameraDisconnectMessage,
  buildRecordingStartMessage,
  buildScannerDisconnectMessage,
  speak,
  TtsOptions,
  checkIndonesianVoiceWindows,
} from "./tts";

export const AGENT_VERSION = "0.1.3";

export interface ScannerLinkStatus {
  id: string;
  label: string;
  connected: boolean;
  portPath: string | null;
  usbLabel: string | null;
  error: string | null;
}

export interface MonitorCellStatus {
  cctvId: string;
  cctvLabel: string;
  scannerId: string;
  scannerLabel: string;
  operatorUsername: string | null;
  scannerConnected: boolean;
  state: "idle" | "recording" | "offline";
  invoiceNumber: string | null;
  scanId: string | null;
  remainingSec: number | null;
  previewSrc: string;
  go2rtcBaseUrl: string;
  previewError: string | null;
  scannedAt: string | null;
}

export interface RuntimeStatus {
  paired: boolean;
  recording: boolean;
  lastError: string | null;
  lastScan: string | null;
  busyMessage: string | null;
  clipsDir: string;
  workstationLabel: string | null;
  localClipCount: number;
  diskFreeBytes: number | null;
  diskLow: boolean;
  diskFreeLabel: string;
  scanners: ScannerLinkStatus[];
  configSyncedAt: string | null;
  clipRetentionDays: number;
  lastCleanupAt: string | null;
  lastCleanupDeleted: number;
  lastTtsError: string | null;
  startupError: string | null;
  recordingMaxDurationSec: number | null;
  hasIndonesianVoice: boolean;
  hideTtsLanguageWarning: boolean;
}

export class AgentRuntime {
  private config: AgentConfig;
  private api: AgentApiClient;
  private recorder = new LocalRecorder();
  private serial = new SerialManager();
  private mediaServer = new LocalMediaServer();
  private go2rtcPreview = new Go2RtcPreviewManager();
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private configSyncTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private monitorActive = false;
  private remoteConfig: Awaited<
    ReturnType<AgentApiClient["fetchConfig"]>
  > | null = null;
  private ingestLocks = new Set<string>();
  private globalIngestLock: Promise<void> = Promise.resolve();
  private reconcileLock = false;
  private isPolling = false;
  private startingScans = new Set<string>();
  private finishingScans = new Set<string>();
  private cctvGate = new Map<string, Promise<void>>();
  private lastActiveRecordings: AgentActiveRecording[] = [];
  private spokenScanIds = new Set<string>();
  private lastDisconnectTtsAt = new Map<string, number>();
  private busyMessageTimer: NodeJS.Timeout | null = null;
  private recordingStarts = new Map<string, string>();
  private status: RuntimeStatus = {
    paired: false,
    recording: false,
    lastError: null,
    lastScan: null,
    busyMessage: null,
    clipsDir: "",
    workstationLabel: null,
    localClipCount: 0,
    diskFreeBytes: null,
    diskLow: false,
    diskFreeLabel: "—",
    scanners: [],
    configSyncedAt: null,
    clipRetentionDays: 14,
    lastCleanupAt: null,
    lastCleanupDeleted: 0,
    lastTtsError: null,
    startupError: null,
    recordingMaxDurationSec: null,
    hasIndonesianVoice: true,
    hideTtsLanguageWarning: false,
  };

  constructor(config?: AgentConfig) {
    this.config = config ?? loadConfig();
    this.status.clipsDir = this.config.clipsDir;
    this.status.clipRetentionDays = this.config.clipRetentionDays ?? 14;
    this.api = new AgentApiClient(this.config);
    this.status.paired = Boolean(this.config.deviceToken);
  }

  getStatus(): RuntimeStatus {
    this.status.localClipCount = listLocalClipFiles(
      this.config.clipsDir,
    ).length;
    this.status.workstationLabel = this.config.workstationLabel ?? null;
    this.status.hasIndonesianVoice = checkIndonesianVoiceWindows();
    this.status.hideTtsLanguageWarning = !!this.config.hideTtsLanguageWarning;
    this.refreshDiskStatus();
    this.updateScannerStatus();
    return { ...this.status };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  setStartupError(message: string | null): void {
    this.status.startupError = message;
  }

  clearStartupError(): void {
    this.status.startupError = null;
  }

  /** Hapus token lokal agar agent kembali ke layar pairing. */
  unpair(): void {
    delete this.config.deviceToken;
    delete this.config.workstationId;
    delete this.config.organizationName;
    delete this.config.workstationLabel;
    saveConfig(this.config);
    this.status.paired = false;
    this.status.startupError = null;
    this.remoteConfig = null;
  }

  updateTtsSettings(settings: {
    ttsEnabled?: boolean;
    ttsVolume?: number;
    hideTtsLanguageWarning?: boolean;
  }): AgentConfig {
    if (settings.ttsEnabled !== undefined) {
      this.config.ttsEnabled = settings.ttsEnabled;
    }
    if (settings.ttsVolume !== undefined) {
      this.config.ttsVolume = Math.max(0, Math.min(100, settings.ttsVolume));
    }
    if (settings.hideTtsLanguageWarning !== undefined) {
      this.config.hideTtsLanguageWarning = settings.hideTtsLanguageWarning;
    }
    saveConfig(this.config);
    return { ...this.config };
  }

  testTts(): void {
    this.speakMessage(
      buildRecordingStartMessage("Budi","Scanner 1"),
    );
  }

  private ttsOptions(): TtsOptions {
    return {
      enabled: this.config.ttsEnabled !== false,
      volume: this.config.ttsVolume ?? 80,
    };
  }

  private speakMessage(text: string): void {
    speak(text, this.ttsOptions(), (message) => {
      this.status.lastTtsError = message.slice(0, 160);
    });
  }

  private speakDisconnectWarning(key: string, text: string): void {
    const now = Date.now();
    const last = this.lastDisconnectTtsAt.get(key) ?? 0;
    if (now - last < 30_000) return;
    this.lastDisconnectTtsAt.set(key, now);
    this.speakMessage(text);
  }

  private announceRecordingStart(
    scanId: string,
    operatorUsername: string | null | undefined,
    scannerLabel: string | null | undefined,
  ): void {
    if (this.spokenScanIds.has(scanId)) return;
    this.spokenScanIds.add(scanId);
    if (this.spokenScanIds.size > 200) {
      const first = this.spokenScanIds.values().next().value;
      if (first) this.spokenScanIds.delete(first);
    }
    this.speakMessage(
      buildRecordingStartMessage(operatorUsername, scannerLabel),
    );
  }

  private refreshDiskStatus(): void {
    const freeBytes = getFreeBytesForPath(this.config.clipsDir);
    this.status.diskFreeBytes = freeBytes;
    this.status.diskLow = isDiskLow(freeBytes);
    this.status.diskFreeLabel = formatFreeBytes(freeBytes);
  }

  private setTransientBusyMessage(message: string): void {
    this.status.busyMessage = message;
    if (this.busyMessageTimer) clearTimeout(this.busyMessageTimer);
    this.busyMessageTimer = setTimeout(() => {
      this.busyMessageTimer = null;
      if (this.ingestLocks.size === 0) this.status.busyMessage = null;
    }, 8000);
  }

  private clearBusyMessage(): void {
    if (this.busyMessageTimer) {
      clearTimeout(this.busyMessageTimer);
      this.busyMessageTimer = null;
    }
    this.status.busyMessage = null;
  }
  
  getScanners(): AgentScannerConfig[] {
    return this.remoteConfig?.scanners ?? [];
  }

  async listSerialPorts(): Promise<ListedSerialPort[]> {
    return listSerialPorts();
  }

  async pairUsbScanner(
    scannerId: string,
    usbVendorId: number,
    usbProductId: number,
    serialPortPath: string,
  ): Promise<void> {
    await this.api.pairUsb(
      scannerId,
      usbVendorId,
      usbProductId,
      serialPortPath,
    );
    await this.refreshConfig(true);
  }

  async refreshConfig(forceReconnect = false): Promise<void> {
    if (!this.config.deviceToken) return;

    const prevScanners = this.remoteConfig?.scanners ?? null;
    const next = await this.api.fetchConfig();
    const reconnect = shouldReconnectSerial(
      prevScanners,
      next.scanners,
      forceReconnect,
    );

    this.remoteConfig = next;
    if (next.clipsDir) {
      this.config.clipsDir = next.clipsDir;
    }
    if (next.ttsEnabled !== undefined) {
      this.config.ttsEnabled = next.ttsEnabled;
    }
    if (next.ttsVolume !== undefined) {
      this.config.ttsVolume = next.ttsVolume;
    }
    if (next.clipRetentionDays !== undefined) {
      this.config.clipRetentionDays = next.clipRetentionDays;
    }
    this.status.recordingMaxDurationSec = next.recordingMaxDurationSec ?? null;
    this.status.clipsDir = this.config.clipsDir;
    this.status.clipRetentionDays = this.config.clipRetentionDays ?? 14;
    fs.mkdirSync(this.config.clipsDir, { recursive: true });
    this.mediaServer.start(this.config.clipsDir);
    saveConfig(this.config);

    if (!next.scanners.length) {
      await this.serial.disconnectAll();
    } else {
      if (reconnect) {
        await this.serial.reconnectAll(
          next.scanners,
          (id, inv) => this.handleScan(id, inv),
          (scannerId) => {
            this.speakDisconnectWarning(
              `scanner:${scannerId}`,
              buildScannerDisconnectMessage(),
            );
            this.updateScannerStatus();
          },
        );
      } else {
        // Auto-reconnect any disconnected scanners
        const connectedIds = new Set(this.serial.getConnectedScannerIds());
        for (const scanner of next.scanners) {
          if (!connectedIds.has(scanner.id)) {
            try {
              await this.serial.connectScanner(
                scanner,
                (id, inv) => this.handleScan(id, inv),
                (scannerId) => {
                  this.speakDisconnectWarning(
                    `scanner:${scannerId}`,
                    buildScannerDisconnectMessage(),
                  );
                  this.updateScannerStatus();
                },
              );
            } catch {
              // Ignore failure if scanner is still offline/unplugged
            }
          }
        }
      }
    }

    this.status.configSyncedAt = new Date().toISOString();
    this.updateScannerStatus();
    this.syncMonitorPreviews();
  }

  async syncClipsNow(): Promise<void> {
    await this.reconcileLocalClips();
  }

  getMonitorGrid(): MonitorCellStatus[] {
    this.updateScannerStatus();
    const scanners = this.remoteConfig?.scanners ?? [];
    const linkByScanner = new Map(this.status.scanners.map((s) => [s.id, s]));

    return scanners
      .filter((s) => s.cctv?.isActive && s.cctv.rtspUrl)
      .map((s) => {
        const link = linkByScanner.get(s.id);
        const activeRow = this.lastActiveRecordings.find(
          (r) => r.cctvConfigId === s.cctv.id,
        );

        const isStarting = [...this.startingScans.values()].some((scanId) => {
          return activeRow?.scanId === scanId;
        });

        const recording = this.recorder.isRecordingForCctv(s.cctv.id) || isStarting;
        const invoice = recording
          ? (this.recorder.getRecordingInvoiceForCctv(s.cctv.id) ?? activeRow?.invoiceNumber ?? null)
          : null;
        const scanId = recording
          ? (this.recorder.getRecordingScanIdForCctv(s.cctv.id) ?? activeRow?.scanId ?? null)
          : null;
        const remainingSec = activeRow?.remainingSec ?? null;
        const previewError = this.go2rtcPreview.getLastError(s.cctv.id);
        const scannerConnected = link?.connected ?? false;
        let state: MonitorCellStatus["state"] = recording ? "recording" : "idle";
        if (!recording && (!scannerConnected || previewError)) {
          state = "offline";
        }

        let localScannedAt = this.recordingStarts.get(s.cctv.id) ?? null;
        if (recording && !localScannedAt) {
          localScannedAt = activeRow?.scannedAt ?? new Date().toISOString();
          this.recordingStarts.set(s.cctv.id, localScannedAt);
        } else if (!recording && localScannedAt) {
          this.recordingStarts.delete(s.cctv.id);
          localScannedAt = null;
        }

        return {
          cctvId: s.cctv.id,
          cctvLabel: s.cctv.label,
          scannerId: s.id,
          scannerLabel: s.label,
          operatorUsername: s.assignedUsername,
          scannerConnected,
          state,
          invoiceNumber: invoice,
          scanId,
          remainingSec,
          previewSrc: this.go2rtcPreview.streamName(s.cctv.id),
          go2rtcBaseUrl: GO2RTC_API_BASE,
          previewError,
          scannedAt: localScannedAt,
        } satisfies MonitorCellStatus;
      });
  }

  getActiveRecordings(): AgentActiveRecording[] {
    return [...this.lastActiveRecordings];
  }

  async getRecentScans(): Promise<AgentRecentScan[]> {
    if (!this.config.deviceToken) return [];
    return this.api.recentScans();
  }

  async listInvoiceScans(query: {
    page: number;
    limit: number;
    search?: string;
    operator?: string;
    workstationId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<{
    items: AgentRecentScan[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!this.config.deviceToken) return { items: [], total: 0, page: 1, limit: 10 };
    return this.api.listInvoiceScans(query);
  }

  async startMonitor(): Promise<void> {
    for (const scanner of this.remoteConfig?.scanners ?? []) {
      if (!scanner.cctv?.isActive || !scanner.cctv.rtspUrl) continue;
      const rtspUrl = this.buildRtspUrl(
        scanner.cctv.rtspUrl,
        scanner.cctv.username,
        scanner.cctv.password,
      );
      this.go2rtcPreview.warmUp(scanner.cctv.id, toPreviewSubstreamUrl(rtspUrl));
    }

    if (this.monitorActive) {
      await this.go2rtcPreview.resync();
      return;
    }

    this.monitorActive = true;
    await this.go2rtcPreview.start();
  }

  async resyncMonitor(): Promise<void> {
    for (const scanner of this.remoteConfig?.scanners ?? []) {
      if (!scanner.cctv?.isActive || !scanner.cctv.rtspUrl) continue;
      const rtspUrl = this.buildRtspUrl(
        scanner.cctv.rtspUrl,
        scanner.cctv.username,
        scanner.cctv.password,
      );
      this.go2rtcPreview.warmUp(scanner.cctv.id, toPreviewSubstreamUrl(rtspUrl));
    }
    await this.go2rtcPreview.resync();
  }

  stopMonitor(): void {
    if (!this.monitorActive) return;
    this.monitorActive = false;
    this.go2rtcPreview.stopAll();
  }

  async startCameraPreview(cctvId: string): Promise<void> {
    const scanner = this.remoteConfig?.scanners.find(
      (s) => s.cctv?.id === cctvId,
    );
    if (!scanner?.cctv?.rtspUrl) return;
    const rtspUrl = this.buildRtspUrl(
      scanner.cctv.rtspUrl,
      scanner.cctv.username,
      scanner.cctv.password,
    );
    await this.go2rtcPreview.startCamera(
      cctvId,
      toPreviewSubstreamUrl(rtspUrl),
    );
  }

  async stopCameraPreview(cctvId: string): Promise<void> {
    await this.go2rtcPreview.stopCamera(cctvId);
  }

  async refreshPreview(cctvId: string): Promise<void> {
    const scanner = this.remoteConfig?.scanners.find(
      (s) => s.cctv?.id === cctvId,
    );
    if (!scanner?.cctv?.rtspUrl) return;
    const rtspUrl = this.buildRtspUrl(
      scanner.cctv.rtspUrl,
      scanner.cctv.username,
      scanner.cctv.password,
    );
    await this.go2rtcPreview.refreshStream(
      cctvId,
      toPreviewSubstreamUrl(rtspUrl),
    );
  }

  async stopRecording(scanId: string): Promise<void> {
    const row = this.lastActiveRecordings.find((r) => r.scanId === scanId);
    const cctvId = row?.cctvConfigId ?? "unknown";
    this.recordingStarts.delete(cctvId);

    await this.withCctvLock(cctvId, async () => {
      if (this.finishingScans.has(scanId)) return;
      this.finishingScans.add(scanId);
      try {
        let localPath: string | null = null;
        if (this.recorder.isRecording(scanId)) {
          localPath = await this.recorder.stop(scanId);
        }
        if (!localPath && row) {
          localPath = resolveClipPath(this.config.clipsDir, row.invoiceNumber);
        }
        if (localPath) {
          await this.api.complete(scanId, localPath, 0);
        } else {
          await this.api.failRecording(scanId);
        }
        this.status.recording = this.recorder.hasActiveRecordings();
      } finally {
        this.finishingScans.delete(scanId);
      }
    });
  }

  private syncMonitorPreviews(): void {
    if (!this.monitorActive) return;
    for (const scanner of this.remoteConfig?.scanners ?? []) {
      if (!scanner.cctv?.isActive || !scanner.cctv.rtspUrl) continue;
      const rtspUrl = this.buildRtspUrl(
        scanner.cctv.rtspUrl,
        scanner.cctv.username,
        scanner.cctv.password,
      );
      this.go2rtcPreview.warmUp(
        scanner.cctv.id,
        toPreviewSubstreamUrl(rtspUrl),
      );
    }
    void this.go2rtcPreview.resync().catch(() => {});
  }

  private updateScannerStatus(): void {
    const connected = new Set(this.serial.getConnectedScannerIds());
    this.status.scanners = (this.remoteConfig?.scanners ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      connected: connected.has(s.id),
      portPath: this.serial.getPortPath(s.id),
      usbLabel:
        s.usbVendorId != null && s.usbProductId != null
          ? `${s.usbVendorId}:${s.usbProductId}`
          : null,
      error: this.serial.getScannerError(s.id),
    }));
  }
  
  private async withCctvLock<T>(
    cctvId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const tail = this.cctvGate.get(cctvId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = tail.then(() => gate);
    this.cctvGate.set(cctvId, next);
    await tail;
    try {
      return await work();
    } finally {
      release();
      if (this.cctvGate.get(cctvId) === next) {
        this.cctvGate.delete(cctvId);
      }
    }
  }

  async captureCctvSnapshot(cctvId: string): Promise<Buffer> {
    return this.withCctvLock(cctvId, async () => {
      const scanner = this.remoteConfig?.scanners.find(
        (s) => s.cctv.id === cctvId,
      );
      if (!scanner?.cctv?.rtspUrl) {
        throw new Error("CCTV tidak ditemukan di konfigurasi workstation");
      }
      const rtspUrl = this.buildRtspUrl(
        scanner.cctv.rtspUrl,
        scanner.cctv.username,
        scanner.cctv.password,
      );
      return captureCctvSnapshot(rtspUrl);
    });
  }

  async pair(
    apiBaseUrl: string,
    workstationId: string,
    pairingCode: string,
    clipsDir?: string,
  ): Promise<void> {
    this.config.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.config.clipsDir = clipsDir || this.config.clipsDir;
    this.api.updateConfig(this.config);

    const result = await this.api.pair(workstationId, pairingCode);
    this.config.deviceToken = result.deviceToken;
    this.config.workstationId = result.workstationId;
    this.config.organizationName = result.organizationName;
    this.config.workstationLabel = result.workstationLabel;
    saveConfig(this.config);
    this.api.updateConfig(this.config);
    this.status.paired = true;
    this.status.clipsDir = this.config.clipsDir;
  }

  private buildRtspUrl(
    baseUrl: string,
    username: string | null,
    password: string | null,
  ): string {
    const trimmed = baseUrl.trim();
    if (!username || trimmed.includes("@")) return trimmed;
    try {
      const u = new URL(trimmed);
      u.username = username;
      if (password) u.password = password;
      return u.toString();
    } catch {
      return trimmed;
    }
  }

  private async handleScan(
    scannerConfigId: string,
    invoiceNumber: string,
  ): Promise<void> {
    if (!this.remoteConfig) return;

    if (this.ingestLocks.has(scannerConfigId)) {
      const scanner = this.remoteConfig.scanners.find(
        (s) => s.id === scannerConfigId,
      );
      const operatorName = scanner?.assignedUsername || scanner?.label || "Operator";
      
      this.setTransientBusyMessage(
        `Scanner ${operatorName} sibuk — mohon tunggu proses sebelumnya selesai`,
      );
      this.speakMessage(`Scanner ${operatorName} sibuk`);
      return;
    }

    this.ingestLocks.add(scannerConfigId);
    this.clearBusyMessage();

    // Antre request ingest jika ada scanner lain yang sedang scan di waktu yang persis sama
    const tail = this.globalIngestLock;
    let releaseLock!: () => void;
    this.globalIngestLock = new Promise<void>((r) => { releaseLock = r; });
    await tail;

    let scanId: string | null = null;
    let ingestSuccess = false;
    let scanResult: any = null;

    try {
      scanResult = await this.api.ingest(scannerConfigId, invoiceNumber);
      ingestSuccess = true;
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : "Scan gagal";
    } finally {
      releaseLock(); // <-- lepaskan lock secepat mungkin agar scanner lain bisa ingest
    }

    if (!ingestSuccess) {
      this.ingestLocks.delete(scannerConfigId);
      if (!this.status.recording && this.ingestLocks.size === 0) {
        this.clearBusyMessage();
      }
      return;
    }

    try {
      const scan = scanResult;
      scanId = scan.id as string;
      this.startingScans.add(scanId);
      this.status.lastScan = scan.invoiceNumber;

      const scanner = this.remoteConfig.scanners.find(
        (s) => s.id === scannerConfigId,
      );
      if (!scanner?.cctv?.rtspUrl) {
        throw new Error("RTSP CCTV tidak dikonfigurasi");
      }

      this.announceRecordingStart(
        scan.id,
        scanner.assignedUsername,
        scanner.label,
      );

      const rtspUrl = this.buildRtspUrl(
        scanner.cctv.rtspUrl,
        scanner.cctv.username,
        scanner.cctv.password,
      );

      fs.mkdirSync(this.config.clipsDir, { recursive: true });
      await this.withCctvLock(scanner.cctv.id, () =>
        this.recorder.start({
          scanId: scan.id,
          cctvConfigId: scanner.cctv.id,
          invoiceNumber: scan.invoiceNumber,
          rtspUrl,
          clipsDir: this.config.clipsDir,
          operatorName: scanner.assignedUsername,
        }),
      );
      this.recordingStarts.set(scanner.cctv.id, new Date().toISOString());
      this.status.recording = true;
      this.status.lastError = null;
    } catch (err) {
      if (scanId) {
        try {
          await this.api.failRecording(scanId);
        } catch {
          /* ignore */
        }
      }
      this.status.lastError = err instanceof Error ? err.message : "Scan gagal";
      const errText = this.status.lastError ?? "";
      if (
        /cctv|rtsp|ffmpeg|kamera|stream/i.test(errText) &&
        scanId
      ) {
        this.speakDisconnectWarning(
          `cctv:${scannerConfigId}`,
          buildCameraDisconnectMessage(),
        );
      }
    } finally {
      if (scanId) {
        this.startingScans.delete(scanId);
      }
      this.ingestLocks.delete(scannerConfigId);
      if (!this.status.recording && this.ingestLocks.size === 0) {
        this.clearBusyMessage();
      }
    }
  }

  private async finishRecordingRow(row: {
    scanId: string;
    invoiceNumber: string;
    maxDurationSec: number;
    remainingSec: number;
    cctvConfigId?: string | null;
  }): Promise<void> {
    const cctvId = row.cctvConfigId ?? "unknown";
    this.recordingStarts.delete(cctvId);

    await this.withCctvLock(cctvId, async () => {
      if (this.finishingScans.has(row.scanId)) return;
      this.finishingScans.add(row.scanId);

      try {
        let localPath: string | null = null;

        if (this.recorder.isRecording(row.scanId)) {
          localPath = await this.recorder.stop(row.scanId);
        }

        if (!localPath) {
          localPath = resolveClipPath(this.config.clipsDir, row.invoiceNumber);
        }

        if (localPath) {
          const durationSec = Math.max(0, row.maxDurationSec - row.remainingSec);
          await this.api.complete(row.scanId, localPath, durationSec);
          return;
        }

        await this.api.failRecording(row.scanId);
      } finally {
        this.finishingScans.delete(row.scanId);
      }
    });
  }

  private async reconcileLocalClips(): Promise<void> {
    if (this.reconcileLock || !this.config.deviceToken) return;
    const clips = listLocalClipFiles(this.config.clipsDir);
    if (!clips.length) return;

    this.reconcileLock = true;
    try {
      await this.api.reconcileClips(clips);
    } catch {
      /* retry on next heartbeat */
    } finally {
      this.reconcileLock = false;
    }
  }

  private async pollRecordings(): Promise<void> {
    if (this.isPolling || !this.config.deviceToken) return;
    this.isPolling = true;

    try {
      const rows = await this.api.activeRecordings();
      this.lastActiveRecordings = rows;

      for (const row of rows) {
        const shouldStop = row.stopRequested || row.remainingSec <= 0;
        const isLocal = this.recorder.isRecording(row.scanId) || this.startingScans.has(row.scanId);

        if (!isLocal && !shouldStop && row.rtspUrl) {
          const rtspUrl = this.buildRtspUrl(
            row.rtspUrl,
            row.cctvUsername,
            row.cctvPassword,
          );
          const cctvId = row.cctvConfigId || "unknown";
          
          this.startingScans.add(row.scanId);
          try {
            const scanner = this.remoteConfig?.scanners.find(
              (s) => s.cctv?.id === cctvId,
            );
            this.announceRecordingStart(
              row.scanId,
              scanner?.assignedUsername ?? null,
              scanner?.label ?? null,
            );
            await this.withCctvLock(cctvId, () =>
              this.recorder.start({
                scanId: row.scanId,
                cctvConfigId: cctvId,
                invoiceNumber: row.invoiceNumber,
                rtspUrl,
                clipsDir: this.config.clipsDir,
                operatorName: scanner?.assignedUsername,
              }),
            );
            this.recordingStarts.set(cctvId, row.scannedAt);
            this.status.recording = true;
          } catch {
            this.recordingStarts.delete(cctvId);
            await this.api.failRecording(row.scanId);
          } finally {
            this.startingScans.delete(row.scanId);
          }
        }

        if (shouldStop) {
          await this.finishRecordingRow(row);
        }
      }

      this.status.recording = this.recorder.hasActiveRecordings();
      if (!this.status.recording && this.ingestLocks.size === 0) {
        this.clearBusyMessage();
      }
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : "Poll gagal";
    } finally {
      this.isPolling = false;
    }
  }

  private async syncRemote(): Promise<void> {
    await this.refreshConfig(true);
  }

  async start(): Promise<void> {
    if (!this.config.deviceToken) {
      throw new Error("Agent belum dipairing");
    }

    this.clearStartupError();

    fs.mkdirSync(this.config.clipsDir, { recursive: true });
    this.mediaServer.start(this.config.clipsDir);
    await this.syncRemote();
    await this.reconcileLocalClips();

    const heartbeat = async () => {
      try {
        this.refreshDiskStatus();
        await this.api.heartbeat({
          agentVersion: AGENT_VERSION,
          clipsDir: this.config.clipsDir,
          diskFreeBytes: this.status.diskFreeBytes ?? undefined,
          isRecording: this.status.recording,
        });
        await this.reconcileLocalClips();
      } catch (err) {
        this.status.lastError =
          err instanceof Error ? err.message : "Heartbeat gagal";
      }
    };

    await heartbeat();
    this.heartbeatTimer = setInterval(() => void heartbeat(), 60_000);
    this.pollTimer = setInterval(() => void this.pollRecordings(), 2000);
    this.configSyncTimer = setInterval(
      () => void this.refreshConfig().catch(() => {}),
      30_000,
    );
    this.runClipCleanup();
    this.cleanupTimer = setInterval(
      () => this.runClipCleanup(),
      6 * 60 * 60 * 1000,
    );
  }

  private runClipCleanup(): void {
    const days = this.config.clipRetentionDays ?? 14;
    if (days <= 0) return;
    const deleted = this.purgeOldClips(days);
    this.status.lastCleanupDeleted = deleted;
    this.status.lastCleanupAt = new Date().toISOString();
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.configSyncTimer) clearInterval(this.configSyncTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.monitorActive = false;
    this.go2rtcPreview.stopAll();
    this.mediaServer.stop();
    await this.serial.disconnectAll();
  }

  purgeOldClips(retentionDays = 30): number {
    const dir = this.config.clipsDir;
    if (!fs.existsSync(dir) || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    const purgeMp4InDir = (targetDir: string) => {
      if (!fs.existsSync(targetDir)) return;
      for (const name of fs.readdirSync(targetDir)) {
        if (!name.toLowerCase().endsWith(".mp4")) continue;
        const filePath = path.join(targetDir, name);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted += 1;
          }
        } catch {
          /* ignore */
        }
      }
    };

    purgeMp4InDir(dir);

    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!name.isDirectory() || !MONTHLY_CLIPS_DIR_PATTERN.test(name.name)) {
        continue;
      }
      const monthDir = path.join(dir, name.name);
      purgeMp4InDir(monthDir);
      try {
        const remaining = fs.readdirSync(monthDir);
        if (remaining.length === 0) fs.rmdirSync(monthDir);
      } catch {
        /* ignore */
      }
    }

    return deleted;
  }
}
