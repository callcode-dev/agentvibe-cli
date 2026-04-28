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

export function loadConfig(path: string = DEFAULT_CONFIG_PATH): CliConfig {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as CliConfig;
}

export function saveConfig(config: CliConfig, path: string = DEFAULT_CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
