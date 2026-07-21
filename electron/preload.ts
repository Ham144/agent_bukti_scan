import { contextBridge, ipcRenderer } from "electron";

export interface AgentScannerView {
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

export interface ScannerLinkView {
  id: string;
  label: string;
  connected: boolean;
  portPath: string | null;
  usbLabel: string | null;
  error: string | null;
}

export interface RuntimeStatusView {
  paired: boolean;
  recording: boolean;
  lastError: string | null;
  lastScan: string | null;
  busyMessage: string | null;
  clipsDir: string;
  workstationLabel?: string | null;
  localClipCount?: number;
  diskFreeBytes?: number | null;
  diskLow?: boolean;
  diskFreeLabel?: string;
  scanners: ScannerLinkView[];
  configSyncedAt: string | null;
  clipRetentionDays?: number;
  lastCleanupAt?: string | null;
  lastCleanupDeleted?: number;
  lastTtsError?: string | null;
  startupError?: string | null;
  recordingMaxDurationSec?: number | null;
  hasIndonesianVoice?: boolean;
  hideTtsLanguageWarning?: boolean;
}

export interface MonitorCellView {
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
  scannedAt?: string | null;
}

export interface ActiveRecordingView {
  scanId: string;
  invoiceNumber: string;
  cctvConfigId: string | null;
  remainingSec: number;
}

export interface RecentScanView {
  scanId: string;
  invoiceNumber: string;
  status: string;
  scannedAt: string;
  completedAt: string | null;
  operatorUsername: string | null;
  hasLocalFile?: boolean;
}

export interface ListedSerialPortView {
  path: string;
  vendorId: string | null;
  productId: string | null;
  manufacturer: string | null;
}

contextBridge.exposeInMainWorld("BuktiScanAgent", {
  getStatus: () =>
    ipcRenderer.invoke("agent:get-status") as Promise<RuntimeStatusView | null>,
  getConfig: () => ipcRenderer.invoke("agent:get-config"),
  getDefaultApiUrl: () => ipcRenderer.invoke("agent:get-default-api-url"),
  getScanners: () =>
    ipcRenderer.invoke("agent:get-scanners") as Promise<AgentScannerView[]>,
  listSerialPorts: () =>
    ipcRenderer.invoke("agent:list-serial-ports") as Promise<
      ListedSerialPortView[]
    >,
  captureCctvSnapshot: (cctvId: string) =>
    ipcRenderer.invoke("agent:cctv-snapshot", cctvId) as Promise<string>,
  openClipsFolder: () => ipcRenderer.invoke("agent:open-clips-folder"),
  refreshConfig: () =>
    ipcRenderer.invoke("agent:refresh-config") as Promise<RuntimeStatusView>,
  syncClips: () =>
    ipcRenderer.invoke("agent:sync-clips") as Promise<RuntimeStatusView>,
  startMonitor: () =>
    ipcRenderer.invoke("agent:start-monitor") as Promise<MonitorCellView[]>,
  resyncMonitor: () =>
    ipcRenderer.invoke("agent:resync-monitor") as Promise<MonitorCellView[]>,
  stopMonitor: () => ipcRenderer.invoke("agent:stop-monitor") as Promise<void>,
  getMonitorGrid: () =>
    ipcRenderer.invoke("agent:get-monitor-grid") as Promise<MonitorCellView[]>,
  getActiveRecordings: () =>
    ipcRenderer.invoke(
      "agent:get-active-recordings",
    ) as Promise<ActiveRecordingView[]>,
  getRecentScans: () =>
    ipcRenderer.invoke("agent:get-recent-scans") as Promise<RecentScanView[]>,
  stopRecording: (scanId: string) =>
    ipcRenderer.invoke("agent:stop-recording", scanId) as Promise<void>,
  refreshPreview: (cctvId: string) =>
    ipcRenderer.invoke("agent:refresh-preview", cctvId) as Promise<void>,
  startCameraPreview: (cctvId: string) =>
    ipcRenderer.invoke("agent:start-camera-preview", cctvId) as Promise<void>,
  stopCameraPreview: (cctvId: string) =>
    ipcRenderer.invoke("agent:stop-camera-preview", cctvId) as Promise<void>,
  updateTtsSettings: (payload: { ttsEnabled?: boolean; ttsVolume?: number; hideTtsLanguageWarning?: boolean }) =>
    ipcRenderer.invoke("agent:update-tts-settings", payload) as Promise<
      Record<string, unknown>
    >,
  testTts: () => ipcRenderer.invoke("agent:test-tts") as Promise<void>,
  setMonitorMode: (enabled: boolean) =>
    ipcRenderer.invoke("agent:monitor-mode", enabled) as Promise<void>,
  pairUsb: (payload: {
    scannerId: string;
    usbVendorId: number;
    usbProductId: number;
    serialPortPath: string;
  }) =>
    ipcRenderer.invoke("agent:pair-usb", payload) as Promise<
      AgentScannerView[]
    >,
  pair: (payload: {
    apiBaseUrl: string;
    workstationId: string;
    pairingCode: string;
    clipsDir?: string;
  }) =>
    ipcRenderer.invoke("agent:pair", payload),
  unpair: () => ipcRenderer.invoke("agent:unpair") as Promise<void>,
  openClipFile: (invoiceNumber: string) =>
    ipcRenderer.invoke("agent:open-clip-file", invoiceNumber) as Promise<void>,
  showClipInFolder: (invoiceNumber: string) =>
    ipcRenderer.invoke("agent:show-clip-in-folder", invoiceNumber) as Promise<void>,
  openSpeechSettings: () =>
    ipcRenderer.invoke("agent:open-speech-settings") as Promise<void>,
  listInvoiceScans: (query: {
    page: number;
    limit: number;
    search?: string;
    operator?: string;
    workstationId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) =>
    ipcRenderer.invoke("agent:list-invoice-scans", query) as Promise<{
      items: any[];
      total: number;
      page: number;
      limit: number;
    }>,
});

export interface BuktiScanAgentBridge {
  getStatus: () => Promise<RuntimeStatusView | null>;
  getConfig: () => Promise<unknown>;
  getDefaultApiUrl: () => Promise<string>;
  getScanners: () => Promise<AgentScannerView[]>;
  listSerialPorts: () => Promise<ListedSerialPortView[]>;
  captureCctvSnapshot: (cctvId: string) => Promise<string>;
  openClipsFolder: () => Promise<void>;
  refreshConfig: () => Promise<RuntimeStatusView>;
  syncClips: () => Promise<RuntimeStatusView>;
  startMonitor: () => Promise<MonitorCellView[]>;
  resyncMonitor: () => Promise<MonitorCellView[]>;
  stopMonitor: () => Promise<void>;
  getMonitorGrid: () => Promise<MonitorCellView[]>;
  getActiveRecordings: () => Promise<ActiveRecordingView[]>;
  getRecentScans: () => Promise<RecentScanView[]>;
  stopRecording: (scanId: string) => Promise<void>;
  refreshPreview: (cctvId: string) => Promise<void>;
  startCameraPreview: (cctvId: string) => Promise<void>;
  stopCameraPreview: (cctvId: string) => Promise<void>;
  updateTtsSettings: (payload: {
    ttsEnabled?: boolean;
    ttsVolume?: number;
    hideTtsLanguageWarning?: boolean;
  }) => Promise<Record<string, unknown>>;
  testTts: () => Promise<void>;
  setMonitorMode: (enabled: boolean) => Promise<void>;
  pairUsb: (payload: {
    scannerId: string;
    usbVendorId: number;
    usbProductId: number;
    serialPortPath: string;
  }) => Promise<AgentScannerView[]>;
  pair: (payload: {
    apiBaseUrl: string;
    workstationId: string;
    pairingCode: string;
    clipsDir?: string;
  }) => Promise<unknown>;
  unpair: () => Promise<void>;
  openClipFile: (invoiceNumber: string) => Promise<void>;
  showClipInFolder: (invoiceNumber: string) => Promise<void>;
  openSpeechSettings: () => Promise<void>;
  listInvoiceScans: (query: {
    page: number;
    limit: number;
    search?: string;
    operator?: string;
    workstationId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) => Promise<{
    items: any[];
    total: number;
    page: number;
    limit: number;
  }>;
}

declare global {
  interface Window {
    BuktiScanAgent: BuktiScanAgentBridge;
  }
}
