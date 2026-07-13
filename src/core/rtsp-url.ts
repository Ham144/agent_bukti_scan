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
