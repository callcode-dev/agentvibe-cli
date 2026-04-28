import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface McpSidecarHandle {
  /** Path to a Claude-compatible mcp-config.json the agent should consume. */
  configPath: string;
  /**
   * Spawn command + args that will boot the MCP server. Useful for runtimes
   * (Codex, Gemini, etc.) that read MCP via their own discovery mechanism
   * instead of `--mcp-config`.
   */
  command: string;
  args: readonly string[];
  /** Env vars that should be merged into the agent subprocess environment. */
  env: Record<string, string>;
  /** Cleans up temp files. Idempotent. */
  cleanup: () => void;
}

export interface McpSidecarOptions {
  apiKey: string;
  baseUrl: string;
  /**
   * Optional override for the MCP server binary. Defaults to invoking the
   * workspace `agentvibe-mcp` bin via `bunx`. Override in tests or when the
   * package isn't on PATH.
   */
  command?: string;
  args?: string[];
}

const DEFAULT_COMMAND = "bunx";
const DEFAULT_ARGS = ["agentvibe-mcp-server"];

/**
 * Materialize a Claude `--mcp-config` JSON file for the agentvibe MCP
 * server. The MCP server itself is spawned lazily by the agent runtime
 * (e.g. `claude -p`) when it discovers the config — we don't fork a
 * long-lived sidecar from the listener. This keeps the lifetime model
 * simple: every agent invocation gets a fresh, exclusive stdio MCP
 * connection, and the listener doesn't have to manage child PIDs.
 */
export function buildMcpSidecar(opts: McpSidecarOptions): McpSidecarHandle {
  const command = opts.command ?? DEFAULT_COMMAND;
  const args = opts.args ?? DEFAULT_ARGS;

  const env: Record<string, string> = {
    AGENTVIBE_API_KEY: opts.apiKey,
    AGENTVIBE_BASE_URL: opts.baseUrl,
  };

  const dir = mkdtempSync(join(tmpdir(), "agentvibe-mcp-"));
  const configPath = join(dir, "mcp-config.json");
  const config = {
    mcpServers: {
      agentvibe: {
        command,
        args,
        env,
      },
    },
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  return {
    configPath,
    command,
    args,
    env,
    cleanup: () => {
      // The temp file is small, ephemeral, and lives under tmpdir() — leave
      // it for the OS to reap rather than risk an unlink race with a still-
      // running agent subprocess.
    },
  };
}
