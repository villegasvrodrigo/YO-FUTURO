import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createMemoryDb, memoryAdminClient, type MemoryDb } from '@/lib/testing/memoryDb';

// The daily notice, end to end with the cron. AI, email and the push service are simulated;
// the database is the in-memory one. Nothing real is sent.
vi.mock('@/lib/messages/generate', () => ({ generateMessage: vi.fn() }));
vi.mock('@/lib/tasks/daily', () => ({ prepareDailyTasks: vi.fn() }));
vi.mock('@/lib/insights/daily', () => ({ prepareDailyInsight: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendDailyEmail: vi.fn() }));
const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...args: unknown[]) => sendNotification(...args) } }));
let db: MemoryDb;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => memoryAdminClient(db) }));

const { GET } = await import('./route');
const { generateMessage } = await import('@/lib/messages/generate');
const { prepareDailyTasks } = await import('@/lib/tasks/daily');
const { prepareDailyInsight } = await import('@/lib/insights/daily');
const { sendDailyEmail } = await import('@/lib/email/send');

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

const request = () =>
  GET(new NextRequest('http://localhost/api/cron/send-messages', { headers: { authorization: 'Bearer secreto' } }));
const run = async () => (await (await request()).json()) as { processed: number; succeeded: number; failed: number };
const turnOn = (withKeys = true) => {
  vi.stubEnv('PUSH_ENABLED', 'true');
  vi.stubEnv('VAPID_PUBLIC_KEY', withKeys ? 'BPublica' : '');
  vi.stubEnv('VAPID_PRIVATE_KEY', withKeys ? 'privada' : '');
};

beforeEach(() => {
  db = createMemoryDb();
  db.tables.profiles.push(profile());
  db.users.ana = { email: 'ana@ejemplo.invalid', app_metadata: {} };
  db.tables.push_subscriptions.push({ id: 'cel', user_id: 'ana', endpoint: 'https://web.push.apple.com/x', p256dh: 'k', auth: 'a' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T14:20:00Z')); // 08:20 in Mexico City, her hour
  vi.stubEnv('CRON_SECRET', 'secreto');
  vi.stubEnv('PUSH_ENABLED', undefined);
  vi.stubEnv('VAPID_PUBLIC_KEY', undefined);
  vi.stubEnv('VAPID_PRIVATE_KEY', undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(generateMessage).mockResolvedValue({ content: 'Tu mensaje de hoy.', modelUsed: 'claude-sonnet-5' });
  vi.mocked(prepareDailyTasks).mockResolvedValue(null);
  vi.mocked(prepareDailyInsight).mockResolvedValue(null);
  vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: 'p1', status: 'sent', error: null });
  sendNotification.mockResolvedValue({ statusCode: 201 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(generateMessage).mockReset();
  vi.mocked(prepareDailyTasks).mockReset();
  vi.mocked(prepareDailyInsight).mockReset();
  vi.mocked(sendDailyEmail).mockReset();
  sendNotification.mockReset();
});

describe('the daily notice in the cron', () => {
  it('with notifications off nothing changes: the email goes out, no notice', async () => {
    expect(await run()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('on but without the keys: no notice, and the email goes out as always', async () => {
    turnOn(false);

    expect(await run()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('on: one notice, right after the email, "{Nombre}, tu yo futuro te escribió"', async () => {
    turnOn();

    await run();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toEqual({
      title: 'Yo Futuro',
      body: 'Ana, tu yo futuro te escribió',
      url: '/dashboard',
      tag: 'mensaje-del-dia',
    });
    expect(sendNotification.mock.invocationCallOrder[0]).toBeGreaterThan(vi.mocked(sendDailyEmail).mock.invocationCallOrder[0]);
  });

  it('two runs at the same time: one email and one notice', async () => {
    turnOn();

    await Promise.all([request(), request()]);

    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('a failing notice never makes the email fail nor counts as "failed"', async () => {
    turnOn();
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    expect(await run()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(db.tables.messages[0]).toMatchObject({ send_status: 'sent' });
  });

  it('if the email fails but the message exists, the notice still goes', async () => {
    turnOn();
    vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: null, status: 'failed', error: 'resend down' });

    await run();

    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('a phone that no longer accepts notices is removed', async () => {
    turnOn();
    sendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));

    await run();

    expect(db.tables.push_subscriptions).toHaveLength(0);
  });

  it('paused people get no notice (the cron does not take them)', async () => {
    turnOn();
    db.tables.profiles = [profile({ delivery_paused: true })];

    await run();

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('a later run the same day sends neither another email nor another notice', async () => {
    turnOn();
    await run();

    vi.setSystemTime(new Date('2026-10-08T15:20:00Z'));
    await run();

    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
