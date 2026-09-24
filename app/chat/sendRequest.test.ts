import { describe, it, expect, vi } from 'vitest';
import { sendChatRequest, GENERIC_ERROR, NETWORK_ERROR, TIMEOUT_ERROR } from './sendRequest';

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  ) as unknown as typeof fetch;
}

describe('sendChatRequest', () => {
  it('posts the message to /api/chat as JSON', async () => {
    const fetchFn = respond(200, { reply: 'Aquí estoy.', isCrisis: false, messagesLeft: 19 });

    await sendChatRequest('Hola', fetchFn);

    const [url, init] = vi.mocked(fetchFn).mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ message: 'Hola' }) });
  });

  it('returns the reply and how many messages are left', async () => {
    const outcome = await sendChatRequest('Hola', respond(200, { reply: 'Aquí estoy.', isCrisis: false, messagesLeft: 4 }));

    expect(outcome).toEqual({ kind: 'reply', reply: 'Aquí estoy.', messagesLeft: 4 });
  });

  it('recognizes the daily limit', async () => {
    const outcome = await sendChatRequest('Hola', respond(429, { error: 'Seguimos mañana.', code: 'limit_reached' }));

    expect(outcome).toEqual({ kind: 'limit' });
  });

  it("shows the server's own kind message on other errors", async () => {
    const outcome = await sendChatRequest('Hola', respond(502, { error: 'No pude responderte ahora.', code: 'reply_failed' }));

    expect(outcome).toEqual({ kind: 'error', message: 'No pude responderte ahora.' });
  });

  it('falls back to a generic message when the answer is not JSON', async () => {
    const outcome = await sendChatRequest('Hola', respond(500, '<html>Error</html>'));

    expect(outcome).toEqual({ kind: 'error', message: GENERIC_ERROR });
  });

  it('says to check the connection when the request cannot be made', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch;

    expect(await sendChatRequest('Hola', fetchFn)).toEqual({ kind: 'error', message: NETWORK_ERROR });
  });

  it('gives up kindly when the answer takes too long', async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    ) as unknown as typeof fetch;

    expect(await sendChatRequest('Hola', fetchFn, 10)).toEqual({ kind: 'error', message: TIMEOUT_ERROR });
  });
});
