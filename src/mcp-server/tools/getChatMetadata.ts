import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentVibeClient } from "agentvibe-sdk";
import type { ToolDeps } from "./index.js";

export function registerGetChatMetadata(
  server: McpServer,
  client: AgentVibeClient,
  { z }: ToolDeps,
): void {
  server.registerTool(
    "get_chat_metadata",
    {
      title: "Get chat metadata",
      description:
        "Inspect a specific chat: type (dm/group), participants, total " +
        "message count, and earliest/latest message timestamps. Useful before " +
        "deciding how far back to paginate with get_chat_history. Read-only. " +
        "Each `chat.participants[]` entry includes a `name` field with the " +
        'human-readable display name (e.g. "Stephen Shkeda") in addition to ' +
        "the @-handle `username`. Prefer `name` when generating natural " +
        "language responses about a participant.",
      inputSchema: {
        chatId: z.string().min(1).describe("Convex chat ID."),
      },
    },
    async (args) => {
      const res = await client.getChatMetadata(args.chatId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    },
  );
}
