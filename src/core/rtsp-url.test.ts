import { describe, expect, it } from "vitest";
import { toPreviewSubstreamUrl } from "./rtsp-url";

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
