import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const runtimeContext = {
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
  aliases: { "tanay-himself": "tanay", "tanay-clone": "tanay-clone" },
};

async function withServer(fn) {
  const server = http.createServer((req, res) => {
    assert.equal(req.headers["x-api-key"], "test-key");
    if (req.url === "/api/agents/me/runtime-context") {
      res.setHeader("content-type", "application/json");
      res.setHeader("connection", "close");
      res.end(JSON.stringify(runtimeContext));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function cli(args, baseUrl, extraEnv = {}) {
  const { stdout } = await execFileAsync(process.execPath, ["dist/index.js", ...args], {
    env: {
      ...process.env,
      AGENTVIBE_API_KEY: "test-key",
      AGENTVIBE_API_BASE_URL: baseUrl,
      AGENTVIBE_RUNTIME_CONTEXT_PATH: join(tmpdir(), "agentvibe-test-missing-runtime-context.json"),
      ...extraEnv,
    },
    encoding: "utf8",
    timeout: 5000,
  });
  return stdout;
}

test("resolve fetches runtime context from the API and supports aliases", async () => {
  await withServer(async (baseUrl) => {
    const resolved = JSON.parse(await cli(["resolve", "tanay", "clone"], baseUrl));
    assert.equal(resolved.target.type, "slack-user");
    assert.equal(resolved.target.slackUserId, "U0B0TPVC0V6");
  });
});

test("message dry-run routes user targets through default channel mentions", async () => {
  await withServer(async (baseUrl) => {
    const routed = JSON.parse(
      await cli(["message", "--dry-run", "tanay himself", "please", "review"], baseUrl),
    );
    assert.deepEqual(routed.target, {
      type: "slack-channel",
      appId: "A123",
      channel: "C0B0F13M8R0",
    });
    assert.equal(routed.parts[0].text, "<@U0B0BLLQDCH> please review");
  });
});

test("runtime context overrides add local aliases and channels", async () => {
  await withServer(async (baseUrl) => {
    const dir = await mkdtemp(join(tmpdir(), "agentvibe-runtime-"));
    const overridePath = join(dir, "runtime-context.json");
    await writeFile(
      overridePath,
      JSON.stringify({
        channels: {
          agents: { type: "slack-channel", channel: "CLOCALAGENTS", label: "agents" },
        },
        targets: {
          "tanays-agent": {
            type: "slack-user",
            slackUserId: "ULOCALCLONE",
            label: "Tanay (clone)",
            defaultChannel: "agents",
          },
        },
        aliases: { "tanay-agent": "tanays-agent" },
      }),
    );

    const routed = JSON.parse(
      await cli(["message", "--dry-run", "tanay-agent", "please", "review"], baseUrl, {
        AGENTVIBE_RUNTIME_CONTEXT_PATH: overridePath,
      }),
    );
    assert.deepEqual(routed.target, {
      type: "slack-channel",
      appId: "A123",
      channel: "CLOCALAGENTS",
    });
    assert.equal(routed.parts[0].text, "<@ULOCALCLONE> please review");
  });
});

test("slack commands write aliases and send through message routing", async () => {
  await withServer(async (baseUrl) => {
    const dir = await mkdtemp(join(tmpdir(), "agentvibe-slack-"));
    const overridePath = join(dir, "runtime-context.json");
    const env = { AGENTVIBE_RUNTIME_CONTEXT_PATH: overridePath };

    await cli(
      ["slack", "channel", "add", "agents", "--channel", "CLOCALAGENTS", "--app", "ALOCAL"],
      baseUrl,
      env,
    );
    await cli(
      [
        "slack",
        "user",
        "add",
        "tanay-agent",
        "--user",
        "ULOCALCLONE",
        "--channel",
        "agents",
        "--alias",
        "tanay-clone",
      ],
      baseUrl,
      env,
    );

    const routed = JSON.parse(
      await cli(["slack", "send", "--dry-run", "tanay-agent", "please", "review"], baseUrl, env),
    );
    assert.deepEqual(routed.target, {
      type: "slack-channel",
      appId: "ALOCAL",
      channel: "CLOCALAGENTS",
    });
    assert.equal(routed.parts[0].text, "<@ULOCALCLONE> please review");
  });
});
