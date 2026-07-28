import { describe, expect, it } from "vitest";
import { toPreviewSubstreamUrl, maskRtspUrl } from "./rtsp-url";

describe("toPreviewSubstreamUrl", () => {
  it("converts Hikvision main channel to sub", () => {
    const main =
      "rtsp://192.168.1.50:554/Streaming/Channels/101";
    expect(toPreviewSubstreamUrl(main)).toBe(
      "rtsp://192.168.1.50:554/Streaming/Channels/102",
    );
  });

  it("converts Dahua subtype=0 to subtype=1", () => {
    const main = "rtsp://192.168.1.50:554/cam/realmonitor?channel=1&subtype=0";
    expect(toPreviewSubstreamUrl(main)).toBe(
      "rtsp://192.168.1.50:554/cam/realmonitor?channel=1&subtype=1",
    );
  });

  it("leaves already-sub stream unchanged", () => {
    const sub = "rtsp://192.168.1.50:554/Streaming/Channels/102";
    expect(toPreviewSubstreamUrl(sub)).toBe(sub);
  });
});

describe("maskRtspUrl", () => {
  it("masks username and password and extracts IP", () => {
    const original = "rtsp://admin:secret123@192.168.10.123:554/Streaming/Channels/101";
    const res = maskRtspUrl(original);
    expect(res.ip).toBe("192.168.10.123");
    expect(res.masked).toBe("rtsp://admin:***@192.168.10.123:554/Streaming/Channels/101");
  });
  
  it("handles username only and extracts IP", () => {
    const original = "rtsp://operator@192.168.1.50/live";
    const res = maskRtspUrl(original);
    expect(res.ip).toBe("192.168.1.50");
    expect(res.masked).toBe("rtsp://operator@192.168.1.50/live");
  });
  
  it("handles URL without credentials", () => {
    const original = "rtsp://10.0.0.5:8554/mystream";
    const res = maskRtspUrl(original);
    expect(res.ip).toBe("10.0.0.5");
    expect(res.masked).toBe("rtsp://10.0.0.5:8554/mystream");
  });

  it("handles empty or invalid URLs", () => {
    expect(maskRtspUrl("")).toEqual({ ip: "—", masked: "—" });
    expect(maskRtspUrl("  ")).toEqual({ ip: "—", masked: "—" });
  });
});