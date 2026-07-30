import fs from "fs";
import os from "os";
import path from "path";
import {
  loadAgentEnv,
  resolveDefaultApiBaseUrl,
  resolveDefaultClipsDir,
} from "./env-loader";

loadAgentEnv();

export interface AgentConfig {
  apiBaseUrl: string;
  deviceToken?: string;
  workstationId?: string;
  organizationName?: string;
  workstationLabel?: string;
  clipsDir: string;
  clipsDirSecondary?: string;
  ttsEnabled?: boolean;
  ttsVolume?: number;
  clipRetentionDays?: number;
  hideTtsLanguageWarning?: boolean;
}

const CONFIG_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), ".BuktiScan"),
  "BuktiScan",
);
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function defaultClipsDir(): string {
  const fromEnv = resolveDefaultClipsDir();
  if (fromEnv) return fromEnv;
  if (process.platform === "win32") {
    return path.join("D:", "BuktiScan", "clips");
  }
  return path.join(os.homedir(), "BuktiScan", "clips");
}

const DEFAULT_API = resolveDefaultApiBaseUrl();

export function loadConfig(): AgentConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(
        fs.readFileSync(CONFIG_PATH, "utf8"),
      ) as Partial<AgentConfig>;
      return {
        apiBaseUrl: raw.apiBaseUrl || DEFAULT_API,
        clipsDir: raw.clipsDir || defaultClipsDir(),
        clipsDirSecondary: raw.clipsDirSecondary,
        deviceToken: raw.deviceToken,
        workstationId: raw.workstationId,
        organizationName: raw.organizationName,
        workstationLabel: raw.workstationLabel,
        ttsEnabled: raw.ttsEnabled !== false,
        ttsVolume:
          typeof raw.ttsVolume === "number"
            ? Math.max(0, Math.min(100, raw.ttsVolume))
            : 80,
        clipRetentionDays:
          typeof raw.clipRetentionDays === "number"
            ? Math.max(0, Math.min(365, Math.round(raw.clipRetentionDays)))
            : 14,
        hideTtsLanguageWarning: !!raw.hideTtsLanguageWarning,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    apiBaseUrl: DEFAULT_API,
    clipsDir: defaultClipsDir(),
    ttsEnabled: true,
    ttsVolume: 80,
    clipRetentionDays: 14,
    hideTtsLanguageWarning: false,
  };
}

export function saveConfig(config: AgentConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export function configPath(): string {
  return CONFIG_PATH;
}
