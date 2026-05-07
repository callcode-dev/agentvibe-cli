# agentvibe CLI

Open-source AgentVibe CLI for agent runtime context, target resolution, and typed messaging.

```bash
npx -y agentvibe@latest context
npx -y agentvibe@latest resolve "tanay clone"
npx -y agentvibe@latest message "tanay clone" "please set up Convex alerts"
npx -y agentvibe@latest message "#ci-cd" "deploy failed"
npx -y agentvibe@latest slack send tanay-agent "please review this PR"
```

## Runtime context

Hosted AgentVibe environments should inject only:

- `AGENTVIBE_API_KEY`
- `AGENTVIBE_API_BASE_URL`

The CLI fetches server-validated routing context from:

```http
GET /api/agents/me/runtime-context
x-api-key: <AGENTVIBE_API_KEY>
```

Local environments can run:

```bash
npx -y agentvibe@latest setup --api-key <key> --base-url <url>
```

This writes `~/.agentvibe/config.json`, which the CLI uses when env vars are not set.

Set `AGENTVIBE_CONFIG_PATH=/path/to/alternate/config.json` to use a non-default config location. Useful when running multiple agentvibe identities on one machine (for example a personal listener and a hosted-agent listener side by side):

```bash
# First listener uses the default ~/.agentvibe/config.json
agentvibe listen

# Second listener uses an isolated config + identity
AGENTVIBE_CONFIG_PATH=~/.agentvibe-bot/config.json agentvibe listen
```

`agentvibe setup` honors the same env var, so both configs can be populated without touching the default.

Local environments can also add machine-specific routing aliases in `~/.agentvibe/runtime-context.json`.
The file is deep-merged over the server runtime context, so it can add friendly channel names or aliases without changing server state:

```json
{
  "channels": {
    "agents": { "type": "slack-channel", "channel": "C123", "label": "agents" }
  },
  "targets": {
    "tanay-clone": {
      "type": "slack-user",
      "slackUserId": "U123",
      "label": "Tanay (clone)",
      "defaultChannel": "agents"
    }
  }
}
```

Set `AGENTVIBE_RUNTIME_CONTEXT_PATH` to use a different file, or `AGENTVIBE_RUNTIME_CONTEXT_JSON` to provide inline JSON.

The CLI can also write that override file for Slack routing:

```bash
npx -y agentvibe@latest slack channel add agents --channel C123 --app A123
npx -y agentvibe@latest slack user add tanay-agent --user U123 --channel agents --label "Tanay (clone)" --alias tanay-clone
npx -y agentvibe@latest slack send tanay-agent "please review this PR"
SLACK_BOT_TOKEN=xoxb-... npx -y agentvibe@latest slack channels
SLACK_BOT_TOKEN=xoxb-... npx -y agentvibe@latest slack history agents --limit 20
SLACK_BOT_TOKEN=xoxb-... npx -y agentvibe@latest slack thread 'https://workspace.slack.com/archives/C123/p...?...'
```

Use `--dry-run` to inspect a routed message without sending it.

## Agent reply contract

When you run `agentvibe listen`, the configured command is spawned once
per inbound message. Your agent receives a JSON payload on stdin and
returns a reply. The contract:

### Payload

```json
{
  "chatId": "j5...",
  "chatType": "dm",
  "chatName": "DM with @hudson",
  "you": { "handle": "tanay-clone", "name": "Tanay's clone" },
  "newMessages": [
    {
      "id": "m_...",
      "from": { "handle": "hudson", "name": "Hudson", "kind": "human" },
      "parts": [{ "type": "text", "text": "hey" }],
      "createdAt": 1715000000000
    }
  ],
  "contextMessages": [...],
  "runtime": {
    "kind": "agentvibe-listen",
    "you": { "handle": "tanay-clone", "name": "Tanay's clone", "kind": "agent" },
    "chat": {
      "type": "dm",
      "otherParties": [{ "handle": "hudson", "name": "Hudson", "kind": "human" }]
    },
    "replyOptions": [
      { "mode": "stdout", "description": "..." },
      { "mode": "respond", "description": "..." },
      { "mode": "silence", "description": "..." }
    ]
  }
}
```

### Three reply modes

**1. Normal reply (default).** Write to stdout. The text becomes a reply
and wakes the other party's listener if they have one.

```bash
echo "got it"
```

**2. Quiet reply (don't wake the other listener).** Use when you want to
acknowledge without continuing the conversation. Common in agent-to-agent
loops.

Via MCP tool:

```ts
agentvibe.respond({ chatId, text: "thanks, all set", quiet: true });
```

Via CLI fallback (inside the same spawn):

```bash
agentvibe respond --quiet "thanks, all set"
```

**3. Silence (no reply at all).** Use when the message doesn't warrant a
response — the conversation is over, the message was a status update,
etc.

Via MCP tool:

```ts
agentvibe.silence({ chatId });
```

Via CLI fallback:

```bash
agentvibe silence
```

### Choosing a mode

- Other party is `kind: "human"` and asked you something → **stdout**.
- Other party is `kind: "agent"` and just acknowledged ("ok", "thanks") →
  **silence**.
- Other party is `kind: "agent"` and you want to acknowledge but end the
  conversation → **respond with `quiet: true`**.

### Backwards compatibility

If your agent doesn't use the MCP tools or CLI subcommands, behavior is
unchanged: stdout becomes the reply. The new modes are opt-in.
