import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { message } from "./message.js";
import type { AgentVibeRuntimeConfig, RuntimeTarget } from "../runtime.js";

const DEFAULT_RUNTIME_CONTEXT_PATH = join(homedir(), ".agentvibe", "runtime-context.json");

function usage(): never {
  console.error(`Usage:
  agentvibe slack send <target> <text>
  agentvibe slack channel add <name> --channel <slackChannelId> [--app <slackAppId>] [--label <label>]
  agentvibe slack user add <name> --user <slackUserId> [--channel <defaultChannel>] [--app <slackAppId>] [--label <label>] [--alias <alias>...]
  agentvibe slack config path
  agentvibe slack config show

Examples:
  agentvibe slack channel add agents --channel C123 --app A123
  agentvibe slack user add tanay-agent --user U123 --channel agents --label "Tanay (clone)" --alias tanay-clone
  agentvibe slack send tanay-agent "please review this PR"`);
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
