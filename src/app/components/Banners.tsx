import React from "react";
import type { RuntimeStatusView } from "../../../electron/preload";
import { S } from "../styles";

export function DiskLowBanner({ status }: { status: RuntimeStatusView }) {
  if (!status.diskLow) return null;
  return (
    <div
      style={{
        ...S.warn,
        background: "#fef2f2",
        borderColor: "#fca5a5",
        color: "#991b1b",
        marginBottom: 12,
      }}
    >
      <strong>Disk hampir penuh.</strong> Tersisa {status.diskFreeLabel ?? "—"} di
      drive folder klip. Kosongkan ruang atau pindahkan folder klip sebelum rekam
      gagal.
    </div>
  );
}

export function GlobalStatusBanners({
  status,
  onUnpair,
}: {
  status: RuntimeStatusView;
  onUnpair?: () => void;
}) {
  const isAuthError =
    status.startupError != null &&
    /401|403|unauthorized|tidak terdaftar|tidak aktif|berakhir/i.test(
      status.startupError,
    );
  return (
    <>
      <DiskLowBanner status={status} />
      {status.startupError ? (
        <div
          style={{
            padding: "8px 10px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: 6,
            color: "#991b1b",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          <strong>Agent gagal jalan:</strong> {status.startupError}
          {isAuthError && onUnpair ? (
            <>
              {" — "}
              <button
                onClick={onUnpair}
                style={{
                  background: "none",
                  border: "none",
                  color: "#991b1b",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                Reset Pairing
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {status.busyMessage ? (
        <div
          style={{
            padding: "8px 10px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 6,
            color: "#92400e",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {status.busyMessage}
        </div>
      ) : null}
      {status.lastError ? (
        <div
          style={{
            padding: "8px 10px",
            background: "#fef2f2",
            borderRadius: 6,
            color: "#dc2626",
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {status.lastError}
        </div>
      ) : null}
    </>
  );
}
