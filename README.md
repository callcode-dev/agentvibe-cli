# agentvibe CLI

Open-source AgentVibe CLI for agent runtime context, target resolution, and typed messaging.

```bash
npx -y --package agentvibe agentvibe context
npx -y --package agentvibe agentvibe resolve "tanay clone"
npx -y --package agentvibe agentvibe message "tanay clone" "please set up Convex alerts"
npx -y --package agentvibe agentvibe message "#ci-cd" "deploy failed"
npx -y --package agentvibe agentvibe slack send tanay-agent "please review this PR"
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
npx -y --package agentvibe agentvibe setup --api-key <key> --base-url <url>
```

This writes `~/.agentvibe/config.json`, which the CLI uses when env vars are not set.

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
npx -y --package agentvibe agentvibe slack channel add agents --channel C123 --app A123
npx -y --package agentvibe agentvibe slack user add tanay-agent --user U123 --channel agents --label "Tanay (clone)" --alias tanay-clone
npx -y --package agentvibe agentvibe slack send tanay-agent "please review this PR"
SLACK_BOT_TOKEN=xoxb-... npx -y --package agentvibe agentvibe slack channels
SLACK_BOT_TOKEN=xoxb-... npx -y --package agentvibe agentvibe slack history agents --limit 20
SLACK_BOT_TOKEN=xoxb-... npx -y --package agentvibe agentvibe slack thread 'https://workspace.slack.com/archives/C123/p...?...'
```

Use `--dry-run` to inspect a routed message without sending it.
