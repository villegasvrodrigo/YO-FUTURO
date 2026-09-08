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

import { GET } from './route';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';

type QueryResult = { data: unknown; error: unknown };

/** One recorded Supabase call, so tests can assert what was written. */
interface RecordedOp {
  table: string;
  kind: 'select' | 'insert' | 'update';
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
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
  order() {
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
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
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
    expect(sendDailyEmail).toHaveBeenCalledWith('user-1@example.com', 'Hoy diste un paso más.');

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
      'Mensaje para el usuario sano.'
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
