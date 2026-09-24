// How long the screen waits for /api/chat before giving up: the route itself allows up to
// 60 s (the AI call plus one retry), so this only catches a connection that stalled.
export const CHAT_REQUEST_TIMEOUT_MS = 70_000;

export const NETWORK_ERROR = 'No pude enviar tu mensaje. Revisa tu conexión e intenta de nuevo.';
export const TIMEOUT_ERROR = 'Tu yo futuro tardó demasiado en responder. Intenta de nuevo.';
export const GENERIC_ERROR = 'Algo falló. Intenta de nuevo en un momento.';

export type SendOutcome =
  | { kind: 'reply'; reply: string; messagesLeft: number }
  // Today's messages are used up: the screen says goodbye and locks the box.
  | { kind: 'limit' }
  // Anything else: the message wasn't sent, and `message` says so kindly.
  | { kind: 'error'; message: string };

/** Sends one message to /api/chat and says what happened. Never throws. */
export async function sendChatRequest(
  message: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = CHAT_REQUEST_TIMEOUT_MS
): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
  } catch (err) {
    return { kind: 'error', message: err instanceof Error && err.name === 'AbortError' ? TIMEOUT_ERROR : NETWORK_ERROR };
  } finally {
    clearTimeout(timer);
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await res.json()) as Record<string, unknown> | null) ?? {};
  } catch {
    // Not JSON (a proxy error page, for example): handled below by the status alone.
  }

  if (res.status === 429 || body.code === 'limit_reached') return { kind: 'limit' };

  if (res.ok && typeof body.reply === 'string' && typeof body.messagesLeft === 'number') {
    return { kind: 'reply', reply: body.reply, messagesLeft: body.messagesLeft };
  }

  return { kind: 'error', message: typeof body.error === 'string' && body.error ? body.error : GENERIC_ERROR };
}
