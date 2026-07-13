import React, { useEffect, useState } from "react";
import type {
  RuntimeStatusView,
  ActiveRecordingView,
} from "../../../electron/preload";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import type { AgentConfig, Tab } from "../App";

function formatRecordingLimit(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "Tanpa batas (auto-cut scan berikutnya)";
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
  }
  if (sec >= 60) return `${Math.floor(sec / 60)} menit`;
  return `${sec} detik`;
}

function scanStatusLabel(status: string): string {
  switch (status) {
    case "RECORDING":
      return "Rekam";
    case "COMPLETED":
      return "Selesai";
    case "FAILED":
      return "Gagal";
    default:
      return status;
  }
}



function TtsRemoteHintCard({
  config,
  status,
}: {
  config: AgentConfig | null;
  status: RuntimeStatusView;
}) {
  const enabled = config?.ttsEnabled !== false;
  const volume = config?.ttsVolume ?? 80;
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      await window.BuktiScanAgent.testTts();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={S.card}>
      <div style={S.label}>Suara saat mulai rekam</div>
      <p style={{ ...S.hint, marginTop: 8 }}>
        Diatur dari <strong>dashboard web</strong> → Perangkat → Workstation &amp;
        Scanner → Pengaturan Agent.
      </p>
      <p style={{ ...S.hint, marginTop: 6 }}>
        Status: {enabled ? `aktif (volume ${volume})` : "nonaktif"} — sinkron
        otomatis ~30 detik. Ucapan: &quot;Merekam resi …&quot;
      </p>
      <button
        type="button"
        style={{ ...S.btnOutline, marginTop: 8, opacity: testing ? 0.7 : 1 }}
        disabled={testing || !enabled}
        onClick={() => void handleTest()}
      >
        {testing ? "Memutar..." : "Tes suara"}
      </button>
      {status.lastTtsError ? (
        <p style={{ ...S.error, marginBottom: 0 }}>{status.lastTtsError}</p>
      ) : null}
    </div>
  );
}

export function TabBeranda({
  status,
  config,
  onNavigate,
}: {
  status: RuntimeStatusView;
  config: AgentConfig | null;
  onNavigate: (tab: Tab) => void;
}) {
  const links = status.scanners ?? [];
  const anyConnected = links.some((l) => l.connected);
  const [activeRecs, setActiveRecs] = useState<ActiveRecordingView[]>([]);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);

  useEffect(() => {
    if (!status.recording) {
      setActiveRecs([]);
      return;
    }
    const poll = () => {
      void window.BuktiScanAgent.getActiveRecordings().then(setActiveRecs);
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [status.recording]);

  const handleStop = async (scanId: string) => {
    setStoppingId(scanId);
    setStopError(null);
    try {
      await window.BuktiScanAgent.stopRecording(scanId);
      setActiveRecs((prev) => prev.filter((r) => r.scanId !== scanId));
    } catch (err) {
      setStopError(agentErrorMessage(err, "Gagal menghentikan rekam"));
    } finally {
      setStoppingId(null);
    }
  };

  return (
    <div>
      <div
        style={{
          ...S.warn,
          background: "#eff6ff",
          borderColor: "#bfdbfe",
          color: "#1e40af",
        }}
      >
        <strong>Operasional scan:</strong> tutup window ini boleh — agent tetap
        jalan di tray. Scan barcode langsung; tidak perlu buka browser. Cek
        hasil di web → Scan Log.
      </div>

      <div style={S.card}>
        <div style={S.grid2}>
          <div>
            <div style={S.label}>Organisasi</div>
            <div style={S.value}>{config?.organizationName ?? "—"}</div>
          </div>
          <div>
            <div style={S.label}>Workstation</div>
            <div style={S.value}>{config?.workstationLabel ?? "—"}</div>
          </div>
          <div>
            <div style={S.label}>Status rekam</div>
            <div>
              {status.recording ? (
                <span style={S.badgeBlue}>● Merekam {status.lastScan ?? ""}</span>
              ) : (
                <span style={S.badgeGreen}>○ Siap scan</span>
              )}
            </div>
          </div>
          <div>
            <div style={S.label}>Scan terakhir</div>
            <div style={S.value}>{status.lastScan ?? "—"}</div>
          </div>
          <div>
            <div style={S.label}>Scanner terhubung</div>
            <div>
              {links.length === 0 ? (
                <span style={S.badgeGray}>Belum ada scanner</span>
              ) : anyConnected ? (
                <span style={S.badgeGreen}>
                  {links.filter((l) => l.connected).length}/{links.length} aktif
                </span>
              ) : (
                <span style={S.badgeRed}>
                  Tidak terhubung — pair USB di tab Scanner
                </span>
              )}
            </div>
          </div>
          <div>
            <div style={S.label}>Batas durasi rekam</div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {formatRecordingLimit(status.recordingMaxDurationSec)}
            </div>
          </div>
          <div>
            <div style={S.label}>File MP4 lokal</div>
            <div style={S.value}>{status.localClipCount ?? 0}</div>
          </div>
          <div>
            <div style={S.label}>Ruang disk tersisa</div>
            <div style={S.value}>
              {status.diskFreeLabel ?? "—"}
              {status.diskLow ? (
                <span style={{ ...S.badgeRed, marginLeft: 6 }}>Rendah</span>
              ) : null}
            </div>
          </div>
        </div>

        {stopError ? <p style={S.error}>{stopError}</p> : null}
      </div>

      {status.recording && activeRecs.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Rekam aktif</div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {activeRecs.map((rec) => (
              <li
                key={rec.scanId}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}
              >
                <span>
                  <strong>{rec.invoiceNumber}</strong>
                  {rec.remainingSec > 0 && (
                    <span style={{ color: "#64748b", marginLeft: 6 }}>
                      sisa {rec.remainingSec}s
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  style={{
                    ...S.btnSmall,
                    background: "#fee2e2",
                    color: "#dc2626",
                    border: "1px solid #fca5a5",
                    opacity: stoppingId === rec.scanId ? 0.6 : 1,
                  }}
                  disabled={stoppingId === rec.scanId}
                  onClick={() => void handleStop(rec.scanId)}
                >
                  {stoppingId === rec.scanId ? "Menghentikan…" : "Stop Rekam"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div style={S.card}>
          <div style={S.label}>Status per scanner</div>
          <ul
            style={{
              margin: "8px 0 0",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: 6,
            }}
          >
            {links.map((link) => (
              <li key={link.id} style={{ fontSize: 12 }}>
                <strong>{link.label}</strong>{" "}
                {link.connected ? (
                  <span style={S.badgeGreen}>Terhubung {link.portPath}</span>
                ) : (
                  <span style={S.badgeRed}>Putus</span>
                )}
                {link.error && (
                  <span
                    style={{ display: "block", color: "#dc2626", marginTop: 2 }}
                  >
                    {link.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TtsRemoteHintCard config={config} status={status} />



      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button
          type="button"
          style={S.btnOutline}
          onClick={() => onNavigate("monitor")}
        >
          Monitor live meja →
        </button>
        <button
          type="button"
          style={S.btnOutline}
          onClick={() => onNavigate("kamera")}
        >
          Preview CCTV →
        </button>
      </div>
      <button
        type="button"
        style={{ ...S.btnOutline, marginTop: 10, width: "100%" }}
        onClick={() => onNavigate("scanner")}
      >
        Pair USB scanner →
      </button>
    </div>
  );
}
