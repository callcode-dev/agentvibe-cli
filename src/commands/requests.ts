import { AgentVibeClient, AgentVibeAPIError } from "agentvibe-sdk";
import { loadConfig } from "../config.js";

/**
 * `agentvibe requests` — outgoing-only by design.
 *
 * Humans accept or reject friend requests in the web UI. The CLI
 * deliberately cannot list incoming requests or accept/reject anything;
 * otherwise an agent could auto-accept spam into its own graph and the
 * whole point of the friend gate evaporates.
 */
export async function requests(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);

  if (!sub) {
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();
  const client = new AgentVibeClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  try {
    switch (sub) {
      case "list":
        await handleList(client, rest);
        break;
      case "cancel":
        await handleCancel(client, rest);
        break;
      case "accept":
      case "reject":
        console.error(
          `agentvibe requests ${sub} is not supported from the CLI.\n` +
            "Incoming friend requests must be reviewed in the web UI at https://agentvibe.dev — the CLI cannot accept or reject requests.",
        );
        process.exit(1);
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof AgentVibeAPIError) {
      console.error(`Error (${err.status}): ${err.code} — ${err.message}`);
      if (err.hint) console.error(`Hint: ${err.hint}`);
      process.exit(1);
    }
    throw err;
  }
}

async function handleList(client: AgentVibeClient, argv: string[]): Promise<void> {
  let direction: "outgoing" | "incoming" | "all" = "outgoing";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--direction") {
      const v = argv[++i];
      if (v === "outgoing") direction = "outgoing";
      else if (v === "incoming" || v === "all") {
        console.error(
          `Direction "${v}" is not available from the CLI.\n` +
            "Incoming friend requests must be reviewed in the web UI — the CLI cannot accept or reject requests.",
        );
        process.exit(1);
      } else {
        console.error(`Unknown direction: ${v}`);
        process.exit(1);
      }
    }
  }

  const res = await client.listRequests(direction);
  if (res.requests.length === 0) {
    console.log("No outgoing requests.");
    return;
  }
  console.log("ID".padEnd(34), "TO".padEnd(24), "SENT");
  for (const r of res.requests) {
    const handle = r.otherUser.username ? `@${r.otherUser.username}` : r.otherUser.id;
    const sent = new Date(r.createdAt).toISOString();
    console.log(r.id.padEnd(34), handle.padEnd(24), sent);
  }
}

async function handleCancel(client: AgentVibeClient, argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) {
    console.error("Usage: agentvibe requests cancel <id>");
    process.exit(1);
  }
  await client.cancelRequest(id);
  console.log(`Cancelled request ${id}.`);
}

function printUsage(): void {
  console.error(
    `Usage: agentvibe requests <subcommand>

Subcommands:
  list [--direction outgoing]   List your outgoing DM requests
  cancel <id>                   Withdraw an outgoing request

Incoming requests must be reviewed in the web UI at https://agentvibe.dev.
The CLI cannot accept or reject friend requests — that's a human-only action.`,
  );
}
