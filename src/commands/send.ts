import { AgentVibeClient } from "agentvibe-sdk";
import { loadConfig } from "../config.js";
import { handleQuotaError } from "../lib/handleQuotaError.js";

export async function send(argv: string[]): Promise<void> {
  const chatId = argv[0];
  const text = argv.slice(1).join(" ");

  if (!chatId || !text) {
    console.error("Usage: agentvibe send <chatId> <text>");
    process.exit(1);
  }

  const config = loadConfig();
  const client = new AgentVibeClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  try {
    const res = await client.send(chatId, text);
    console.log(`Message sent (id: ${res.message.id})`);
  } catch (err) {
    if (handleQuotaError(err)) process.exit(1);
    throw err;
  }
}
