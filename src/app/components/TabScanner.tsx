import React from "react";
import type {
  AgentScannerView,
  ScannerLinkView,
  ListedSerialPortView,
} from "../../../electron/preload";
import { findDuplicateUsbBindings, parseUsbId } from "../../core/scan-parse";
import { S } from "../styles";

function portLabel(port: ListedSerialPortView): string {
  const vid = parseUsbId(port.vendorId);
  const pid = parseUsbId(port.productId);
  const ids = vid != null && pid != null ? ` (${vid}:${pid})` : "";
  const maker = port.manufacturer ? ` — ${port.manufacturer}` : "";
  return `${port.path}${ids}${maker}`;
}

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("id-ID");
}

export function TabScanner({
  scanners,
  links,
  serialPorts,
  pairingScannerId,
  selectedPortPath,
  usbLoading,
  usbError,
  usbSuccess,
  configSyncedAt,
  onStartPair,
  onCancelPair,
  onSelectPort,
  onConfirmPair,
  onRefreshConfig,
  onRefreshPorts,
}: {
  scanners: AgentScannerView[];
  links: ScannerLinkView[];
  serialPorts: ListedSerialPortView[];
  pairingScannerId: string | null;
  selectedPortPath: string;
  usbLoading: boolean;
  usbError: string | null;
  usbSuccess: string | null;
  configSyncedAt: string | null;
  onStartPair: (id: string) => void;
  onCancelPair: () => void;
  onSelectPort: (path: string) => void;
  onConfirmPair: (id: string) => void;
  onRefreshConfig: () => void;
  onRefreshPorts: () => void;
}) {
  const dupes = findDuplicateUsbBindings(scanners);
  const linkById = new Map(links.map((l) => [l.id, l]));

  if (!scanners.length) {
    return (
      <div style={S.card}>
        <p style={{ color: "#64748b" }}>
          Belum ada scanner di workstation ini.
        </p>
        <p style={S.hint}>
          Tambahkan scanner di dashboard web → Perangkat → Workstation &
          Scanner.
        </p>
        <button
          type="button"
          style={{ ...S.btnOutline, marginTop: 10 }}
          onClick={onRefreshConfig}
        >
          Refresh daftar dari server
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <p style={{ color: "#64748b", margin: 0, fontSize: 12 }}>
          Pair USB di sini. Label, baud, CCTV → atur di dashboard web.
        </p>
        <button type="button" style={S.btnSmall} onClick={onRefreshConfig}>
          Refresh config
        </button>
        <button type="button" style={S.btnSmall} onClick={onRefreshPorts}>
          Refresh port COM
        </button>
      </div>
      <p style={S.hint}>
        Config terakhir sync: {formatSyncedAt(configSyncedAt)} (otomatis ~30
        detik)
      </p>

      {dupes.length > 0 && (
        <div style={S.warn}>
          Beberapa scanner memakai USB ID sama — hanya satu yang bisa terhubung.
          Hapus duplikat di web atau pair ulang ke scanner yang benar.
        </div>
      )}

      {usbSuccess && (
        <div
          style={{
            ...S.success,
            padding: "8px 10px",
            background: "#dcfce7",
            borderRadius: 6,
            marginBottom: 10,
          }}
        >
          {usbSuccess}
        </div>
      )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 10,
        }}
      >
        {scanners.map((scanner) => {
          const link = linkById.get(scanner.id);
          return (
            <li key={scanner.id} style={S.card}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>
                    {scanner.label}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>
                    CCTV: {scanner.cctv?.label ?? "—"} · {scanner.baudRate} baud
                    {scanner.assignedUsername ? (
                      <> · Operator: {scanner.assignedUsername}</>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    {link?.connected ? (
                      <span style={S.badgeGreen}>
                        Terhubung {link.portPath}
                      </span>
                    ) : scanner.usbVendorId != null ? (
                      <span style={S.badgeAmber}>
                        USB {scanner.usbVendorId}:{scanner.usbProductId} — putus
                      </span>
                    ) : (
                      <span style={S.badgeGray}>USB belum di-pair</span>
                    )}
                  </div>
                  {link?.error && (
                    <p style={{ ...S.error, marginTop: 4, marginBottom: 0 }}>
                      {link.error}
                    </p>
                  )}
                </div>
                {pairingScannerId !== scanner.id && (
                  <button
                    type="button"
                    style={S.btnSmall}
                    onClick={() => onStartPair(scanner.id)}
                  >
                    {scanner.usbVendorId != null ? "Ganti port" : "Pair USB"}
                  </button>
                )}
              </div>

              {pairingScannerId === scanner.id && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={S.divider} />
                  <div style={S.label}>
                    Colok scanner (mode VCOM) lalu pilih port COM:
                  </div>
                  <select
                    style={S.input}
                    value={selectedPortPath}
                    onChange={(e) => onSelectPort(e.target.value)}
                  >
                    <option value="">
                      {serialPorts.length
                        ? "Pilih port COM..."
                        : "Tidak ada port — colok scanner lalu Refresh port COM"}
                    </option>
                    {serialPorts.map((port) => (
                      <option key={port.path} value={port.path}>
                        {portLabel(port)}
                      </option>
                    ))}
                  </select>
                  {usbError && <p style={S.error}>{usbError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={{
                        ...S.btnPrimary,
                        opacity: usbLoading || !selectedPortPath ? 0.6 : 1,
                      }}
                      disabled={usbLoading || !selectedPortPath}
                      onClick={() => onConfirmPair(scanner.id)}
                    >
                      {usbLoading ? "Menyimpan..." : "Simpan"}
                    </button>
                    <button
                      type="button"
                      style={S.btnOutline}
                      onClick={onCancelPair}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p style={S.hint}>
        Setelah badge hijau &quot;Terhubung COMx&quot;, scan barcode — agent
        otomatis rekam CCTV.
      </p>
    </div>
  );
}
