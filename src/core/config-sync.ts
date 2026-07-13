import type { AgentScannerConfig } from "./api-client";

export function scannerConfigFingerprint(
  scanners: Pick<
    AgentScannerConfig,
    "id" | "usbVendorId" | "usbProductId" | "baudRate" | "serialPortPath"
  >[],
): string {
  return JSON.stringify(
    scanners.map((s) => [
      s.id,
      s.usbVendorId,
      s.usbProductId,
      s.baudRate,
      s.serialPortPath,
    ]),
  );
}

export function scannerIdsKey(
  scanners: Pick<AgentScannerConfig, "id">[],
): string {
  return scanners
    .map((s) => s.id)
    .sort()
    .join(",");
}

/** Reconnect serial only when scanner list or USB/baud mapping changed. */
export function shouldReconnectSerial(
  prev: AgentScannerConfig[] | null | undefined,
  next: AgentScannerConfig[],
  force = false,
): boolean {
  if (force) return true;
  if (!prev?.length && next.length) return true;
  if (!prev) return next.length > 0;
  if (scannerIdsKey(prev) !== scannerIdsKey(next)) return true;
  return scannerConfigFingerprint(prev) !== scannerConfigFingerprint(next);
}
