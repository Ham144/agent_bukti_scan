import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentScannerView,
  ListedSerialPortView,
  RuntimeStatusView,
} from "../../electron/preload";
import { parseUsbId } from "../core/scan-parse";
import { agentErrorMessage } from "../core/agent-error";
import { S } from "./styles";
import { GlobalStatusBanners } from "./components/Banners";
import { TabBeranda } from "./components/TabBeranda";
import { TabMonitor } from "./components/TabMonitor";
import { TabKamera } from "./components/TabKamera";
import { TabScanner } from "./components/TabScanner";
import { TabPenyimpanan } from "./components/TabPenyimpanan";
import { TabTentang } from "./components/TabTentang";
import { TabRiwayat } from "./components/TabRiwayat";

const AGENT_VERSION = "0.1.3";

export type Tab = "beranda" | "monitor" | "kamera" | "scanner" | "penyimpanan" | "riwayat" | "tentang";

export interface AgentConfig {
  apiBaseUrl: string;
  workstationId?: string;
  organizationName?: string;
  workstationLabel?: string;
  clipsDir: string;
  clipsDirSecondary?: string;
  ttsEnabled?: boolean;
  ttsVolume?: number;
  hideTtsLanguageWarning?: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "monitor", label: "Monitor" },
  { id: "beranda", label: "Beranda" },
  { id: "kamera", label: "Kamera" },
  { id: "scanner", label: "Scanner" },
  { id: "penyimpanan", label: "Penyimpanan" },
  { id: "riwayat", label: "Riwayat Scan" },
  { id: "tentang", label: "Tentang" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [status, setStatus] = useState<RuntimeStatusView | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [scanners, setScanners] = useState<AgentScannerView[]>([]);
  const [serialPorts, setSerialPorts] = useState<ListedSerialPortView[]>([]);

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [clipsDir, setClipsDir] = useState("");
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [previewCctvId, setPreviewCctvId] = useState("");

  const [pairingScannerId, setPairingScannerId] = useState<string | null>(null);
  const [selectedPortPath, setSelectedPortPath] = useState("");
  const [usbLoading, setUsbLoading] = useState(false);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [usbSuccess, setUsbSuccess] = useState<string | null>(null);

  // Set outer window body styles once on mount
  useEffect(() => {
    document.body.style.backgroundColor = "#f1f5f9";
    document.body.style.margin = "0";
  }, []);

  const cctvs = useMemo(() => {
    const map = new Map<string, AgentScannerView["cctv"]>();
    for (const scanner of scanners) {
      if (scanner.cctv?.isActive) map.set(scanner.cctv.id, scanner.cctv);
    }
    return [...map.values()];
  }, [scanners]);

  const applyStatus = useCallback((s: RuntimeStatusView | null) => {
    setStatus(s);
  }, []);

  const refresh = useCallback(
    async (opts?: { full?: boolean }) => {
      setRefreshError(null);
      try {
        const c = (await window.BuktiScanAgent.getConfig()) as AgentConfig;
        const defaultApi = await window.BuktiScanAgent.getDefaultApiUrl();
        setConfig(c);
        setApiBaseUrl((prev) => prev || c.apiBaseUrl || defaultApi);
        if (!clipsDir && c.clipsDir) setClipsDir(c.clipsDir);
        if (!workstationId && c.workstationId) setWorkstationId(c.workstationId);

        let s = await window.BuktiScanAgent.getStatus();
        if (s?.paired && opts?.full) {
          s = await window.BuktiScanAgent.refreshConfig();
        }
        applyStatus(s);

        if (s?.paired) {
          setScanners(await window.BuktiScanAgent.getScanners());
          setSerialPorts(await window.BuktiScanAgent.listSerialPorts());
        }
      } catch (err) {
        setRefreshError(agentErrorMessage(err, "Gagal sinkron agent"));
      } finally {
        setBooting(false);
      }
    },
    [applyStatus, clipsDir, workstationId],
  );

  useEffect(() => {
    void refresh({ full: true });
    const fast = setInterval(() => void refresh(), 5000);
    const slow = setInterval(() => void refresh({ full: true }), 30_000);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [refresh]);

  useEffect(() => {
    if (!previewCctvId && cctvs[0]?.id) setPreviewCctvId(cctvs[0].id);
  }, [cctvs, previewCctvId]);

  const onPair = async () => {
    setPairLoading(true);
    setPairError(null);
    try {
      await window.BuktiScanAgent.pair({
        apiBaseUrl,
        workstationId,
        pairingCode,
        clipsDir: clipsDir || undefined,
      });
      await refresh({ full: true });
    } catch (err) {
      setPairError(agentErrorMessage(err, "Pairing gagal"));
    } finally {
      setPairLoading(false);
    }
  };

  const onUnpair = async () => {
    const ok = window.confirm("Apakah Anda yakin ingin keluar session (unpair) workstation ini?");
    if (!ok) return;
    try {
      await window.BuktiScanAgent.unpair();
      await refresh();
    } catch {
      /* abaikan */
    }
  };

  const refreshSerialPorts = useCallback(async () => {
    setSerialPorts(await window.BuktiScanAgent.listSerialPorts());
  }, []);

  const onPairUsb = async (scannerId: string) => {
    const port = serialPorts.find((p) => p.path === selectedPortPath);
    if (!port) {
      setUsbError("Pilih port COM terlebih dahulu");
      return;
    }
    const usbVendorId = parseUsbId(port.vendorId);
    const usbProductId = parseUsbId(port.productId);
    if (usbVendorId == null || usbProductId == null) {
      setUsbError("Port tidak punya Vendor/Product ID — coba port lain");
      return;
    }
    setUsbLoading(true);
    setUsbError(null);
    setUsbSuccess(null);
    try {
      const label =
        scanners.find((s) => s.id === scannerId)?.label ?? "Scanner";
      await window.BuktiScanAgent.pairUsb({
        scannerId,
        usbVendorId,
        usbProductId,
        serialPortPath: port.path,
      });
      const s = await window.BuktiScanAgent.refreshConfig();
      applyStatus(s);
      setScanners(await window.BuktiScanAgent.getScanners());
      setPairingScannerId(null);
      setSelectedPortPath("");
      setUsbSuccess(
        `USB tersimpan: ${port.path} (${usbVendorId}:${usbProductId}) → ${label}`,
      );
      await refreshSerialPorts();
    } catch (err) {
      setUsbError(agentErrorMessage(err, "Pair USB gagal"));
    } finally {
      setUsbLoading(false);
    }
  };

  if (booting && !status) {
    return (
      <div
        style={{
          ...S.page,
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          width: "100%",
        }}
      >
        <p style={{ color: "#64748b", margin: 0 }}>Memuat agent…</p>
      </div>
    );
  }

  if (!status?.paired) {
    return (
      <div
        style={{
          ...S.page,
          alignItems: "center",
          justifyContent: "center",
          background: "#f1f5f9",
        }}
      >
        <div style={S.pairingContainer}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>
            BuktiScan Agent
          </h1>
          <p style={{ color: "#64748b", marginTop: 0, marginBottom: 24, fontSize: 12 }}>
            Masukkan Workstation ID + kode pairing dari dashboard web.
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              <div style={S.label}>URL API cloud</div>
              <input
                style={S.input}
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
            </label>
            <label>
              <div style={S.label}>Workstation ID</div>
              <input
                style={S.input}
                value={workstationId}
                onChange={(e) => setWorkstationId(e.target.value)}
              />
            </label>
            <label>
              <div style={S.label}>Kode pairing</div>
              <input
                style={S.input}
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              <div style={S.label}>Folder klip (opsional)</div>
              <input
                style={S.input}
                placeholder="D:\BuktiScan\clips"
                value={clipsDir}
                onChange={(e) => setClipsDir(e.target.value)}
              />
            </label>
            <button
              type="button"
              style={{
                ...S.btnPrimary,
                opacity:
                  pairLoading || !workstationId || !pairingCode ? 0.6 : 1,
              }}
              disabled={pairLoading || !workstationId || !pairingCode}
              onClick={() => void onPair()}
            >
              {pairLoading ? "Menghubungkan..." : "Pair & mulai agent"}
            </button>
            {pairError && <p style={S.error}>{pairError}</p>}
          </div>
          <p style={{ ...S.hint, marginTop: 20, marginBottom: 0 }}>
            Generate kode pairing di dashboard web → Agent → Generate kode
            pairing.
          </p>
        </div>
      </div>
    );
  }

  const pageStyle = tab === "monitor"
    ? {
        ...S.page,
        maxWidth: "100%",
        borderLeft: "none",
        borderRight: "none",
        boxShadow: "none",
      }
    : S.page;

  return (
    <div style={pageStyle}>
      <div style={S.header}>
        <span style={S.headerTitle}>BuktiScan Agent v{AGENT_VERSION}</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {status.recording ? (
              <span style={{ color: "#fbbf24" }}>
                ● Merekam {status.lastScan ?? ""}
              </span>
            ) : (
              <span style={{ color: "#86efac" }}>● Siap scan</span>
            )}
          </span>
          <button
            type="button"
            onClick={onUnpair}
            style={{
              background: "none",
              border: "1px solid rgba(255, 255, 255, 0.4)",
              borderRadius: 6,
              color: "#fff",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              marginLeft: 12,
              transition: "background-color 0.2s ease, border-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.8)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.4)";
            }}
          >
            Keluar Session
          </button>
        </div>
      </div>

      <div style={S.tabBar}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            style={S.tab(tab === t.id)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={S.content}>
        <GlobalStatusBanners status={status} onUnpair={onUnpair} />
        {refreshError ? (
          <p style={{ ...S.error, marginTop: 0, marginBottom: 12 }}>
            {refreshError}
          </p>
        ) : null}
        {tab === "beranda" && (
          <TabBeranda status={status} config={config} onNavigate={setTab} />
        )}
        {tab === "monitor" && <TabMonitor config={config} />}
        {tab === "kamera" && (
          <TabKamera
            cctvs={cctvs}
            activeCctvId={previewCctvId}
            onSelectCctv={setPreviewCctvId}
          />
        )}
        {tab === "scanner" && (
          <TabScanner
            scanners={scanners}
            links={status.scanners ?? []}
            serialPorts={serialPorts}
            pairingScannerId={pairingScannerId}
            selectedPortPath={selectedPortPath}
            usbLoading={usbLoading}
            usbError={usbError}
            usbSuccess={usbSuccess}
            configSyncedAt={status.configSyncedAt}
            onStartPair={(id) => {
              setPairingScannerId(id);
              setUsbError(null);
              setUsbSuccess(null);
            }}
            onCancelPair={() => {
              setPairingScannerId(null);
              setSelectedPortPath("");
              setUsbError(null);
            }}
            onSelectPort={setSelectedPortPath}
            onConfirmPair={(id) => void onPairUsb(id)}
            onRefreshConfig={() => void refresh({ full: true })}
            onRefreshPorts={() => void refreshSerialPorts()}
          />
        )}
        {tab === "penyimpanan" && (
          <TabPenyimpanan
            status={status}
            config={config}
            onSync={() => void refresh({ full: true })}
          />
        )}
        {tab === "riwayat" && <TabRiwayat config={config} status={status} />}
        {tab === "tentang" && (
          <TabTentang
            config={config}
            agentVersion={AGENT_VERSION}
            onUnpair={onUnpair}
          />
        )}
      </div>
    </div>
  );
}
