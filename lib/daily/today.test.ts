import { describe, it, expect, vi } from 'vitest';
import { claimTodayEmail, findTodayMessage, EMAIL_CLAIM_TIMEOUT_MINUTES, type DayMessage } from './today';

const msg = (extra: Partial<DayMessage>): DayMessage =>
  ({
    id: 'm',
    user_id: 'u',
    content: 'x',
    generated_at: '2026-10-04T14:00:00Z',
    sent_at: null,
    send_status: 'pending',
    model_used: 'm',
    ...extra,
  }) as DayMessage;

describe('findTodayMessage', () => {
  it('uses message_date when the row has it', () => {
    const today = msg({ id: 'hoy', message_date: '2026-10-04' });
    const yesterday = msg({ id: 'ayer', message_date: '2026-10-03' });

    expect(findTodayMessage([today, yesterday], '2026-10-04', 'America/Mexico_City')?.id).toBe('hoy');
    expect(findTodayMessage([yesterday], '2026-10-04', 'America/Mexico_City')).toBeNull();
  });

  it("falls back to the generated time in the person's zone for old rows without it", () => {
    // 05:30 UTC on Oct 5 is still Oct 4 in Mexico City.
    const old = msg({ id: 'viejo', message_date: null, generated_at: '2026-10-05T05:30:00Z' });

    expect(findTodayMessage([old], '2026-10-04', 'America/Mexico_City')?.id).toBe('viejo');
    expect(findTodayMessage([old], '2026-10-05', 'America/Mexico_City')).toBeNull();
  });
});

describe('claimTodayEmail', () => {
  it('claims in one update: only a pending message, unclaimed or claimed more than 15 minutes ago', async () => {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ['update', 'eq', 'or']) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.select = vi.fn().mockResolvedValue({ data: [{ id: 'm1' }], error: null });
    const supabase = { from: () => builder } as never;

    const got = await claimTodayEmail(supabase, 'm1', new Date('2026-10-04T14:20:00Z'));

    expect(got).toBe(true);
    expect(EMAIL_CLAIM_TIMEOUT_MINUTES).toBe(15);
    expect(calls).toEqual([
      ['update', { email_claimed_at: '2026-10-04T14:20:00.000Z' }],
      ['eq', 'id', 'm1'],
      ['eq', 'send_status', 'pending'],
      ['or', 'email_claimed_at.is.null,email_claimed_at.lt.2026-10-04T14:05:00.000Z'],
    ]);
  });

  it('returns false when no row came back (another run has it), and throws on a database error', async () => {
    const make = (result: unknown) => {
      const b: Record<string, unknown> = {};
      for (const m of ['update', 'eq', 'or']) b[m] = () => b;
      b.select = vi.fn().mockResolvedValue(result);
      return { from: () => b } as never;
    };

    expect(await claimTodayEmail(make({ data: [], error: null }), 'm1', new Date())).toBe(false);
    await expect(claimTodayEmail(make({ data: null, error: { message: 'boom' } }), 'm1', new Date())).rejects.toThrow('boom');
  });
});
