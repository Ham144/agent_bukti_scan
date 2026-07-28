/**
 * Prefer substream / low-bandwidth RTSP for live preview grids.
 * Main stream stays on the configured URL for recording.
 */
export function toPreviewSubstreamUrl(rtspUrl: string): string {
  const trimmed = rtspUrl.trim();
  if (!trimmed) return trimmed;

  // Hikvision: .../Channels/101 → .../Channels/102 (main → sub)
  const hik = trimmed.replace(
    /(\/Streaming\/Channels\/)(\d+)01(\b)/i,
    "$1$202$3",
  );
  if (hik !== trimmed) return hik;

  // Dahua / generic subtype=0 → subtype=1
  if (/subtype=0/i.test(trimmed)) {
    return trimmed.replace(/subtype=0/i, "subtype=1");
  }

  // Already substream or unknown vendor — use as-is
  return trimmed;
}

/**
 * Parse and mask credentials of RTSP URL to display it safely in UI,
 * returning the hostname/IP and the masked URL.
 */
export function maskRtspUrl(rtspUrl: string): { ip: string; masked: string } {
  const trimmed = rtspUrl.trim();
  if (!trimmed) return { ip: "—", masked: "—" };

  // Try to parse using regex matching the rtsp://[creds@]host[:port][path]
  const regex = /^([a-zA-Z0-9+.-]+:\/\/)(?:([^@/]+)@)?([^:/]+)(?::(\d+))?(\/.*)?$/;
  const match = trimmed.match(regex);
  if (match) {
    const scheme = match[1];
    const credentials = match[2] || "";
    const host = match[3];
    const port = match[4] ? `:${match[4]}` : "";
    const path = match[5] || "";

    let maskedCreds = "";
    if (credentials) {
      const parts = credentials.split(":");
      const username = parts[0];
      maskedCreds = parts.length > 1 ? `${username}:***@` : `${username}@`;
    }

    return {
      ip: host,
      masked: `${scheme}${maskedCreds}${host}${port}${path}`,
    };
  }

  // Fallback
  return { ip: trimmed, masked: trimmed };
}

