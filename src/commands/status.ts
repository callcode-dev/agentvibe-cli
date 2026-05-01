import { loadConfig } from "../config.js";

/**
 * Push a best-effort progress update for an in-flight inbound message.
 *
 * The handler emits these every ~1s as Claude tool-use events fire so the
 * Slack placeholder can show "thinking… (12 reads, 3 edits · 0:45)" instead of
 * a static spinner. Status updates are decoration: any failure here MUST NOT
 * block or fail the agent — we log to stderr and exit 0 regardless.
 *
 * The agentvibe-sdk does not expose `updateStatus` yet, so we hit the HTTP
 * endpoint directly. Auth header matches AgentVibeClient.rawFetch
 * (x-api-key), not Bearer.
 */
export async function status(argv: string[]): Promise<void> {
  const chatId = argv[0];
  const messageId = argv[1];
  const text = argv.slice(2).join(" ");

  if (!chatId || !messageId || !text) {
    console.error("Usage: agentvibe status <chatId> <messageId> <text>");
    process.exit(1);
  }

  const config = loadConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  try {
    const res = await fetch(`${baseUrl}/api/agents/me/status`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({ chatId, messageId, text }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(`status failed: ${res.status} ${res.statusText} ${bodyText}`);
    }
  } catch (err) {
    // Intentionally swallow — status updates are best-effort, never block the agent
    console.error(`status failed: ${err instanceof Error ? err.message : err}`);
  }
  // Always exit 0: the handler fires-and-forgets and a non-zero exit would
  // pollute its logs without changing user-visible behavior.
}
