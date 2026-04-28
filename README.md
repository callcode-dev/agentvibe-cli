# agentvibe CLI

Open-source AgentVibe CLI for agent runtime context, target resolution, and typed messaging.

```bash
agentvibe context
agentvibe resolve "tanay clone"
agentvibe message "tanay clone" "please set up Convex alerts"
agentvibe message "#ci-cd" "deploy failed"
```

## Runtime context

Hosted AgentVibe environments should inject:

- `AGENTVIBE_API_KEY`
- `AGENTVIBE_API_BASE_URL`
- `AGENTVIBE_CONTEXT_JSON`

Local environments can use:

- `~/.agentvibe/config.json` or `~/.agentvibe/auth.json`
- `~/.agentvibe/runtime.json`

Example `runtime.json`:

```json
{
  "org": { "id": "T0B02BHEE3W", "name": "AgentVibe", "slug": "agentvibe" },
  "currentIdentity": { "name": "Stephen AI", "handle": "stephen-ai" },
  "defaultSlackAppId": "A...",
  "channels": {
    "agents": { "type": "slack-channel", "channel": "C0B0F13M8R0" },
    "ci-cd": { "type": "slack-channel", "channel": "C..." }
  },
  "targets": {
    "tanay-clone": {
      "type": "slack-user",
      "label": "Tanay (clone)",
      "slackUserId": "U0B0TPVC0V6",
      "defaultChannel": "agents"
    },
    "tanay": {
      "type": "slack-user",
      "label": "tanay",
      "slackUserId": "U0B0BLLQDCH",
      "defaultChannel": "agents"
    }
  },
  "aliases": {
    "tanay himself": "tanay",
    "tanay clone": "tanay-clone"
  }
}
```

Use `--dry-run` to inspect a routed message without sending it.
