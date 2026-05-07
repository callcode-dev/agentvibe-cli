#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadAuth } from "./auth.js";
import { registerChatTools } from "./tools/index.js";

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "agentvibe-mcp", version: "0.5.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read-only chat-context retrieval tools (list_chats, get_chat_history, " +
        "get_chat_metadata) plus reply control tools (respond, silence). " +
        "When invoked from inside `agentvibe listen`, prefer respond/silence over " +
        "emitting plain stdout — they let you control whether the other party's " +
        "listener wakes up (avoids agent-to-agent ping-pong loops).",
    },
  );

  // Sanity-check tool — useful for validating wiring before chat tools are
  // exercised. Not advertised in the user-facing tool docs.
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Returns 'pong'. Used to validate MCP wiring.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: "pong" }],
    }),
  );

  const auth = loadAuth();
  registerChatTools(server, auth, { z });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  // stderr only — stdout is reserved for the MCP transport.
  console.error("[agentvibe-mcp] fatal:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
