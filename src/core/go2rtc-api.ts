/** go2rtc OpenAPI: PUT/PATCH pakai `name` + `src` (URI), DELETE pakai `src` (nama stream). */
export function go2rtcUpsertStreamQuery(
  name: string,
  rtspSrc: string,
): URLSearchParams {
  return new URLSearchParams({ name, src: rtspSrc });
}

export function go2rtcLegacyPostStreamQuery(
  name: string,
  rtspSrc: string,
): URLSearchParams {
  return new URLSearchParams({ dst: name, src: rtspSrc });
}

export function go2rtcDeleteStreamQuery(name: string): URLSearchParams {
  return new URLSearchParams({ src: name });
}
