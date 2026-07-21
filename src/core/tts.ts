import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";

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

/** Bersihkan username operator agar TTS terdengar natural. */
export function sanitizeOperatorName(
  username: string | null | undefined,
  fallbackScanner: string | null | undefined,
): string {
  if (!username?.trim()) return fallbackScanner || "Operator";
  const cleaned = username
    .replace(/[._\-@+#/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallbackScanner || "Operator";
}

export function invoiceTailDigits(invoiceNumber: string, len = 17): string {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return "";
  return trimmed.length > len ? trimmed.slice(-len) : trimmed;
}

/** Gaya rekamkemas.id — singkat agar mudah didengar di gudang. */
export function buildRecordingStartMessage(
  operatorUsername: string | null | undefined,
  scannerLabel: string | null | undefined,
): string {
  const operatorName = sanitizeOperatorName(operatorUsername, scannerLabel);
  return `${operatorName} merekam`
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

function speakWindowsOffline(
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
      "$idVoice = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'id-ID' } | Select-Object -First 1",
      "if ($idVoice) { $s.SelectVoice($idVoice.VoiceInfo.Name) }",
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
        onError?.(`TTS Windows exit ${code}`);
      }
      resolve();
    });
  });
}

async function speakWindowsOnline(
  text: string,
  volume: number,
): Promise<boolean> {
  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=id&client=tw-ob&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const stamp = getTtsStamp();
    const mp3File = path.join(os.tmpdir(), `bukti-scan-tts-${stamp}.mp3`);
    const scriptFile = path.join(os.tmpdir(), `bukti-scan-tts-${stamp}.ps1`);

    fs.writeFileSync(mp3File, response.data);

    const script = [
      "param([string]$Mp3File, [int]$Volume)",
      "Add-Type -AssemblyName PresentationCore",
      "$player = New-Object System.Windows.Media.MediaPlayer",
      "$player.Open($Mp3File)",
      "$player.Volume = $Volume / 100.0",
      "$player.Play()",
      "Start-Sleep -Milliseconds 500",
      "if ($player.NaturalDuration.HasTimeSpan) {",
      "  $sec = $player.NaturalDuration.TimeSpan.TotalSeconds",
      "  Start-Sleep -Seconds $sec",
      "} else {",
      "  Start-Sleep -Seconds 5",
      "}"
    ].join("\r\n");

    fs.writeFileSync(scriptFile, script, "utf8");

    return new Promise((resolve) => {
      const proc = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-WindowStyle",
          "Hidden",
          "-File",
          scriptFile,
          "-Mp3File",
          mp3File,
          "-Volume",
          String(volume),
        ],
        { windowsHide: true, stdio: "ignore" },
      );

      proc.on("error", () => {
        cleanupTempFiles(mp3File, scriptFile);
        resolve(false);
      });

      proc.on("exit", () => {
        cleanupTempFiles(mp3File, scriptFile);
        resolve(true);
      });
    });
  } catch {
    return false;
  }
}

async function speakWindows(
  text: string,
  volume: number,
  onError?: TtsErrorHandler,
): Promise<void> {
  const success = await speakWindowsOnline(text, volume);
  if (!success) {
    await speakWindowsOffline(text, volume, onError);
  }
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
): Promise<void> {
  return new Promise((resolve) => {
    const candidates = ["espeak-ng", "espeak", "spd-say"];
    const cmd = candidates.find((name) => commandExists(name));
    if (!cmd) {
      onError?.("TTS tidak tersedia — install espeak-ng atau speech-dispatcher");
      resolve();
      return;
    }

    const args =
      cmd === "spd-say"
        ? ["-i", "50", "-r", "150", text]
        : ["-a", String(volume), "-s", "150", text];

    const proc = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    proc.on("error", (err) => {
      onError?.(err.message);
      resolve();
    });
    proc.on("exit", (code) => {
      if (code !== 0 && code !== null) onError?.(`TTS ${cmd} exit ${code}`);
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
  } else if (process.platform === "linux") {
    speakLinux(text, volume, onError).catch(() => {});
  } else if (process.platform === "darwin") {
    onError?.("TTS belum didukung di macOS — gunakan Windows atau Linux");
  }
}

let indonesianVoiceCached: boolean | null = null;

export function checkIndonesianVoiceWindows(): boolean {
  if (process.platform !== "win32") return true; // non-Windows doesn't use SAPI
  if (indonesianVoiceCached !== null) return indonesianVoiceCached;
  try {
    const script = `
      Add-Type -AssemblyName System.Speech
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $voices = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'id-ID' }
      if ($voices) { exit 0 } else { exit 1 }
    `;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true });
    indonesianVoiceCached = result.status === 0;
    return indonesianVoiceCached;
  } catch {
    indonesianVoiceCached = false;
    return false;
  }
}

