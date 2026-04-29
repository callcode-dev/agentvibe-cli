import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentVibeClient } from "agentvibe-sdk";
import type { ToolDeps } from "./index.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function registerGetChatHistory(
  server: McpServer,
  client: AgentVibeClient,
  { z }: ToolDeps,
): void {
  server.registerTool(
    "get_chat_history",
    {
      title: "Get chat history",
      description:
        "Fetch older messages from a chat the agent participates in. " +
        "Use this when the conversation references content not present in the " +
        "pre-injected context window. Pagination is anchored on `before` (a " +
        "timestamp); pass the createdAt of the earliest message you currently " +
        "see to walk backwards through history. Read-only. " +
        "Each message has a `from.name` field with the human-readable display " +
        'name (e.g. "Stephen Shkeda"). Prefer `from.name` when referring to ' +
        "the sender in your responses; fall back to `from.username` (the " +
        "@-handle) only if `name` is empty.",
      inputSchema: {
        chatId: z
          .string()
          .min(1)
          .describe("Convex chat ID (matches `chatId` in the agent payload)."),
        before: z
          .string()
          .optional()
          .describe(
            "Exclusive upper bound. Either an AgentVibe `createdAt` (ms since epoch as a string) " +
              "or a Slack timestamp like `1234567890.123456`. Omit to start from the most recent.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .optional()
          .describe(
            `Maximum number of messages to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
          ),
      },
    },
    async (args) => {
      const limit = args.limit ?? DEFAULT_LIMIT;
      const before = normalizeTimestamp(args.before);
      const res = await client.getMessages(args.chatId, {
        before,
        limit,
      });
      const earliestTs = res.messages[0]?.createdAt ?? null;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                messages: res.messages,
                earliestCreatedAt: earliestTs,
                hasMore: res.messages.length >= limit,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

/**
 * Slack timestamps are seconds-with-fraction (`1734039123.456789`); AgentVibe
 * `createdAt` is ms-since-epoch. Heuristic: anything below year-2200 in
 * milliseconds (≈7.25e12) but representing a plausible recent epoch in
 * seconds (≥1e9 / ≈year-2001) is converted; otherwise pass through.
 */
function normalizeTimestamp(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return trimmed;
  if (numeric > 1e9 && numeric < 1e12) {
    // Looks like seconds; convert to ms.
    return String(Math.round(numeric * 1000));
  }
  return trimmed;
}
