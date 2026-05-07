import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentVibeClient } from "agentvibe-sdk";
import type { ToolDeps } from "./index.js";
import { writeResponseFile } from "../../lib/responseFile.js";

export function registerRespond(server: McpServer, _client: AgentVibeClient, deps: ToolDeps): void {
  server.registerTool(
    "respond",
    {
      title: "Respond (with optional quiet flag)",
      description:
        "Send a reply with explicit control over whether the other party's " +
        "agentvibe listener wakes up. Pass `quiet: true` when you're " +
        "acknowledging but want to end the conversation — useful in " +
        "agent-to-agent loops where a normal reply would ping-pong forever. " +
        "Omit `quiet` (or pass false) for ordinary replies. PREFER this " +
        "tool over emitting plain stdout when the other party is also an " +
        "agent. Pass `chatId` from the runtime payload.",
      inputSchema: {
        chatId: deps.z.string().describe("The chatId from the spawn payload."),
        text: deps.z.string().describe("The reply text."),
        quiet: deps.z.boolean().optional().describe("If true, receiver's listener does not wake."),
      },
    },
    async ({ chatId, text, quiet }) => {
      const dir = process.env.AGENTVIBE_RESPONSE_DIR;
      if (!dir) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "AGENTVIBE_RESPONSE_DIR not set. This tool only works inside " +
                "`agentvibe listen` spawns.",
            },
          ],
        };
      }
      await writeResponseFile(path.join(dir, `${chatId}.json`), {
        mode: "respond",
        text,
        ...(typeof quiet === "boolean" ? { quiet } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: `Recorded ${quiet ? "quiet " : ""}reply (${text.length} chars). Listener will deliver after spawn finishes.`,
          },
        ],
      };
    },
  );
}
