import { SerialPort } from "serialport";
import type { AgentScannerConfig } from "./api-client";
import { parseScanLines } from "./scan-parse";
import { resolveSerialPortPath } from "./serial-resolve";

export type ScanHandler = (
  scannerId: string,
  invoiceNumber: string,
) => void | Promise<void>;

export type ScannerDisconnectHandler = (
  scannerId: string,
  message: string,
) => void;

export interface ListedSerialPort {
  path: string;
  vendorId: string | null;
  productId: string | null;
  manufacturer: string | null;
}

export async function listSerialPorts(): Promise<ListedSerialPort[]> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    vendorId: p.vendorId ?? null,
    productId: p.productId ?? null,
    manufacturer: p.manufacturer ?? null,
  }));
}

interface SerialSession {
  port: SerialPort;
  scannerId: string;
  portPath: string;
}

export class SerialManager {
  private sessions = new Map<string, SerialSession>();
  private usedPaths = new Set<string>();
  private lastErrors = new Map<string, string>();

  getPortPath(scannerId: string): string | null {
    return this.sessions.get(scannerId)?.portPath ?? null;
  }

  getConnectedScannerIds(): string[] {
    return [...this.sessions.keys()];
  }

  getScannerError(scannerId: string): string | null {
    return this.lastErrors.get(scannerId) ?? null;
  }

  private handlePortData(scannerId: string, chunk: Buffer, onScan: ScanHandler) {
    for (const invoice of parseScanLines(chunk.toString("utf8"))) {
      void onScan(scannerId, invoice);
    }
  }

  async connectScanner(
    scanner: AgentScannerConfig,
    onScan: ScanHandler,
    onDisconnectHandler?: ScannerDisconnectHandler,
  ): Promise<void> {
    if (this.sessions.has(scanner.id)) return;

    const ports = await listSerialPorts();
    const targetPath = resolveSerialPortPath(scanner, ports, this.usedPaths);

    if (!targetPath) {
      const msg = scanner.serialPortPath?.trim()
        ? `Port ${scanner.serialPortPath} tidak ditemukan — colok scanner dan pair ulang`
        : scanner.usbVendorId != null
          ? "Port USB tidak ditemukan — colok scanner dan pair ulang di tab Scanner"
          : "Belum pair USB — pilih port COM di tab Scanner";
      this.lastErrors.set(scanner.id, msg);
      throw new Error(msg);
    }

    if (this.usedPaths.has(targetPath)) {
      const msg = `Port ${targetPath} sudah dipakai scanner lain — satu COM hanya untuk satu scanner`;
      this.lastErrors.set(scanner.id, msg);
      throw new Error(msg);
    }

    const port = new SerialPort({
      path: targetPath,
      baudRate: scanner.baudRate || 9600,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((err) => (err ? reject(err) : resolve()));
    });

    port.on("data", (chunk: Buffer) => {
      this.handlePortData(scanner.id, chunk, onScan);
    });

    const onDisconnect = (message: string) => {
      if (!this.sessions.has(scanner.id)) return;
      this.usedPaths.delete(targetPath);
      this.sessions.delete(scanner.id);
      this.lastErrors.set(scanner.id, message);
      try {
        if (port.isOpen) port.close(() => {});
      } catch {
        /* ignore */
      }
      onDisconnectHandler?.(scanner.id, message);
    };

    port.on("close", () => {
      onDisconnect(`Scanner putus dari port ${targetPath}`);
    });

    port.on("error", () => {
      onDisconnect(`Scanner error di port ${targetPath}`);
    });

    this.sessions.set(scanner.id, {
      port,
      scannerId: scanner.id,
      portPath: targetPath,
    });
    this.usedPaths.add(targetPath);
    this.lastErrors.delete(scanner.id);
  }

  async disconnectAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      this.usedPaths.delete(session.portPath);
      await new Promise<void>((resolve) => {
        if (!session.port.isOpen) {
          resolve();
          return;
        }
        session.port.close(() => resolve());
      });
    }
    this.sessions.clear();
    this.usedPaths.clear();
  }

  async reconnectAll(
    scanners: AgentScannerConfig[],
    onScan: ScanHandler,
    onDisconnectHandler?: ScannerDisconnectHandler,
  ): Promise<void> {
    await this.disconnectAll();
    for (const scanner of scanners) {
      try {
        await this.connectScanner(scanner, onScan, onDisconnectHandler);
      } catch {
        /* scanner optional until paired USB */
      }
    }
  }
}
