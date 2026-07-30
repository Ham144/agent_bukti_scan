import React, { useEffect, useRef, useState } from "react";
import type { MonitorCellView } from "../../../electron/preload";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import { LiveRtcPlayer } from "../LiveRtcPlayer";
import type { AgentConfig } from "../App";

function RecordingTimer({ scannedAt }: { scannedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(scannedAt).getTime();
    const update = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [scannedAt]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return <span>{mm}:{ss}</span>;
}

export function TabMonitor({ config }: { config: AgentConfig | null }) {
  const [cells, setCells] = useState<MonitorCellView[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [snapshotCell, setSnapshotCell] = useState<{ label: string; src: string } | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    const boot = async () => {
      setLoading(true);
      setBootError(null);
      try {
        await window.BuktiScanAgent.setMonitorMode(true);
        const rows = await window.BuktiScanAgent.startMonitor();
        if (activeRef.current) setCells(rows);
      } catch (err) {
        if (activeRef.current) {
          setBootError(agentErrorMessage(err, "Gagal menghubungkan stream"));
        }
      } finally {
        if (activeRef.current) setLoading(false);
      }
    };

    void boot();

    const poll = setInterval(() => {
      void window.BuktiScanAgent.getMonitorGrid().then((rows) => {
        if (activeRef.current) setCells(rows);
      });
    }, 2000);

    return () => {
      activeRef.current = false;
      clearInterval(poll);
      void window.BuktiScanAgent.stopMonitor();
      void window.BuktiScanAgent.setMonitorMode(false);
    };
  }, []);

  const handleStop = async (scanId: string) => {
    setStoppingId(scanId);
    setStopError(null);
    try {
      await window.BuktiScanAgent.stopRecording(scanId);
    } catch (err) {
      setStopError(agentErrorMessage(err, "Gagal menghentikan rekam"));
    } finally {
      setStoppingId(null);
    }
  };

  const handleSnapshot = async (cctvId: string, label: string) => {
    setSnapshotError(null);
    try {
      const b64 = await window.BuktiScanAgent.captureCctvSnapshot(cctvId);
      setSnapshotCell({ label, src: `data:image/jpeg;base64,${b64}` });
    } catch (err) {
      setSnapshotError(agentErrorMessage(err, "Snapshot gagal"));
    }
  };
  
  const handleRetryBoot = async () => {
    setLoading(true);
    setBootError(null);
    try {
      const rows = await window.BuktiScanAgent.startMonitor();
      if (activeRef.current) setCells(rows);
    } catch (err) {
      if (activeRef.current) {
        setBootError(agentErrorMessage(err, "Gagal menghubungkan stream"));
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshError(null);
    try {
      const rows = await window.BuktiScanAgent.resyncMonitor();
      if (activeRef.current) setCells(rows);
    } catch (err) {
      if (activeRef.current) {
        setRefreshError(agentErrorMessage(err, "Gagal refresh stream"));
      }
    }
  };

  if (loading) {
    return (
      <div style={S.card}>
        <p style={{ color: "#64748b", margin: 0 }}>Menyiapkan stream kamera…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div style={S.card}>
        <p style={{ ...S.error, margin: 0 }}>{bootError}</p>
        <p style={S.hint}>
          Pastikan go2rtc.exe ada di folder agent, port 1984 tidak dipakai aplikasi lain,
          dan URL RTSP substream benar di dashboard web.
        </p>
        <button type="button" style={S.btnPrimary} onClick={() => void handleRetryBoot()}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (!cells.length) {
    return (
      <div style={S.card}>
        <p style={{ color: "#64748b", margin: 0 }}>Belum ada CCTV di workstation ini.</p>
        <p style={S.hint}>Tambahkan scanner + CCTV di dashboard web → Perangkat.</p>
      </div>
    );
  }

  const cols = Math.min(Math.max(cells.length, 1), 3);
  const recCount = cells.filter((c) => c.state === "recording").length;
  const offlineCount = cells.filter((c) => !c.scannerConnected).length;

  return (
    <div>
      <div
        style={{
          padding: "8px 12px",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 6,
          color: "#1e40af",
          fontSize: 12,
          marginBottom: 12,
          lineHeight: 1.4,
        }}
      >     
        ℹ️ <strong>Tips Monitor:</strong> Untuk Preview dan rekam stabil dan tidak patah patah, ganti video encoding menjadi h.264 di di <strong>Configuration - video and audio - video encoding</strong> 
      </div>
      {stopError ? <p style={S.error}>{stopError}</p> : null}
      {snapshotError ? <p style={S.error}>{snapshotError}</p> : null}
      {refreshError ? <p style={S.error}>{refreshError}</p> : null}
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, fontSize: 12, color: "#64748b" }}>
          <strong>Workstation: {config?.workstationLabel || "Tidak diketahui"}</strong> · Live substream via go2rtc.{" "}
          {recCount > 0 && <span style={{ color: "#b45309", fontWeight: 600 }}>{recCount} rekam aktif.</span>}
          {offlineCount > 0 && <span style={{ color: "#dc2626" }}> {offlineCount} scanner putus.</span>}
        </div>
        <button type="button" style={S.btnSmall} onClick={() => void handleRefreshAll()}>
          Refresh semua
        </button>
        <button
          type="button"
          style={S.btnSmall}
          onClick={async () => {
            setRefreshError(null);
            try {
              await window.BuktiScanAgent.refreshConfig();
              const rows = await window.BuktiScanAgent.getMonitorGrid();
              if (activeRef.current) setCells(rows);
            } catch (err) {
              if (activeRef.current) {
                setRefreshError(agentErrorMessage(err, "Sync config gagal"));
              }
            }
          }}
        >
          Sync config
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 10,
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.cctvId}
            style={{
              ...S.card,
              marginBottom: 0,
              padding: 0,
              overflow: "hidden",
              borderColor: cell.state === "recording" ? "#fbbf24" : "#e2e8f0",
              borderWidth: cell.state === "recording" ? 2 : 1,
            }}
          >
            <div style={{ position: "relative", aspectRatio: "16/9" }}>
              <LiveRtcPlayer
                src={cell.previewSrc}
                baseUrl={cell.go2rtcBaseUrl}
              />
              {/* Status badges overlay */}
              <div
                style={{
                  position: "absolute",
                  bottom: 6,
                  left: 6,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 3,
                  pointerEvents: "none",
                }}
              >
                {cell.state === "recording" ? (
                  <span style={S.badgeAmber}>
                    ● REKAM {cell.invoiceNumber}
                    {cell.scannedAt && (
                      <span style={{ marginLeft: 6, fontWeight: 700 }}>
                        [<RecordingTimer scannedAt={cell.scannedAt} />]
                      </span>
                    )}
                  </span>
                ) : cell.state === "offline" ? (
                  <span style={S.badgeRed}>○ OFFLINE</span>
                ) : (
                  <span style={S.badgeGreen}>○ IDLE</span>
                )}
                {cell.scannerConnected ? (
                  <span style={S.badgeGreen}>Scanner OK</span>
                ) : (
                  <span style={S.badgeRed}>Scanner putus</span>
                )}
                {cell.operatorUsername && (
                  <span style={{ ...S.badgeGreen, background: "#f1f5f9", color: "#475569", borderColor: "#cbd5e1" }}>
                    👤 {cell.operatorUsername}
                  </span>
                )}
              </div>
              {/* Refresh stream button */}
              <button
                type="button"
                title="Refresh stream"
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  background: "rgba(0,0,0,0.5)",
                  border: "none",
                  borderRadius: 4,
                  color: "#fff",
                  fontSize: 11,
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
                onClick={() => void window.BuktiScanAgent.refreshPreview(cell.cctvId)}
              >
                ↺
              </button>
            </div>

            <div style={{ padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{cell.scannerLabel}</div>
                  <div style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>
                    {cell.cctvLabel}
                    {cell.operatorUsername ? ` · ${cell.operatorUsername}` : ""}
                  </div>
                  {(cell.cctvIp || cell.cctvRtspUrl) && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        color: "#64748b",
                        fontFamily: "monospace",
                        background: "#f8fafc",
                        padding: "4px 6px",
                        borderRadius: 4,
                        border: "1px solid #e2e8f0",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {cell.cctvIp && (
                        <div>
                          <strong style={{ color: "#475569" }}>IP:</strong> {cell.cctvIp}
                        </div>
                      )}
                      {cell.cctvRtspUrl && (
                        <div
                          style={{
                            wordBreak: "break-all",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.2,
                          }}
                          title={cell.cctvRtspUrl}
                        >
                          <strong style={{ color: "#475569" }}>RTSP:</strong> {cell.cctvRtspUrl}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    type="button"
                    style={S.btnSmall}
                    title="Ambil snapshot"
                    onClick={() => void handleSnapshot(cell.cctvId, cell.cctvLabel)}
                  >
                    📷
                  </button>
                  {cell.state === "recording" && cell.scanId && (
                    <button
                      type="button"
                      style={{
                        ...S.btnSmall,
                        background: "#fee2e2",
                        color: "#dc2626",
                        border: "1px solid #fca5a5",
                        opacity: stoppingId === cell.scanId ? 0.6 : 1,
                      }}
                      disabled={stoppingId === cell.scanId}
                      onClick={() => void handleStop(cell.scanId!)}
                    >
                      {stoppingId === cell.scanId ? "…" : "Stop"}
                    </button>
                  )}
                </div>
              </div>
              {cell.previewError && (
                <p style={{ ...S.error, marginTop: 4, marginBottom: 0, fontSize: 11 }}>
                  {cell.previewError}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Snapshot modal */}
      {snapshotCell && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
          onClick={() => setSnapshotCell(null)}
        >
          <div style={{ maxWidth: "90vw", maxHeight: "80vh", textAlign: "center" }}>
            <div style={{ color: "#fff", marginBottom: 8, fontSize: 13 }}>{snapshotCell.label}</div>
            <img
              src={snapshotCell.src}
              alt={snapshotCell.label}
              style={{ maxWidth: "100%", maxHeight: "70vh", borderRadius: 6 }}
            />
            <div style={{ color: "#94a3b8", marginTop: 8, fontSize: 11 }}>Klik untuk tutup</div>
          </div>
        </div>
      )}
    </div>
  );
}
