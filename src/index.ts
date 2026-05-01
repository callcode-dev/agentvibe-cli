#!/usr/bin/env node

import { whoami } from "./commands/whoami.js";
import { setup } from "./commands/setup.js";
import { send } from "./commands/send.js";
import { status } from "./commands/status.js";
import { listen } from "./commands/listen.js";
import { chat } from "./commands/chat.js";
import { requests } from "./commands/requests.js";
import { context } from "./commands/context.js";
import { message } from "./commands/message.js";
import { resolve } from "./commands/resolve.js";
import { admin } from "./commands/admin.js";
import { slack } from "./commands/slack.js";

const invokedAs = process.argv[1]?.split(/[\\/]/).pop();
const command = invokedAs === "ava" ? "admin" : process.argv[2];
const commandArgs = invokedAs === "ava" ? process.argv.slice(2) : process.argv.slice(3);

function printUsage(): void {
  console.error(
    `Usage: agentvibe <command>

Commands:
  setup     Configure agentvibe credentials
  listen    Start the polling daemon
  send      Send a message to a chat
  status    Push a best-effort progress update for an in-flight message
  chat      Start a DM or send a friend request to a handle
  requests  Manage outgoing DM requests (cancel / list)
  context   Print AgentVibe runtime context
  resolve   Resolve a person, agent, or channel from runtime context
  message   Route a message to a resolved person, agent, or channel
  slack     Configure Slack aliases and send Slack-routed messages
  whoami    Print current identity
  admin     Internal admin/debug tools (also installed as ava)`,
  );
}

async function main() {
  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;
    case "whoami":
      await whoami();
      break;
    case "setup":
      await setup(commandArgs);
      break;
    case "listen":
      await listen(commandArgs);
      break;
    case "send":
      await send(commandArgs);
      break;
    case "status":
      await status(commandArgs);
      break;
    case "chat":
      await chat(commandArgs);
      break;
    case "requests":
      await requests(commandArgs);
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
    case "slack":
      await slack(commandArgs);
      break;
    case "admin":
      await admin(commandArgs);
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
