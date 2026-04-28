import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentVibeClient } from "agentvibe-sdk";
import type { ChatMessage, ChatListItem } from "agentvibe-sdk";
import { loadConfig } from "../config.js";
import { buildPayload } from "../lib/payload.js";
import { spawnAgent } from "../lib/spawn.js";
import { withTypingIndicator } from "../lib/withTypingIndicator.js";
import { handleQuotaError } from "../lib/handleQuotaError.js";
import { buildMcpSidecar, type McpSidecarHandle } from "../lib/mcpSidecar.js";
import { materializeFiles } from "../lib/files.js";

// Keep in sync with TYPING_TTL_MS in convex/lib/typing.ts — the typing
// indicator TTL must be >= this timeout so a live subprocess is never
// misreported as stale.
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function listen(argv: string[]): Promise<void> {
  const config = loadConfig();

  // Allow --command override from CLI
  let commandOverride: string | undefined;
  let noMcp = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--command") {
      commandOverride = argv[++i];
    } else if (argv[i] === "--no-mcp") {
      noMcp = true;
    }
  }

  const baseCommand = commandOverride ?? config.daemon.command;
  if (!baseCommand) {
    console.error(
      'No command configured. Set daemon.command in ~/.agentvibe/config.json or pass --command "..."',
    );
    process.exit(1);
  }

  // Materialize the MCP sidecar config once per `listen` lifetime. The agent
  // runtime forks the actual MCP server process via the config's `command` —
  // we don't fork it ourselves. If --no-mcp is set, the spawn falls back to
  // pre-injected context only.
  const mcpSidecar: McpSidecarHandle | null = noMcp
    ? null
    : buildMcpSidecar({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  // Auto-inject `--mcp-config <path>` for claude-flavored commands so the
  // common case Just Works. Other runtimes get the config path via env vars
  // (AGENTVIBE_MCP_CONFIG) and can wire it up themselves.
  const command =
    mcpSidecar && shouldAutoInjectClaudeMcp(baseCommand)
      ? `${baseCommand} --mcp-config ${shellQuote(mcpSidecar.configPath)}`
      : baseCommand;

  const client = new AgentVibeClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  // Validate credentials
  const me = await client.me();
  console.log(`Listening as @${me.account.username} on ${config.baseUrl}`);
  console.log(`Command: ${command}`);
  console.log(`Poll interval: ${config.daemon.pollInterval}ms`);
  if (mcpSidecar) {
    console.log(`MCP context tools: enabled (config at ${mcpSidecar.configPath})`);
  } else {
    console.log("MCP context tools: disabled (--no-mcp)");
  }
  console.log("");

  const cleanup = (): void => {
    if (mcpSidecar) mcpSidecar.cleanup();
  };

  const activeChats = new Set<string>();
  // Start cursor at "now" so the first inbox poll skips historical messages
  // and the daemon only reacts to messages that arrive after startup.
  let cursor: string | undefined = String(Date.now());
  let errorCount = 0;

  // Fetch chat list for metadata (names, participants)
  let chatMap = new Map<string, ChatListItem>();

  async function refreshChatList(): Promise<void> {
    const res = await client.listChats();
    chatMap = new Map(res.chats.map((c) => [c.id, c]));
  }

  async function handleChat(chatId: string, messages: ChatMessage[]): Promise<void> {
    if (activeChats.has(chatId)) return;
    activeChats.add(chatId);

    let filesDir: string | null = null;
    try {
      // Ensure we have chat metadata
      if (!chatMap.has(chatId)) {
        await refreshChatList();
      }

      const chat = chatMap.get(chatId);
      if (!chat) {
        console.error(`Chat ${chatId} not found in chat list, skipping.`);
        return;
      }

      // Fetch context messages
      let contextMessages: ChatMessage[] = [];
      const contextRes = await client.getMessages(chatId);
      contextMessages = contextRes.messages
        .slice(-config.daemon.contextMessages)
        // Exclude the new messages from context to avoid duplication
        .filter((m) => !messages.some((nm) => nm.id === m.id));

      // Fetch metadata so the agent knows whether older history exists. Best
      // effort — never block the reply on this.
      let totalMessageCount: number | null = null;
      try {
        const meta = await client.getChatMetadata(chatId);
        totalMessageCount = meta.totalMessageCount;
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] Could not fetch chat metadata for ${chatId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      const earliestContextTs =
        contextMessages.length > 0 ? (contextMessages[0]?.createdAt ?? null) : null;
      const seenCount = contextMessages.length + messages.length;
      const contextHints =
        totalMessageCount !== null
          ? {
              totalMessageCount,
              earliestContextTs,
              moreHistoryAvailable: totalMessageCount > seenCount,
            }
          : undefined;

      // Materialize every file part referenced by new + context messages into
      // a per-invocation tmpdir, so the spawned daemon can read them directly
      // without needing agentvibe API credentials.
      filesDir = await mkdtemp(path.join(tmpdir(), `agentvibe-files-${chatId}-`));
      const materialized = await materializeFiles({
        client,
        chatId,
        messages: [...contextMessages, ...messages],
        dir: filesDir,
      });

      const payload = buildPayload({
        chat,
        newMessages: messages,
        contextMessages,
        handle: config.handle,
        name: me.account.name,
        contextHints,
        materialized,
      });

      const from = messages.map((m) => `@${m.from?.username}`).join(", ");
      console.log(
        `[${new Date().toISOString()}] New message in "${payload.chatName}" from ${from}`,
      );

      const spawnEnv: Record<string, string> = { AGENTVIBE_FILES_DIR: filesDir };
      if (mcpSidecar) {
        Object.assign(spawnEnv, mcpSidecar.env, {
          AGENTVIBE_MCP_CONFIG: mcpSidecar.configPath,
          AGENTVIBE_MCP_COMMAND: [mcpSidecar.command, ...mcpSidecar.args].join(" "),
        });
      }

      await withTypingIndicator(client, chatId, async () => {
        const result = await spawnAgent({
          command,
          input: JSON.stringify(payload),
          timeoutMs: TIMEOUT_MS,
          env: spawnEnv,
        });

        if (result.timedOut) {
          console.error(`[${new Date().toISOString()}] Command timed out for chat ${chatId}`);
          return;
        }

        if (result.exitCode !== 0) {
          console.error(
            `[${new Date().toISOString()}] Command failed (exit ${result.exitCode}) for chat ${chatId}`,
          );
          if (result.stderr) console.error(result.stderr);
          return;
        }

        const response = result.stdout.trim();
        if (response) {
          await client.send(chatId, response);
          console.log(
            `[${new Date().toISOString()}] Sent response to "${payload.chatName}" (${response.length} chars)`,
          );
        }
      });
    } catch (err) {
      if (handleQuotaError(err)) {
        // daemon: don't exit; wait for user to upgrade, resume next tick
        return;
      }
      console.error(
        `[${new Date().toISOString()}] Error handling chat ${chatId}:`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      if (filesDir) {
        await rm(filesDir, { recursive: true, force: true }).catch((err) => {
          console.error(
            `[${new Date().toISOString()}] Failed to clean up ${filesDir}:`,
            err instanceof Error ? err.message : err,
          );
        });
      }
      activeChats.delete(chatId);
    }
  }

  // Initial chat list fetch
  await refreshChatList();

  // Main poll loop
  async function tick(): Promise<void> {
    try {
      const res = await client.inbox(cursor);

      if (res.messages.length > 0) {
        cursor = res.cursor ?? cursor;

        // Filter out own messages
        const incoming = res.messages.filter((m) => m.from && !m.from.isYou);

        // Group by chatId
        const byChatId = new Map<string, ChatMessage[]>();
        for (const msg of incoming) {
          const group = byChatId.get(msg.chatId) ?? [];
          group.push(msg);
          byChatId.set(msg.chatId, group);
        }

        // Spawn handlers (don't await — run concurrently)
        for (const [chatId, messages] of byChatId) {
          handleChat(chatId, messages).catch((err) =>
            console.error(
              `[${new Date().toISOString()}] Unexpected error in chat ${chatId}:`,
              err instanceof Error ? err.message : err,
            ),
          );
        }
      }

      errorCount = 0;
    } catch (err) {
      if (handleQuotaError(err)) {
        // daemon: don't exit; wait for user to upgrade, resume next tick
      } else {
        errorCount++;
        console.error(
          `[${new Date().toISOString()}] Poll error:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const interval =
      errorCount === 0
        ? config.daemon.pollInterval
        : Math.min(
            config.daemon.pollInterval * Math.pow(2, errorCount),
            config.daemon.maxPollInterval,
          );

    setTimeout(tick, interval);
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    cleanup();
    process.exit(0);
  });

  tick();
}

function shouldAutoInjectClaudeMcp(cmd: string): boolean {
  if (cmd.includes("--mcp-config")) return false;
  // Match `claude` or `claude-code`-flavored binaries at a word boundary.
  return /(^|[\s/])claude(?:-code)?(\s|$)/.test(cmd);
}

function shellQuote(value: string): string {
  // Single-quote with internal single-quote escape — safe for `bash -c`.
  return `'${value.replace(/'/g, "'\\''")}'`;
}
