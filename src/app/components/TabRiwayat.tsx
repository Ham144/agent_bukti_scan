import React, { useEffect, useState } from "react";
import { agentErrorMessage } from "../../core/agent-error";
import { S } from "../styles";
import type { AgentConfig } from "../App";

interface InvoiceScanListItem {
  id: string;
  invoiceNumber: string;
  scannedAt: string;
  completedAt: string | null;
  videoPath: string | null;
  localClipPath: string | null;
  status: string;
  previousInvoice: string | null;
  scannedByUsername: string | null;
  hasLocalFile?: boolean;
  cctvConfig?: { label: string } | null;
  scannerConfig?: { label: string } | null;
  workstation?: { label: string } | null;
}

function formatDuration(scannedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const start = new Date(scannedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  if (diffMs <= 0) return "0:00";

  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

import type { RuntimeStatusView } from "../../../electron/preload";

export function TabRiwayat({ config, status }: { config: AgentConfig | null; status: RuntimeStatusView | null }) {
  const [items, setItems] = useState<InvoiceScanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "RECORDING" | "COMPLETED" | "FAILED">("ALL");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const query: any = {
      page,
      limit,
    };
    if (search.trim()) {
      query.search = search.trim();
    }
    if (statusFilter !== "ALL") {
      query.status = statusFilter;
    }
    // Always filter by this workstation to display local history only
    if (config?.workstationId) {
      query.workstationId = config.workstationId;
    }

    window.BuktiScanAgent.listInvoiceScans(query)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
        setLimit(res.limit);
      })
      .catch((err) => {
        setError(agentErrorMessage(err, "Gagal memuat riwayat scan dari server"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page, limit, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const handleReset = () => {
    setSearch("");
    setStatusFilter("ALL");
    setPage(1);
  };

  const handlePlay = async (invoiceNumber: string) => {
    setActionError(null);
    try {
      await window.BuktiScanAgent.openClipFile(invoiceNumber);
    } catch (err) {
      setActionError(agentErrorMessage(err, "Gagal membuka video"));
    }
  };

  const handleShowFolder = async (invoiceNumber: string) => {
    setActionError(null);
    try {
      await window.BuktiScanAgent.showClipInFolder(invoiceNumber);
    } catch (err) {
      setActionError(agentErrorMessage(err, "Gagal membuka folder"));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span style={S.badgeGreen}>Selesai</span>;
      case "FAILED":
        return <span style={S.badgeRed}>Gagal</span>;
      case "RECORDING":
        return <span style={S.badgeBlue}>Rekam</span>;
      default:
        return <span style={S.badgeGray}>{status}</span>;
    }
  };

  const getLocalFileBadge = (scan: InvoiceScanListItem) => {
    if (scan.status !== "COMPLETED") return null;
    if (scan.hasLocalFile) {
      return (
        <span
          style={{
            display: "inline-block",
            border: "1px solid #86efac",
            color: "#166534",
            background: "#f0fdf4",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 10,
            fontWeight: 600,
            marginLeft: 6,
          }}
        >
          Lokal OK
        </span>
      );
    }

    const retentionDays = status?.clipRetentionDays ?? 14;
    const scannedTime = new Date(scan.scannedAt).getTime();
    const isExpired = Date.now() - scannedTime > retentionDays * 24 * 60 * 60 * 1000;

    if (isExpired && retentionDays > 0) {
      return (
        <span
          style={{
            display: "inline-block",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            background: "#fef2f2",
            borderRadius: 4,
            padding: "1px 6px",
            fontSize: 10,
            fontWeight: 600,
            marginLeft: 6,
          }}
          title={`Video otomatis terhapus karena melewati batas retensi ${retentionDays} hari.`}
        >
          Terhapus (Expired)
        </span>
      );
    }

    return (
      <span
        style={{
          display: "inline-block",
          border: "1px solid #cbd5e1",
          color: "#475569",
          background: "#f8fafc",
          borderRadius: 4,
          padding: "1px 6px",
          fontSize: 10,
          fontWeight: 600,
          marginLeft: 6,
        }}
        title="File video tidak ditemukan secara lokal."
      >
        Terhapus
      </span>
    );
  };

  const totalPages = Math.ceil(total / limit) || 1;
  
const openBrowser = () => {
  const url = config?.apiBaseUrl + "/dashboard/scan-log";
  // Gunakan (window as any) agar TypeScript mengabaikan pengecekan tipe
  (window as any).electron?.openExternal(url); 
};

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Riwayat Scan Diambil dari Scan</h2>
          
          <span className="link" style={{cursor: "pointer"}} onClick={openBrowser}>Untuk melihat detail</span>
          <button type="button" style={S.btnSmall} onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {/* Form Pencarian & Filter Status */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <input
              type="text"
              style={{ ...S.input, marginTop: 0 }}
              placeholder="Cari no. resi / invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ×
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" style={S.btnPrimary}>
              🔍 Filter
            </button>
            <button type="button" style={S.btnOutline} onClick={handleReset}>
              Reset
            </button>
          </div>

          <div style={{ display: "flex", background: "#f1f5f9", padding: 2, borderRadius: 6, gap: 2, marginLeft: "auto" }}>
            {(["ALL", "COMPLETED", "RECORDING", "FAILED"] as const).map((filter) => {
              const active = statusFilter === filter;
              const label =
                filter === "ALL"
                  ? "Semua"
                  : filter === "COMPLETED"
                    ? "Selesai"
                    : filter === "RECORDING"
                      ? "Merekam"
                      : "Gagal";
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filter);
                    setPage(1);
                  }}
                  style={{
                    padding: "6px 12px",
                    border: "none",
                    background: active ? "#fff" : "transparent",
                    color: active ? "#1e293b" : "#64748b",
                    fontWeight: active ? 600 : 500,
                    borderRadius: 5,
                    fontSize: 12,
                    cursor: "pointer",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </form>

        {actionError && (
          <div style={{ ...S.error, padding: "8px 10px", background: "#fef2f2", borderRadius: 6, marginBottom: 12 }}>
            {actionError}
          </div>
        )}

        {/* Content Area */}
        {error ? (
          <p style={S.error}>{error}</p>
        ) : loading ? (
          <p style={{ color: "#94a3b8", padding: 24, textAlign: "center" }}>Memuat riwayat scan dari server...</p>
        ) : !items.length ? (
          <p style={{ color: "#94a3b8", padding: 32, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 8 }}>
            Tidak ada data scan ditemukan di server.
          </p>
        ) : (
          <div>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>INVOICE</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>WAKTU</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>SCANNER</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>CCTV</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>OPERATOR</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>STATUS</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>DURASI</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "#475569", fontWeight: 600 }}>SEBELUMNYA</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600, width: 150 }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((scan, idx) => {
                    const isAlt = idx % 2 === 1;
                    return (
                      <tr
                        key={scan.id}
                        style={{
                          background: isAlt ? "#f8fafc" : "#fff",
                          borderBottom: "1px solid #e2e8f0",
                        }}
                      >
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1e3a8a", wordBreak: "break-all" }}>
                          {scan.invoiceNumber}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569", whiteSpace: "nowrap" }}>
                          {new Date(scan.scannedAt).toLocaleString("id-ID", {
                            day: "numeric",
                            month: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {scan.scannerConfig?.label ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {scan.cctvConfig?.label ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {scan.scannedByUsername ?? "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div>{getStatusBadge(scan.status)}</div>
                            <div>{getLocalFileBadge(scan)}</div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569" }}>
                          {formatDuration(scan.scannedAt, scan.completedAt)}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b", wordBreak: "break-all" }}>
                          {scan.previousInvoice ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          {scan.status === "COMPLETED" && scan.hasLocalFile ? (
                            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                              <button
                                type="button"
                                onClick={() => void handlePlay(scan.invoiceNumber)}
                                style={{
                                  ...S.btnSmall,
                                  padding: "4px 8px",
                                  background: "#eff6ff",
                                  color: "#2563eb",
                                  border: "1px solid #bfdbfe",
                                }}
                                title="Putar video"
                              >
                                Play 🎥
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleShowFolder(scan.invoiceNumber)}
                                style={{
                                  ...S.btnSmall,
                                  padding: "4px 8px",
                                  background: "#f8fafc",
                                  color: "#475569",
                                }}
                                title="Tampilkan di folder"
                              >
                                Folder 📁
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ color: "#64748b" }}>
                {total} records · Halaman {page} dari {totalPages} · Tampilkan{" "}
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{
                    padding: "3px 6px",
                    border: "1px solid #cbd5e1",
                    borderRadius: 4,
                    fontSize: 12,
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>{" "}
                baris
              </div>

              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                  style={{ ...S.btnSmall, padding: "4px 8px", opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
                >
                  &lt;&lt;
                </button>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ ...S.btnSmall, padding: "4px 8px", opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
                >
                  &lt;
                </button>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 10px",
                    background: "#2563eb",
                    color: "#fff",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {page}
                </span>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ ...S.btnSmall, padding: "4px 8px", opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? "not-allowed" : "pointer" }}
                >
                  &gt;
                </button>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage(totalPages)}
                  style={{ ...S.btnSmall, padding: "4px 8px", opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? "not-allowed" : "pointer" }}
                >
                  &gt;&gt;
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
