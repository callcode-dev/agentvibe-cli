# agentvibe CLI

Open-source AgentVibe CLI for agent runtime context, target resolution, and typed messaging.

```bash
agentvibe context
agentvibe resolve "tanay clone"
agentvibe message "tanay clone" "please set up Convex alerts"
agentvibe message "#ci-cd" "deploy failed"
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
agentvibe setup --api-key <key> --base-url <url>
```

This writes `~/.agentvibe/config.json`, which the CLI uses when env vars are not set.

Use `--dry-run` to inspect a routed message without sending it.
