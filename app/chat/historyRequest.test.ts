import { describe, it, expect, vi } from 'vitest';
import { fetchEarlierDays, HISTORY_ERROR } from './historyRequest';

function respond(status: number, body: string) {
  return vi.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;
}

describe('fetchEarlierDays', () => {
  it('asks for the days before the given date and returns them', async () => {
    const page = { days: [{ date: '2026-09-24', messages: [{ role: 'user', content: 'Hola' }] }], hasMore: true };
    const fetchFn = respond(200, JSON.stringify(page));

    expect(await fetchEarlierDays('2026-09-25', fetchFn)).toEqual({ kind: 'ok', ...page });
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe('/api/chat/history?before=2026-09-25');
  });

  it.each([
    ['a server error', respond(500, '{"error":"x"}')],
    ['an answer that is not JSON', respond(200, '<html>')],
    ['an answer with the wrong shape', respond(200, '{"days":"no"}')],
    ['no connection', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch],
  ])('gives a kind message on %s', async (_, fetchFn) => {
    expect(await fetchEarlierDays('2026-09-25', fetchFn)).toEqual({ kind: 'error', message: HISTORY_ERROR });
  });
});
