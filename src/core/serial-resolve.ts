import type { AgentScannerConfig } from "./api-client";
import type { ListedSerialPort } from "./serial";
import { parseUsbId } from "./scan-parse";

/** Resolve COM/tty path for a scanner config. */
export function resolveSerialPortPath(
  scanner: Pick<
    AgentScannerConfig,
    "serialPortPath" | "usbVendorId" | "usbProductId"
  >,
  ports: ListedSerialPort[],
  usedPaths: Set<string>,
): string | undefined {
  const saved = scanner.serialPortPath?.trim();
  if (saved) {
    if (!ports.some((p) => p.path === saved)) return undefined;
    return saved;
  }

  if (scanner.usbVendorId != null && scanner.usbProductId != null) {
    const vid = scanner.usbVendorId
      .toString(16)
      .padStart(4, "0")
      .toLowerCase();
    const pid = scanner.usbProductId
      .toString(16)
      .padStart(4, "0")
      .toLowerCase();
    const match = ports.find((p) => {
      if (usedPaths.has(p.path)) return false;
      const pVid = parseUsbId(p.vendorId)
        ?.toString(16)
        .padStart(4, "0")
        .toLowerCase();
      const pPid = parseUsbId(p.productId)
        ?.toString(16)
        .padStart(4, "0")
        .toLowerCase();
      return pVid === vid && pPid === pid;
    });
    return match?.path;
  }

  if (ports.length === 1 && !usedPaths.has(ports[0].path)) {
    return ports[0].path;
  }

  return undefined;
}
