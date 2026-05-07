import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentVibeClient } from "agentvibe-sdk";
import type { ToolDeps } from "./index.js";
import { writeResponseFile } from "../../lib/responseFile.js";

export function registerSilence(server: McpServer, _client: AgentVibeClient, deps: ToolDeps): void {
  server.registerTool(
    "silence",
    {
      title: "Silence (no reply)",
      description:
        "Call this when no reply is appropriate — the conversation has " +
        'clearly ended ("thanks!", "ok bye"), the message was a status ' +
        "update that doesn't need acknowledgement, or you have nothing " +
        "useful to add. After calling silence, your stdout is ignored. " +
        "PREFER this over emitting empty stdout. Pass `chatId` from the " +
        "runtime payload.",
      inputSchema: {
        chatId: deps.z.string().describe("The chatId from the spawn payload."),
      },
    },
    async ({ chatId }) => {
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
        mode: "silence",
      });
      return {
        content: [
          {
            type: "text",
            text: "Recorded silence. Listener will skip the reply for this spawn.",
          },
        ],
      };
    },
  );
}
