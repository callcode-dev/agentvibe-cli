import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readResponseFile, writeResponseFile } from "../dist/lib/responseFile.js";

async function withTempFile(content, fn) {
  const dir = await mkdtemp(join(tmpdir(), "av-test-"));
  const file = join(dir, "response.json");
  if (content !== undefined) await writeFile(file, content);
  try {
    return await fn(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("readResponseFile: returns null when file does not exist", async () => {
  await withTempFile(undefined, async (file) => {
    const result = await readResponseFile(file);
    assert.equal(result, null);
  });
});

test("readResponseFile: returns silence envelope", async () => {
  await withTempFile('{"mode":"silence"}', async (file) => {
    const result = await readResponseFile(file);
    assert.deepEqual(result, { mode: "silence" });
  });
});

test("readResponseFile: returns respond envelope with quiet", async () => {
  await withTempFile(
    '{"mode":"respond","text":"hi","quiet":true}',
    async (file) => {
      const result = await readResponseFile(file);
      assert.deepEqual(result, { mode: "respond", text: "hi", quiet: true });
    }
  );
});

test("readResponseFile: returns null for malformed JSON", async () => {
  await withTempFile("{not json", async (file) => {
    const result = await readResponseFile(file);
    assert.equal(result, null);
  });
});

test("readResponseFile: returns null for unknown mode", async () => {
  await withTempFile('{"mode":"garbage"}', async (file) => {
    const result = await readResponseFile(file);
    assert.equal(result, null);
  });
});

test("writeResponseFile: writes valid envelope readable by reader", async () => {
  await withTempFile(undefined, async (file) => {
    await writeResponseFile(file, { mode: "respond", text: "ok", quiet: false });
    const result = await readResponseFile(file);
    assert.deepEqual(result, { mode: "respond", text: "ok", quiet: false });
  });
});

test("writeResponseFile: creates missing parent directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "av-test-"));
  const nested = join(dir, "nested-subdir", "response.json");
  try {
    await writeResponseFile(nested, { mode: "silence" });
    const result = await readResponseFile(nested);
    assert.deepEqual(result, { mode: "silence" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readResponseFile: returns respond envelope without quiet field", async () => {
  await withTempFile('{"mode":"respond","text":"plain"}', async (file) => {
    const result = await readResponseFile(file);
    assert.deepEqual(result, { mode: "respond", text: "plain" });
  });
});
