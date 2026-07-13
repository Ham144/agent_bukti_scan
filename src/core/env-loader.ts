import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), ".BuktiScan"),
  "BuktiScan",
);

function parseEnvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readEnvFile(filePath: string): Record<string, string> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return parseEnvContent(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Urutan: folder .exe → %APPDATA%/BuktiScan/.env → cwd (dev) */
export function envFileCandidates(): string[] {
  const candidates: string[] = [];
  try {
    candidates.push(path.join(path.dirname(process.execPath), ".env"));
  } catch {
    /* ignore */
  }
  candidates.push(path.join(CONFIG_DIR, ".env"));
  candidates.push(path.join(process.cwd(), ".env"));
  return candidates;
}

let loaded = false;

/** Muat variabel dari file .env ke process.env (sekali). */
export function loadAgentEnv(): void {
  if (loaded) return;
  loaded = true;

  for (const filePath of envFileCandidates()) {
    const parsed = readEnvFile(filePath);
    if (!parsed) continue;
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
}

export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function resolveDefaultApiBaseUrl(): string {
  loadAgentEnv();
  const fromProcess = process.env.BuktiScan_API_URL?.trim();
  if (fromProcess) return normalizeApiUrl(fromProcess);
  return "http://127.0.0.1:3001";
}

export function resolveDefaultClipsDir(): string | undefined {
  loadAgentEnv();
  const dir = process.env.BuktiScan_CLIPS_DIR?.trim();
  return dir || undefined;
}
