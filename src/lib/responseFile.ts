import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type ResponseEnvelope =
  | { mode: "silence" }
  | { mode: "respond"; text: string; quiet?: boolean };

/**
 * Read the response envelope written by an MCP tool or CLI subcommand
 * during a single agent invocation. Returns null when:
 *  - the file does not exist (agent didn't use the tools — fall back to stdout)
 *  - the file is malformed JSON
 *  - the envelope shape is invalid
 *
 * Never throws on file/parse errors; the caller decides what to do with null.
 */
export async function readResponseFile(filePath: string): Promise<ResponseEnvelope | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.mode === "silence") return { mode: "silence" };
  if (obj.mode === "respond" && typeof obj.text === "string") {
    return {
      mode: "respond",
      text: obj.text,
      ...(typeof obj.quiet === "boolean" ? { quiet: obj.quiet } : {}),
    };
  }
  return null;
}

/**
 * Write a response envelope. Creates the parent directory if needed.
 * Used by MCP tools and the `agentvibe respond` / `agentvibe silence`
 * CLI subcommands.
 *
 * Not atomic — relies on the contract that the writer (the spawned
 * agent) finishes before the reader (the listener) reads, which is
 * how `agentvibe listen` is structured.
 */
export async function writeResponseFile(
  filePath: string,
  envelope: ResponseEnvelope,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(envelope), { mode: 0o600 });
}
