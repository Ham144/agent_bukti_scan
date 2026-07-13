import React from "react";
import { S } from "../styles";
import type { AgentConfig } from "../App";

export function TabTentang({
  config,
  agentVersion,
}: {
  config: AgentConfig | null;
  agentVersion: string;
}) {
  return (
    <div>
      <div style={S.card}>
        <div style={S.label}>Peran aplikasi</div>
        <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, margin: "6px 0 0" }}>
          <strong>Agent (aplikasi ini)</strong> jalan di PC kasir: baca scanner USB,
          rekam CCTV, simpan MP4 lokal, sinkron ke cloud. Tab Scanner/Kamera/Monitor
          hanya untuk <em>operasional &amp; tes</em> — bukan tempat edit konfigurasi.
        </p>
        <p style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, margin: "10px 0 0" }}>
          <strong>Dashboard web</strong> untuk admin: buat workstation, assign operator +
          CCTV, lihat Scan Log lengkap, kelola organisasi. Satu sumber konfigurasi
          (server); agent hanya menarik config dan menjalankannya.
        </p>
      </div>

      <div style={S.card}>
        <div style={S.grid2}>
          <div>
            <div style={S.label}>Versi agent</div>
            <div style={S.value}>{agentVersion}</div>
          </div>
          <div>
            <div style={S.label}>Organisasi</div>
            <div style={S.value}>{config?.organizationName ?? "—"}</div>
          </div>
          <div>
            <div style={S.label}>Workstation</div>
            <div style={S.value}>{config?.workstationLabel ?? "—"}</div>
          </div>
          <div>
            <div style={S.label}>Workstation ID</div>
            <div
              style={{
                ...S.value,
                fontFamily: "monospace",
                fontSize: 11,
                wordBreak: "break-all",
              }}
            >
              {config?.workstationId ?? "—"}
            </div>
          </div>
        </div>
        <div style={S.divider} />
        <div>
          <div style={S.label}>URL API cloud</div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              wordBreak: "break-all",
            }}
          >
            {config?.apiBaseUrl ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
