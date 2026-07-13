import { describe, expect, it } from "vitest";
import { go2rtcStreamName } from "./go2rtc-preview";
import { GO2RTC_API_BASE, GO2RTC_API_PORT } from "./go2rtc-constants";

describe("go2rtcStreamName", () => {
  it("prefixes with cctv_ and keeps alphanumeric", () => {
    expect(go2rtcStreamName("abc123")).toBe("cctv_abc123");
  });

  it("replaces hyphens and dots with underscore", () => {
    expect(go2rtcStreamName("cam-01.abc")).toBe("cctv_cam_01_abc");
  });

  it("replaces UUID separators", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = go2rtcStreamName(id);
    expect(result).toBe("cctv_550e8400_e29b_41d4_a716_446655440000");
    expect(result).toMatch(/^cctv_[a-z0-9_]+$/);
  });

  it("handles empty string", () => {
    expect(go2rtcStreamName("")).toBe("cctv_");
  });
});

describe("go2rtc constants", () => {
  it("API port is 1984", () => {
    expect(GO2RTC_API_PORT).toBe(1984);
  });

  it("API base points to localhost", () => {
    expect(GO2RTC_API_BASE).toBe("http://127.0.0.1:1984");
  });
});
