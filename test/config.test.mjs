import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  loadConfig,
  saveConfig,
  resolveConfigPath,
  DEFAULT_DAEMON_CONFIG,
} from "../dist/config.js";

const SAMPLE = {
  apiKey: "av_ak_test",
  baseUrl: "https://example.invalid",
  handle: "tester",
  daemon: { ...DEFAULT_DAEMON_CONFIG, command: "/bin/true" },
};

function clearEnv() {
  delete process.env.AGENTVIBE_CONFIG_PATH;
}

test("resolveConfigPath defaults to ~/.agentvibe/config.json", () => {
  clearEnv();
  assert.equal(resolveConfigPath(), join(homedir(), ".agentvibe", "config.json"));
});

test("resolveConfigPath honors AGENTVIBE_CONFIG_PATH env var", () => {
  process.env.AGENTVIBE_CONFIG_PATH = "/tmp/agentvibe-x/config.json";
  try {
    assert.equal(resolveConfigPath(), "/tmp/agentvibe-x/config.json");
  } finally {
    clearEnv();
  }
});

test("resolveConfigPath ignores empty AGENTVIBE_CONFIG_PATH", () => {
  process.env.AGENTVIBE_CONFIG_PATH = "";
  try {
    assert.equal(resolveConfigPath(), join(homedir(), ".agentvibe", "config.json"));
  } finally {
    clearEnv();
  }
});

test("explicit path argument takes precedence over env var", () => {
  process.env.AGENTVIBE_CONFIG_PATH = "/tmp/agentvibe-env/config.json";
  try {
    assert.equal(
      resolveConfigPath("/tmp/agentvibe-explicit/config.json"),
      "/tmp/agentvibe-explicit/config.json",
    );
  } finally {
    clearEnv();
  }
});

test("saveConfig + loadConfig round-trip via env-var path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentvibe-config-"));
  const path = join(dir, "config.json");
  process.env.AGENTVIBE_CONFIG_PATH = path;
  try {
    saveConfig(SAMPLE);
    const loaded = loadConfig();
    assert.deepEqual(loaded, SAMPLE);
    const onDisk = await readFile(path, "utf-8");
    assert.ok(onDisk.includes("av_ak_test"));
  } finally {
    clearEnv();
  }
});

test("saveConfig writes to env-var path even when default exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agentvibe-config-isolation-"));
  const customPath = join(dir, "alt-config.json");
  process.env.AGENTVIBE_CONFIG_PATH = customPath;
  try {
    saveConfig({ ...SAMPLE, handle: "second-account" });
    const loaded = JSON.parse(await readFile(customPath, "utf-8"));
    assert.equal(loaded.handle, "second-account");
  } finally {
    clearEnv();
  }
});
