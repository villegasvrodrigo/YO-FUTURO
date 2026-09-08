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
});

describe('GET /api/cron/send-messages — same-local-day dedup guard', () => {
  const originalSecret = process.env.CRON_SECRET;

  // Simple chainable fake query builder: every builder method returns
  // `this`, and awaiting the object resolves to the configured result.
  class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
    constructor(private result: { data: unknown; error: unknown }) {}
    select() {
      return this;
    }
    eq() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    insert() {
      return this;
    }
    update() {
      return this;
    }
    single() {
      return this;
    }
    then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // 10:00 UTC — matches delivery_hour_local: 10 in the UTC timezone below.
    vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.CRON_SECRET = originalSecret;
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateMessage).mockReset();
    vi.mocked(sendDailyEmail).mockReset();
  });

  it('skips a user who already received a message earlier the same local day, without generating or sending', async () => {
    process.env.CRON_SECRET = 'right-secret';

    const profile = {
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
    };

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

    const fromMock = vi.fn((table: string) => {
      if (table === 'profiles') {
        return new FakeQuery({ data: [profile], error: null });
      }
      if (table === 'goals') {
        return new FakeQuery({ data: [], error: null });
      }
      if (table === 'messages') {
        return new FakeQuery({ data: [lastMessage], error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const fakeSupabase = {
      from: fromMock,
      auth: { admin: { getUserById: vi.fn() } },
    };

    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase as never);

    const request = new NextRequest('http://localhost/api/cron/send-messages', {
      headers: { authorization: 'Bearer right-secret' },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    // The dedup guard must short-circuit before any generation/send/insert.
    expect(generateMessage).not.toHaveBeenCalled();
    expect(sendDailyEmail).not.toHaveBeenCalled();
    expect(fakeSupabase.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(fromMock.mock.calls.filter(([table]) => table === 'messages')).toHaveLength(1);
  });
});
