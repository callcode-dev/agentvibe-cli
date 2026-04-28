import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const env = {
  ...process.env,
  AGENTVIBE_CONTEXT_JSON: JSON.stringify({
    defaultSlackAppId: "A123",
    channels: { agents: { type: "slack-channel", channel: "C0B0F13M8R0" } },
    targets: {
      "tanay-clone": {
        type: "slack-user",
        slackUserId: "U0B0TPVC0V6",
        label: "Tanay (clone)",
        defaultChannel: "agents",
      },
      tanay: { type: "slack-user", slackUserId: "U0B0BLLQDCH", defaultChannel: "agents" },
    },
    aliases: { "tanay himself": "tanay", "tanay clone": "tanay-clone" },
  }),
};

function cli(args) {
  return execFileSync(process.execPath, ["dist/index.js", ...args], { env, encoding: "utf8" });
}

test("resolve supports aliases", () => {
  const resolved = JSON.parse(cli(["resolve", "tanay", "clone"]));
  assert.equal(resolved.target.type, "slack-user");
  assert.equal(resolved.target.slackUserId, "U0B0TPVC0V6");
});

test("message dry-run routes user targets through default channel mentions", () => {
  const routed = JSON.parse(cli(["message", "--dry-run", "tanay himself", "please", "review"]));
  assert.deepEqual(routed.target, { type: "slack-channel", appId: "A123", channel: "C0B0F13M8R0" });
  assert.equal(routed.parts[0].text, "<@U0B0BLLQDCH> please review");
});
