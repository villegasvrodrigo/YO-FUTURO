import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRecentCompletedTasks } from './checked';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const DATE = '2026-09-23';

// A fake of the read chain: select().eq().eq().gte().lt().order().order(), awaited at the end.
function fakeReadClient(result: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, from, chain: chain as Record<string, ReturnType<typeof vi.fn>> };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getRecentCompletedTasks', () => {
  it('returns the descriptions in the order the database gave them', async () => {
    const rows = [{ description: 'Ayer 1' }, { description: 'Antier 3' }];
    const { client } = fakeReadClient({ data: rows, error: null });

    await expect(getRecentCompletedTasks(USER_ID, DATE, client)).resolves.toEqual(['Ayer 1', 'Antier 3']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('asks only for checked tasks of this user, from 7 days before the date up to (not including) the date', async () => {
    const { client, from, chain } = fakeReadClient({ data: [], error: null });

    await getRecentCompletedTasks(USER_ID, '2026-09-23', client);

    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(chain.select).toHaveBeenCalledWith('description');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.eq).toHaveBeenCalledWith('completed', true);
    expect(chain.gte).toHaveBeenCalledWith('task_date', '2026-09-16');
    expect(chain.lt).toHaveBeenCalledWith('task_date', '2026-09-23');
  });

  it('orders newest day first, then by position within the day', async () => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getRecentCompletedTasks(USER_ID, DATE, client);

    expect(chain.order).toHaveBeenNthCalledWith(1, 'task_date', { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, 'position', { ascending: true });
  });

  it.each([
    ['a month boundary', '2026-10-03', '2026-09-26'],
    ['a year boundary', '2027-01-03', '2026-12-27'],
    ['a leap year', '2028-03-02', '2028-02-24'],
  ])('computes the window across %s', async (_label, date, expectedFrom) => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getRecentCompletedTasks(USER_ID, date, client);

    expect(chain.gte).toHaveBeenCalledWith('task_date', expectedFrom);
    expect(chain.lt).toHaveBeenCalledWith('task_date', date);
  });

  it.each([
    ['null data', null],
    ['no rows', []],
  ])('returns an empty list for %s, without logging an error', async (_label, data) => {
    const { client } = fakeReadClient({ data, error: null });

    await expect(getRecentCompletedTasks(USER_ID, DATE, client)).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips rows with a blank or missing description', async () => {
    const { client } = fakeReadClient({
      data: [{ description: 'Buena' }, { description: '   ' }, { description: null }, {}],
      error: null,
    });

    await expect(getRecentCompletedTasks(USER_ID, DATE, client)).resolves.toEqual(['Buena']);
  });

  describe('error while reading', () => {
    it('returns an empty list and logs when Supabase returns an error', async () => {
      const { client } = fakeReadClient({ data: null, error: { message: 'connection refused' } });

      await expect(getRecentCompletedTasks(USER_ID, DATE, client)).resolves.toEqual([]);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][1])).toContain('connection refused');
    });

    it('returns an empty list instead of throwing when the call rejects', async () => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lt']) chain[method] = vi.fn(() => chain);
      let orders = 0;
      chain.order = vi.fn(() => (++orders === 2 ? Promise.reject(new Error('network down')) : chain));
      const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

      await expect(getRecentCompletedTasks(USER_ID, DATE, client)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns an empty list instead of throwing when the admin client cannot be created', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      await expect(getRecentCompletedTasks(USER_ID, DATE)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each(['', '23/09/2026', '2026-02-31'])(
      'returns an empty list without querying for the invalid date %j',
      async (badDate) => {
        const { client, from } = fakeReadClient({ data: [], error: null });

        await expect(getRecentCompletedTasks(USER_ID, badDate, client)).resolves.toEqual([]);

        expect(from).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});
