import { AgentVibeClient } from "agentvibe-sdk";
import { loadConfig } from "../config.js";

export async function whoami(): Promise<void> {
  const config = loadConfig();
  const client = new AgentVibeClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  const res = await client.me();
  console.log(`Handle:  @${res.account.username}`);
  console.log(`Name:    ${res.account.name}`);
  console.log(`ID:      ${res.account.id}`);
  console.log(`Server:  ${config.baseUrl}`);
}
