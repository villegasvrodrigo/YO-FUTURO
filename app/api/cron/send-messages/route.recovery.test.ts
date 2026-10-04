import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Same-day recovery, end to end. Everything outside the route is simulated: no real database,
// AI or email. The database keeps the messages the route saves, across runs.
vi.mock('@/lib/messages/generate', () => ({ generateMessage: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendDailyEmail: vi.fn() }));
vi.mock('@/lib/tasks/daily', () => ({ prepareDailyTasks: vi.fn() }));
vi.mock('@/lib/tasks/save', () => ({ saveDailyTasks: vi.fn() }));
vi.mock('@/lib/insights/daily', () => ({ prepareDailyInsight: vi.fn() }));
vi.mock('@/lib/insights/save', () => ({ saveDailyInsight: vi.fn() }));

type Row = Record<string, unknown>;
const db: { profiles: Row[]; messages: Row[]; failInserts: boolean } = { profiles: [], messages: [], failInserts: false };
const profileFilters: unknown[][] = [];

function fakeAdmin() {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let inserted: Row | null = null;
      let insertError: { code: string; message: string } | null = null;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          if (table === 'profiles') profileFilters.push([column, value]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        update: () => builder,
        insert: (row: Row) => {
          if (table === 'messages') {
            // Like the real database: one message per person per day (messages_one_per_day).
            const taken = db.messages.some((m) => m.user_id === row.user_id && m.message_date === row.message_date);
            if (db.failInserts) {
              insertError = { code: 'XX000', message: 'db down' };
            } else if (taken) {
              insertError = { code: '23505', message: 'duplicate key value violates unique constraint "messages_one_per_day"' };
            } else {
              inserted = { id: `m${db.messages.length + 1}`, generated_at: new Date().toISOString(), ...row };
              db.messages.push(inserted);
            }
          }
          return builder;
        },
        single: async () => ({ data: inserted, error: insertError }),
        then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
          let data: unknown = [];
          if (table === 'profiles') data = db.profiles;
          if (table === 'messages') {
            const userId = filters.find(([c]) => c === 'user_id')?.[1];
            data = db.messages
              .filter((m) => m.user_id === userId)
              .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)));
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@ejemplo.invalid` } } }) } },
  };
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }));

const { GET } = await import('./route');
const { generateMessage } = await import('@/lib/messages/generate');
const { sendDailyEmail } = await import('@/lib/email/send');
const { prepareDailyTasks } = await import('@/lib/tasks/daily');
const { prepareDailyInsight } = await import('@/lib/insights/daily');

const profile = (id: string, hour: number, extra: Row = {}): Row => ({
  id,
  name: id,
  current_age: 30,
  future_self_age: 40,
  values: '',
  focus_area: 'paz',
  tone: 'tierno',
  delivery_hour_local: hour,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: null,
  blocking_pattern: null,
  future_vision: null,
  delivery_paused: false,
  created_at: '',
  updated_at: '',
  ...extra,
});

async function runAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  const response = await GET(
    new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } })
  );
  return (await response.json()) as { processed: number; succeeded: number; failed: number };
}

const sentTo = () => vi.mocked(sendDailyEmail).mock.calls.map((call) => call[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', 'secreto');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.profiles = [];
  db.messages = [];
  db.failInserts = false;
  profileFilters.length = 0;
  vi.mocked(generateMessage).mockResolvedValue({ content: 'Tu mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: 'p1', status: 'sent', error: null });
  vi.mocked(prepareDailyTasks).mockResolvedValue(null);
  vi.mocked(prepareDailyInsight).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(generateMessage).mockReset();
  vi.mocked(sendDailyEmail).mockReset();
  vi.mocked(prepareDailyTasks).mockReset();
  vi.mocked(prepareDailyInsight).mockReset();
});

// 2026-09-29T14:00Z is 08:00 in Mexico City (UTC-6).
describe('GET /api/cron/send-messages — same-day recovery', () => {
  it('the person whose hour it is gets their message, with tasks prepared', async () => {
    db.profiles = [profile('ana', 8)];

    expect(await runAt('2026-09-29T14:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
  });

  it('a person whose run failed 1 hour ago is recovered in the next run', async () => {
    db.profiles = [profile('ana', 8)];

    // 08:00: the AI fails both attempts, nothing is saved.
    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded'));
    expect(await runAt('2026-09-29T14:05:00Z')).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(db.messages).toHaveLength(0);

    // 09:00: the AI works again, and she still has no message today: she gets it.
    vi.mocked(generateMessage).mockResolvedValue({ content: 'Tu mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
    expect(await runAt('2026-09-29T15:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
  });

  it('a person whose hour was 5 hours ago is not recovered', async () => {
    db.profiles = [profile('ana', 8)];

    // 13:00 in Mexico City.
    expect(await runAt('2026-09-29T19:05:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it("a person who already has today's message never gets another one, nor new tasks or insight", async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [{ id: 'm1', user_id: 'ana', generated_at: '2026-09-29T14:06:00Z', content: 'x' }];

    // 10:00: within the 4 hours, but today's message exists.
    expect(await runAt('2026-09-29T16:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(generateMessage).not.toHaveBeenCalled();
    expect(prepareDailyTasks).not.toHaveBeenCalled();
    expect(prepareDailyInsight).not.toHaveBeenCalled();
    expect(sendDailyEmail).not.toHaveBeenCalled();
  });

  it('a whole morning of runs (08:00 to 12:00) sends exactly one email', async () => {
    db.profiles = [profile('ana', 8)];

    for (const hour of ['14', '15', '16', '17', '18']) await runAt(`2026-09-29T${hour}:05:00Z`);

    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
  });

  it('paused people are never taken, even within the 4 hours', async () => {
    db.profiles = [profile('pausada', 8, { delivery_paused: true })];

    expect(await runAt('2026-09-29T15:05:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it('only reads profiles with the onboarding finished', async () => {
    await runAt('2026-09-29T14:05:00Z');

    expect(profileFilters).toContainEqual(['onboarding_completed', true]);
  });

  it('starts over at local midnight: a late-night hour missed yesterday is not sent after midnight', async () => {
    db.profiles = [profile('noctambula', 23)];

    // 01:30 on Sep 30 in Mexico City: 23:00 was yesterday.
    expect(await runAt('2026-09-30T07:30:00Z')).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it("yesterday's message doesn't count as today's: the new day's email goes out at its hour", async () => {
    db.profiles = [profile('ana', 8)];
    db.messages = [{ id: 'm1', user_id: 'ana', generated_at: '2026-09-28T14:06:00Z', content: 'x' }];

    expect(await runAt('2026-09-29T14:05:00Z')).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
  });

  it("saves each message with the person's local day", async () => {
    // 2026-10-05T01:30Z is still 19:30 on Oct 4 in Mexico City: her hour, on the 4th.
    db.profiles = [profile('ana', 19)];
    await runAt('2026-10-05T01:30:00Z');

    expect(db.messages).toHaveLength(1);
    expect(db.messages[0].message_date).toBe('2026-10-04');
  });
});

describe('GET /api/cron/send-messages — two triggers at the same time', () => {
  it('two runs at once (GitHub and Supabase) send exactly one email; the second counts as a success', async () => {
    db.profiles = [profile('ana', 8)];
    vi.setSystemTime(new Date('2026-10-04T14:45:00Z'));
    const request = () =>
      GET(new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } }));

    const [first, second] = await Promise.all([request(), request()]);

    // Both read "no message today" before either saved one, so both asked the AI...
    expect(generateMessage).toHaveBeenCalledTimes(2);
    // ...but the database kept only one message, and only one email went out.
    expect(db.messages).toHaveLength(1);
    expect(sentTo()).toEqual(['ana@ejemplo.invalid']);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
    expect(prepareDailyInsight).toHaveBeenCalledTimes(1);
    // Neither run reports a failure (no red alert for a duplicate).
    expect(await first.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(await second.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
  });

  it('any other save error is still a failure', async () => {
    db.profiles = [profile('ana', 8)];
    // A different database error (not the one-per-day rule): the person counts as failed, as before.
    db.failInserts = true;

    expect(await runAt('2026-10-04T14:05:00Z')).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(sendDailyEmail).not.toHaveBeenCalled();
  });
});

