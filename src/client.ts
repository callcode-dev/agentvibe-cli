import { hc } from "hono/client";
import type { AppType } from "./api-types.js";
import { loadRuntimeAuth } from "./runtime.js";

export function createClient() {
  const auth = loadRuntimeAuth();
  return {
    auth,
    client: hc<AppType>(auth.baseUrl.replace(/\/+$/, ""), {
      headers: { "x-api-key": auth.apiKey },
    }),
  };
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Ignore parse errors; handled below.
  }
  if (!res.ok) {
    const errorBody = body as { error?: string; message?: string; hint?: string } | null;
    const message = errorBody?.message ?? errorBody?.error ?? `HTTP ${res.status}`;
    const hint = errorBody?.hint ? `\n${errorBody.hint}` : "";
    throw new Error(`${message}${hint}`);
  }
  return body as T;
}
