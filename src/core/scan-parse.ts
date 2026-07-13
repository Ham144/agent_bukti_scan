/** Prefix barcode konfigurasi scanner (bukan invoice). */
const SCANNER_NOISE_PREFIXES = [/^DN:/i, /^DEVICE:/i, /^NUL/i];

function isScannerNoiseLine(line: string): boolean {
  return SCANNER_NOISE_PREFIXES.some((re) => re.test(line));
}

/** Parse barcode lines from serial chunk (handles \\r, \\n, \\r\\n). */
export function parseScanLines(chunk: string): string[] {
  const invoices: string[] = [];
  for (const line of chunk.split(/[\r\n]+/)) {
    const invoice = line.trim().toUpperCase();
    if (invoice.length < 3) continue;
    if (isScannerNoiseLine(invoice)) continue;
    invoices.push(invoice);
  }
  return invoices;
}

export function parseUsbId(raw?: string | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/^0x/i, ""), 16);
  return Number.isFinite(n) ? n : null;
}

export function formatUsbPair(
  vendorId: number | null,
  productId: number | null,
): string | null {
  if (vendorId == null || productId == null) return null;
  return `${vendorId}:${productId}`;
}

export interface UsbBinding {
  scannerId: string;
  usbVendorId: number;
  usbProductId: number;
}

/** Scanners that share the same USB VID:PID — only one can open the port. */
export function findDuplicateUsbBindings(
  scanners: {
    id: string;
    usbVendorId: number | null;
    usbProductId: number | null;
  }[],
): UsbBinding[][] {
  const byKey = new Map<string, UsbBinding[]>();
  for (const s of scanners) {
    if (s.usbVendorId == null || s.usbProductId == null) continue;
    const key = `${s.usbVendorId}:${s.usbProductId}`;
    const row = byKey.get(key) ?? [];
    row.push({
      scannerId: s.id,
      usbVendorId: s.usbVendorId,
      usbProductId: s.usbProductId,
    });
    byKey.set(key, row);
  }
  return [...byKey.values()].filter((g) => g.length > 1);
}
