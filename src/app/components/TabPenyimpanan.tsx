import React, { useState, useEffect } from "react";
import type { RuntimeStatusView } from "../../../electron/preload";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import { DiskLowBanner } from "./Banners";
import type { AgentConfig } from "../App";

function currentMonthClipsSubdir(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatFreeBytes(freeBytes: number | null): string {
  if (freeBytes == null) return "—";
  const gb = freeBytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = freeBytes / 1024 ** 2;
  return `${Math.round(mb)} MB`;
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

  const [primaryDir, setPrimaryDir] = useState(status.clipsDir || config?.clipsDir || "");
  const [secondaryDir, setSecondaryDir] = useState(status.clipsDirSecondary || "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (status.clipsDir) {
      setPrimaryDir(status.clipsDir);
    }
    if (status.clipsDirSecondary !== undefined) {
      setSecondaryDir(status.clipsDirSecondary || "");
    }
  }, [status.clipsDir, status.clipsDirSecondary]);

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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!primaryDir.trim()) {
      alert("Folder utama tidak boleh kosong");
      return;
    }
    if(primaryDir.trim() == secondaryDir.trim()){
      alert("Tidak boleh sama");
      return;
    }
    setSaving(true);
    setSaveSuccess(null);
    setSaveError(null);
    try {
      await window.BuktiScanAgent.updateStorageSettings({
        clipsDir: primaryDir.trim(),
        clipsDirSecondary: secondaryDir.trim() || null,
      });
      setSaveSuccess("Pengaturan folder penyimpanan berhasil disimpan.");
      onSync();
    } catch (err) {
      setSaveError(agentErrorMessage(err, "Gagal menyimpan pengaturan"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <DiskLowBanner status={status} />
      
      <form onSubmit={handleSaveSettings} style={S.card}>
        <div style={{ ...S.label, marginBottom: 6 }}>Folder Penyimpanan Utama (Disk 1)</div>
        <input
          type="text"
          style={{ ...S.input, marginTop: 0, marginBottom: 12 }}
          placeholder="Masukkan path folder utama (mis. D:\BuktiScan\clips)"
          value={primaryDir}
          onChange={(e) => setPrimaryDir(e.target.value)}
          required
        />
        
        <div style={{ ...S.label, marginBottom: 6 }}>Folder Penyimpanan Sekunder (Disk 2 - Opsional)</div>
        <input
          type="text"
          style={{ ...S.input, marginTop: 0, marginBottom: 16 }}
          placeholder="Masukkan path folder kedua jika ingin menggabungkan disk (mis. E:\BuktiScan\clips)"
          value={secondaryDir}
          onChange={(e) => setSecondaryDir(e.target.value)}
        />
        
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="submit"
            style={{ ...S.btnPrimary, flex: "0 0 auto", opacity: saving ? 0.7 : 1 }}
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
          <button
            type="button"
            style={{ ...S.btnOutline, flex: "0 0 auto", opacity: opening ? 0.7 : 1 }}
            disabled={opening || !status.clipsDir}
            onClick={() => void openFolder()}
          >
            {opening ? "Membuka..." : "Buka folder di Explorer"}
          </button>
        </div>
        {saveSuccess && <p style={{ ...S.success, marginTop: 8, marginBottom: 0 }}>{saveSuccess}</p>}
        {saveError && <p style={{ ...S.error, marginTop: 8, marginBottom: 0 }}>{saveError}</p>}
      </form>

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
        <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
          <div>
            Ruang disk Disk 1 (Utama): <strong>{status.diskFreeLabel && !status.clipsDirSecondary ? status.diskFreeLabel : (status.diskFreeBytes !== null && status.diskFreeBytesSecondary !== null && status.diskFreeBytesSecondary !== undefined ? formatFreeBytes(status.diskFreeBytes - status.diskFreeBytesSecondary) : status.diskFreeLabel || "—")}</strong>
          </div>
          {status.clipsDirSecondary ? (
            <div style={{ marginTop: 4 }}>
              Ruang disk Disk 2 (Sekunder): <strong>{status.diskFreeSecondaryLabel ?? "—"}</strong>
            </div>
          ) : null}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0", fontWeight: 600 }}>
            Total Ruang Bebas Gabungan: <span style={{ color: "#0f766e" }}>{status.diskFreeLabel ?? "—"}</span>
            {status.diskLow ? (
              <span style={{ color: "#dc2626", marginLeft: 6, fontWeight: 400 }}>
                — segera kosongkan drive
              </span>
            ) : null}
          </div>
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
