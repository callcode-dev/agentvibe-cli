import type {
  Part,
  ProactiveSendResponse,
  ProactiveSendTarget,
  SendMessageResponse,
} from "../api-types.js";
import { createClient, parseJsonResponse } from "../client.js";
import { loadRuntimeContext, resolveRuntimeTarget, type RuntimeTarget } from "../runtime.js";

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

function toDeliveryTarget(target: RuntimeTarget, defaultSlackAppId?: string): ProactiveSendTarget {
  if (target.type === "agentvibe-chat") return { type: "agentvibe-chat", chatId: target.chatId };
  const appId = target.slackAppId ?? defaultSlackAppId;
  if (!appId) throw new Error("Missing slackAppId/defaultSlackAppId for Slack delivery");
  if (target.type === "slack-channel")
    return { type: "slack-channel", appId, channel: target.channel };
  return { type: "slack-dm", appId, slackUserId: target.slackUserId };
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

  const { context } = loadRuntimeContext();
  const resolved = resolveRuntimeTarget(targetName, context);
  if (!resolved) {
    console.error(`Could not resolve ${JSON.stringify(targetName)} from AgentVibe runtime context`);
    process.exit(1);
  }

  let target = resolved.target;
  let parts: Part[] = [{ type: "text", text }];

  if (target.type === "slack-user" && (channelOverride || target.defaultChannel)) {
    const channelName = channelOverride ?? target.defaultChannel;
    const channel = channelName ? resolveRuntimeTarget(channelName, context) : null;
    if (!channel || channel.target.type !== "slack-channel") {
      throw new Error(`Could not resolve Slack channel ${JSON.stringify(channelName)}`);
    }
    parts = [{ type: "text", text: `<@${target.slackUserId}> ${text}` }];
    target = channel.target;
  }

  const deliveryTarget = toDeliveryTarget(target, context.defaultSlackAppId);
  if (dryRun) {
    console.log(JSON.stringify({ target: deliveryTarget, parts }, null, 2));
    return;
  }

  const { client } = createClient();
  if (deliveryTarget.type === "agentvibe-chat") {
    const res = await client.api.chats[":id"].messages.$post({
      param: { id: deliveryTarget.chatId },
      json: { parts },
    });
    const data = await parseJsonResponse<SendMessageResponse>(res);
    console.log(`Message sent (id: ${data.message.id})`);
    return;
  }

  const res = await client.api.agents.me.send.$post({ json: { target: deliveryTarget, parts } });
  const data = await parseJsonResponse<ProactiveSendResponse>(res);
  console.log(
    `Message sent (id: ${data.messageId}${data.slackTs ? `, slackTs: ${data.slackTs}` : ""})`,
  );
}
