import { AgentVibeClient, type Part, type ProactiveSendTarget } from "agentvibe-sdk";
import { handleQuotaError } from "../lib/handleQuotaError.js";
import { loadRuntime, resolveRuntimeTarget, type RuntimeTarget } from "../runtime.js";

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  argv.splice(index, 2);
  return value;
}

function readFlag(argv: string[], name: string): boolean {
  const index = argv.indexOf(name);
  if (index === -1) return false;
  argv.splice(index, 1);
  return true;
}

function slackTarget(target: RuntimeTarget, defaultSlackAppId?: string): ProactiveSendTarget {
  if (target.type === "slack-channel") {
    const appId = target.slackAppId ?? defaultSlackAppId;
    if (!appId) throw new Error("Missing slackAppId/defaultSlackAppId for Slack channel send");
    return { type: "slack-channel", appId, channel: target.channel };
  }
  if (target.type === "slack-user") {
    const appId = target.slackAppId ?? defaultSlackAppId;
    if (!appId) throw new Error("Missing slackAppId/defaultSlackAppId for Slack DM send");
    return { type: "slack-dm", appId, slackUserId: target.slackUserId };
  }
  return { type: "agentvibe-chat", chatId: target.chatId };
}

export async function message(argv: string[]): Promise<void> {
  const dryRun = readFlag(argv, "--dry-run");
  const channelOverride = readOption(argv, "--channel");
  const targetName = argv.shift();
  const text = argv.join(" ").trim();

  if (!targetName || !text) {
    console.error(
      "Usage: agentvibe message [--dry-run] [--channel <channel-alias>] <person|agent|channel> <text>",
    );
    process.exit(1);
  }

  const runtime = loadRuntime();
  const resolved = resolveRuntimeTarget(targetName, runtime.context);
  if (!resolved) {
    console.error(`Could not resolve ${JSON.stringify(targetName)} from AgentVibe runtime context`);
    process.exit(1);
  }

  let target = resolved.target;
  let parts: Part[] = [{ type: "text", text }];

  if (target.type === "slack-user" && (channelOverride || target.defaultChannel)) {
    const channelName = channelOverride ?? target.defaultChannel;
    const channel = channelName ? resolveRuntimeTarget(channelName, runtime.context) : null;
    if (!channel || channel.target.type !== "slack-channel") {
      throw new Error(`Could not resolve Slack channel ${JSON.stringify(channelName)}`);
    }
    parts = [{ type: "text", text: `<@${target.slackUserId}> ${text}` }];
    target = channel.target;
  }

  const deliveryTarget = slackTarget(target, runtime.context.defaultSlackAppId);

  if (dryRun) {
    console.log(JSON.stringify({ target: deliveryTarget, parts }, null, 2));
    return;
  }

  const client = new AgentVibeClient({
    apiKey: runtime.auth.apiKey,
    baseUrl: runtime.auth.baseUrl,
  });
  try {
    if (deliveryTarget.type === "agentvibe-chat") {
      const textPart = parts[0];
      if (!textPart || textPart.type !== "text")
        throw new Error("agentvibe-chat sends require text");
      const res = await client.send(deliveryTarget.chatId, textPart.text);
      console.log(`Message sent (id: ${res.message.id})`);
      return;
    }

    const res = await client.proactiveSend({ target: deliveryTarget, parts });
    console.log(
      `Message sent (id: ${res.messageId}${res.slackTs ? `, slackTs: ${res.slackTs}` : ""})`,
    );
  } catch (err) {
    if (handleQuotaError(err)) process.exit(1);
    throw err;
  }
}
