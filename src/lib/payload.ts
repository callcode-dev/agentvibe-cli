import type { ChatMessage, ChatListItem } from "agentvibe-sdk";
import type { MaterializedFile } from "./files.js";

export type PayloadPart =
  | { type: "text"; text: string }
  | {
      type: "file";
      fileId: string;
      filename: string;
      mediaType: string;
      sizeBytes: number;
      path: string;
      downloadUrl: string;
    };

export interface PayloadMessage {
  /**
   * Convex message id (`Id<"messages">` shape). Forwarded so agents can
   * reference the message in callbacks — e.g. the digital-clone handler
   * uses the most recent newMessages[].id as the messageId argument to
   * `agentvibe status` so the right slack placeholder gets edited.
   */
  id: string;
  from: {
    handle: string;
    name: string;
    kind: "human" | "agent";
    isYou?: boolean;
  };
  parts: PayloadPart[];
  createdAt: number;
}

export interface PayloadContextHints {
  /** Total number of messages in the chat (across all of history). */
  totalMessageCount: number;
  /**
   * createdAt of the earliest message in the pre-injected context window.
   * `null` when contextMessages is empty.
   */
  earliestContextTs: number | null;
  /** True iff the chat has messages older than the pre-injected window. */
  moreHistoryAvailable: boolean;
}

export interface RuntimeReplyOption {
  mode: "stdout" | "respond" | "silence";
  description: string;
}

export interface RuntimeContext {
  kind: "agentvibe-listen";
  you: { handle: string; name: string; kind: "agent" };
  chat: {
    type: "dm" | "group";
    otherParties: Array<{ handle: string; name: string; kind: "human" | "agent" }>;
  };
  replyOptions: readonly RuntimeReplyOption[];
}

export interface AgentPayload {
  chatId: string;
  chatType: "dm" | "group";
  chatName: string;
  // TODO: redundant with runtime.you (which also carries kind: "agent").
  // Kept for backwards compat with renderContextPrompt; remove after that
  // function is migrated to read from runtime.you instead.
  you: { handle: string; name: string };
  newMessages: PayloadMessage[];
  contextMessages: PayloadMessage[];
  contextHints?: PayloadContextHints;
  runtime: RuntimeContext;
}

function mapPart(
  part: ChatMessage["parts"][number],
  materialized: Map<string, MaterializedFile> | undefined,
): PayloadPart | null {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "file") {
    const m = materialized?.get(part.fileId);
    if (!m) return null;
    return {
      type: "file",
      fileId: m.fileId,
      filename: m.filename,
      mediaType: m.mediaType,
      sizeBytes: m.sizeBytes,
      path: m.path,
      downloadUrl: m.downloadUrl,
    };
  }
  // Exhaustiveness guard: turns "SDK added a new part type" into a compile
  // error so this file is revisited intentionally rather than silently dropping.
  const _exhaustive: never = part;
  void _exhaustive;
  return null;
}

function toPayloadMessage(
  msg: ChatMessage,
  materialized: Map<string, MaterializedFile> | undefined,
): PayloadMessage {
  const parts: PayloadPart[] = [];
  for (const p of msg.parts) {
    const mapped = mapPart(p, materialized);
    if (mapped) parts.push(mapped);
  }
  return {
    id: msg.id,
    from: {
      handle: msg.from?.username ?? "system",
      name: msg.from?.name ?? "System",
      // ChatMessage.sender is the SDK's view of convex's per-message sender field
      // (populated for every message; falls back to "human" for older rows).
      // TODO(sdk): remove cast once ChatMessage.sender is typed in agentvibe-sdk.
      kind: (msg as { sender?: "human" | "agent" }).sender ?? "human",
      ...(msg.from?.isYou ? { isYou: true } : {}),
    },
    parts,
    createdAt: msg.createdAt,
  };
}

function deriveChatName(chat: ChatListItem, myHandle: string): string {
  if (chat.type === "group") {
    return chat.name ?? "Group Chat";
  }
  const other = chat.participants.find((p) => p.username !== myHandle);
  return other ? `DM with ${other.username}` : "DM";
}

const REPLY_OPTIONS: readonly RuntimeReplyOption[] = [
  {
    mode: "stdout",
    description:
      "Default. Anything you write to stdout becomes a normal reply and wakes the other party's listener if they have one. Use for ordinary back-and-forth.",
  },
  {
    mode: "respond",
    description:
      "Call agentvibe.respond({ text, quiet: true }) to send a reply that will NOT wake the other party's listener. Use when you're acknowledging but the conversation should end (e.g. another agent just said 'thanks').",
  },
  {
    mode: "silence",
    description:
      "Call agentvibe.silence() to send no reply. Use when no message is warranted (you have nothing to add, the message was an FYI, the conversation is over).",
  },
];

export function buildPayload(opts: {
  chat: ChatListItem;
  newMessages: ChatMessage[];
  contextMessages: ChatMessage[];
  handle: string;
  name: string;
  contextHints?: PayloadContextHints;
  materialized?: Map<string, MaterializedFile>;
}): AgentPayload {
  const otherParties = opts.chat.participants
    .filter((p) => !p.isYou)
    .map((p) => ({
      handle: p.username,
      name: p.name,
      // Participant-level kind isn't carried on convex chats today; conservative
      // default is "human", and per-message kind on PayloadMessage.from already
      // gives the agent the precise per-message answer.
      kind: "human" as const,
    }));

  const runtime: RuntimeContext = {
    kind: "agentvibe-listen",
    you: { handle: opts.handle, name: opts.name, kind: "agent" },
    chat: {
      type: opts.chat.type,
      otherParties,
    },
    replyOptions: REPLY_OPTIONS,
  };

  return {
    chatId: opts.chat.id,
    chatType: opts.chat.type,
    chatName: deriveChatName(opts.chat, opts.handle),
    you: { handle: opts.handle, name: opts.name },
    newMessages: opts.newMessages.map((m) => toPayloadMessage(m, opts.materialized)),
    contextMessages: opts.contextMessages.map((m) => toPayloadMessage(m, opts.materialized)),
    ...(opts.contextHints ? { contextHints: opts.contextHints } : {}),
    runtime,
  };
}

/**
 * Render a system-prompt addendum that points the agent at the MCP context
 * tools when more history exists than fits in the pre-injected window.
 *
 * The wording is deliberately direct so the model knows exactly which tool
 * to call and what arguments to pass.
 */
export function renderContextPrompt(payload: AgentPayload): string {
  const hints = payload.contextHints;
  const seen = payload.contextMessages.length + payload.newMessages.length;
  const lines = [
    "## Conversation Context",
    "",
    `You are participating as @${payload.you.handle} in chat "${payload.chatName}" (id: ${payload.chatId}).`,
  ];
  if (hints) {
    lines.push(
      `You have been shown ${seen} of ${hints.totalMessageCount} total messages in this chat.`,
    );
    if (hints.moreHistoryAvailable) {
      const beforeRef =
        hints.earliestContextTs !== null ? String(hints.earliestContextTs) : "(omit)";
      lines.push(
        "",
        "Older history exists. If the conversation references something not in the",
        "context above, call the `get_chat_history` MCP tool with",
        `\`chatId="${payload.chatId}"\` and \`before="${beforeRef}"\` to fetch more.`,
        "Use `get_chat_metadata` to inspect the chat or `list_chats` to enumerate",
        "other accessible chats. All three are read-only.",
      );
    }
  }
  return lines.join("\n");
}
