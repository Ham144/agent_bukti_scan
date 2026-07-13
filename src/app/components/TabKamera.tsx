import React, { useEffect, useRef, useState } from "react";
import type { AgentScannerView } from "../../../electron/preload";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import { LiveRtcPlayer } from "../LiveRtcPlayer";

export function TabKamera({
  cctvs,
  activeCctvId,
  onSelectCctv,
}: {
  cctvs: AgentScannerView["cctv"][];
  activeCctvId: string;
  onSelectCctv: (id: string) => void;
}) {
  const activeCctv = cctvs.find((c) => c.id === activeCctvId) ?? cctvs[0] ?? null;
  const [liveActive, setLiveActive] = useState(false);
  const [liveStarting, setLiveStarting] = useState(false);
  const [liveKey, setLiveKey] = useState(0);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const prevCctvIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevCctvIdRef.current;
    if (prev && prev !== activeCctv?.id) {
      void window.BuktiScanAgent.stopCameraPreview(prev);
      setLiveActive(false);
      setSnapshotUrl(null);
    }
    prevCctvIdRef.current = activeCctv?.id ?? null;
  }, [activeCctv?.id]);

  useEffect(() => {
    return () => {
      if (prevCctvIdRef.current) {
        void window.BuktiScanAgent.stopCameraPreview(prevCctvIdRef.current);
      }
    };
  }, []);

  const handleStartLive = async () => {
    if (!activeCctv) return;
    setSnapshotUrl(null);
    setSnapshotError(null);
    setLiveStarting(true);
    try {
      await window.BuktiScanAgent.startCameraPreview(activeCctv.id);
      setLiveActive(true);
      setLiveKey((k) => k + 1);
    } catch (err) {
      setLiveActive(false);
      setSnapshotError(agentErrorMessage(err, "Live preview gagal"));
    } finally {
      setLiveStarting(false);
    }
  };

  const handleStopLive = async () => {
    if (!activeCctv) return;
    await window.BuktiScanAgent.stopCameraPreview(activeCctv.id);
    setLiveActive(false);
  };

  const handleSnapshot = async () => {
    if (!activeCctv) return;
    setSnapshotLoading(true);
    setSnapshotError(null);
    setSnapshotUrl(null);
    try {
      const b64 = await window.BuktiScanAgent.captureCctvSnapshot(activeCctv.id);
      setSnapshotUrl(`data:image/jpeg;base64,${b64}`);
    } catch (err) {
      setSnapshotError(agentErrorMessage(err, "Snapshot gagal"));
    } finally {
      setSnapshotLoading(false);
    }
  };

  if (!cctvs.length) {
    return (
      <div style={S.card}>
        <p style={{ color: "#64748b" }}>Belum ada CCTV dikonfigurasi.</p>
        <p style={S.hint}>
          Tambahkan CCTV di dashboard web → Perangkat → Konfigurasi CCTV.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Pilih kamera</div>
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <select
            style={{ ...S.input, marginTop: 0, flex: 1, minWidth: 120 }}
            value={activeCctvId}
            onChange={(e) => onSelectCctv(e.target.value)}
          >
            {cctvs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={S.btnPrimary}
            disabled={!activeCctv || liveStarting}
            onClick={() => void handleStartLive()}
          >
            {liveStarting ? "Menghubungkan…" : liveActive ? "Restart Live" : "Mulai Live"}
          </button>
          {liveActive ? (
            <button
              type="button"
              style={S.btnOutline}
              onClick={() => void handleStopLive()}
            >
              Stop Live
            </button>
          ) : null}
          <button
            type="button"
            style={{ ...S.btnOutline, opacity: snapshotLoading ? 0.7 : 1 }}
            disabled={snapshotLoading || !activeCctv}
            onClick={() => void handleSnapshot()}
          >
            {snapshotLoading ? "Mengambil…" : "Snapshot"}
          </button>
        </div>

        {activeCctv && (
          <div style={{ marginTop: 8 }}>
            <div style={S.label}>URL RTSP (read-only — edit di dashboard web)</div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "#475569",
                wordBreak: "break-all",
                marginTop: 2,
              }}
            >
              {activeCctv.rtspUrl}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...S.previewBox, padding: 0, overflow: "hidden" }}>
        {liveActive && activeCctv ? (
          <LiveRtcPlayer key={liveKey} src={`cctv_${activeCctv.id.replace(/[^a-zA-Z0-9]/g, "_")}`} />
        ) : snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt="Snapshot CCTV"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        ) : (
          <p style={{ color: "#94a3b8", fontSize: 12, padding: 16, textAlign: "center", margin: 0 }}>
            {snapshotError ?? "Klik 'Mulai Live' untuk preview live atau 'Snapshot' untuk tes satu frame."}
          </p>
        )}
      </div>
      {snapshotError && !liveActive && (
        <p style={{ ...S.error, marginTop: 8 }}>{snapshotError}</p>
      )}
      <p style={S.hint}>
        Preview satu kamera — untuk semua meja pakai tab Monitor. Substream via
        go2rtc; snapshot diambil langsung dari LAN.
      </p>
    </div>
  );
}
