import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface ResolvedAuth {
  apiKey: string;
  baseUrl: string;
}

interface CliConfigShape {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Resolve credentials for the MCP server.
 *
 * Order of precedence:
 *   1. AGENTVIBE_API_KEY + AGENTVIBE_BASE_URL env vars (preferred — what
 *      `agentvibe listen` injects when spawning the sidecar).
 *   2. ~/.agentvibe/config.json (the same file the CLI uses).
 *
 * Fail fast if no credentials are found — a silently misconfigured MCP
 * server would surface as confusing tool-call errors mid-conversation.
 */
export function loadAuth(): ResolvedAuth {
  const envKey = process.env.AGENTVIBE_API_KEY?.trim();
  const envBase = process.env.AGENTVIBE_BASE_URL?.trim();
  if (envKey && envBase) {
    return { apiKey: envKey, baseUrl: envBase };
  }

  const configPath = process.env.AGENTVIBE_CONFIG_PATH?.trim()
    ? process.env.AGENTVIBE_CONFIG_PATH.trim()
    : join(homedir(), ".agentvibe", "config.json");

  let parsed: CliConfigShape | null = null;
  try {
    const raw = readFileSync(configPath, "utf-8");
    parsed = JSON.parse(raw) as CliConfigShape;
  } catch {
    parsed = null;
  }

  const apiKey = envKey ?? parsed?.apiKey;
  const baseUrl = envBase ?? parsed?.baseUrl;

  if (!apiKey || !baseUrl) {
    throw new Error(
      "agentvibe-mcp: no credentials found. " +
        "Set AGENTVIBE_API_KEY and AGENTVIBE_BASE_URL, " +
        `or ensure ${configPath} contains apiKey and baseUrl.`,
    );
  }

  return { apiKey, baseUrl };
}
