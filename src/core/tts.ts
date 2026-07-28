import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface TtsOptions {
  enabled: boolean;
  volume: number;
}

export type TtsErrorHandler = (message: string) => void;

let ttsCounter = 0;
function getTtsStamp(): string {
  ttsCounter = (ttsCounter + 1) % 1000000;
  return `${process.pid}-${Date.now()}-${ttsCounter}`;
}

/** Clean up scanner label for TTS pronunciation. */
export function sanitizeScannerLabel(label: string | null | undefined): string {
  if (!label?.trim()) return "Scanner";
  const cleaned = label
    .replace(/[._\-@+#/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Scanner";
}

/** "<Scanner Label> start recording" */
export function buildRecordingStartMessage(
  _operatorUsername: string | null | undefined,
  scannerLabel: string | null | undefined,
): string {
  return `${sanitizeScannerLabel(scannerLabel)} start recording`;
}

export function buildCameraDisconnectMessage(): string {
  return "Camera disconnected";
}

export function buildScannerDisconnectMessage(): string {
  return "Scanner disconnected";
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

/**
 * Speak using Windows built-in SAPI (System.Speech) — no internet required.
 * Uses the system default voice (typically English on most Windows installs).
 */
function speakWindows(
  text: string,
  volume: number,
  onError?: TtsErrorHandler,
): Promise<void> {
  return new Promise((resolve) => {
    const stamp = getTtsStamp();
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
      onError?.(err instanceof Error ? err.message : "TTS write failed");
      resolve();
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
      resolve();
    });

    proc.on("exit", (code) => {
      cleanupTempFiles(textFile, scriptFile);
      if (code !== 0 && code !== null) {
        onError?.(`TTS exit ${code}`);
      }
      resolve();
    });
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
    speakWindows(text, volume, onError).catch(() => {});
  }
  // Linux / macOS: TTS not supported in this build
}
