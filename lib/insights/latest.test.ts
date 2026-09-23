import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLatestInsight } from './latest';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';

// A fake of the read chain: select().eq().order().limit().maybeSingle().
function fakeReadClient(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const chain: Record<string, unknown> = { maybeSingle };
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, from, chain: chain as Record<string, ReturnType<typeof vi.fn>> };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('getLatestInsight', () => {
  it('returns the date and the text of the newest insight', async () => {
    const { client } = fakeReadClient({
      data: { insight_date: '2026-09-23', content: '  Estás aprendiendo algo.  ' },
      error: null,
    });

    await expect(getLatestInsight(client, USER_ID)).resolves.toEqual({
      insightDate: '2026-09-23',
      content: 'Estás aprendiendo algo.',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('asks only for this user, newest date first, just one row', async () => {
    const { client, from, chain } = fakeReadClient({ data: null, error: null });

    await getLatestInsight(client, USER_ID);

    expect(from).toHaveBeenCalledWith('daily_insights');
    expect(chain.select).toHaveBeenCalledWith('insight_date, content');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.order).toHaveBeenCalledWith('insight_date', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(chain.maybeSingle).toHaveBeenCalled();
  });

  it('returns null, without logging an error, when there is no insight yet', async () => {
    const { client } = fakeReadClient({ data: null, error: null });

    await expect(getLatestInsight(client, USER_ID)).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['a blank text', { insight_date: '2026-09-23', content: '   ' }],
    ['no text', { insight_date: '2026-09-23', content: null }],
    ['no date', { insight_date: null, content: 'Algo.' }],
  ])('returns null for a row with %s', async (_label, data) => {
    const { client } = fakeReadClient({ data, error: null });

    await expect(getLatestInsight(client, USER_ID)).resolves.toBeNull();
  });

  it('returns null and logs when Supabase returns an error', async () => {
    const { client } = fakeReadClient({ data: null, error: { message: 'permission denied for table daily_insights' } });

    await expect(getLatestInsight(client, USER_ID)).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns null instead of throwing when the call rejects', async () => {
    const { client, chain } = fakeReadClient({ data: null, error: null });
    chain.maybeSingle.mockRejectedValue(new Error('network down'));

    await expect(getLatestInsight(client, USER_ID)).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
