import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface TtsOptions {
  enabled: boolean;
  volume: number;
}

export type TtsErrorHandler = (message: string) => void;

/** Bersihkan username operator agar TTS terdengar natural. */
export function sanitizeOperatorName(
  username: string | null | undefined,
): string {
  if (!username?.trim()) return "Operator";
  const cleaned = username
    .replace(/[._\-@+#/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Operator";
}

export function invoiceTailDigits(invoiceNumber: string, len = 17): string {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return "";
  return trimmed.length > len ? trimmed.slice(-len) : trimmed;
}

/** Gaya rekamkemas.id — singkat agar mudah didengar di gudang. */
export function buildRecordingStartMessage(
  _operatorUsername: string | null | undefined,
  invoiceNumber: string,
): string {
  const tail = invoiceTailDigits(invoiceNumber);
  return tail ? `Merekam resi ${tail}` : "Merekam resi";
}

export function buildCameraDisconnectMessage(): string {
  return "Kamera tidak dapat dihubungkan";
}

export function buildScannerDisconnectMessage(): string {
  return "Scanner terputus";
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(100, Math.round(volume)));
}

function cleanupTempFiles(...files: string[]): void {
  for (const file of files) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function speakWindows(
  text: string,
  volume: number,
  onError?: TtsErrorHandler,
): void {
  const stamp = `${process.pid}-${Date.now()}`;
  const textFile = path.join(os.tmpdir(), `bukti-scan-tts-${stamp}.txt`);
  const scriptFile = path.join(os.tmpdir(), `bukti-scan-tts-${stamp}.ps1`);

  const script = [
    "param([string]$TextFile, [int]$Volume)",
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$s.SetOutputToDefaultAudioDevice()",
    "$s.Volume = $Volume",
    "$content = [System.IO.File]::ReadAllText($TextFile, [System.Text.UTF8Encoding]::new($false))",
    "$s.Speak($content)",
    "$s.Dispose()",
  ].join("\r\n");

  try {
    fs.writeFileSync(textFile, text, "utf8");
    fs.writeFileSync(scriptFile, script, "utf8");
  } catch (err) {
    onError?.(err instanceof Error ? err.message : "Gagal menulis file TTS");
    return;
  }

  const proc = spawn(
    "powershell.exe",
    [
      "-STA",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      scriptFile,
      "-TextFile",
      textFile,
      "-Volume",
      String(volume),
    ],
    { windowsHide: true, stdio: "ignore" },
  );

  proc.on("error", (err) => {
    cleanupTempFiles(textFile, scriptFile);
    onError?.(err.message);
  });

  proc.on("exit", (code) => {
    cleanupTempFiles(textFile, scriptFile);
    if (code !== 0 && code !== null) {
      onError?.(`TTS Windows exit ${code}`);
    }
  });
}

function commandExists(cmd: string): boolean {
  try {
    const which = process.platform === "win32" ? "where.exe" : "which";
    const result = spawnSync(which, [cmd], { encoding: "utf8" });
    return result.status === 0 && Boolean(result.stdout?.trim());
  } catch {
    return false;
  }
}

function speakLinux(
  text: string,
  volume: number,
  onError?: TtsErrorHandler,
): void {
  const candidates = ["espeak-ng", "espeak", "spd-say"];
  const cmd = candidates.find((name) => commandExists(name));
  if (!cmd) {
    onError?.("TTS tidak tersedia — install espeak-ng atau speech-dispatcher");
    return;
  }

  const args =
    cmd === "spd-say"
      ? ["-i", "50", "-r", "150", text]
      : ["-a", String(volume), "-s", "150", text];

  const proc = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
  proc.on("error", (err) => onError?.(err.message));
  proc.on("exit", (code) => {
    if (code !== 0 && code !== null) onError?.(`TTS ${cmd} exit ${code}`);
  });
}

export function speak(
  text: string,
  options: TtsOptions,
  onError?: TtsErrorHandler,
): void {
  if (!options.enabled || !text.trim()) return;

  const volume = clampVolume(options.volume);

  if (process.platform === "win32") {
    speakWindows(text, volume, onError);
    return;
  }

  if (process.platform === "linux") {
    speakLinux(text, volume, onError);
    return;
  }

  if (process.platform === "darwin") {
    onError?.("TTS belum didukung di macOS — gunakan Windows atau Linux");
  }
}
