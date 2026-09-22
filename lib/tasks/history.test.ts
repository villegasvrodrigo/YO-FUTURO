import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTaskHistory } from './history';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const TODAY = '2026-09-22';

// A fake of the read chain: select().eq().gte().lte().order(), awaited at the end.
function fakeReadClient(result: { data: unknown; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order']) {
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
  vi.restoreAllMocks();
});

describe('getTaskHistory', () => {
  it('returns the rows the database gave', async () => {
    const rows = [
      { task_date: '2026-09-21', completed: true },
      { task_date: '2026-09-22', completed: false },
    ];
    const { client } = fakeReadClient({ data: rows, error: null });

    await expect(getTaskHistory(client, USER_ID, TODAY)).resolves.toEqual(rows);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('asks only for this user, only the needed columns, from 89 days back through today', async () => {
    const { client, from, chain } = fakeReadClient({ data: [], error: null });

    await getTaskHistory(client, USER_ID, TODAY);

    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(chain.select).toHaveBeenCalledWith('task_date, completed');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.gte).toHaveBeenCalledWith('task_date', '2026-06-25');
    expect(chain.lte).toHaveBeenCalledWith('task_date', TODAY);
    expect(chain.order).toHaveBeenCalledWith('task_date', { ascending: true });
  });

  it.each([
    ['a year boundary', '2027-01-15', '2026-10-18'],
    ['a leap year', '2028-03-01', '2027-12-03'],
  ])('computes the 90-day window across %s', async (_label, today, expectedFrom) => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getTaskHistory(client, USER_ID, today);

    expect(chain.gte).toHaveBeenCalledWith('task_date', expectedFrom);
    expect(chain.lte).toHaveBeenCalledWith('task_date', today);
  });

  it.each([
    ['null data', null],
    ['no rows', []],
  ])('returns an empty list for %s, without logging an error', async (_label, data) => {
    const { client } = fakeReadClient({ data, error: null });

    await expect(getTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('drops malformed rows', async () => {
    const { client } = fakeReadClient({
      data: [
        { task_date: '2026-09-22', completed: true },
        { task_date: null, completed: true },
        { task_date: '2026-09-22' },
        null,
      ],
      error: null,
    });

    await expect(getTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([
      { task_date: '2026-09-22', completed: true },
    ]);
  });

  it('returns an empty list and logs when Supabase returns an error', async () => {
    const { client } = fakeReadClient({ data: null, error: { message: 'permission denied' } });

    await expect(getTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns an empty list instead of throwing when the call rejects', async () => {
    const order = vi.fn().mockRejectedValue(new Error('network down'));
    const chain = { select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, order };
    const client = { from: () => chain } as unknown as SupabaseClient;

    await expect(getTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each(['', '2026-02-31', 'hoy'])(
    'does not touch the database with the invalid date %j',
    async (bad) => {
      const { client, from } = fakeReadClient({ data: [], error: null });

      await expect(getTaskHistory(client, USER_ID, bad)).resolves.toEqual([]);
      expect(from).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    }
  );
});
