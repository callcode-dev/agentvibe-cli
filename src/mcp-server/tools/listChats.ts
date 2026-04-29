import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentVibeClient } from "agentvibe-sdk";
import type { ToolDeps } from "./index.js";

export function registerListChats(
  server: McpServer,
  client: AgentVibeClient,
  _deps: ToolDeps,
): void {
  server.registerTool(
    "list_chats",
    {
      title: "List chats",
      description:
        "Enumerate all chats the agent has access to. Use this when the user " +
        "references a different chat by name or asks 'what conversations are " +
        "happening'. Read-only. " +
        "Each `participants[]` entry includes both `username` (the @-handle, " +
        'e.g. "slack-bhee3w-llqdch" for Slack-backed users) and `name` (the ' +
        'human-readable display name, e.g. "Stephen Shkeda"). Prefer `name` ' +
        "when describing a participant; fall back to `username` only if " +
        "`name` is empty.",
      inputSchema: {},
    },
    async () => {
      const res = await client.listChats();
      const summary = res.chats.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        participants: c.participants.map((p) => ({
          username: p.username,
          name: p.name,
          isYou: p.isYou,
        })),
        lastMessageAt: c.lastMessage?.createdAt ?? null,
        updatedAt: c.updatedAt,
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ chats: summary }, null, 2),
          },
        ],
      };
    },
  );
}
