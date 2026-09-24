// While the chat is being built (until the real-use test, phase 7), it only works for the
// owner's account. Everyone else keeps seeing "Chat — Próximamente" and the API answers that
// it isn't available yet, without calling the AI or saving anything.
export const CHAT_ALLOWED_USER_IDS: readonly string[] = ['39fc48c8-e574-43a4-a192-b0ce420686d2'];

/** Whether this account can use the chat yet. */
export function isChatEnabledFor(userId: string | null | undefined): boolean {
  return !!userId && CHAT_ALLOWED_USER_IDS.includes(userId);
}
