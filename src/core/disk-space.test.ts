import { describe, expect, it } from "vitest";
import {
  DISK_LOW_THRESHOLD_BYTES,
  formatFreeBytes,
  isDiskLow,
} from "./disk-space";

describe("isDiskLow", () => {
  it("returns false when unknown", () => {
    expect(isDiskLow(null)).toBe(false);
  });

  it("returns true below threshold", () => {
    expect(isDiskLow(DISK_LOW_THRESHOLD_BYTES - 1)).toBe(true);
    expect(isDiskLow(DISK_LOW_THRESHOLD_BYTES)).toBe(false);
  });
});

describe("formatFreeBytes", () => {
  it("formats gigabytes", () => {
    expect(formatFreeBytes(6 * 1024 ** 3)).toBe("6.0 GB");
  });

  it("formats megabytes for small values", () => {
    expect(formatFreeBytes(512 * 1024 ** 2)).toBe("512 MB");
  });
});
