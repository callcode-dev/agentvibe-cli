import type { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";

export interface TextPart {
  type: "text";
  text: string;
}

export interface FilePart {
  type: "file";
  fileId: string;
}

export type Part = TextPart | FilePart;

export interface Account {
  id: string;
  username: string;
  name: string;
}

export interface MeResponse {
  account: Account;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  from: { id: string; username: string; name: string; isYou: boolean } | null;
  parts: Part[];
  createdAt: number;
}

export interface SendMessageResponse {
  message: ChatMessage;
}

export type ProactiveSendTarget =
  | { type: "agentvibe-chat"; chatId: string }
  | { type: "slack-dm"; appId: string; slackUserId: string }
  | { type: "slack-channel"; appId: string; channel: string; threadTs?: string };

export interface ProactiveSendResponse {
  messageId: string;
  chatId: string;
  deliveryStatus: "sent" | "queued";
  slackTs?: string;
}

type JsonEndpoint<Input, Output, Status extends StatusCode = 200> = {
  input: Input;
  output: Output;
  outputFormat: "json";
  status: Status;
};

type AppSchema = {
  "/api/me": {
    $get: JsonEndpoint<Record<string, never>, MeResponse>;
  };
  "/api/chats/:id/messages": {
    $post: JsonEndpoint<
      { param: { id: string }; json: { parts: Part[] } },
      SendMessageResponse,
      201
    >;
  };
  "/api/agents/me/send": {
    $post: JsonEndpoint<
      { json: { target: ProactiveSendTarget; parts: Part[]; idempotencyKey?: string } },
      ProactiveSendResponse,
      200 | 202
    >;
  };
};

// Keep this tiny until AgentVibe publishes backend AppType declarations.
// The CLI still uses Hono RPC (`hc<AppType>`) for typed route calls.
export type AppType = Hono<Record<string, never>, AppSchema, "/">;
