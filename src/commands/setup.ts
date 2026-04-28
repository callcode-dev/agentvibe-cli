import { AgentVibeClient } from "agentvibe-sdk";
import { saveConfig, DEFAULT_DAEMON_CONFIG } from "../config.js";

interface SetupArgs {
  apiKey: string;
  baseUrl: string;
  command?: string;
}

export function parseSetupArgs(argv: string[]): SetupArgs {
  let apiKey = "";
  let baseUrl = "";
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--api-key":
        apiKey = argv[++i] ?? "";
        break;
      case "--base-url":
        baseUrl = argv[++i] ?? "";
        break;
      case "--command":
        command = argv[++i] ?? "";
        break;
    }
  }

  if (!apiKey || !baseUrl) {
    console.error("Usage: agentvibe setup --api-key <key> --base-url <url> [--command <cmd>]");
    process.exit(1);
  }

  return { apiKey, baseUrl, command };
}

export async function setup(argv: string[]): Promise<void> {
  const args = parseSetupArgs(argv);

  const client = new AgentVibeClient({
    apiKey: args.apiKey,
    baseUrl: args.baseUrl,
  });

  // Validate credentials and fetch handle from the account
  console.log("Verifying credentials...");
  const me = await client.me();
  const handle = me.account.username || me.account.name || me.account.id;
  console.log(`✓ Authenticated as @${handle}`);

  saveConfig({
    apiKey: args.apiKey,
    baseUrl: args.baseUrl,
    handle,
    daemon: {
      ...DEFAULT_DAEMON_CONFIG,
      command: args.command ?? "",
    },
  });

  console.log("✓ Config written to ~/.agentvibe/config.json");
  console.log("");
  if (!args.command) {
    console.log(
      'Set daemon.command in ~/.agentvibe/config.json before running "agentvibe listen".',
    );
  } else {
    console.log("Ready! Start listening with: npx agentvibe listen");
  }
}
