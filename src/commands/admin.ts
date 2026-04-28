import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

interface AdminTarget {
  apiUrl: string;
  adminToken: string;
  envName: "dev" | "prod" | "custom";
}

function parseDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  return argv[i + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function targetFromArgs(argv: string[]): AdminTarget {
  const explicitApi =
    getFlag(argv, "--api-url") ?? process.env.AVA_API_URL ?? process.env.AGENTVIBE_API_URL;
  const explicitToken =
    getFlag(argv, "--admin-token") ??
    process.env.AVA_ADMIN_TOKEN ??
    process.env.AGENTVIBE_ADMIN_TOKEN;
  if (explicitApi && explicitToken) {
    return {
      apiUrl: explicitApi.replace(/\/+$/, ""),
      adminToken: explicitToken,
      envName: "custom",
    };
  }

  const envName = hasFlag(argv, "--prod") ? "prod" : "dev";
  const file = parseDotEnv(
    resolve(process.cwd(), envName === "prod" ? ".env.production" : ".env.local"),
  );
  const apiUrl = explicitApi ?? file.CONVEX_SITE_URL;
  const adminToken = explicitToken ?? file.ADMIN_AGENT_TOKEN ?? process.env.ADMIN_AGENT_TOKEN;
  if (!apiUrl || !adminToken) {
    throw new Error(
      `Missing admin target for ${envName}. Provide --api-url and --admin-token, or set CONVEX_SITE_URL and ADMIN_AGENT_TOKEN in ${envName === "prod" ? ".env.production" : ".env.local"}.`,
    );
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ""), adminToken, envName };
}

async function adminFetch(
  target: AdminTarget,
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<unknown> {
  const res = await fetch(`${target.apiUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${target.adminToken}`,
      ...(opts?.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Admin request failed ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function summarizeSlackHealth(data: unknown): void {
  const d = data as {
    ok?: boolean;
    channel?: string;
    installations?: Array<{
      appId: string;
      botUserId: string;
      botName?: string;
      ok: boolean;
      channel?: { isMember?: boolean; error?: string };
      warnings?: string[];
    }>;
    summary?: { total?: number; warnings?: number };
  };
  console.log(`Slack health: ${d.ok ? "ok" : "needs attention"}`);
  if (d.channel) console.log(`Channel: ${d.channel}`);
  console.log(`Installations: ${d.summary?.total ?? d.installations?.length ?? 0}`);
  for (const i of d.installations ?? []) {
    const channelStatus = i.channel
      ? ` channelMember=${i.channel.isMember === true ? "yes" : i.channel.isMember === false ? "no" : "unknown"}${i.channel.error ? ` error=${i.channel.error}` : ""}`
      : "";
    console.log(`  - ${i.appId} ${i.botName ?? i.botUserId}: ok=${i.ok}${channelStatus}`);
    for (const warning of i.warnings ?? []) console.log(`      warning: ${warning}`);
  }
}

function summarizeSlackDiagnosis(data: unknown): void {
  const d = data as {
    input?: { channel?: string; ts?: string; appId?: string };
    verdict?: string;
    selectedAppId?: string | null;
    checkedInstallations?: Array<{
      appId: string;
      slackOk: boolean;
      slackError?: string;
      isMember?: boolean;
    }>;
    slackMessage?: { text?: string; user?: string; bot_id?: string; ts?: string } | null;
    agentvibe?: {
      inboundMessages?: unknown[];
      traces?: Array<{ stage?: string; status?: string; reason?: string }>;
    };
    interpretation?: string;
  };
  console.log(`Slack diagnosis for ${d.input?.channel ?? "?"} ${d.input?.ts ?? "?"}`);
  console.log(`Verdict: ${d.verdict ?? "unknown"}`);
  if (d.selectedAppId) console.log(`Slack-readable via app: ${d.selectedAppId}`);
  console.log("");
  console.log("Installations checked:");
  for (const i of d.checkedInstallations ?? []) {
    console.log(
      `  - ${i.appId}: slackOk=${i.slackOk}${i.slackError ? ` error=${i.slackError}` : ""}${i.isMember !== undefined ? ` isMember=${i.isMember}` : ""}`,
    );
  }
  console.log("");
  console.log(`Slack message: ${d.slackMessage ? "found" : "not found"}`);
  if (d.slackMessage) {
    console.log(`  user=${d.slackMessage.user ?? "?"} bot_id=${d.slackMessage.bot_id ?? ""}`);
    console.log(`  text=${JSON.stringify(d.slackMessage.text ?? "")}`);
  }
  console.log(`AgentVibe inbound messages: ${d.agentvibe?.inboundMessages?.length ?? 0}`);
  console.log(`AgentVibe traces: ${d.agentvibe?.traces?.length ?? 0}`);
  for (const t of d.agentvibe?.traces ?? []) {
    console.log(`  - ${t.stage}: ${t.status}${t.reason ? ` (${t.reason})` : ""}`);
  }
  if (d.interpretation) {
    console.log("");
    console.log(d.interpretation);
  }
}

function cleanArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (["--prod", "--dev", "--json"].includes(a)) continue;
    if (["--api-url", "--admin-token"].includes(a)) {
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

export async function admin(argv: string[]): Promise<void> {
  const target = targetFromArgs(argv);
  const json = hasFlag(argv, "--json");
  const args = cleanArgv(argv);
  const command = args[0];
  const sub = args[1];

  if (command === "env") {
    const safe = {
      env: target.envName,
      apiUrl: target.apiUrl,
      hasAdminToken: Boolean(target.adminToken),
    };
    printJson(safe);
    return;
  }

  if (command === "agents" && sub === "active") {
    const threshold = getFlag(argv, "--threshold-ms") ?? "86400000";
    printJson(
      await adminFetch(
        target,
        `/api/internal-admin/agents/active?thresholdMs=${encodeURIComponent(threshold)}`,
      ),
    );
    return;
  }

  if (command === "slack" && sub === "retry") {
    const permalink = args.find((a, i) => i >= 2 && !a.startsWith("--"));
    const channel = getFlag(argv, "--channel");
    const ts = getFlag(argv, "--ts");
    const data = await adminFetch(target, "/api/internal-admin/slack/retry", {
      method: "POST",
      body: permalink ? { permalink } : { channel, ts },
    });
    if (json) printJson(data);
    else {
      const r = data as { messageId?: string; chatId?: string; placeholderTs?: string };
      console.log(`Retry scheduled for message ${r.messageId ?? "?"} in chat ${r.chatId ?? "?"}`);
      if (r.placeholderTs) console.log(`Placeholder: ${r.placeholderTs}`);
    }
    return;
  }

  if (command === "slack" && sub === "health") {
    const channel = getFlag(argv, "--channel");
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    const data = await adminFetch(target, `/api/internal-admin/slack/health?${params.toString()}`);
    if (json) printJson(data);
    else summarizeSlackHealth(data);
    return;
  }

  if (command === "slack" && sub === "diagnose") {
    const permalink = args.find((a, i) => i >= 2 && !a.startsWith("--"));
    const channel = getFlag(argv, "--channel");
    const ts = getFlag(argv, "--ts");
    const appId = getFlag(argv, "--app-id");
    const params = new URLSearchParams();
    if (permalink) params.set("permalink", permalink);
    if (channel) params.set("channel", channel);
    if (ts) params.set("ts", ts);
    if (appId) params.set("appId", appId);
    const data = await adminFetch(
      target,
      `/api/internal-admin/slack/diagnose?${params.toString()}`,
    );
    if (json) printJson(data);
    else summarizeSlackDiagnosis(data);
    return;
  }

  console.error(`Usage: ava [--dev|--prod] <command>

Commands:
  env                                      Print resolved admin target (without secrets)
  agents active [--threshold-ms <ms>]      List active hosted agents
  slack health [--channel C] [--json]      Check Slack installs, duplicate bots, channel membership
  slack retry <permalink> [--json]         Retry an ingested Slack message's agent run
  slack retry --channel C --ts T           Same, with explicit original user-message coordinates
  slack diagnose <permalink> [--json]      Diagnose Slack delivery/ingest/reply state
  slack diagnose --channel C --ts T        Same, with explicit coordinates

Target flags:
  --dev (default) reads .env.local
  --prod reads .env.production
  --api-url URL --admin-token TOKEN overrides env files`);
  process.exit(command ? 1 : 0);
}
