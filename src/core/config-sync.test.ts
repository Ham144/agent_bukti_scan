import { describe, expect, it } from "vitest";
import type { AgentScannerConfig } from "./api-client";
import {
  scannerConfigFingerprint,
  scannerIdsKey,
  shouldReconnectSerial,
} from "./config-sync";

const scanner = (
  id: string,
  usbVendorId: number | null = null,
  usbProductId: number | null = null,
  baudRate = 9600,
  serialPortPath: string | null = null,
): AgentScannerConfig => ({
  id,
  label: id,
  baudRate,
  usbVendorId,
  usbProductId,
  serialPortPath,
  assignedUsername: null,
  cctv: {
    id: "cctv-1",
    label: "CCTV",
    rtspUrl: "rtsp://x",
    username: null,
    password: null,
    isActive: true,
  },
});

describe("shouldReconnectSerial", () => {
  it("reconnects when scanner added", () => {
    expect(shouldReconnectSerial([], [scanner("a")])).toBe(true);
  });

  it("reconnects when USB pairing changes", () => {
    const prev = [scanner("a", 1, 2)];
    const next = [scanner("a", 3, 4)];
    expect(shouldReconnectSerial(prev, next)).toBe(true);
  });

  it("reconnects when COM path changes", () => {
    const prev = [scanner("a", 1, 2, 9600, "COM3")];
    const next = [scanner("a", 1, 2, 9600, "COM4")];
    expect(shouldReconnectSerial(prev, next)).toBe(true);
  });

  it("skips reconnect when only label changed", () => {
    const prev = [scanner("a", 1, 2)];
    const next = [{ ...scanner("a", 1, 2), label: "Renamed" }];
    expect(shouldReconnectSerial(prev, next)).toBe(false);
  });

  it("reconnects when scanner removed", () => {
    expect(shouldReconnectSerial([scanner("a"), scanner("b")], [scanner("a")])).toBe(
      true,
    );
  });

  it("force always reconnects", () => {
    expect(shouldReconnectSerial([scanner("a")], [scanner("a")], true)).toBe(true);
  });
});

describe("scannerIdsKey", () => {
  it("sorts ids", () => {
    expect(scannerIdsKey([scanner("b"), scanner("a")])).toBe("a,b");
  });
});

describe("scannerConfigFingerprint", () => {
  it("includes baud rate", () => {
    const a = scannerConfigFingerprint([scanner("a", 1, 2, 9600)]);
    const b = scannerConfigFingerprint([scanner("a", 1, 2, 115200)]);
    expect(a).not.toBe(b);
  });
});
