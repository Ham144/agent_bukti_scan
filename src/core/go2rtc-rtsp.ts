/** go2rtc RTSP source — prefer TCP (Hikvision/Dahua di LAN). */
export function toGo2RtcRtspSource(rtspUrl: string): string {
  const trimmed = rtspUrl.trim();
  if (!trimmed) return trimmed;
  if (/#/.test(trimmed)) return trimmed;
  return `${trimmed}#rtsp_transport=tcp`;
}
