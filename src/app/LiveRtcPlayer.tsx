import { useEffect, useMemo, useRef, useState } from "react";
import { GO2RTC_API_BASE } from "../core/go2rtc-constants";

interface Props {
  src: string;
  baseUrl?: string;
}

const LOAD_TIMEOUT_MS = 30_000;

/** URL halaman player bawaan go2rtc — sama dengan yang bisa diputar di browser. */
export function go2rtcStreamPageUrl(
  streamName: string,
  baseUrl = GO2RTC_API_BASE,
): string {
  const q = new URLSearchParams({
    src: streamName,
    background: "false",
    width: "100%",
    controls: "false",
  });
  return `${baseUrl}/stream.html?${q.toString()}`;
}

/**
 * Embed go2rtc stream.html via iframe.
 * Lebih andal di Electron (file://) daripada img MJPEG atau WebRTC manual.
 */
export function LiveRtcPlayer({ src, baseUrl = GO2RTC_API_BASE }: Props) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const pageUrl = useMemo(
    () => `${go2rtcStreamPageUrl(src, baseUrl)}&t=${retry}`,
    [src, baseUrl, retry],
  );

  useEffect(() => {
    setLoading(true);
    setFailed(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setLoading(false);
      setFailed(true);
      timerRef.current = null;
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pageUrl]);

  if (failed) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 8,
        }}
      >
        <span style={{ color: "#f87171", fontSize: 12, textAlign: "center", fontWeight: 500 }}>
          Preview gagal dimuat atau terputus
        </span>
        <span style={{ color: "#94a3b8", fontSize: 11, textAlign: "center", maxWidth: 300 }}>
          Cek IP/koneksi kamera, atau pastikan pengaturan <b>Video Encoding</b> kamera (Sub-Stream) menggunakan <b>H.264</b> (jangan gunakan H.265 agar stabil di preview).
        </span>
        <button
          type="button"
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid #475569",
            background: "#1e293b",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
          onClick={() => {
            setFailed(false);
            setLoading(true);
            setRetry((n) => n + 1);
          }}
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            color: "#94a3b8",
            fontSize: 11,
            zIndex: 1,
          }}
        >
          Menghubungkan preview…
        </div>
      )}
      <iframe
        key={pageUrl}
        src={pageUrl}
        title={`Preview ${src}`}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          background: "#0f172a",
        }}
        allow="autoplay; fullscreen"
        onLoad={() => {
          setLoading(false);
          setFailed(false);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }}
      />
    </div>
  );
}
