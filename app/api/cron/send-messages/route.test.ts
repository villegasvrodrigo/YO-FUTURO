import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/messages/generate', () => ({
  generateMessage: vi.fn(),
}));
vi.mock('@/lib/email/send', () => ({
  sendDailyEmail: vi.fn(),
}));
vi.mock('@/lib/tasks/daily', () => ({
  prepareDailyTasks: vi.fn(),
}));
vi.mock('@/lib/tasks/save', () => ({
  saveDailyTasks: vi.fn(),
}));
vi.mock('@/lib/insights/daily', () => ({
  prepareDailyInsight: vi.fn(),
}));
vi.mock('@/lib/insights/save', () => ({
  saveDailyInsight: vi.fn(),
}));

import { GET } from './route';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';
import { prepareDailyTasks } from '@/lib/tasks/daily';
import { saveDailyTasks } from '@/lib/tasks/save';
import { prepareDailyInsight } from '@/lib/insights/daily';
import { saveDailyInsight } from '@/lib/insights/save';
import { dashboardLine } from '@/lib/email/body';

type QueryResult = { data: unknown; error: unknown };

// Every email: the message, the signature and, last, the dashboard line (with or without tasks).
const EMAIL_WITHOUT_TASKS = `Hoy diste un paso más.\n\n— Tu yo futuro\n\n${dashboardLine()}`;
// The cron runs at 2026-01-15 10:00 UTC and the test profiles use the UTC time zone.
const SUBJECT = 'Tu mensaje de hoy · jueves 15 de enero';

/** One recorded Supabase call, so tests can assert what was written. */
interface RecordedOp {
  table: string;
  kind: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  orders?: Array<[string, unknown]>;
}

// Simple chainable fake query builder: every builder method returns
// `this`, and awaiting the object resolves to the configured result.
// `insert`/`update`/`eq` also record what was asked for.
class FakeQuery implements PromiseLike<QueryResult> {
  constructor(
    private op: RecordedOp,
    private resolveOp: (op: RecordedOp) => QueryResult
  ) {}
  select() {
    return this;
  }
  order(column?: string, options?: unknown) {
    (this.op.orders ??= []).push([column ?? '', options]);
    return this;
  }
  limit() {
    return this;
  }
  single() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.op.filters.push([column, value]);
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.op.kind = 'insert';
    this.op.payload = payload;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.op.kind = 'update';
    this.op.payload = payload;
    return this;
  }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolveOp(this.op)).then(onfulfilled, onrejected);
  }
}

/**
 * Builds a fake admin client over the tables the route touches. Inserted
 * `messages` rows get the deterministic id `msg-<user_id>` so tests can
 * assert the follow-up update and `email_log` row.
 */
function createFakeSupabase(config: {
  profiles: unknown[];
  goals?: Record<string, unknown[]>;
  recentMessages?: Record<string, unknown[]>;
}) {
  const ops: RecordedOp[] = [];

  const resolveOp = (op: RecordedOp): QueryResult => {
    const userId = op.filters.find(([column]) => column === 'user_id')?.[1] as
      | string
      | undefined;

    if (op.table === 'profiles') {
      return { data: config.profiles, error: null };
    }
    if (op.table === 'goals') {
      return { data: config.goals?.[userId ?? ''] ?? [], error: null };
    }
    if (op.table === 'messages') {
      if (op.kind === 'insert') {
        return { data: { id: `msg-${op.payload?.user_id}` }, error: null };
      }
      if (op.kind === 'update') {
        return { data: null, error: null };
      }
      return { data: config.recentMessages?.[userId ?? ''] ?? [], error: null };
    }
    if (op.table === 'email_log') {
      return { data: null, error: null };
    }
    throw new Error(`Unexpected table: ${op.table}`);
  };

  const from = vi.fn((table: string) => {
    const op: RecordedOp = { table, kind: 'select', filters: [] };
    ops.push(op);
    return new FakeQuery(op, resolveOp);
  });

  const getUserById = vi.fn(async (id: string) => ({
    data: { user: { email: `${id}@example.com` } },
  }));

  const client = { from, auth: { admin: { getUserById } } };

  return { client, ops, from, getUserById };
}

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Rodrigo',
    current_age: 30,
    future_self_age: 60,
    values: 'honestidad',
    focus_area: 'personal',
    tone: 'motivador',
    delivery_hour_local: 10,
    timezone: 'UTC',
    onboarding_completed: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function cronRequest(secret = 'right-secret') {
  return new NextRequest('http://localhost/api/cron/send-messages', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe('GET /api/cron/send-messages', () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('rejects requests without the correct CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'right-secret';
    const request = new NextRequest('http://localhost/api/cron/send-messages', {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('rejects requests when CRON_SECRET is unset instead of accepting "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    const request = new NextRequest('http://localhost/api/cron/send-messages', {
      headers: { authorization: 'Bearer undefined' },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('GET /api/cron/send-messages — batch processing', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.useFakeTimers();
    // 10:00 UTC — matches delivery_hour_local: 10 in the UTC timezone below.
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    process.env.CRON_SECRET = 'right-secret';
    // No tasks by default: these tests are about the message flow, as before tasks existed.
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);
    vi.mocked(saveDailyTasks).mockResolvedValue('saved');
    // No insight by default either.
    vi.mocked(prepareDailyInsight).mockResolvedValue(null);
    vi.mocked(saveDailyInsight).mockResolvedValue('saved');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
    vi.mocked(prepareDailyTasks).mockReset();
    vi.mocked(saveDailyTasks).mockReset();
    vi.mocked(prepareDailyInsight).mockReset();
    vi.mocked(saveDailyInsight).mockReset();
  });

  it('skips a user who already received a message earlier the same local day, without generating or sending', async () => {
    const profile = makeProfile();

    // Already sent one hour earlier today (same UTC/local calendar day).
    const lastMessage = {
      id: 'msg-1',
      user_id: 'user-1',
      content: 'ya enviado hoy',
      generated_at: '2026-01-15T09:00:00Z',
      sent_at: '2026-01-15T09:00:01Z',
      send_status: 'sent',
      model_used: 'claude-sonnet-5',
    };

    const fake = createFakeSupabase({
      profiles: [profile],
      recentMessages: { 'user-1': [lastMessage] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    // The dedup guard must short-circuit before any generation/send/insert.
    expect(generateMessage).not.toHaveBeenCalled();
    expect(sendDailyEmail).not.toHaveBeenCalled();
    expect(prepareDailyTasks).not.toHaveBeenCalled();
    expect(saveDailyTasks).not.toHaveBeenCalled();
    expect(fake.getUserById).not.toHaveBeenCalled();
    expect(fake.ops.filter((op) => op.table === 'messages')).toHaveLength(1);
  });

  it('generates, stores, sends and marks the message as sent for a due user', async () => {
    const profile = makeProfile();
    const goal = { id: 'goal-1', user_id: 'user-1', description: 'correr 5k', status: 'active' };

    const fake = createFakeSupabase({
      profiles: [profile],
      goals: { 'user-1': [goal] },
      recentMessages: { 'user-1': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Hoy diste un paso más.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-123',
      status: 'sent',
      error: null,
    });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(generateMessage).toHaveBeenCalledWith(profile, [goal], []);
    expect(sendDailyEmail).toHaveBeenCalledWith('user-1@example.com', EMAIL_WITHOUT_TASKS, SUBJECT);

    const messageInsert = fake.ops.find(
      (op) => op.table === 'messages' && op.kind === 'insert'
    );
    expect(messageInsert?.payload).toEqual({
      user_id: 'user-1',
      content: 'Hoy diste un paso más.',
      model_used: 'claude-sonnet-5',
      send_status: 'pending',
    });

    const messageUpdate = fake.ops.find(
      (op) => op.table === 'messages' && op.kind === 'update'
    );
    expect(messageUpdate?.payload).toEqual({
      send_status: 'sent',
      sent_at: '2026-01-15T10:00:00.000Z',
    });
    expect(messageUpdate?.filters).toContainEqual(['id', 'msg-user-1']);

    const emailLog = fake.ops.find((op) => op.table === 'email_log');
    expect(emailLog?.payload).toEqual({
      message_id: 'msg-user-1',
      provider_id: 'email-123',
      status: 'sent',
      error: null,
    });
  });

  it('marks the message failed and still logs to email_log when the email send fails', async () => {
    const fake = createFakeSupabase({
      profiles: [makeProfile()],
      recentMessages: { 'user-1': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Sigue adelante.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: null,
      status: 'failed',
      error: 'network timeout',
    });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    const messageUpdate = fake.ops.find(
      (op) => op.table === 'messages' && op.kind === 'update'
    );
    expect(messageUpdate?.payload).toEqual({ send_status: 'failed', sent_at: null });

    const emailLog = fake.ops.find((op) => op.table === 'email_log');
    expect(emailLog?.payload).toEqual({
      message_id: 'msg-user-1',
      provider_id: null,
      status: 'failed',
      error: 'network timeout',
    });
  });

  it('filters out a profile whose delivery hour does not match the current local hour', async () => {
    const dueProfile = makeProfile({ id: 'user-due', delivery_hour_local: 10 });
    const notDueProfile = makeProfile({ id: 'user-not-due', delivery_hour_local: 15 });

    const fake = createFakeSupabase({
      profiles: [dueProfile, notDueProfile],
      recentMessages: { 'user-due': [], 'user-not-due': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Solo para el usuario que toca.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-1',
      status: 'sent',
      error: null,
    });

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(generateMessage).toHaveBeenCalledWith(dueProfile, [], []);
    expect(fake.ops.some((op) => op.filters.some(([, v]) => v === 'user-not-due'))).toBe(false);
  });

  it('excludes a profile with an invalid timezone instead of failing the whole batch', async () => {
    const brokenProfile = makeProfile({ id: 'user-broken', timezone: 'Not/AZone' });
    const goodProfile = makeProfile({ id: 'user-good' });

    const fake = createFakeSupabase({
      profiles: [brokenProfile, goodProfile],
      recentMessages: { 'user-good': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Mensaje del día.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-1',
      status: 'sent',
      error: null,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(generateMessage).toHaveBeenCalledWith(goodProfile, [], []);
    expect(consoleError.mock.calls.some(([msg]) => String(msg).includes('user-broken'))).toBe(
      true
    );

    consoleError.mockRestore();
  });

  it('retries a failed Claude generation once and succeeds on the second attempt', async () => {
    const fake = createFakeSupabase({
      profiles: [makeProfile()],
      recentMessages: { 'user-1': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage)
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce({ content: 'Segundo intento.', modelUsed: 'claude-sonnet-5' });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-1',
      status: 'sent',
      error: null,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(generateMessage).toHaveBeenCalledTimes(2);

    const messageInsert = fake.ops.find(
      (op) => op.table === 'messages' && op.kind === 'insert'
    );
    expect(messageInsert?.payload?.content).toBe('Segundo intento.');

    consoleError.mockRestore();
  });

  it('keeps processing other users when one user throws, and inserts no message row for the failed one', async () => {
    const failingProfile = makeProfile({ id: 'user-fails' });
    const okProfile = makeProfile({ id: 'user-ok' });

    const fake = createFakeSupabase({
      profiles: [failingProfile, okProfile],
      recentMessages: { 'user-fails': [], 'user-ok': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockImplementation(async (profile) => {
      if (profile.id === 'user-fails') {
        throw new Error('claude caído');
      }
      return { content: 'Mensaje para el usuario sano.', modelUsed: 'claude-sonnet-5' };
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-1',
      status: 'sent',
      error: null,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 2, succeeded: 1, failed: 1 });

    // Retried once before giving up on the failing user.
    expect(
      vi.mocked(generateMessage).mock.calls.filter(([p]) => p.id === 'user-fails')
    ).toHaveLength(2);

    // The healthy user completed end to end.
    expect(sendDailyEmail).toHaveBeenCalledWith(
      'user-ok@example.com',
      `Mensaje para el usuario sano.\n\n— Tu yo futuro\n\n${dashboardLine()}`,
      SUBJECT
    );
    const inserts = fake.ops.filter((op) => op.table === 'messages' && op.kind === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload?.user_id).toBe('user-ok');

    // The rejection reason is logged with the failing profile's id.
    expect(consoleError.mock.calls.some(([msg]) => String(msg).includes('user-fails'))).toBe(
      true
    );

    consoleError.mockRestore();
  });
});

describe('GET /api/cron/send-messages — daily tasks', () => {
  const originalSecret = process.env.CRON_SECRET;
  const TASKS = [
    'Escribe en tu calendario la hora para revisar tu pipeline.',
    'Elige algo que hayas estado posponiendo y avanza hoy una parte pequeña.',
    'Anota tres logros concretos que ya conseguiste este año.',
  ];
  const PREPARED = { taskDate: '2026-01-15', tasks: TASKS };
  const EMAIL_WITH_TASKS =
    'Hoy diste un paso más.\n\n— Tu yo futuro\n\n· · ·\n\nTus tareas de hoy:\n\n' +
    `1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}\n\n${dashboardLine()}`;

  function setupDueUser() {
    const profile = makeProfile();
    const goal = { id: 'goal-1', user_id: 'user-1', description: 'correr 5k', status: 'active' };
    const fake = createFakeSupabase({
      profiles: [profile],
      goals: { 'user-1': [goal] },
      recentMessages: { 'user-1': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Hoy diste un paso más.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-123',
      status: 'sent',
      error: null,
    });
    return { profile, goal, fake };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    process.env.CRON_SECRET = 'right-secret';
    vi.mocked(saveDailyTasks).mockResolvedValue('saved');
    vi.mocked(prepareDailyInsight).mockResolvedValue(null);
    vi.mocked(saveDailyInsight).mockResolvedValue('saved');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
    vi.mocked(prepareDailyTasks).mockReset();
    vi.mocked(saveDailyTasks).mockReset();
    vi.mocked(prepareDailyInsight).mockReset();
    vi.mocked(saveDailyInsight).mockReset();
  });

  it('with no tasks, sends exactly the message and saves nothing (the email is as it was before tasks)', async () => {
    setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendDailyEmail).toHaveBeenCalledWith('user-1@example.com', EMAIL_WITHOUT_TASKS, SUBJECT);
    expect(saveDailyTasks).not.toHaveBeenCalled();
  });

  it('with tasks, adds the separator, the title, the numbered tasks and the dashboard line to the email', async () => {
    setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledWith('user-1@example.com', EMAIL_WITH_TASKS, SUBJECT);
  });

  it("sends the email with that day's date in the subject, in the user's time zone", async () => {
    setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);

    await GET(cronRequest());

    expect(vi.mocked(sendDailyEmail).mock.calls[0][2]).toBe(SUBJECT);
  });

  it('stores only the message in `messages`, never the tasks', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);

    await GET(cronRequest());

    const insert = fake.ops.find((op) => op.table === 'messages' && op.kind === 'insert');
    expect(insert?.payload).toEqual({
      user_id: 'user-1',
      content: 'Hoy diste un paso más.',
      model_used: 'claude-sonnet-5',
      send_status: 'pending',
    });
  });

  it('prepares the tasks with the profile, the active goals, the message and the run time', async () => {
    const { profile, goal, fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);

    await GET(cronRequest());

    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
    expect(prepareDailyTasks).toHaveBeenCalledWith(
      fake.client,
      profile,
      [goal],
      'Hoy diste un paso más.',
      new Date('2026-01-15T10:00:00Z')
    );
  });

  it('saves the tasks last: after sending, and after the message status and email log are written', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);
    let opsWrittenBeforeSave: string[] = [];
    vi.mocked(saveDailyTasks).mockImplementation(async () => {
      opsWrittenBeforeSave = fake.ops.filter((op) => op.kind !== 'select').map((op) => `${op.table}:${op.kind}`);
      return 'saved';
    });

    await GET(cronRequest());

    expect(saveDailyTasks).toHaveBeenCalledTimes(1);
    expect(saveDailyTasks).toHaveBeenCalledWith('user-1', '2026-01-15', TASKS, fake.client);
    expect(vi.mocked(saveDailyTasks).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(sendDailyEmail).mock.invocationCallOrder[0]
    );
    expect(opsWrittenBeforeSave).toEqual(['messages:insert', 'messages:update', 'email_log:insert']);
  });

  it('prepares the tasks before sending, not after', async () => {
    setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);

    await GET(cronRequest());

    expect(vi.mocked(prepareDailyTasks).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendDailyEmail).mock.invocationCallOrder[0]
    );
  });

  it('a failed task save does not affect the email, the message status or the result', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);
    vi.mocked(saveDailyTasks).mockResolvedValue('failed');

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledWith('user-1@example.com', EMAIL_WITH_TASKS, SUBJECT);
    const update = fake.ops.find((op) => op.table === 'messages' && op.kind === 'update');
    expect(update?.payload).toEqual({ send_status: 'sent', sent_at: '2026-01-15T10:00:00.000Z' });
    expect(fake.ops.some((op) => op.table === 'email_log')).toBe(true);
  });

  it('still saves the tasks when the email fails to send (they show up in the dashboard anyway)', async () => {
    setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: null,
      status: 'failed',
      error: 'network timeout',
    });

    await GET(cronRequest());

    expect(saveDailyTasks).toHaveBeenCalledTimes(1);
  });

  it('makes no task work at all when the user has no email', async () => {
    const { fake } = setupDueUser();
    fake.getUserById.mockResolvedValueOnce({ data: { user: null } } as never);
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(prepareDailyTasks).not.toHaveBeenCalled();
    expect(sendDailyEmail).not.toHaveBeenCalled();
    expect(saveDailyTasks).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('reads the active goals oldest first, so the daily goal rotation is stable', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);

    await GET(cronRequest());

    const goalsRead = fake.ops.find((op) => op.table === 'goals');
    expect(goalsRead?.filters).toEqual([
      ['user_id', 'user-1'],
      ['status', 'active'],
    ]);
    expect(goalsRead?.orders).toEqual([['created_at', { ascending: true }]]);
  });
});

describe('GET /api/cron/send-messages — daily insight', () => {
  const originalSecret = process.env.CRON_SECRET;
  const TASKS = [
    'Escribe en tu calendario la hora para revisar tu pipeline.',
    'Elige algo que hayas estado posponiendo y avanza hoy una parte pequeña.',
    'Anota tres logros concretos que ya conseguiste este año.',
  ];
  const PREPARED_TASKS = { taskDate: '2026-01-15', tasks: TASKS };
  const INSIGHT = {
    insightDate: '2026-01-15',
    content: 'Estás aprendiendo que la calma también se practica. Poco a poco se nota. Eso ya es tuyo.',
    modelUsed: 'claude-sonnet-5',
  };
  const EMAIL_WITH_TASKS =
    'Hoy diste un paso más.\n\n— Tu yo futuro\n\n· · ·\n\nTus tareas de hoy:\n\n' +
    `1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}\n\n${dashboardLine()}`;

  function setupDueUser() {
    const profile = makeProfile();
    const goal = { id: 'goal-1', user_id: 'user-1', description: 'correr 5k', status: 'active' };
    const fake = createFakeSupabase({
      profiles: [profile],
      goals: { 'user-1': [goal] },
      recentMessages: { 'user-1': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({
      content: 'Hoy diste un paso más.',
      modelUsed: 'claude-sonnet-5',
    });
    vi.mocked(sendDailyEmail).mockResolvedValue({
      providerId: 'email-123',
      status: 'sent',
      error: null,
    });
    return { profile, goal, fake };
  }

  // Runs the cron once and returns the exact text the email was sent with.
  async function sentEmailText() {
    const response = await GET(cronRequest());
    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    return vi.mocked(sendDailyEmail).mock.calls[0][1];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    process.env.CRON_SECRET = 'right-secret';
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);
    vi.mocked(saveDailyTasks).mockResolvedValue('saved');
    vi.mocked(prepareDailyInsight).mockResolvedValue(INSIGHT);
    vi.mocked(saveDailyInsight).mockResolvedValue('saved');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
    vi.mocked(prepareDailyTasks).mockReset();
    vi.mocked(saveDailyTasks).mockReset();
    vi.mocked(prepareDailyInsight).mockReset();
    vi.mocked(saveDailyInsight).mockReset();
  });

  describe('the email is exactly the same with or without an insight', () => {
    it('without tasks', async () => {
      setupDueUser();
      vi.mocked(prepareDailyInsight).mockResolvedValue(INSIGHT);
      const withInsight = await sentEmailText();

      vi.mocked(sendDailyEmail).mockClear();
      vi.mocked(prepareDailyInsight).mockResolvedValue(null);
      setupDueUser();
      const withoutInsight = await sentEmailText();

      expect(withInsight).toBe(EMAIL_WITHOUT_TASKS);
      expect(withoutInsight).toBe(EMAIL_WITHOUT_TASKS);
      expect(withInsight).not.toContain(INSIGHT.content);
    });

    it('with tasks', async () => {
      setupDueUser();
      vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED_TASKS);
      vi.mocked(prepareDailyInsight).mockResolvedValue(INSIGHT);
      const withInsight = await sentEmailText();

      vi.mocked(sendDailyEmail).mockClear();
      vi.mocked(prepareDailyInsight).mockResolvedValue(null);
      setupDueUser();
      const withoutInsight = await sentEmailText();

      expect(withInsight).toBe(EMAIL_WITH_TASKS);
      expect(withoutInsight).toBe(EMAIL_WITH_TASKS);
      expect(withInsight).not.toContain(INSIGHT.content);
    });

    it('when the insight fails, is slow or rejects', async () => {
      for (const insight of [
        () => Promise.resolve(null),
        () => new Promise<null>(() => {}),
        () => Promise.reject(new Error('insight roto')),
      ]) {
        setupDueUser();
        vi.mocked(sendDailyEmail).mockClear();
        vi.mocked(prepareDailyInsight).mockImplementation(insight as never);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        const pending = GET(cronRequest());
        // Let everything that does not depend on the insight run.
        await vi.advanceTimersByTimeAsync(0);

        expect(sendDailyEmail).toHaveBeenCalledTimes(1);
        expect(vi.mocked(sendDailyEmail).mock.calls[0][1]).toBe(EMAIL_WITHOUT_TASKS);
        consoleError.mockRestore();
        void pending;
      }
    });
  });

  it('starts the insight before sending, with the profile, the active goals, the message and the run time', async () => {
    const { profile, goal, fake } = setupDueUser();

    await GET(cronRequest());

    expect(prepareDailyInsight).toHaveBeenCalledTimes(1);
    expect(prepareDailyInsight).toHaveBeenCalledWith(
      fake.client,
      profile,
      [goal],
      'Hoy diste un paso más.',
      new Date('2026-01-15T10:00:00Z')
    );
    expect(vi.mocked(prepareDailyInsight).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sendDailyEmail).mock.invocationCallOrder[0]
    );
  });

  it('starts the insight at the same time as the tasks: the tasks do not wait for it', async () => {
    setupDueUser();
    vi.mocked(prepareDailyInsight).mockReturnValue(new Promise(() => {}));

    const pending = GET(cronRequest());
    await vi.advanceTimersByTimeAsync(0);

    expect(prepareDailyInsight).toHaveBeenCalledTimes(1);
    expect(prepareDailyTasks).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prepareDailyInsight).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prepareDailyTasks).mock.invocationCallOrder[0]
    );
    void pending;
  });

  it('sends the email without waiting for a slow insight, and saves the insight once it arrives', async () => {
    const { fake } = setupDueUser();
    let resolveInsight: (value: typeof INSIGHT) => void = () => {};
    vi.mocked(prepareDailyInsight).mockReturnValue(new Promise((resolve) => (resolveInsight = resolve)));

    const pending = GET(cronRequest());
    await vi.advanceTimersByTimeAsync(0);

    // The email went out and was logged while the insight was still being written.
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(fake.ops.some((op) => op.table === 'email_log')).toBe(true);
    expect(saveDailyInsight).not.toHaveBeenCalled();

    resolveInsight(INSIGHT);
    const response = await pending;

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(saveDailyInsight).toHaveBeenCalledWith('user-1', '2026-01-15', INSIGHT, fake.client);
  });

  it('saves the insight last: after sending, the message status, the email log and the tasks', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED_TASKS);
    let opsWrittenBeforeSave: string[] = [];
    vi.mocked(saveDailyInsight).mockImplementation(async () => {
      opsWrittenBeforeSave = fake.ops.filter((op) => op.kind !== 'select').map((op) => `${op.table}:${op.kind}`);
      return 'saved';
    });

    await GET(cronRequest());

    expect(saveDailyInsight).toHaveBeenCalledTimes(1);
    expect(saveDailyInsight).toHaveBeenCalledWith('user-1', '2026-01-15', INSIGHT, fake.client);
    expect(opsWrittenBeforeSave).toEqual(['messages:insert', 'messages:update', 'email_log:insert']);
    expect(vi.mocked(saveDailyInsight).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(saveDailyTasks).mock.invocationCallOrder[0]
    );
  });

  it('with no insight, saves no insight and the user still succeeds', async () => {
    setupDueUser();
    vi.mocked(prepareDailyInsight).mockResolvedValue(null);

    await sentEmailText();

    expect(saveDailyInsight).not.toHaveBeenCalled();
  });

  it('an insight that rejects does not affect the email, the tasks, the message status or the result', async () => {
    const { fake } = setupDueUser();
    vi.mocked(prepareDailyTasks).mockResolvedValue(PREPARED_TASKS);
    vi.mocked(prepareDailyInsight).mockRejectedValue(new Error('insight roto'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await sentEmailText()).toBe(EMAIL_WITH_TASKS);

    expect(saveDailyTasks).toHaveBeenCalledTimes(1);
    expect(saveDailyInsight).not.toHaveBeenCalled();
    const update = fake.ops.find((op) => op.table === 'messages' && op.kind === 'update');
    expect(update?.payload).toEqual({ send_status: 'sent', sent_at: '2026-01-15T10:00:00.000Z' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('a failed insight save does not affect the result', async () => {
    setupDueUser();
    vi.mocked(saveDailyInsight).mockResolvedValue('failed');

    expect(await sentEmailText()).toBe(EMAIL_WITHOUT_TASKS);
  });

  it('stores only the message in `messages`, never the insight', async () => {
    const { fake } = setupDueUser();

    await GET(cronRequest());

    const insert = fake.ops.find((op) => op.table === 'messages' && op.kind === 'insert');
    expect(insert?.payload).toEqual({
      user_id: 'user-1',
      content: 'Hoy diste un paso más.',
      model_used: 'claude-sonnet-5',
      send_status: 'pending',
    });
  });

  it('makes no insight work at all when the user has no email', async () => {
    const { fake } = setupDueUser();
    fake.getUserById.mockResolvedValueOnce({ data: { user: null } } as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    expect(prepareDailyInsight).not.toHaveBeenCalled();
    expect(saveDailyInsight).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('GET /api/cron/send-messages — paused daily emails', () => {
  const originalSecret = process.env.CRON_SECRET;

  // Two users due at 10:00 UTC; `pausedOverrides` lets a test pause one of them.
  function setupTwoUsers(pausedOverrides: Record<string, unknown> = { delivery_paused: true }) {
    const paused = makeProfile({ id: 'user-paused', ...pausedOverrides });
    const active = makeProfile({ id: 'user-active' });
    const fake = createFakeSupabase({
      profiles: [paused, active],
      recentMessages: { 'user-paused': [], 'user-active': [] },
    });
    vi.mocked(createAdminClient).mockReturnValue(fake.client as never);
    vi.mocked(generateMessage).mockResolvedValue({ content: 'Hoy diste un paso más.', modelUsed: 'claude-sonnet-5' });
    vi.mocked(sendDailyEmail).mockResolvedValue({ providerId: 'email-1', status: 'sent', error: null });
    return { fake };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    process.env.CRON_SECRET = 'right-secret';
    vi.mocked(prepareDailyTasks).mockResolvedValue(null);
    vi.mocked(saveDailyTasks).mockResolvedValue('saved');
    vi.mocked(prepareDailyInsight).mockResolvedValue(null);
    vi.mocked(saveDailyInsight).mockResolvedValue('saved');
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
    vi.mocked(prepareDailyTasks).mockReset();
    vi.mocked(saveDailyTasks).mockReset();
    vi.mocked(prepareDailyInsight).mockReset();
    vi.mocked(saveDailyInsight).mockReset();
  });

  it('does nothing at all for a paused user: no message, tasks, insight or email', async () => {
    const { fake } = setupTwoUsers();

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    expect(vi.mocked(generateMessage).mock.calls.map(([p]) => p.id)).toEqual(['user-active']);
    expect(vi.mocked(prepareDailyTasks).mock.calls.map(([, p]) => p.id)).toEqual(['user-active']);
    expect(vi.mocked(prepareDailyInsight).mock.calls.map(([, p]) => p.id)).toEqual(['user-active']);
    expect(sendDailyEmail).toHaveBeenCalledTimes(1);
    expect(sendDailyEmail).toHaveBeenCalledWith('user-active@example.com', EMAIL_WITHOUT_TASKS, SUBJECT);
    const inserts = fake.ops.filter((op) => op.table === 'messages' && op.kind === 'insert');
    expect(inserts.map((op) => op.payload?.user_id)).toEqual(['user-active']);
  });

  it.each([
    ['false', { delivery_paused: false }],
    ['null', { delivery_paused: null }],
    ['missing (column not there yet)', {}],
  ])('processes a user normally when the pause is %s', async (_label, overrides) => {
    setupTwoUsers(overrides);

    const response = await GET(cronRequest());

    expect(await response.json()).toEqual({ processed: 2, succeeded: 2, failed: 0 });
    expect(sendDailyEmail).toHaveBeenCalledTimes(2);
    expect(sendDailyEmail).toHaveBeenCalledWith('user-paused@example.com', EMAIL_WITHOUT_TASKS, SUBJECT);
    expect(sendDailyEmail).toHaveBeenCalledWith('user-active@example.com', EMAIL_WITHOUT_TASKS, SUBJECT);
  });

  it('logs how many are paused, and each paused user whose hour it was', async () => {
    setupTwoUsers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await GET(cronRequest());

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('elegibles esta hora: 1') && line.includes('en pausa: 1'))).toBe(true);
    expect(lines.some((line) => line.includes('en pausa: perfil user-paused (le tocaba esta hora'))).toBe(true);
    log.mockRestore();
  });

  it('does not log a paused user whose hour it was not, but still counts them', async () => {
    setupTwoUsers({ delivery_paused: true, delivery_hour_local: 20 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await GET(cronRequest());

    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('en pausa: 1'))).toBe(true);
    expect(lines.some((line) => line.includes('en pausa: perfil user-paused'))).toBe(false);
    log.mockRestore();
  });
});
