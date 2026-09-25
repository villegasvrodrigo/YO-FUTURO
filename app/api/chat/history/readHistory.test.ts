import { describe, it, expect } from 'vitest';
import { readEarlierDays } from './readHistory';

type Result = { data: unknown; error: { message: string } | null };

// A stand-in for the person's Supabase client: records every query and answers them in order
// from `answers` (one per query, awaited or not).
function fakeSupabase(answers: Result[]) {
  const queries: [string, ...unknown[]][][] = [];
  let next = 0;
  const client = {
    from(table: string) {
      const calls: [string, ...unknown[]][] = [['from', table]];
      queries.push(calls);
      const result = answers[next++] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      for (const method of ['select', 'eq', 'lt', 'gte', 'order', 'range']) {
        builder[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return builder;
        };
      }
      return builder;
    },
  };
  return { client: client as never, queries };
}

const dates = (...days: string[]) => ({ data: days.map((chat_date) => ({ chat_date })), error: null });

describe('readEarlierDays', () => {
  it('returns the 7 days right before the given date, oldest first, with their messages in order', async () => {
    const days = ['2026-09-24', '2026-09-23', '2026-09-22', '2026-09-20', '2026-09-19', '2026-09-18', '2026-09-15'];
    const { client, queries } = fakeSupabase([
      dates(...days.flatMap((d) => [d, d])),
      {
        data: [
          { chat_date: '2026-09-15', role: 'user', content: 'Primero' },
          { chat_date: '2026-09-15', role: 'assistant', content: 'Respuesta' },
          { chat_date: '2026-09-24', role: 'user', content: 'Ayer' },
        ],
        error: null,
      },
    ]);

    const result = await readEarlierDays(client, 'u1', '2026-09-25');

    expect(result.hasMore).toBe(false);
    expect(result.days.map((d) => d.date)).toEqual([...days].reverse());
    expect(result.days[0].messages).toEqual([
      { role: 'user', content: 'Primero' },
      { role: 'assistant', content: 'Respuesta' },
    ]);
    expect(result.days[6].messages).toEqual([{ role: 'user', content: 'Ayer' }]);
    // Only this person's days before the date, newest first; then the messages of those days.
    expect(queries[0]).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'u1'],
        ['lt', 'chat_date', '2026-09-25'],
        ['order', 'chat_date', { ascending: false }],
      ])
    );
    expect(queries[1]).toEqual(
      expect.arrayContaining([
        ['select', 'chat_date, role, content'],
        ['eq', 'user_id', 'u1'],
        ['gte', 'chat_date', '2026-09-15'],
        ['lt', 'chat_date', '2026-09-25'],
        ['order', 'chat_date', { ascending: true }],
        ['order', 'created_at', { ascending: true }],
      ])
    );
  });

  it('says there are more when an 8th earlier day exists, and returns only 7', async () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-09-${String(20 - i).padStart(2, '0')}`);
    const { client, queries } = fakeSupabase([dates(...days), { data: [], error: null }]);

    const result = await readEarlierDays(client, 'u1', '2026-09-21');

    expect(result.hasMore).toBe(true);
    expect(result.days).toHaveLength(7);
    expect(result.days[0].date).toBe('2026-09-14');
    expect(queries[1]).toContainEqual(['gte', 'chat_date', '2026-09-14']);
  });

  it('returns nothing, without a second read, when there are no earlier days', async () => {
    const { client, queries } = fakeSupabase([dates()]);

    expect(await readEarlierDays(client, 'u1', '2026-09-25')).toEqual({ days: [], hasMore: false });
    expect(queries).toHaveLength(1);
  });

  it('reads past the 1,000-row limit to find the days', async () => {
    const full = { data: Array.from({ length: 1000 }, () => ({ chat_date: '2026-09-24' })), error: null };
    const { client, queries } = fakeSupabase([full, dates('2026-09-24', '2026-09-23'), { data: [], error: null }]);

    const result = await readEarlierDays(client, 'u1', '2026-09-25');

    expect(result.days.map((d) => d.date)).toEqual(['2026-09-23', '2026-09-24']);
    expect(queries[1]).toContainEqual(['range', 1000, 1999]);
  });

  it('keeps crisis messages exactly as they were', async () => {
    const crisis = 'Gracias por contármelo. Línea de la Vida 800 911 2000, o 911.';
    const { client } = fakeSupabase([
      dates('2026-09-24'),
      { data: [{ chat_date: '2026-09-24', role: 'assistant', content: crisis }], error: null },
    ]);

    const result = await readEarlierDays(client, 'u1', '2026-09-25');

    expect(result.days[0].messages[0].content).toBe(crisis);
  });

  it('throws on a database error', async () => {
    const broken = { data: null, error: { message: 'permission denied' } };

    await expect(readEarlierDays(fakeSupabase([broken]).client, 'u1', '2026-09-25')).rejects.toThrow('permission denied');
    await expect(readEarlierDays(fakeSupabase([dates('2026-09-24'), broken]).client, 'u1', '2026-09-25')).rejects.toThrow(
      'permission denied'
    );
  });
});
