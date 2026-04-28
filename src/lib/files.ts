import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentVibeClient, ChatMessage } from "agentvibe-sdk";

/**
 * Sanitize an arbitrary filename string into something safe to write under a
 * controlled tmpdir. Strips path separators, NUL bytes, leading dots, and
 * trims whitespace. Falls back to `fallback` if the result is empty.
 */
export function safeFilename(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const stripped = value
    .replace(/[\\/\0]/g, "")
    .trim()
    .replace(/^\.+/, "");
  return stripped || fallback;
}

export interface MaterializedFile {
  fileId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  path: string;
  downloadUrl: string;
}

interface MaterializeOptions {
  client: AgentVibeClient;
  chatId: string;
  messages: ChatMessage[];
  dir: string;
}

export async function materializeFiles(
  opts: MaterializeOptions,
): Promise<Map<string, MaterializedFile>> {
  const result = new Map<string, MaterializedFile>();

  const fileIds = new Set<string>();
  for (const msg of opts.messages) {
    for (const part of msg.parts) {
      if (part.type === "file") fileIds.add(part.fileId);
    }
  }
  if (fileIds.size === 0) return result;

  await Promise.all(
    Array.from(fileIds).map(async (fileId) => {
      try {
        const info = await opts.client.getFileUrl(opts.chatId, fileId);
        const res = await fetch(info.downloadUrl);
        if (!res.ok) {
          throw new Error(`download returned HTTP ${res.status}`);
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const filename = safeFilename(info.filename, `${fileId}.bin`);
        const subdir = path.join(opts.dir, fileId);
        await mkdir(subdir, { recursive: true });
        const target = path.join(subdir, filename);
        await writeFile(target, bytes);
        result.set(fileId, {
          fileId,
          filename,
          mediaType: info.contentType || "application/octet-stream",
          sizeBytes: typeof info.sizeBytes === "number" ? info.sizeBytes : bytes.byteLength,
          path: target,
          downloadUrl: info.downloadUrl,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[${new Date().toISOString()}] file ${fileId} skipped: ${reason}`);
      }
    }),
  );

  return result;
}
