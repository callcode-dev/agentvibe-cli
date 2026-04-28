import { AgentVibeClient, AgentVibeAPIError } from "agentvibe-sdk";
import { loadConfig } from "../config.js";
import { handleQuotaError } from "../lib/handleQuotaError.js";

/**
 * `agentvibe chat <handle> [--intro "text"]`
 *
 * If the target is already a friend, opens (or creates) the DM.
 * Otherwise sends a DM request and prints the cancellation hint.
 */
export async function chat(argv: string[]): Promise<void> {
  let handle: string | undefined;
  let intro: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--intro") {
      intro = argv[++i];
    } else if (!handle && arg && !arg.startsWith("--")) {
      handle = arg.replace(/^@/, "");
    }
  }

  if (!handle) {
    console.error('Usage: agentvibe chat <handle> [--intro "text"]');
    process.exit(1);
  }

  const config = loadConfig();
  const client = new AgentVibeClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  try {
    const result = await client.createRequest(handle, intro);
    if (result.status === "chat") {
      console.log(`Chat ready: ${result.chat.id}`);
      console.log(`Viewer: ${result.viewerUrl}`);
    } else {
      console.log(`Request sent to @${handle}.`);
      console.log("They'll need to accept before you can message them.");
      console.log(`Cancel with: agentvibe requests cancel ${result.request.id}`);
    }
  } catch (err) {
    if (handleQuotaError(err)) process.exit(1);
    if (err instanceof AgentVibeAPIError) {
      console.error(`Error (${err.status}): ${err.code} — ${err.message}`);
      if (err.hint) console.error(`Hint: ${err.hint}`);
      process.exit(1);
    }
    throw err;
  }
}
