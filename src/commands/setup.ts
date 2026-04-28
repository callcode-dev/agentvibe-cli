import type { MeResponse } from "../api-types.js";
import { parseJsonResponse } from "../client.js";
import { saveRuntimeAuth } from "../runtime.js";
import { hc } from "hono/client";
import type { AppType } from "../api-types.js";

function readOption(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  argv.splice(index, 2);
  return value;
}

export async function setup(argv: string[]): Promise<void> {
  const apiKey = readOption(argv, "--api-key");
  const baseUrl = readOption(argv, "--base-url") ?? readOption(argv, "--api-base-url");
  if (!apiKey || !baseUrl) {
    console.error("Usage: agentvibe setup --api-key <key> --base-url <url>");
    process.exit(1);
  }

  const client = hc<AppType>(baseUrl.replace(/\/+$/, ""), { headers: { "x-api-key": apiKey } });
  const me = await parseJsonResponse<MeResponse>(await client.api.me.$get({}));
  saveRuntimeAuth({ apiKey, baseUrl, source: "config" });
  console.log(`✓ Authenticated as @${me.account.username || me.account.name || me.account.id}`);
  console.log("✓ Config written to ~/.agentvibe/config.json");
}
