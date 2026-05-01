import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadConfig, resolveConfigPath, type CliConfig } from "./config.js";

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
  org?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  currentIdentity?: RuntimeIdentity;
  defaultSlackAppId?: string;
  channels?: Record<string, RuntimeTarget>;
  targets?: Record<string, RuntimeTarget>;
  aliases?: Record<string, string>;
}

export interface RuntimeAuth {
  apiKey: string;
  baseUrl: string;
  source: "env" | "config";
  config?: CliConfig;
}

export interface LoadedRuntime {
  auth: RuntimeAuth;
  context: AgentVibeRuntimeConfig;
  contextSource: "api";
}

const DEFAULT_RUNTIME_CONTEXT_PATH = join(homedir(), ".agentvibe", "runtime-context.json");

export function loadRuntimeAuth(): RuntimeAuth {
  const apiKey = process.env.AGENTVIBE_API_KEY;
  const baseUrl = process.env.AGENTVIBE_API_BASE_URL ?? process.env.AGENTVIBE_BASE_URL;
  if (apiKey && baseUrl) return { apiKey, baseUrl, source: "env" };

  const config = loadConfig(resolveConfigPath());
  return { apiKey: config.apiKey, baseUrl: config.baseUrl, source: "config", config };
}

function mergeRuntimeContext(
  base: AgentVibeRuntimeConfig,
  override: AgentVibeRuntimeConfig,
): AgentVibeRuntimeConfig {
  return {
    ...base,
    ...override,
    org: { ...(base.org ?? {}), ...(override.org ?? {}) },
    currentIdentity: override.currentIdentity ?? base.currentIdentity,
    channels: { ...(base.channels ?? {}), ...(override.channels ?? {}) },
    targets: { ...(base.targets ?? {}), ...(override.targets ?? {}) },
    aliases: { ...(base.aliases ?? {}), ...(override.aliases ?? {}) },
  };
}

function loadRuntimeContextOverride(): AgentVibeRuntimeConfig | null {
  const inline = process.env.AGENTVIBE_RUNTIME_CONTEXT_JSON;
  if (inline) return JSON.parse(inline) as AgentVibeRuntimeConfig;

  const path = process.env.AGENTVIBE_RUNTIME_CONTEXT_PATH ?? DEFAULT_RUNTIME_CONTEXT_PATH;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as AgentVibeRuntimeConfig;
}

export async function fetchRuntimeContext(
  auth = loadRuntimeAuth(),
): Promise<AgentVibeRuntimeConfig> {
  const url = new URL("/api/agents/me/runtime-context", auth.baseUrl);
  const res = await fetch(url, { headers: { "x-api-key": auth.apiKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch AgentVibe runtime context (${res.status}): ${body}`);
  }
  const context = (await res.json()) as AgentVibeRuntimeConfig;
  const override = loadRuntimeContextOverride();
  return override ? mergeRuntimeContext(context, override) : context;
}

export async function loadRuntime(): Promise<LoadedRuntime> {
  const auth = loadRuntimeAuth();
  const context = await fetchRuntimeContext(auth);
  return { auth, context, contextSource: "api" };
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

export function describeRuntime(runtime: LoadedRuntime): Record<string, unknown> {
  return {
    authSource: runtime.auth.source,
    baseUrl: runtime.auth.baseUrl,
    contextSource: runtime.contextSource,
    org: runtime.context.org ?? null,
    currentIdentity: runtime.context.currentIdentity ?? null,
    channels: Object.keys(runtime.context.channels ?? {}),
    targets: Object.keys(runtime.context.targets ?? {}),
  };
}
