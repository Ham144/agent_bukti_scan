import React, { useState } from "react";
import type { RuntimeStatusView } from "../../../electron/preload";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import { DiskLowBanner } from "./Banners";
import type { AgentConfig } from "../App";

function currentMonthClipsSubdir(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function TabPenyimpanan({
  status,
  config,
  onSync,
}: {
  status: RuntimeStatusView;
  config: AgentConfig | null;
  onSync: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const openFolder = async () => {
    setOpening(true);
    try {
      await window.BuktiScanAgent.openClipsFolder();
    } finally {
      setOpening(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      await window.BuktiScanAgent.syncClips();
      setSyncMessage("Sinkron selesai — metadata terkirim ke server.");
      onSync();
    } catch (err) {
      setSyncError(agentErrorMessage(err, "Sinkron gagal"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <DiskLowBanner status={status} />
      <div style={S.card}>
        <div style={S.label}>Folder klip</div>
        <div
          style={{
            ...S.value,
            fontFamily: "monospace",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {status.clipsDir || config?.clipsDir || "—"}
        </div>
        <button
          type="button"
          style={{ ...S.btnOutline, opacity: opening ? 0.7 : 1 }}
          disabled={opening || !status.clipsDir}
          onClick={() => void openFolder()}
        >
          {opening ? "Membuka..." : "Buka folder di Explorer"}
        </button>
      </div>

      <div style={S.card}>
        <div style={S.label}>Struktur penyimpanan</div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
          MP4 final disimpan per bulan-tahun:
          <div
            style={{
              fontFamily: "monospace",
              marginTop: 6,
              padding: "8px 10px",
              background: "#f8fafc",
              borderRadius: 6,
              wordBreak: "break-all",
            }}
          >
            {(status.clipsDir || config?.clipsDir || "D:\\BuktiScan\\clips")}/
            {currentMonthClipsSubdir()}/
            {"{invoice}.mp4"}
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
          Ruang disk tersisa: <strong>{status.diskFreeLabel ?? "—"}</strong>
          {status.diskLow ? (
            <span style={{ color: "#dc2626", marginLeft: 6 }}>
              — segera kosongkan drive
            </span>
          ) : null}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.label}>Auto-cleanup rekaman lama</div>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
          Hapus otomatis MP4 yang lebih tua dari{" "}
          <strong>
            {status.clipRetentionDays ?? 14} hari
          </strong>
          {status.clipRetentionDays === 0 ? " (nonaktif)" : ""}.
          {status.lastCleanupAt ? (
            <>
              {" "}
              Terakhir: {new Date(status.lastCleanupAt).toLocaleString("id-ID")}
              {status.lastCleanupDeleted
                ? ` — ${status.lastCleanupDeleted} file dihapus`
                : ""}
              .
            </>
          ) : null}
        </div>
        <p style={{ ...S.hint, marginTop: 8 }}>
          Atur dari dashboard web → Pengaturan Agent. Agent membersihkan saat
          startup dan tiap 6 jam.
        </p>
      </div>
          
      <div style={S.card}>
        <div style={S.grid2}>
          <div>
            <div style={S.label}>File MP4 lokal</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {status.localClipCount ?? 0}
            </div>
          </div>
          <div>
            <div style={S.label}>Sinkron ke Scan Log</div>
            <div style={{ ...S.value, fontSize: 12 }}>
              Otomatis ~1 menit + manual di bawah
            </div>
          </div>
        </div>
        <button
          type="button"
          style={{ ...S.btnPrimary, marginTop: 12, opacity: syncing ? 0.7 : 1 }}
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          {syncing ? "Menyinkronkan..." : "Sinkron sekarang"}
        </button>
        {syncMessage ? <p style={S.success}>{syncMessage}</p> : null}
        {syncError ? <p style={S.error}>{syncError}</p> : null}
      </div>

      <p style={S.hint}>
        Video tersimpan di disk PC kasir. MP4 muncul setelah rekam selesai
        (bukan langsung saat bip). Cek hasil di web → Scan Log (browser di PC
        yang sama untuk putar video).
      </p>
    </div>
  );
}
