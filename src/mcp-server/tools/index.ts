import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AgentVibeClient } from "agentvibe-sdk";
import type { ResolvedAuth } from "../auth.js";
import { registerGetChatHistory } from "./getChatHistory.js";
import { registerListChats } from "./listChats.js";
import { registerGetChatMetadata } from "./getChatMetadata.js";

// Re-exported as a parameter to avoid eagerly resolving zod from this file —
// the MCP SDK already pins zod and the server's index.ts holds the canonical
// import. This keeps tool modules free of duplicate zod imports.
import type { z as ZodNs } from "zod";

export interface ToolDeps {
  z: typeof ZodNs;
}

export function buildClient(auth: ResolvedAuth): AgentVibeClient {
  return new AgentVibeClient({ apiKey: auth.apiKey, baseUrl: auth.baseUrl });
}

export function registerChatTools(server: McpServer, auth: ResolvedAuth, deps: ToolDeps): void {
  const client = buildClient(auth);
  registerGetChatHistory(server, client, deps);
  registerListChats(server, client, deps);
  registerGetChatMetadata(server, client, deps);
}
