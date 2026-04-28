import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type RuntimeTarget =
  | {
      type: "slack-user";
      slackUserId: string;
      label?: string;
      defaultChannel?: string;
      slackAppId?: string;
    }
  | { type: "slack-channel"; channel: string; label?: string; slackAppId?: string }
  | { type: "agentvibe-chat"; chatId: string; label?: string };

export interface RuntimeIdentity {
  id?: string;
  name: string;
  handle?: string;
  slackUserId?: string;
}

export interface AgentVibeRuntimeConfig {
  org?: { id?: string; name?: string; slug?: string };
  currentIdentity?: RuntimeIdentity;
  defaultSlackAppId?: string;
  channels?: Record<string, RuntimeTarget>;
  targets?: Record<string, RuntimeTarget>;
  aliases?: Record<string, string>;
}

export interface RuntimeAuth {
  apiKey: string;
  baseUrl: string;
  source: "env" | "config" | "auth";
}

const CONFIG_PATH = join(homedir(), ".agentvibe", "config.json");
const AUTH_PATH = join(homedir(), ".agentvibe", "auth.json");
const RUNTIME_PATH = join(homedir(), ".agentvibe", "runtime.json");

type AuthFile = { apiKey?: string; baseUrl?: string; apiBaseUrl?: string };

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function loadRuntimeAuth(): RuntimeAuth {
  const apiKey = process.env.AGENTVIBE_API_KEY;
  const baseUrl = process.env.AGENTVIBE_API_BASE_URL ?? process.env.AGENTVIBE_BASE_URL;
  if (apiKey && baseUrl) return { apiKey, baseUrl, source: "env" };

  const config = readJson<AuthFile>(CONFIG_PATH);
  if (config?.apiKey && (config.baseUrl ?? config.apiBaseUrl)) {
    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? config.apiBaseUrl ?? "",
      source: "config",
    };
  }

  const auth = readJson<AuthFile>(AUTH_PATH);
  if (auth?.apiKey && (auth.baseUrl ?? auth.apiBaseUrl)) {
    return { apiKey: auth.apiKey, baseUrl: auth.baseUrl ?? auth.apiBaseUrl ?? "", source: "auth" };
  }

  throw new Error(
    "Missing AgentVibe auth. Set AGENTVIBE_API_KEY and AGENTVIBE_API_BASE_URL, or run agentvibe setup.",
  );
}

export function saveRuntimeAuth(auth: RuntimeAuth): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ apiKey: auth.apiKey, baseUrl: auth.baseUrl }, null, 2) + "\n",
    { mode: 0o600 },
  );
}

export function loadRuntimeContext(): {
  context: AgentVibeRuntimeConfig;
  source: "env" | "file" | "none";
} {
  const raw = process.env.AGENTVIBE_CONTEXT_JSON ?? process.env.AGENTVIBE_RUNTIME_JSON;
  if (raw) return { context: JSON.parse(raw) as AgentVibeRuntimeConfig, source: "env" };
  const fileContext = readJson<AgentVibeRuntimeConfig>(RUNTIME_PATH);
  if (fileContext) return { context: fileContext, source: "file" };
  return { context: {}, source: "none" };
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@|^#/, "")
    .replace(/[\s_-]+/g, "-");
}

export function resolveRuntimeTarget(
  input: string,
  context: AgentVibeRuntimeConfig,
  seen = new Set<string>(),
): { key: string; target: RuntimeTarget } | null {
  const normalized = normalizeName(input);
  if (!normalized) return null;
  if (seen.has(normalized)) throw new Error(`Alias cycle while resolving ${input}`);
  seen.add(normalized);

  const targets = { ...(context.channels ?? {}), ...(context.targets ?? {}) };
  for (const [key, target] of Object.entries(targets)) {
    if (normalizeName(key) === normalized || normalizeName(target.label ?? "") === normalized) {
      return { key, target };
    }
  }

  const aliases = context.aliases ?? {};
  const alias = aliases[normalized] ?? aliases[input] ?? aliases[input.trim().toLowerCase()];
  if (alias) return resolveRuntimeTarget(alias, context, seen);

  return null;
}

export function runtimeSummary(): Record<string, unknown> {
  const { context, source } = loadRuntimeContext();
  let auth: Pick<RuntimeAuth, "baseUrl" | "source"> | null = null;
  try {
    const loaded = loadRuntimeAuth();
    auth = { baseUrl: loaded.baseUrl, source: loaded.source };
  } catch {
    auth = null;
  }
  return {
    auth,
    contextSource: source,
    org: context.org ?? null,
    currentIdentity: context.currentIdentity ?? null,
    channels: Object.keys(context.channels ?? {}),
    targets: Object.keys(context.targets ?? {}),
  };
}
