import { describe, it, expect } from 'vitest';
import { createChatStore } from './store';

type Result = { data: unknown; error: { message: string } | null };

// A stand-in for the Supabase client: records every query (table + chained calls) and
// answers each table with the given result.
function fakeSupabase(results: Record<string, Result>) {
  const queries: { table: string; calls: [string, ...unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const query = { table, calls: [] as [string, ...unknown[]][] };
      queries.push(query);
      const result = results[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      for (const method of ['select', 'eq', 'lt', 'order', 'limit', 'insert']) {
        builder[method] = (...args: unknown[]) => {
          query.calls.push([method, ...args]);
          return builder;
        };
      }
      builder.maybeSingle = () => {
        query.calls.push(['maybeSingle']);
        return Promise.resolve(result);
      };
      return builder;
    },
  };
  return { client: client as never, queries };
}

const ok = (data: unknown): Result => ({ data, error: null });
const broken: Result = { data: null, error: { message: 'permission denied' } };

describe('createChatStore', () => {
  it("reads today's conversation of that person, oldest first", async () => {
    const rows = [{ role: 'user', content: 'Hola', is_crisis: false }];
    const { client, queries } = fakeSupabase({ chat_messages: ok(rows) });

    const result = await createChatStore(client).getTodaysMessages('u1', '2026-09-24');

    expect(result).toEqual(rows);
    expect(queries[0]).toEqual({
      table: 'chat_messages',
      calls: [
        ['select', 'role, content, is_crisis'],
        ['eq', 'user_id', 'u1'],
        ['eq', 'chat_date', '2026-09-24'],
        ['order', 'created_at', { ascending: true }],
      ],
    });
  });

  it('reads the active goals in a stable order', async () => {
    const { client, queries } = fakeSupabase({ goals: ok([{ description: 'Ahorrar' }, { description: 'Meditar' }]) });

    expect(await createChatStore(client).getActiveGoals('u1')).toEqual(['Ahorrar', 'Meditar']);
    expect(queries[0].calls).toContainEqual(['eq', 'status', 'active']);
    expect(queries[0].calls).toContainEqual(['order', 'created_at', { ascending: true }]);
  });

  it("reads that day's tasks in their order", async () => {
    const tasks = [{ description: 'Anota', completed: true }];
    const { client, queries } = fakeSupabase({ daily_tasks: ok(tasks) });

    expect(await createChatStore(client).getTasks('u1', '2026-09-24')).toEqual(tasks);
    expect(queries[0].calls).toContainEqual(['eq', 'task_date', '2026-09-24']);
    expect(queries[0].calls).toContainEqual(['order', 'position', { ascending: true }]);
  });

  it('reads the latest daily email', async () => {
    const email = { content: 'Hoy da un paso.', generated_at: '2026-09-24T14:00:00Z' };
    const { client, queries } = fakeSupabase({ messages: ok(email) });

    expect(await createChatStore(client).getLatestDailyMessage('u1')).toEqual(email);
    expect(queries[0].calls).toContainEqual(['order', 'generated_at', { ascending: false }]);
    expect(queries[0].calls).toContainEqual(['limit', 1]);
  });

  it('reads the latest summary from before today', async () => {
    const { client, queries } = fakeSupabase({
      chat_summaries: ok({ summary_date: '2026-09-22', content: 'Hablamos del ahorro.', had_crisis: true }),
    });

    const result = await createChatStore(client).getLastSummary('u1', '2026-09-24');

    expect(result).toEqual({ date: '2026-09-22', content: 'Hablamos del ahorro.', hadCrisis: true });
    expect(queries[0].calls).toContainEqual(['lt', 'summary_date', '2026-09-24']);
    expect(queries[0].calls).toContainEqual(['order', 'summary_date', { ascending: false }]);
  });

  it('returns null when there is no summary yet', async () => {
    const { client } = fakeSupabase({ chat_summaries: ok(null) });

    expect(await createChatStore(client).getLastSummary('u1', '2026-09-24')).toBeNull();
  });

  it("saves the person's message and the reply as two rows, in order", async () => {
    const { client, queries } = fakeSupabase({ chat_messages: ok(null) });

    await createChatStore(client).saveExchange('u1', '2026-09-24', {
      userMessage: 'Hola',
      userAt: new Date('2026-09-25T03:00:00.000Z'),
      reply: 'Hola, aquí estoy.',
      replyAt: new Date('2026-09-25T03:00:02.000Z'),
      isCrisis: false,
      modelUsed: 'claude-sonnet-5',
    });

    expect(queries[0].calls).toEqual([
      [
        'insert',
        [
          {
            user_id: 'u1',
            chat_date: '2026-09-24',
            role: 'user',
            content: 'Hola',
            is_crisis: false,
            created_at: '2026-09-25T03:00:00.000Z',
          },
          {
            user_id: 'u1',
            chat_date: '2026-09-24',
            role: 'assistant',
            content: 'Hola, aquí estoy.',
            is_crisis: false,
            model_used: 'claude-sonnet-5',
            created_at: '2026-09-25T03:00:02.000Z',
          },
        ],
      ],
    ]);
  });

  it('finds the last day with a conversation before today', async () => {
    const { client, queries } = fakeSupabase({ chat_messages: ok({ chat_date: '2026-09-22' }) });

    expect(await createChatStore(client).getLastConversationDay('u1', '2026-09-24')).toBe('2026-09-22');
    expect(queries[0].calls).toEqual([
      ['select', 'chat_date'],
      ['eq', 'user_id', 'u1'],
      ['lt', 'chat_date', '2026-09-24'],
      ['order', 'chat_date', { ascending: false }],
      ['limit', 1],
      ['maybeSingle'],
    ]);
  });

  it('returns null when there was no earlier conversation', async () => {
    const { client } = fakeSupabase({ chat_messages: ok(null) });

    expect(await createChatStore(client).getLastConversationDay('u1', '2026-09-24')).toBeNull();
  });

  it('tells whether a day already has its summary', async () => {
    const found = fakeSupabase({ chat_summaries: ok({ id: 's1' }) });
    const missing = fakeSupabase({ chat_summaries: ok(null) });

    expect(await createChatStore(found.client).hasSummary('u1', '2026-09-22')).toBe(true);
    expect(await createChatStore(missing.client).hasSummary('u1', '2026-09-22')).toBe(false);
    expect(found.queries[0].calls).toContainEqual(['eq', 'summary_date', '2026-09-22']);
  });

  it('saves a summary', async () => {
    const { client, queries } = fakeSupabase({ chat_summaries: ok(null) });

    await createChatStore(client).saveSummary('u1', '2026-09-22', {
      content: 'Hablaron del ahorro.',
      hadCrisis: true,
      modelUsed: 'claude-sonnet-5',
    });

    expect(queries[0]).toEqual({
      table: 'chat_summaries',
      calls: [
        [
          'insert',
          {
            user_id: 'u1',
            summary_date: '2026-09-22',
            content: 'Hablaron del ahorro.',
            had_crisis: true,
            model_used: 'claude-sonnet-5',
          },
        ],
      ],
    });
  });

  it('saving a summary another tab already saved is not an error', async () => {
    const duplicate = { data: null, error: { message: 'duplicate key value', code: '23505' } };
    const store = createChatStore(fakeSupabase({ chat_summaries: duplicate }).client);

    await expect(store.saveSummary('u1', '2026-09-22', { content: 'x', hadCrisis: false, modelUsed: 'm' })).resolves.toBeUndefined();
  });

  it('throws on any database error', async () => {
    const tables = ['profiles', 'chat_messages', 'goals', 'messages', 'daily_tasks', 'chat_summaries'];
    const store = createChatStore(fakeSupabase(Object.fromEntries(tables.map((t) => [t, broken]))).client);
    const exchange = { userMessage: 'a', userAt: new Date(), reply: 'b', replyAt: new Date(), isCrisis: false, modelUsed: 'm' };

    await expect(store.getProfile('u1')).rejects.toThrow('permission denied');
    await expect(store.getTodaysMessages('u1', '2026-09-24')).rejects.toThrow('permission denied');
    await expect(store.getActiveGoals('u1')).rejects.toThrow('permission denied');
    await expect(store.getLatestDailyMessage('u1')).rejects.toThrow('permission denied');
    await expect(store.getTasks('u1', '2026-09-24')).rejects.toThrow('permission denied');
    await expect(store.getLastSummary('u1', '2026-09-24')).rejects.toThrow('permission denied');
    await expect(store.saveExchange('u1', '2026-09-24', exchange)).rejects.toThrow('permission denied');
    await expect(store.getLastConversationDay('u1', '2026-09-24')).rejects.toThrow('permission denied');
    await expect(store.hasSummary('u1', '2026-09-22')).rejects.toThrow('permission denied');
    await expect(store.saveSummary('u1', '2026-09-22', { content: 'x', hadCrisis: false, modelUsed: 'm' })).rejects.toThrow(
      'permission denied'
    );
  });
});
