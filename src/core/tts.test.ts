import { describe, expect, it } from "vitest";
import {
  buildRecordingStartMessage,
  sanitizeScannerLabel,
} from "./tts";

describe("sanitizeScannerLabel", () => {
  it("returns Scanner for empty/null input", () => {
    expect(sanitizeScannerLabel(null)).toBe("Scanner");
    expect(sanitizeScannerLabel("")).toBe("Scanner");
    expect(sanitizeScannerLabel("...")).toBe("Scanner");
  });

  it("replaces dots, dashes and symbols with spaces", () => {
    expect(sanitizeScannerLabel("scanner.1")).toBe("scanner 1");
    expect(sanitizeScannerLabel("pos-kasir#1")).toBe("pos kasir 1");
  });

  it("keeps plain labels", () => {
    expect(sanitizeScannerLabel("Scanner 1")).toBe("Scanner 1");
  });
});

describe("buildRecordingStartMessage", () => {
  it("produces '<label> start recording' format", () => {
    expect(
      buildRecordingStartMessage(null, "Scanner 1"),
    ).toBe("Scanner 1 start recording");
  });

  it("ignores operator username, uses scanner label only", () => {
    expect(
      buildRecordingStartMessage("budi.santoso", "POS Kasir"),
    ).toBe("POS Kasir start recording");
  });

  it("falls back to Scanner when label is empty", () => {
    expect(buildRecordingStartMessage(null, "  ")).toBe("Scanner start recording");
  });
});
