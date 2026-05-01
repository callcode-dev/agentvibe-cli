import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export interface DaemonConfig {
  command: string;
  pollInterval: number;
  maxPollInterval: number;
  contextMessages: number;
}

export interface CliConfig {
  apiKey: string;
  baseUrl: string;
  handle: string;
  daemon: DaemonConfig;
}

const DEFAULT_CONFIG_PATH = join(homedir(), ".agentvibe", "config.json");

export const DEFAULT_DAEMON_CONFIG: DaemonConfig = {
  command: "",
  pollInterval: 3000,
  maxPollInterval: 30000,
  contextMessages: 20,
};

// Resolve the active config path. Honors AGENTVIBE_CONFIG_PATH so that one
// machine can run multiple agentvibe identities with isolated config files
// (useful for: a personal listener and a hosted-agent listener side by side).
export function resolveConfigPath(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env.AGENTVIBE_CONFIG_PATH;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return DEFAULT_CONFIG_PATH;
}

export function loadConfig(path?: string): CliConfig {
  const resolved = resolveConfigPath(path);
  const raw = readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as CliConfig;
}

export function saveConfig(config: CliConfig, path?: string): void {
  const resolved = resolveConfigPath(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
