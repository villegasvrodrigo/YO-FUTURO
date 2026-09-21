import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveDailyTasks, getRecentTaskDescriptions } from './save';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const TASK_DATE = '2026-09-21';
const TASKS = [
  'Escribe en tu calendario la hora en la que revisarás tu pipeline hoy.',
  'Elige algo que hayas estado posponiendo y avanza hoy una parte pequeña.',
  'Anota tres logros concretos que ya conseguiste este año.',
];

type FakeResult = { error: { code?: string; message: string } | null };

// A fake of `supabase.from('daily_tasks')` for writes. It also exposes upsert/update/delete
// so a test can prove they are never used (saving must never overwrite anything).
function fakeWriteClient(insert: ReturnType<typeof vi.fn>) {
  const table = { insert, upsert: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const from = vi.fn(() => table);
  return { client: { from } as unknown as SupabaseClient, from, table };
}

function insertResolving(result: FakeResult) {
  return vi.fn().mockResolvedValue(result);
}

// A fake of the read chain: select().eq().gte().lt().order().order(), awaited at the end.
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

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('saveDailyTasks', () => {
  it('inserts the 3 tasks as positions 1, 2 and 3 for that user and date', async () => {
    const insert = insertResolving({ error: null });
    const { client, from } = fakeWriteClient(insert);

    const result = await saveDailyTasks(USER_ID, TASK_DATE, TASKS, client);

    expect(result).toBe('saved');
    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      { user_id: USER_ID, task_date: TASK_DATE, position: 1, description: TASKS[0] },
      { user_id: USER_ID, task_date: TASK_DATE, position: 2, description: TASKS[1] },
      { user_id: USER_ID, task_date: TASK_DATE, position: 3, description: TASKS[2] },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace around each task before saving', async () => {
    const insert = insertResolving({ error: null });
    const { client } = fakeWriteClient(insert);

    await saveDailyTasks(USER_ID, TASK_DATE, TASKS.map((t) => `  ${t}\n`), client);

    const rows = insert.mock.calls[0][0] as { description: string }[];
    expect(rows.map((r) => r.description)).toEqual(TASKS);
  });

  describe('tasks already saved for that date', () => {
    const duplicate: FakeResult = {
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "daily_tasks_user_id_task_date_position_key"',
      },
    };

    it('does not fail: reports "skipped" and logs it as information, not as an error', async () => {
      const { client } = fakeWriteClient(insertResolving(duplicate));

      await expect(saveDailyTasks(USER_ID, TASK_DATE, TASKS, client)).resolves.toBe('skipped');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ya existían tareas'));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('never overwrites: it only ever inserts, never upserts, updates or deletes', async () => {
      const { client, table } = fakeWriteClient(insertResolving(duplicate));

      await saveDailyTasks(USER_ID, TASK_DATE, TASKS, client);

      expect(table.insert).toHaveBeenCalledTimes(1);
      expect(table.upsert).not.toHaveBeenCalled();
      expect(table.update).not.toHaveBeenCalled();
      expect(table.delete).not.toHaveBeenCalled();
    });
  });

  describe('error while saving', () => {
    it('returns "failed" and logs when Supabase returns an error', async () => {
      const { client } = fakeWriteClient(
        insertResolving({ error: { code: '42501', message: 'permission denied for table daily_tasks' } })
      );

      await expect(saveDailyTasks(USER_ID, TASK_DATE, TASKS, client)).resolves.toBe('failed');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][1])).toContain('permission denied');
    });

    it('returns "failed" instead of throwing when the call rejects', async () => {
      const { client } = fakeWriteClient(vi.fn().mockRejectedValue(new Error('network down')));

      await expect(saveDailyTasks(USER_ID, TASK_DATE, TASKS, client)).resolves.toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns "failed" instead of throwing when the call throws synchronously', async () => {
      const { client } = fakeWriteClient(
        vi.fn(() => {
          throw new Error('boom');
        })
      );

      await expect(saveDailyTasks(USER_ID, TASK_DATE, TASKS, client)).resolves.toBe('failed');
    });

    it('returns "failed" instead of throwing when the admin client cannot be created', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      await expect(saveDailyTasks(USER_ID, TASK_DATE, TASKS)).resolves.toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('invalid input', () => {
    it.each([
      ['no tasks', []],
      ['two tasks', TASKS.slice(0, 2)],
      ['four tasks', [...TASKS, 'Camina diez minutos.']],
      ['a blank task', [TASKS[0], '   ', TASKS[2]]],
    ])('does not touch the database with %s', async (_label, tasks) => {
      const insert = insertResolving({ error: null });
      const { client, from } = fakeWriteClient(insert);

      await expect(saveDailyTasks(USER_ID, TASK_DATE, tasks, client)).resolves.toBe('failed');

      expect(from).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each(['', '21/09/2026', '2026-02-31', 'hoy'])(
      'does not touch the database with the invalid date %j',
      async (badDate) => {
        const insert = insertResolving({ error: null });
        const { client, from } = fakeWriteClient(insert);

        await expect(saveDailyTasks(USER_ID, badDate, TASKS, client)).resolves.toBe('failed');

        expect(from).not.toHaveBeenCalled();
      }
    );
  });
});

describe('getRecentTaskDescriptions', () => {
  it('returns the descriptions in the order the database gave them', async () => {
    const rows = [
      { description: 'Ayer 1' },
      { description: 'Ayer 2' },
      { description: 'Ayer 3' },
      { description: 'Antier 1' },
    ];
    const { client } = fakeReadClient({ data: rows, error: null });

    const result = await getRecentTaskDescriptions(USER_ID, TASK_DATE, client);

    expect(result).toEqual(['Ayer 1', 'Ayer 2', 'Ayer 3', 'Antier 1']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('asks only for this user, from 3 days before the date up to (not including) the date', async () => {
    const { client, from, chain } = fakeReadClient({ data: [], error: null });

    await getRecentTaskDescriptions(USER_ID, '2026-09-21', client);

    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(chain.select).toHaveBeenCalledWith('description');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.gte).toHaveBeenCalledWith('task_date', '2026-09-18');
    expect(chain.lt).toHaveBeenCalledWith('task_date', '2026-09-21');
  });

  it('orders newest day first, then by position within the day', async () => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getRecentTaskDescriptions(USER_ID, TASK_DATE, client);

    expect(chain.order).toHaveBeenNthCalledWith(1, 'task_date', { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, 'position', { ascending: true });
  });

  it.each([
    ['a month boundary', '2026-03-02', '2026-02-27'],
    ['a year boundary', '2027-01-02', '2026-12-30'],
    ['a leap year', '2028-03-02', '2028-02-28'],
  ])('computes the window across %s', async (_label, taskDate, expectedFrom) => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getRecentTaskDescriptions(USER_ID, taskDate, client);

    expect(chain.gte).toHaveBeenCalledWith('task_date', expectedFrom);
    expect(chain.lt).toHaveBeenCalledWith('task_date', taskDate);
  });

  it.each([
    ['null data', null],
    ['no rows', []],
  ])('returns an empty list for %s, without logging an error', async (_label, data) => {
    const { client } = fakeReadClient({ data, error: null });

    await expect(getRecentTaskDescriptions(USER_ID, TASK_DATE, client)).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips rows with a blank or missing description', async () => {
    const { client } = fakeReadClient({
      data: [{ description: 'Buena' }, { description: '   ' }, { description: null }, {}],
      error: null,
    });

    await expect(getRecentTaskDescriptions(USER_ID, TASK_DATE, client)).resolves.toEqual(['Buena']);
  });

  describe('error while reading', () => {
    it('returns an empty list and logs when Supabase returns an error', async () => {
      const { client } = fakeReadClient({ data: null, error: { message: 'connection refused' } });

      await expect(getRecentTaskDescriptions(USER_ID, TASK_DATE, client)).resolves.toEqual([]);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][1])).toContain('connection refused');
    });

    it('returns an empty list instead of throwing when the call rejects', async () => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lt']) chain[method] = vi.fn(() => chain);
      chain.order = vi.fn(() => Promise.reject(new Error('network down')));
      const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

      await expect(getRecentTaskDescriptions(USER_ID, TASK_DATE, client)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns an empty list instead of throwing when the admin client cannot be created', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      await expect(getRecentTaskDescriptions(USER_ID, TASK_DATE)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each(['', '21/09/2026', '2026-02-31'])(
      'returns an empty list without querying for the invalid date %j',
      async (badDate) => {
        const { client, from } = fakeReadClient({ data: [], error: null });

        await expect(getRecentTaskDescriptions(USER_ID, badDate, client)).resolves.toEqual([]);

        expect(from).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});
