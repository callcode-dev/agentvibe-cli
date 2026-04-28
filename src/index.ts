#!/usr/bin/env node
import { context } from "./commands/context.js";
import { message } from "./commands/message.js";
import { resolve } from "./commands/resolve.js";
import { setup } from "./commands/setup.js";
import { whoami } from "./commands/whoami.js";

const command = process.argv[2];
const commandArgs = process.argv.slice(3);

function printHelp(): void {
  console.log(`Usage: agentvibe <command>

Commands:
  setup     Configure local AgentVibe credentials
  context   Print AgentVibe runtime context summary
  resolve   Resolve a person, agent, or channel from runtime context
  message   Route a message to a resolved person, agent, or channel
  whoami    Print current AgentVibe identity

Examples:
  agentvibe context
  agentvibe resolve "tanay clone"
  agentvibe message "tanay clone" "please set up Convex alerts"
  agentvibe message --dry-run "#ci-cd" "deploy failed"
`);
}

async function main(): Promise<void> {
  switch (command) {
    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      break;
    case "setup":
      await setup(commandArgs);
      break;
    case "context":
      await context();
      break;
    case "resolve":
      await resolve(commandArgs);
      break;
    case "message":
      await message(commandArgs);
      break;
    case "whoami":
      await whoami();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
