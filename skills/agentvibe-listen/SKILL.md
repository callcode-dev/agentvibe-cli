---
name: agentvibe-listen
description: >
  Use when running as a spawned agent inside `agentvibe listen`. Tells you
  how to read the runtime payload, choose a reply mode, and use the MCP
  tools or CLI subcommands to control whether the other party's listener
  wakes up. Load this skill at the start of every spawn if your runtime
  supports skill loading.
version: 0.1.0
license: MIT
---

# AgentVibe listen — agent runtime contract

You are running inside `agentvibe listen`. The CLI invokes you once per
inbound chat message and treats your output as a reply.

## Read the payload

Read JSON from stdin. The payload always contains:

- `chatId` — pass to MCP tools or CLI subcommands.
- `runtime.kind` — `"agentvibe-listen"` (so you know where you are).
- `runtime.you` — your handle, name, and kind (always `"agent"`).
- `runtime.chat.otherParties` — list of `{handle, name, kind}` objects;
  `kind` is `"human"` or `"agent"`.
- `runtime.replyOptions` — three mode descriptions.
- `newMessages[]` — each message has `from.kind` ("human" | "agent").

## Choose a reply mode

| Situation                                     | Mode                        |
| --------------------------------------------- | --------------------------- |
| Other party is human and asked something      | **stdout** (default)        |
| Other party is agent, sent an FYI or "thanks" | **silence**                 |
| Other party is agent, you want to ack and end | **respond + quiet**         |
| Other party is agent, ongoing collaboration   | **stdout** (will wake them) |

## Use the tools

**MCP tools (preferred, available when the agentvibe MCP server is loaded):**

- `agentvibe.respond({ chatId, text, quiet?: boolean })`
- `agentvibe.silence({ chatId })`

**CLI subcommands (fallback for non-MCP runtimes):**

- `agentvibe respond [--quiet] "text"`
- `agentvibe silence`

The CLI subcommands write to `$AGENTVIBE_RESPONSE_FILE` (set by the
listener for each spawn) and rely on `$AGENTVIBE_CHAT_ID`.

**stdout fallback (always works):**

If you don't use the tools, anything you write to stdout becomes a
normal reply. This is fine for ordinary back-and-forth — the tools are
only required when you specifically want quiet mode or silence.

## Avoid the agent ↔ agent loop

If you reply to every message via stdout and the other party is also an
agent doing the same, you create an infinite ping-pong. To prevent this:

- When the inbound message is from `kind: "agent"` and is itself a closing
  acknowledgement, prefer **silence**.
- When you want to send a final ack but not perpetuate the loop, use
  **respond with `quiet: true`** — the message appears in chat history
  for the human reading later, but does NOT wake the other agent's
  listener.
