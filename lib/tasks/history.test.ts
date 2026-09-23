import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getFullTaskHistory } from './history';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const TODAY = '2026-09-22';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('getFullTaskHistory', () => {
  // A fake of the read chain that answers each .range(from, to) with that slice of `all`.
  function pagedClient(all: { task_date: string; completed: boolean }[], failOnPage?: number) {
    const ranges: [number, number][] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte', 'order']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.range = vi.fn((from: number, to: number) => {
      ranges.push([from, to]);
      if (failOnPage !== undefined && ranges.length - 1 === failOnPage) {
        return Promise.resolve({ data: null, error: { message: 'connection reset' } });
      }
      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
    });
    const from = vi.fn(() => chain);
    return {
      client: { from } as unknown as SupabaseClient,
      from,
      ranges,
      chain: chain as Record<string, ReturnType<typeof vi.fn>>,
    };
  }

  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ task_date: `2026-01-01`, completed: i % 2 === 0 }));

  it('reads every row across several pages, beyond the 1,000-row limit', async () => {
    const { client, ranges } = pagedClient(rows(2500));

    const result = await getFullTaskHistory(client, USER_ID, TODAY);

    expect(result).toHaveLength(2500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('stops after one page when the history is short', async () => {
    const { client, ranges } = pagedClient(rows(12));

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toHaveLength(12);
    expect(ranges).toEqual([[0, 999]]);
  });

  it('asks for one more (empty) page when the history is exactly 1,000 rows', async () => {
    const { client, ranges } = pagedClient(rows(1000));

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toHaveLength(1000);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('asks only for this user, up to today, oldest first in a stable order', async () => {
    const { client, from, chain } = pagedClient([]);

    await getFullTaskHistory(client, USER_ID, TODAY);

    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(chain.select).toHaveBeenCalledWith('task_date, completed');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.lte).toHaveBeenCalledWith('task_date', TODAY);
    expect(chain.order).toHaveBeenNthCalledWith(1, 'task_date', { ascending: true });
    expect(chain.order).toHaveBeenNthCalledWith(2, 'position', { ascending: true });
  });

  it('returns an empty list, without logging an error, when there are no tasks', async () => {
    const { client } = pagedClient([]);

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('drops malformed rows', async () => {
    const { client } = pagedClient([
      { task_date: '2026-09-22', completed: true },
      { task_date: null, completed: true } as never,
      { task_date: '2026-09-22' } as never,
    ]);

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([
      { task_date: '2026-09-22', completed: true },
    ]);
  });

  it('returns an empty list (not a partial history) and logs when a later page fails', async () => {
    const { client } = pagedClient(rows(2500), 1);

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns an empty list instead of throwing when the call rejects', async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte', 'order']) chain[method] = vi.fn(() => chain);
    chain.range = vi.fn(() => Promise.reject(new Error('network down')));
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    await expect(getFullTaskHistory(client, USER_ID, TODAY)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each(['', '2026-02-31', 'hoy'])('does not touch the database with the invalid date %j', async (bad) => {
    const { client, from } = pagedClient([]);

    await expect(getFullTaskHistory(client, USER_ID, bad)).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
