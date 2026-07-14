import axios, { AxiosInstance, isAxiosError } from "axios";
import type { AgentConfig } from "./config-store";

function formatApiError(err: unknown, fallback: string): Error {
  if (isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return new Error(msg.join(", "));
    if (typeof msg === "string" && msg.trim()) return new Error(msg);
    if (err.code === "ECONNREFUSED") {
      return new Error(
        "Tidak bisa hubung ke server API. Periksa URL (mis. http://192.168.169.12:3001) dan pastikan backend jalan.",
      );
    }
  }
  if (err instanceof Error && err.message) return err;
  return new Error(fallback);
}

export interface AgentScannerConfig {
  id: string;
  label: string;
  baudRate: number;
  usbVendorId: number | null;
  usbProductId: number | null;
  serialPortPath: string | null;
  assignedUsername: string | null;
  cctv: {
    id: string;
    label: string;
    rtspUrl: string;
    username: string | null;
    password: string | null;
    isActive: boolean;
  };
}

export interface AgentRemoteConfig {
  organizationName: string;
  workstationId: string;
  recordingMaxDurationSec: number;
  clipsDir: string | null;
  ttsEnabled?: boolean;
  ttsVolume?: number;
  clipRetentionDays?: number;
  scanners: AgentScannerConfig[];
}

export interface AgentActiveRecording {
  scanId: string;
  invoiceNumber: string;
  scannedAt: string;
  maxDurationSec: number;
  remainingSec: number;
  stopRequested: boolean;
  scannerConfigId: string | null;
  cctvConfigId: string | null;
  rtspUrl: string | null;
  cctvUsername: string | null;
  cctvPassword: string | null;
}

export interface AgentRecentScan {
  scanId: string;
  invoiceNumber: string;
  status: string;
  scannedAt: string;
  completedAt: string | null;
  operatorUsername: string | null;
}

export interface PairResult {
  deviceToken: string;
  workstationId: string;
  organizationName: string;
  workstationLabel: string;
}

export class AgentApiClient {
  private http: AxiosInstance;
  
  constructor(private config: AgentConfig) {
    this.http = axios.create({
      baseURL: config.apiBaseUrl.replace(/\/$/, ""),
      timeout: 30_000,
    });
  }

  updateConfig(config: AgentConfig): void {
    this.config = config;
    this.http.defaults.baseURL = config.apiBaseUrl.replace(/\/$/, "");
  }

  private authHeaders() {
    if (!this.config.deviceToken) {
      throw new Error("Agent belum dipairing");
    }
    return { Authorization: `Bearer ${this.config.deviceToken}` };
  }

  async pair(
    workstationId: string,
    pairingCode: string,
  ): Promise<PairResult> {
    try {
      const res = await this.http.post<PairResult>("/api/agent/pair", {
        workstationId: workstationId.trim(),
        pairingCode: pairingCode.trim().toUpperCase(),
      });
      return res.data;
    } catch (err) {
      throw formatApiError(err, "Pairing gagal");
    }
  }

  async fetchConfig(): Promise<AgentRemoteConfig> {
    const res = await this.http.get<AgentRemoteConfig>("/api/agent/config", {
      headers: this.authHeaders(),
    });
    return res.data;
  }

  async ingest(scannerConfigId: string, invoiceNumber: string) {
    const res = await this.http.post("/api/agent/ingest", {
      scannerConfigId,
      invoiceNumber,
    }, { headers: this.authHeaders() });
    return res.data as {
      id: string;
      invoiceNumber: string;
      previousInvoice?: string | null;
    };
  }

  async complete(scanId: string, localClipPath: string, durationSec?: number) {
    const res = await this.http.post(
      `/api/agent/recording/${scanId}/complete`,
      { localClipPath, durationSec },
      { headers: this.authHeaders() },
    );
    return res.data;
  }

  async heartbeat(payload: {
    agentVersion?: string;
    clipsDir?: string;
    diskFreeBytes?: number;
    isRecording?: boolean;
  }) {
    const res = await this.http.post(
      "/api/agent/heartbeat",
      payload,
      { headers: this.authHeaders() },
    );
    return res.data;
  }

  async activeRecordings(): Promise<AgentActiveRecording[]> {
    const res = await this.http.get<AgentActiveRecording[]>(
      "/api/agent/active-recordings",
      { headers: this.authHeaders() },
    );
    return res.data;
  }

  async recentScans(): Promise<AgentRecentScan[]> {
    const res = await this.http.get<AgentRecentScan[]>(
      "/api/agent/recent-scans",
      { headers: this.authHeaders() },
    );
    return res.data;
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
  }) {
    const res = await this.http.get<{
      items: AgentRecentScan[];
      total: number;
      page: number;
      limit: number;
    }>("/api/invoice-scan/list", {
      headers: this.authHeaders(),
      params: {
        page: query.page,
        limit: query.limit,
        status: query.status && query.status !== "ALL" ? query.status : undefined,
        search: query.search || undefined,
        operator: query.operator || undefined,
        workstationId: query.workstationId && query.workstationId !== "ALL" ? query.workstationId : undefined,
        startDate: query.startDate || undefined,
        endDate: query.endDate || undefined,
      },
    });
    return res.data;
  }


  async pairUsb(
    scannerConfigId: string,
    usbVendorId: number,
    usbProductId: number,
    serialPortPath: string,
  ) {
    try {
      const res = await this.http.post(
        `/api/agent/scanner/${scannerConfigId}/pair-usb`,
        { usbVendorId, usbProductId, serialPortPath },
        { headers: this.authHeaders() },
      );
      return res.data;
    } catch (err) {
      throw formatApiError(err, "Pair USB gagal");
    }
  }

  async failRecording(scanId: string) {
    const res = await this.http.post(
      `/api/agent/recording/${scanId}/fail`,
      {},
      { headers: this.authHeaders() },
    );
    return res.data;
  }

  async reconcileClips(
    clips: { invoiceNumber: string; localClipPath: string; sizeBytes: number }[],
  ) {
    const res = await this.http.post(
      "/api/agent/clips/reconcile",
      { clips },
      { headers: this.authHeaders() },
    );
    return res.data as { completed: number; imported: number; skipped: number };
  }
}
