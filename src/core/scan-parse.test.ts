import { describe, expect, it } from "vitest";
import {
  findDuplicateUsbBindings,
  formatUsbPair,
  parseScanLines,
  parseUsbId,
} from "./scan-parse";

describe("parseScanLines", () => {
  it("parses CRLF-delimited barcode", () => {
    expect(parseScanLines("INV001\r\n")).toEqual(["INV001"]);
  });

  it("parses LF-only barcode", () => {
    expect(parseScanLines("inv002\n")).toEqual(["INV002"]);
  });

  it("parses CR-only barcode", () => {
    expect(parseScanLines("abc123\r")).toEqual(["ABC123"]);
  });

  it("ignores short lines", () => {
    expect(parseScanLines("AB\r\n")).toEqual([]);
  });

  it("handles multiple lines in one chunk", () => {
    expect(parseScanLines("AAA\r\nBBB\r\n")).toEqual(["AAA", "BBB"]);
  });

  it("ignores scanner device-name prefix DN:", () => {
    expect(parseScanLines("DN:TM-T82\r\n")).toEqual([]);
    expect(parseScanLines("DN:TM-T82\r\nINV001\r\n")).toEqual(["INV001"]);
  });
});

describe("parseUsbId", () => {
  it("parses hex vendor id", () => {
    expect(parseUsbId("9969")).toBe(0x9969);
    expect(parseUsbId("0x9969")).toBe(0x9969);
  });

  it("returns null for invalid", () => {
    expect(parseUsbId(null)).toBeNull();
    expect(parseUsbId("")).toBeNull();
  });
});

describe("formatUsbPair", () => {
  it("formats vid:pid", () => {
    expect(formatUsbPair(9969, 22096)).toBe("9969:22096");
  });

  it("returns null when incomplete", () => {
    expect(formatUsbPair(null, 1)).toBeNull();
  });
});

describe("findDuplicateUsbBindings", () => {
  it("finds scanners sharing same USB", () => {
    const dupes = findDuplicateUsbBindings([
      { id: "a", usbVendorId: 9969, usbProductId: 22096 },
      { id: "b", usbVendorId: 9969, usbProductId: 22096 },
      { id: "c", usbVendorId: 1, usbProductId: 2 },
    ]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]).toHaveLength(2);
  });

  it("ignores unpaired scanners", () => {
    expect(
      findDuplicateUsbBindings([
        { id: "a", usbVendorId: null, usbProductId: null },
      ]),
    ).toEqual([]);
  });
});
