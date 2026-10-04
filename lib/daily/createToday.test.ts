import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryDb, memoryAdminClient, type MemoryDb } from '@/lib/testing/memoryDb';

// Only the AI is simulated; saving tasks and insight are the real functions over the memory db.
vi.mock('@/lib/messages/generate', () => ({ generateMessage: vi.fn() }));
vi.mock('@/lib/tasks/daily', () => ({ prepareDailyTasks: vi.fn() }));
vi.mock('@/lib/insights/daily', () => ({ prepareDailyInsight: vi.fn() }));

const { createTodayForPerson, effectiveTimezone } = await import('./today');
const { generateMessage } = await import('@/lib/messages/generate');
const { prepareDailyTasks } = await import('@/lib/tasks/daily');
const { prepareDailyInsight } = await import('@/lib/insights/daily');

let db: MemoryDb;
const client = () => memoryAdminClient(db) as never;

const profile = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'ana',
    name: 'Ana',
    current_age: 30,
    future_self_age: 40,
    values: '',
    focus_area: 'paz',
    tone: 'tierno',
    delivery_hour_local: 8,
    timezone: 'America/Mexico_City',
    onboarding_completed: true,
    current_energy_summary: null,
    blocking_pattern: null,
    future_vision: null,
    delivery_paused: false,
    created_at: '',
    updated_at: '',
    ...extra,
  }) as never;

// 2026-10-04 18:00 UTC is 12:00 on Oct 4 in Mexico City.
const NOON = new Date('2026-10-04T18:00:00Z');
const TASKS = ['Tarea uno.', 'Tarea dos.', 'Tarea tres.'];

beforeEach(() => {
  db = createMemoryDb();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(generateMessage).mockResolvedValue({ content: 'El mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(prepareDailyTasks).mockImplementation(async (_s, p, _g, _c, now) => ({
    taskDate: new Intl.DateTimeFormat('en-CA', { timeZone: (p as { timezone: string }).timezone }).format(now),
    tasks: TASKS,
  }));
  vi.mocked(prepareDailyInsight).mockResolvedValue({ insightDate: '2026-10-04', content: 'Un insight.', modelUsed: 'claude-sonnet-5' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(generateMessage).mockReset();
  vi.mocked(prepareDailyTasks).mockReset();
  vi.mocked(prepareDailyInsight).mockReset();
});

describe('createTodayForPerson', () => {
  it("creates today's message (email NOT claimed) and its tasks; the insight waits for makeInsight", async () => {
    const result = await createTodayForPerson(client(), profile(), NOON);

    expect(result.status).toBe('created');
    expect(db.tables.messages).toHaveLength(1);
    expect(db.tables.messages[0]).toMatchObject({
      content: 'El mensaje de hoy.',
      message_date: '2026-10-04',
      send_status: 'pending',
      email_claimed_at: null,
    });
    expect(db.tables.daily_tasks.map((t) => t.description)).toEqual(TASKS);
    expect(db.tables.daily_insights).toHaveLength(0);

    if (result.status === 'created') await result.makeInsight();
    expect(db.tables.daily_insights).toHaveLength(1);
  });

  it('returns the existing message and generates nothing when today already has one', async () => {
    db.tables.messages.push({ id: 'm', user_id: 'ana', content: 'Ya estaba.', generated_at: '2026-10-04T14:00:00Z', message_date: '2026-10-04', send_status: 'sent' });

    const result = await createTodayForPerson(client(), profile(), NOON);

    expect(result).toMatchObject({ status: 'existing', message: { content: 'Ya estaba.' } });
    expect(generateMessage).not.toHaveBeenCalled();
    expect(prepareDailyTasks).not.toHaveBeenCalled();
  });

  it('two tabs at the same time: one message; the second gets the first one, never an error', async () => {
    const [a, b] = await Promise.all([
      createTodayForPerson(client(), profile(), NOON),
      createTodayForPerson(client(), profile(), NOON),
    ]);

    expect(db.tables.messages).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual(['created', 'existing']);
    expect(db.tables.daily_tasks).toHaveLength(3);
  });

  it('when the AI fails both attempts it throws and saves nothing', async () => {
    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded'));

    await expect(createTodayForPerson(client(), profile(), NOON)).rejects.toThrow('overloaded');
    expect(generateMessage).toHaveBeenCalledTimes(2);
    expect(db.tables.messages).toHaveLength(0);
  });

  it('asks allowGeneration right before the AI, and stops when it says no', async () => {
    const allowGeneration = vi.fn().mockResolvedValue(false);

    expect(await createTodayForPerson(client(), profile(), NOON, { allowGeneration })).toEqual({ status: 'limit' });
    expect(allowGeneration).toHaveBeenCalledTimes(1);
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it('a paused person gets their day too (the pause is only the email)', async () => {
    const result = await createTodayForPerson(client(), profile({ delivery_paused: true }), NOON);

    expect(result.status).toBe('created');
    expect(db.tables.daily_tasks).toHaveLength(3);
  });

  it('a new person with no messages at all gets their first one', async () => {
    expect((await createTodayForPerson(client(), profile(), NOON)).status).toBe('created');
  });
});

describe("the person's day changes at their own midnight", () => {
  // 2026-10-05 05:30 UTC: 23:30 on Oct 4 in Mexico City, 07:30 on Oct 5 in Madrid,
  // 14:30 on Oct 5 in Tokyo.
  const AT = new Date('2026-10-05T05:30:00Z');
  const yesterdayRow = (date: string) => ({ id: `m-${date}`, user_id: 'ana', content: 'Anterior.', generated_at: '2026-10-04T14:00:00Z', message_date: date, send_status: 'sent' });

  it('in Mexico City it is still Oct 4: the Oct 4 message is today\'s', async () => {
    db.tables.messages.push(yesterdayRow('2026-10-04'));

    expect((await createTodayForPerson(client(), profile(), AT)).status).toBe('existing');
  });

  it.each(['Europe/Madrid', 'Asia/Tokyo'])('in %s it is already Oct 5: a new message is made for Oct 5', async (timezone) => {
    db.tables.messages.push(yesterdayRow('2026-10-04'));

    const result = await createTodayForPerson(client(), profile({ timezone }), AT);

    expect(result.status).toBe('created');
    expect(db.tables.messages.map((m) => m.message_date)).toEqual(['2026-10-04', '2026-10-05']);
  });

  it('with an invalid time zone it uses the fallback (Mexico City) instead of failing', async () => {
    const result = await createTodayForPerson(client(), profile({ timezone: 'Not/AZone' }), AT);

    expect(result.status).toBe('created');
    expect(db.tables.messages[0].message_date).toBe('2026-10-04');
    expect(effectiveTimezone('Not/AZone')).toBe('America/Mexico_City');
    expect(effectiveTimezone(null)).toBe('America/Mexico_City');
    expect(effectiveTimezone('Europe/Madrid')).toBe('Europe/Madrid');
  });
});
