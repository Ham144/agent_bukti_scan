import { describe, expect, it } from "vitest";
import {
  go2rtcDeleteStreamQuery,
  go2rtcLegacyPostStreamQuery,
  go2rtcUpsertStreamQuery,
} from "./go2rtc-api";

describe("go2rtc stream API queries", () => {
  const rtsp =
    "rtsp://admin:pass@192.168.1.10/Streaming/Channels/102#rtsp_transport=tcp";

  it("upsert uses name + src", () => {
    const q = go2rtcUpsertStreamQuery("cctv_cam01", rtsp);
    expect(q.get("name")).toBe("cctv_cam01");
    expect(q.get("src")).toBe(rtsp);
    expect(q.get("dst")).toBeNull();
  });

  it("legacy post uses dst + src", () => {
    const q = go2rtcLegacyPostStreamQuery("cctv_cam01", rtsp);
    expect(q.get("dst")).toBe("cctv_cam01");
    expect(q.get("src")).toBe(rtsp);
  });

  it("delete uses src as stream name", () => {
    const q = go2rtcDeleteStreamQuery("cctv_cam01");
    expect(q.get("src")).toBe("cctv_cam01");
    expect(q.get("dst")).toBeNull();
  });
});
