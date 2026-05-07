import test from "node:test";
import assert from "node:assert/strict";
import { buildPayload } from "../dist/lib/payload.js";

const baseChat = {
  id: "c1",
  type: "dm",
  name: null,
  participants: [
    { id: "u-me", username: "me", name: "Me", isYou: true },
    { id: "u-them", username: "them", name: "Them", isYou: false },
  ],
  lastMessage: null,
  updatedAt: 0,
};

function newMessage({ from, sender }) {
  return {
    id: "m1",
    chatId: "c1",
    from,
    sender,
    parts: [{ type: "text", text: "hi" }],
    createdAt: 1,
  };
}

test("payload: from.kind is 'agent' when message sender='agent'", () => {
  const payload = buildPayload({
    chat: baseChat,
    newMessages: [
      newMessage({
        from: { id: "u-them", username: "them", name: "Them", isYou: false },
        sender: "agent",
      }),
    ],
    contextMessages: [],
    handle: "me",
    name: "Me",
  });
  assert.equal(payload.newMessages[0].from.kind, "agent");
});

test("payload: from.kind defaults to 'human' when sender absent", () => {
  const payload = buildPayload({
    chat: baseChat,
    newMessages: [
      newMessage({
        from: { id: "u-them", username: "them", name: "Them", isYou: false },
        sender: undefined,
      }),
    ],
    contextMessages: [],
    handle: "me",
    name: "Me",
  });
  assert.equal(payload.newMessages[0].from.kind, "human");
});

test("payload: runtime block lists three reply options", () => {
  const payload = buildPayload({
    chat: baseChat,
    newMessages: [],
    contextMessages: [],
    handle: "me",
    name: "Me",
  });
  assert.equal(payload.runtime.kind, "agentvibe-listen");
  assert.equal(payload.runtime.you.kind, "agent");
  assert.equal(payload.runtime.replyOptions.length, 3);
  const modes = payload.runtime.replyOptions.map((o) => o.mode);
  assert.deepEqual(modes, ["stdout", "respond", "silence"]);
});

test("payload: runtime.chat.otherParties excludes self", () => {
  const payload = buildPayload({
    chat: baseChat,
    newMessages: [],
    contextMessages: [],
    handle: "me",
    name: "Me",
  });
  assert.equal(payload.runtime.chat.otherParties.length, 1);
  assert.equal(payload.runtime.chat.otherParties[0].handle, "them");
});
