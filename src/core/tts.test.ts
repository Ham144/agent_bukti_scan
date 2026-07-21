import { describe, expect, it } from "vitest";
import {
  buildRecordingStartMessage,
  invoiceTailDigits,
  sanitizeOperatorName,
} from "./tts";

describe("sanitizeOperatorName", () => {
  it("returns Operator for empty input", () => {
    expect(sanitizeOperatorName(null, "Scanner 1")).toBe("Scanner 1");
    expect(sanitizeOperatorName("", "Scanner 1")).toBe("Scanner 1");
    expect(sanitizeOperatorName("...", "Scanner 1")).toBe("Scanner 1");
  });

  it("replaces dots dashes and symbols with spaces", () => {
    expect(sanitizeOperatorName("budi.santoso-01", "Scanner 1")).toBe("budi santoso 01");
    expect(sanitizeOperatorName("user@store#1", "Scanner 1")).toBe("user store 1");
  });

  it("keeps plain names", () => {
    expect(sanitizeOperatorName("Budi", "Scanner 1")).toBe("Budi");
  });
});

describe("invoiceTailDigits", () => {
  it("returns last 17 characters when longer", () => {
    const inv = "123456789012345678901234567890";
    expect(invoiceTailDigits(inv)).toBe("45678901234567890");
  });

  it("returns full string when shorter", () => {
    expect(invoiceTailDigits("INV123")).toBe("INV123");
  });
});

describe("buildRecordingStartMessage", () => {
  it("builds short rekamkemas-style announcement", () => {
    expect(
      buildRecordingStartMessage("budi.santoso", "123456789012345678901234567890"),
    ).toBe("budi santoso merekam");
  });

  it("falls back when invoice empty", () => {
    expect(buildRecordingStartMessage("budi", "  ")).toBe("budi merekam");
  });
});
