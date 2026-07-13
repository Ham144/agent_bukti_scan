import { describe, expect, it } from "vitest";
import { resolveSerialPortPath } from "./serial-resolve";

describe("resolveSerialPortPath", () => {
  const ports = [
    { path: "COM3", vendorId: "9969", productId: "5640", manufacturer: null },
    { path: "COM4", vendorId: "9969", productId: "5640", manufacturer: null },
    { path: "COM5", vendorId: "abcd", productId: "1234", manufacturer: null },
  ];

  it("prefers saved serialPortPath", () => {
    expect(
      resolveSerialPortPath(
        {
          serialPortPath: "COM4",
          usbVendorId: 9969,
          usbProductId: 22080,
        },
        ports,
        new Set(),
      ),
    ).toBe("COM4");
  });

  it("returns undefined when saved port missing", () => {
    expect(
      resolveSerialPortPath(
        { serialPortPath: "COM99", usbVendorId: null, usbProductId: null },
        ports,
        new Set(),
      ),
    ).toBeUndefined();
  });

  it("picks first unused port for same VID:PID", () => {
    expect(
      resolveSerialPortPath(
        { serialPortPath: null, usbVendorId: 0x9969, usbProductId: 0x5640 },
        ports,
        new Set(),
      ),
    ).toBe("COM3");
    expect(
      resolveSerialPortPath(
        { serialPortPath: null, usbVendorId: 0x9969, usbProductId: 0x5640 },
        ports,
        new Set(["COM3"]),
      ),
    ).toBe("COM4");
  });

  it("skips ports already in use", () => {
    expect(
      resolveSerialPortPath(
        { serialPortPath: "COM3", usbVendorId: null, usbProductId: null },
        ports,
        new Set(["COM3"]),
      ),
    ).toBe("COM3");
  });
});
