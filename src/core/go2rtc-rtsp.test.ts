import { describe, expect, it } from "vitest";
import { toGo2RtcRtspSource } from "./go2rtc-rtsp";

describe("toGo2RtcRtspSource", () => {
  it("appends tcp transport when no hash present", () => {
    const url = "rtsp://192.168.1.50:554/Streaming/Channels/102";
    expect(toGo2RtcRtspSource(url)).toBe(`${url}#rtsp_transport=tcp`);
  });

  it("leaves url with existing hash unchanged", () => {
    const url = "rtsp://192.168.1.50/cam?subtype=1#backchannel=0";
    expect(toGo2RtcRtspSource(url)).toBe(url);
  });
});
