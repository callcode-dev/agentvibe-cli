import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { message } from "./message.js";
import {
  fetchRuntimeContext,
  loadRuntimeAuth,
  resolveRuntimeTarget,
  type AgentVibeRuntimeConfig,
  type RuntimeTarget,
} from "../runtime.js";

const DEFAULT_RUNTIME_CONTEXT_PATH = join(homedir(), ".agentvibe", "runtime-context.json");

function usage(): never {
  console.error(`Usage:
  agentvibe slack send <target> <text>
  agentvibe slack channels [--limit <n>] [--types <types>] [--json]
  agentvibe slack history <channel|alias> [--limit <n>] [--json]
  agentvibe slack thread <permalink> [--limit <n>] [--json]
  agentvibe slack thread --channel <channel|alias> --ts <threadTs> [--limit <n>] [--json]
  agentvibe slack channel add <name> --channel <slackChannelId> [--app <slackAppId>] [--label <label>]
  agentvibe slack user add <name> --user <slackUserId> [--channel <defaultChannel>] [--app <slackAppId>] [--label <label>] [--alias <alias>...]
  agentvibe slack config path
  agentvibe slack config show

Examples:
  agentvibe slack channel add agents --channel C123 --app A123
  agentvibe slack user add tanay-agent --user U123 --channel agents --label "Tanay (clone)" --alias tanay-clone
  agentvibe slack send tanay-agent "please review this PR"
  SLACK_BOT_TOKEN=xoxb-... agentvibe slack history agents --limit 20`);
  process.exit(1);
}

function takeFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) usage();
  argv.splice(index, 2);
  return value;
}

function takeRepeatedFlag(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (;;) {
    const value = takeFlag(argv, name);
    if (!value) return values;
    values.push(value);
  }
}

function takeBooleanFlag(argv: string[], name: string): boolean {
  const index = argv.indexOf(name);
  if (index === -1) return false;
  argv.splice(index, 1);
  return true;
}

function takeLimit(argv: string[], fallback: number): number {
  const raw = takeFlag(argv, "--limit") ?? takeFlag(argv, "-n");
  if (!raw) return fallback;
  const limit = Number.parseInt(raw, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("--limit must be an integer between 1 and 200");
  }
  return limit;
}

function slackToken(): string {
  const token =
    process.env.SLACK_TOKEN ??
    process.env.SLACK_BOT_TOKEN ??
    process.env.SLACK_USER_TOKEN ??
    process.env.SLACK_LIVE_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Missing Slack token. Set SLACK_TOKEN, SLACK_BOT_TOKEN, SLACK_USER_TOKEN, or SLACK_LIVE_BOT_TOKEN.",
    );
  }
  return token;
}

async function slackApi<T>(method: string, params: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body.set(key, String(value));
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackToken()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json()) as T & {
    ok?: boolean;
    error?: string;
    needed?: string;
    provided?: string;
  };
  if (!data.ok) {
    const scopeHint = data.needed ? ` needed=${data.needed}` : "";
    throw new Error(`Slack ${method} failed: ${data.error ?? res.status}${scopeHint}`);
  }
  return data;
}

function renderSlackMessage(message: {
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
}) {
  const author = message.user ?? message.bot_id ?? "unknown";
  return `[${message.ts ?? "?"}] ${author}: ${message.text ?? ""}`;
}

async function resolveSlackChannel(input: string): Promise<string> {
  if (/^[CGD][A-Z0-9]+$/.test(input)) return input;
  const auth = loadRuntimeAuth();
  const context = await fetchRuntimeContext(auth);
  const resolved = resolveRuntimeTarget(input, context);
  if (!resolved || resolved.target.type !== "slack-channel") {
    throw new Error(`Could not resolve Slack channel ${JSON.stringify(input)}`);
  }
  return resolved.target.channel;
}

function parseSlackPermalink(value: string): { channel: string; ts: string } | null {
  const url = new URL(value);
  const channel = url.searchParams.get("cid") ?? url.pathname.match(/\/archives\/([^/]+)/)?.[1];
  const threadTs = url.searchParams.get("thread_ts");
  const pathTs = url.pathname
    .match(/\/p(\d{10})(\d{6})/)
    ?.slice(1, 3)
    .join(".");
  const ts = threadTs ?? pathTs;
  return channel && ts ? { channel, ts } : null;
}

function runtimeContextPath(): string {
  return process.env.AGENTVIBE_RUNTIME_CONTEXT_PATH ?? DEFAULT_RUNTIME_CONTEXT_PATH;
}

function loadOverride(): AgentVibeRuntimeConfig {
  const path = runtimeContextPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as AgentVibeRuntimeConfig;
}

function saveOverride(config: AgentVibeRuntimeConfig): string {
  const path = runtimeContextPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function setTarget(config: AgentVibeRuntimeConfig, name: string, target: RuntimeTarget): void {
  config.targets ??= {};
  config.targets[name] = target;
}

function setChannel(config: AgentVibeRuntimeConfig, name: string, target: RuntimeTarget): void {
  config.channels ??= {};
  config.channels[name] = target;
}

export async function slack(argv: string[]): Promise<void> {
  const subcommand = argv.shift();

  if (subcommand === "send") {
    await message(argv);
    return;
  }

  if (subcommand === "channels") {
    const json = takeBooleanFlag(argv, "--json");
    const limit = takeLimit(argv, 100);
    const types = takeFlag(argv, "--types") ?? "public_channel,private_channel,im";
    if (argv.length > 0) usage();
    const data = await slackApi<{
      channels?: Array<{
        id: string;
        name?: string;
        is_member?: boolean;
        is_channel?: boolean;
        is_group?: boolean;
      }>;
    }>("conversations.list", {
      types,
      exclude_archived: "true",
      limit,
    });
    const channels = data.channels ?? [];
    if (json) {
      console.log(JSON.stringify(channels, null, 2));
      return;
    }
    for (const channel of channels) {
      const marker = channel.is_member === false ? "not-member" : "member";
      console.log(`${channel.id}\t${channel.name ?? "(dm)"}\t${marker}`);
    }
    return;
  }

  if (subcommand === "history") {
    const json = takeBooleanFlag(argv, "--json");
    const limit = takeLimit(argv, 20);
    const channelArg = argv.shift();
    if (!channelArg || argv.length > 0) usage();
    const channel = await resolveSlackChannel(channelArg);
    const data = await slackApi<{
      messages?: Array<{ user?: string; bot_id?: string; text?: string; ts?: string }>;
    }>("conversations.history", { channel, limit });
    const messages = data.messages ?? [];
    if (json) {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }
    for (const item of messages.slice().reverse()) console.log(renderSlackMessage(item));
    return;
  }

  if (subcommand === "thread") {
    const json = takeBooleanFlag(argv, "--json");
    const limit = takeLimit(argv, 50);
    let channel = takeFlag(argv, "--channel") ?? takeFlag(argv, "-c");
    let ts = takeFlag(argv, "--ts");
    const permalink = argv.shift();
    if (permalink) {
      const parsed = parseSlackPermalink(permalink);
      if (!parsed) throw new Error("Could not parse Slack permalink");
      channel = parsed.channel;
      ts = parsed.ts;
    }
    if (!channel || !ts || argv.length > 0) usage();
    channel = await resolveSlackChannel(channel);
    const data = await slackApi<{
      messages?: Array<{ user?: string; bot_id?: string; text?: string; ts?: string }>;
    }>("conversations.replies", { channel, ts, limit });
    const messages = data.messages ?? [];
    if (json) {
      console.log(JSON.stringify(messages, null, 2));
      return;
    }
    for (const item of messages) console.log(renderSlackMessage(item));
    return;
  }

  if (subcommand === "config") {
    const action = argv.shift();
    if (action === "path") {
      console.log(runtimeContextPath());
      return;
    }
    if (action === "show") {
      console.log(JSON.stringify(loadOverride(), null, 2));
      return;
    }
    usage();
  }

  if (subcommand === "channel") {
    const action = argv.shift();
    if (action !== "add") usage();
    const name = argv.shift();
    const channel = takeFlag(argv, "--channel") ?? takeFlag(argv, "-c");
    const slackAppId = takeFlag(argv, "--app") ?? takeFlag(argv, "--app-id");
    const label = takeFlag(argv, "--label") ?? name;
    if (!name || !channel || argv.length > 0) usage();

    const config = loadOverride();
    setChannel(config, name, { type: "slack-channel", channel, label, slackAppId });
    const path = saveOverride(config);
    console.log(`Saved Slack channel ${name} -> ${channel} in ${path}`);
    return;
  }

  if (subcommand === "user") {
    const action = argv.shift();
    if (action !== "add") usage();
    const name = argv.shift();
    const slackUserId = takeFlag(argv, "--user") ?? takeFlag(argv, "-u");
    const defaultChannel = takeFlag(argv, "--channel") ?? takeFlag(argv, "-c");
    const slackAppId = takeFlag(argv, "--app") ?? takeFlag(argv, "--app-id");
    const label = takeFlag(argv, "--label") ?? name;
    const aliases = takeRepeatedFlag(argv, "--alias");
    if (!name || !slackUserId || argv.length > 0) usage();

    const config = loadOverride();
    setTarget(config, name, {
      type: "slack-user",
      slackUserId,
      label,
      defaultChannel,
      slackAppId,
    });
    if (aliases.length > 0) {
      config.aliases ??= {};
      for (const alias of aliases) config.aliases[alias] = name;
    }
    const path = saveOverride(config);
    console.log(`Saved Slack user ${name} -> ${slackUserId} in ${path}`);
    return;
  }

  usage();
}
