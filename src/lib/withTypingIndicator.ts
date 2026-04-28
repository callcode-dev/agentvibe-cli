/**
 * Wraps an async operation with "typing start" / "typing stop" signals
 * to the chat API. Failures of either signal are logged and swallowed —
 * the typing indicator is decoration, the wrapped work is the product.
 */
export interface TypingClient {
  setTyping(chatId: string, active: boolean): Promise<void>;
}

export async function withTypingIndicator<T>(
  client: TypingClient,
  chatId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    await client.setTyping(chatId, true);
  } catch (err) {
    console.error(
      `[typing] start failed for chat ${chatId}:`,
      err instanceof Error ? err.message : err,
    );
  }
  try {
    return await fn();
  } finally {
    try {
      await client.setTyping(chatId, false);
    } catch (err) {
      console.error(
        `[typing] stop failed for chat ${chatId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
