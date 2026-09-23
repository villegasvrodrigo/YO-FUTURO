import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveDailyInsight, getRecentInsights } from './save';

const USER_ID = '39fc48c8-e574-43a4-a192-b0ce420686d2';
const INSIGHT_DATE = '2026-09-23';
const INSIGHT = {
  content: 'Estás aprendiendo que tu esfuerzo no necesita pruebas inmediatas para ser real.',
  modelUsed: 'claude-sonnet-5',
};

type FakeResult = { error: { code?: string; message: string } | null };

// A fake of `supabase.from('daily_insights')` for writes. It also exposes upsert/update/delete
// so a test can prove they are never used (saving must never overwrite anything).
function fakeWriteClient(insert: ReturnType<typeof vi.fn>) {
  const table = { insert, upsert: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const from = vi.fn(() => table);
  return { client: { from } as unknown as SupabaseClient, from, table };
}

function insertResolving(result: FakeResult) {
  return vi.fn().mockResolvedValue(result);
}

// A fake of the read chain: select().eq().gte().lt().order(), awaited at the end.
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

describe('saveDailyInsight', () => {
  it('inserts one row with the user, the date, the text and the model', async () => {
    const insert = insertResolving({ error: null });
    const { client, from } = fakeWriteClient(insert);

    const result = await saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client);

    expect(result).toBe('saved');
    expect(from).toHaveBeenCalledWith('daily_insights');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      insight_date: INSIGHT_DATE,
      content: INSIGHT.content,
      model_used: 'claude-sonnet-5',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace around the text before saving', async () => {
    const insert = insertResolving({ error: null });
    const { client } = fakeWriteClient(insert);

    await saveDailyInsight(USER_ID, INSIGHT_DATE, { ...INSIGHT, content: `  ${INSIGHT.content}\n` }, client);

    expect(insert.mock.calls[0][0].content).toBe(INSIGHT.content);
  });

  describe('an insight already saved for that date', () => {
    const duplicate: FakeResult = {
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "daily_insights_user_id_insight_date_key"',
      },
    };

    it('does not fail: reports "skipped" and logs it as information, not as an error', async () => {
      const { client } = fakeWriteClient(insertResolving(duplicate));

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client)).resolves.toBe('skipped');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ya existía un insight'));
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('never overwrites: it only ever inserts, never upserts, updates or deletes', async () => {
      const { client, table } = fakeWriteClient(insertResolving(duplicate));

      await saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client);

      expect(table.insert).toHaveBeenCalledTimes(1);
      expect(table.upsert).not.toHaveBeenCalled();
      expect(table.update).not.toHaveBeenCalled();
      expect(table.delete).not.toHaveBeenCalled();
    });
  });

  describe('error while saving', () => {
    it('returns "failed" and logs when Supabase returns an error', async () => {
      const { client } = fakeWriteClient(
        insertResolving({ error: { code: '42501', message: 'permission denied for table daily_insights' } })
      );

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client)).resolves.toBe('failed');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][1])).toContain('permission denied');
    });

    it('returns "failed" instead of throwing when the call rejects', async () => {
      const { client } = fakeWriteClient(vi.fn().mockRejectedValue(new Error('network down')));

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client)).resolves.toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns "failed" instead of throwing when the call throws synchronously', async () => {
      const { client } = fakeWriteClient(
        vi.fn(() => {
          throw new Error('boom');
        })
      );

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT, client)).resolves.toBe('failed');
    });

    it('returns "failed" instead of throwing when the admin client cannot be created', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, INSIGHT)).resolves.toBe('failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('invalid input', () => {
    it.each([
      ['a blank text', { ...INSIGHT, content: '   ' }],
      ['no text', { ...INSIGHT, content: undefined as unknown as string }],
      ['a blank model', { ...INSIGHT, modelUsed: '' }],
      ['no insight at all', null as unknown as typeof INSIGHT],
    ])('does not touch the database with %s', async (_label, insight) => {
      const insert = insertResolving({ error: null });
      const { client, from } = fakeWriteClient(insert);

      await expect(saveDailyInsight(USER_ID, INSIGHT_DATE, insight, client)).resolves.toBe('failed');

      expect(from).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each(['', '23/09/2026', '2026-02-31', 'hoy'])(
      'does not touch the database with the invalid date %j',
      async (badDate) => {
        const insert = insertResolving({ error: null });
        const { client, from } = fakeWriteClient(insert);

        await expect(saveDailyInsight(USER_ID, badDate, INSIGHT, client)).resolves.toBe('failed');

        expect(from).not.toHaveBeenCalled();
      }
    );
  });
});

describe('getRecentInsights', () => {
  it('returns the texts in the order the database gave them', async () => {
    const rows = [{ content: 'Ayer.' }, { content: 'Antier.' }];
    const { client } = fakeReadClient({ data: rows, error: null });

    await expect(getRecentInsights(USER_ID, INSIGHT_DATE, client)).resolves.toEqual(['Ayer.', 'Antier.']);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('asks only for this user, from 7 days before the date up to (not including) the date, newest first', async () => {
    const { client, from, chain } = fakeReadClient({ data: [], error: null });

    await getRecentInsights(USER_ID, '2026-09-23', client);

    expect(from).toHaveBeenCalledWith('daily_insights');
    expect(chain.select).toHaveBeenCalledWith('content');
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(chain.gte).toHaveBeenCalledWith('insight_date', '2026-09-16');
    expect(chain.lt).toHaveBeenCalledWith('insight_date', '2026-09-23');
    expect(chain.order).toHaveBeenCalledWith('insight_date', { ascending: false });
  });

  it.each([
    ['a month boundary', '2026-10-03', '2026-09-26'],
    ['a year boundary', '2027-01-03', '2026-12-27'],
    ['a leap year', '2028-03-02', '2028-02-24'],
  ])('computes the window across %s', async (_label, date, expectedFrom) => {
    const { client, chain } = fakeReadClient({ data: [], error: null });

    await getRecentInsights(USER_ID, date, client);

    expect(chain.gte).toHaveBeenCalledWith('insight_date', expectedFrom);
    expect(chain.lt).toHaveBeenCalledWith('insight_date', date);
  });

  it.each([
    ['null data', null],
    ['no rows', []],
  ])('returns an empty list for %s, without logging an error', async (_label, data) => {
    const { client } = fakeReadClient({ data, error: null });

    await expect(getRecentInsights(USER_ID, INSIGHT_DATE, client)).resolves.toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips rows with a blank or missing text', async () => {
    const { client } = fakeReadClient({
      data: [{ content: 'Buena.' }, { content: '   ' }, { content: null }, {}],
      error: null,
    });

    await expect(getRecentInsights(USER_ID, INSIGHT_DATE, client)).resolves.toEqual(['Buena.']);
  });

  describe('error while reading', () => {
    it('returns an empty list and logs when Supabase returns an error', async () => {
      const { client } = fakeReadClient({ data: null, error: { message: 'connection refused' } });

      await expect(getRecentInsights(USER_ID, INSIGHT_DATE, client)).resolves.toEqual([]);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][1])).toContain('connection refused');
    });

    it('returns an empty list instead of throwing when the call rejects', async () => {
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lt']) chain[method] = vi.fn(() => chain);
      chain.order = vi.fn(() => Promise.reject(new Error('network down')));
      const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

      await expect(getRecentInsights(USER_ID, INSIGHT_DATE, client)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns an empty list instead of throwing when the admin client cannot be created', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

      await expect(getRecentInsights(USER_ID, INSIGHT_DATE)).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each(['', '23/09/2026', '2026-02-31'])(
      'returns an empty list without querying for the invalid date %j',
      async (badDate) => {
        const { client, from } = fakeReadClient({ data: [], error: null });

        await expect(getRecentInsights(USER_ID, badDate, client)).resolves.toEqual([]);

        expect(from).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
      }
    );
  });
});
