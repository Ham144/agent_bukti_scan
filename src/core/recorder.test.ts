import { describe, expect, it } from "vitest";
import {
  isFirstSegmentReady,
  segmentTransportForRetry,
} from "./recorder";

describe("segmentTransportForRetry", () => {
  it("alternates tcp and udp", () => {
    expect(segmentTransportForRetry(0)).toBe("tcp");
    expect(segmentTransportForRetry(1)).toBe("udp");
    expect(segmentTransportForRetry(2)).toBe("tcp");
  });
});

describe("isFirstSegmentReady", () => {
  it("accepts small first segment above verify threshold", () => {
    expect(isFirstSegmentReady(10_000, 0)).toBe(true);
  });

  it("rejects tiny first segment", () => {
    expect(isFirstSegmentReady(100, 0)).toBe(false);
  });

  it("accepts when already on second segment", () => {
    expect(isFirstSegmentReady(0, 1)).toBe(true);
  });
});
