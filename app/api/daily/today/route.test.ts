import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryDb, memoryAdminClient, type MemoryDb } from '@/lib/testing/memoryDb';

// The AI and the email are simulated; the database is the in-memory one, shared by the app's
// route and the cron, so a test can follow a day from the app to the email.
vi.mock('@/lib/messages/generate', () => ({ generateMessage: vi.fn() }));
vi.mock('@/lib/tasks/daily', () => ({ prepareDailyTasks: vi.fn() }));
vi.mock('@/lib/insights/daily', () => ({ prepareDailyInsight: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendDailyEmail: vi.fn() }));

let db: MemoryDb;
let signedIn: string | null;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => memoryAdminClient(db) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: signedIn ? { id: signedIn, app_metadata: db.users[signedIn]?.app_metadata ?? {} } : null },
      }),
    },
  }),
}));
// after(): record the callbacks, so tests can run them (it needs a real request otherwise).
const afterCallbacks: (() => Promise<void>)[] = [];
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (cb: () => Promise<void>) => afterCallbacks.push(cb),
}));

const { POST } = await import('./route');
const { GET: cron } = await import('@/app/api/cron/send-messages/route');
const { generateMessage } = await import('@/lib/messages/generate');
const { prepareDailyTasks } = await import('@/lib/tasks/daily');
const { prepareDailyInsight } = await import('@/lib/insights/daily');
const { sendDailyEmail } = await import('@/lib/email/send');
const { DAILY_ATTEMPTS_LIMIT, ATTEMPTS_KEY } = await import('./attempts');

const profile = (extra: Record<string, unknown> = {}) => ({
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
});

const open = async () => {
  const response = await POST();
  return { status: response.status, body: (await response.json()) as { status: string } };
};

beforeEach(() => {
  db = createMemoryDb();
  db.tables.profiles.push(profile());
  db.users.ana = { email: 'ana@ejemplo.invalid', app_metadata: {} };
  signedIn = 'ana';
  afterCallbacks.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  // 06:00 on Oct 4 in Mexico City: before her 08:00 email.
  vi.setSystemTime(new Date('2026-10-04T12:00:00Z'));
  vi.stubEnv('CRON_SECRET', 'secreto');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(generateMessage).mockResolvedValue({ content: 'Escrito al abrir la app.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(prepareDailyTasks).mockResolvedValue({ taskDate: '2026-10-04', tasks: ['Uno.', 'Dos.', 'Tres.'] });
  vi.mocked(prepareDailyInsight).mockResolvedValue({ insightDate: '2026-10-04', content: 'Insight.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: 'p1', status: 'sent', error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(generateMessage).mockReset();
  vi.mocked(prepareDailyTasks).mockReset();
  vi.mocked(prepareDailyInsight).mockReset();
  vi.mocked(sendDailyEmail).mockReset();
});

describe('POST /api/daily/today', () => {
  it('without a session: 401, nothing made', async () => {
    signedIn = null;

    expect((await open()).status).toBe(401);
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it('before finishing the onboarding: not ready, nothing made', async () => {
    db.tables.profiles = [profile({ onboarding_completed: false })];

    expect(await open()).toEqual({ status: 403, body: { status: 'not_ready' } });
    expect(generateMessage).not.toHaveBeenCalled();
  });

  it("no message today: creates the message and tasks, answers ready, and leaves the insight for after", async () => {
    expect(await open()).toEqual({ status: 200, body: { status: 'ready' } });

    expect(db.tables.messages).toHaveLength(1);
    expect(db.tables.messages[0]).toMatchObject({ message_date: '2026-10-04', send_status: 'pending', email_claimed_at: null });
    expect(db.tables.daily_tasks).toHaveLength(3);
    expect(db.tables.daily_insights).toHaveLength(0);

    await Promise.all(afterCallbacks.map((cb) => cb()));
    expect(db.tables.daily_insights).toHaveLength(1);
  });

  it("today's message already exists: ready, nothing generated, no attempt counted", async () => {
    db.tables.messages.push({ id: 'm', user_id: 'ana', content: 'Ya estaba.', generated_at: '2026-10-04T11:00:00Z', message_date: '2026-10-04', send_status: 'pending' });

    expect(await open()).toEqual({ status: 200, body: { status: 'ready' } });
    expect(generateMessage).not.toHaveBeenCalled();
    expect(db.users.ana.app_metadata[ATTEMPTS_KEY]).toBeUndefined();
  });

  it('two tabs at the same time: one message, both ready', async () => {
    const [a, b] = await Promise.all([POST(), POST()]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(db.tables.messages).toHaveLength(1);
  });

  it('when the AI fails: a plain "failed" (no technical details), and nothing saved', async () => {
    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded_error: 529 upstream'));

    expect(await open()).toEqual({ status: 502, body: { status: 'failed' } });
    expect(db.tables.messages).toHaveLength(0);
  });

  it(`stops after ${DAILY_ATTEMPTS_LIMIT} AI attempts in the same day, so reloading never runs up costs`, async () => {
    vi.mocked(generateMessage).mockRejectedValue(new Error('overloaded'));

    for (let i = 0; i < DAILY_ATTEMPTS_LIMIT; i++) expect((await open()).body.status).toBe('failed');
    const callsSoFar = vi.mocked(generateMessage).mock.calls.length;

    expect(await open()).toEqual({ status: 429, body: { status: 'limit' } });
    expect(vi.mocked(generateMessage).mock.calls.length).toBe(callsSoFar);
    expect(db.users.ana.app_metadata[ATTEMPTS_KEY]).toEqual({ date: '2026-10-04', attempts: DAILY_ATTEMPTS_LIMIT });
  });

  it('the attempts start over on a new day', async () => {
    db.users.ana.app_metadata = { [ATTEMPTS_KEY]: { date: '2026-10-03', attempts: DAILY_ATTEMPTS_LIMIT } };

    expect(await open()).toEqual({ status: 200, body: { status: 'ready' } });
  });

  it('a paused person gets their day too', async () => {
    db.tables.profiles = [profile({ delivery_paused: true })];

    expect(await open()).toEqual({ status: 200, body: { status: 'ready' } });
    expect(db.tables.messages).toHaveLength(1);
  });
});

describe('from the app to the email', () => {
  it('the cron later sends that same message with its tasks, without generating another', async () => {
    // 06:00: she opens Inicio, the app writes her day.
    await open();
    expect(generateMessage).toHaveBeenCalledTimes(1);

    // 08:20: the cron, at her hour.
    vi.setSystemTime(new Date('2026-10-04T14:20:00Z'));
    const response = await cron(
      new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } })
    );

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    const text = vi.mocked(sendDailyEmail).mock.calls[0][1];
    expect(text).toContain('Escrito al abrir la app.');
    expect(text).toContain('1. Uno.\n2. Dos.\n3. Tres.');
    expect(db.tables.messages).toHaveLength(1);
    expect(db.tables.messages[0]).toMatchObject({ send_status: 'sent' });
  });

  it('a paused person gets the day in the app but never the email', async () => {
    db.tables.profiles = [profile({ delivery_paused: true })];
    await open();

    vi.setSystemTime(new Date('2026-10-04T14:20:00Z'));
    await cron(new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } }));

    expect(sendDailyEmail).not.toHaveBeenCalled();
  });
});
