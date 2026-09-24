import { describe, it, expect } from 'vitest';
import {
  chatDate,
  messagesUsed,
  messagesLeft,
  hasReachedLimit,
  cleanUserMessage,
  DAILY_MESSAGE_LIMIT,
  MAX_USER_MESSAGE_LENGTH,
  type CountableMessage,
} from './rules';

// n exchanges: each is the person's message plus the yo futuro's reply.
function exchanges(n: number, isCrisis = false): CountableMessage[] {
  return Array.from({ length: n }, () => [
    { role: 'user' as const, is_crisis: isCrisis },
    { role: 'assistant' as const, is_crisis: isCrisis },
  ]).flat();
}

describe('chatDate', () => {
  // 2026-09-25 05:30 UTC is still 2026-09-24 at 23:30 in Mexico City (UTC-6).
  const lateNightInMexico = new Date('2026-09-25T05:30:00Z');

  it("uses the person's local day, which ends at their midnight", () => {
    expect(chatDate(lateNightInMexico, 'America/Mexico_City')).toBe('2026-09-24');
    expect(chatDate(new Date('2026-09-25T06:00:00Z'), 'America/Mexico_City')).toBe('2026-09-25');
    expect(chatDate(lateNightInMexico, 'Europe/Madrid')).toBe('2026-09-25');
  });

  it('falls back to Mexico City when the time zone is invalid or missing, without throwing', () => {
    expect(chatDate(lateNightInMexico, 'Not/AZone')).toBe('2026-09-24');
    expect(chatDate(lateNightInMexico, '')).toBe('2026-09-24');
    expect(chatDate(lateNightInMexico, null)).toBe('2026-09-24');
  });
});

describe('daily limit', () => {
  it('is 20 messages', () => {
    expect(DAILY_MESSAGE_LIMIT).toBe(20);
  });

  it("counts only the person's messages, not the replies", () => {
    expect(messagesUsed(exchanges(3))).toBe(3);
    expect(messagesLeft(exchanges(3))).toBe(17);
  });

  it('never counts crisis messages', () => {
    const today = [...exchanges(5), ...exchanges(4, true)];

    expect(messagesUsed(today)).toBe(5);
    expect(messagesLeft(today)).toBe(15);
  });

  it('locks at exactly 20 counted messages, whatever the crises', () => {
    expect(hasReachedLimit(exchanges(19))).toBe(false);
    expect(hasReachedLimit([...exchanges(19), ...exchanges(10, true)])).toBe(false);
    expect(hasReachedLimit(exchanges(20))).toBe(true);
    expect(messagesLeft(exchanges(25))).toBe(0);
  });

  it('starts every day with all 20', () => {
    expect(messagesLeft([])).toBe(20);
    expect(hasReachedLimit([])).toBe(false);
  });
});

describe('cleanUserMessage', () => {
  it('trims the message', () => {
    expect(cleanUserMessage('  hola, hoy no pude  \n')).toBe('hola, hoy no pude');
  });

  it('accepts messages of up to 2,000 characters', () => {
    expect(MAX_USER_MESSAGE_LENGTH).toBe(2000);
    expect(cleanUserMessage('a'.repeat(2000))).toHaveLength(2000);
    expect(cleanUserMessage('a'.repeat(2001))).toBeNull();
  });

  it('rejects empty, non-text and too-long messages', () => {
    expect(cleanUserMessage('   ')).toBeNull();
    expect(cleanUserMessage(42)).toBeNull();
    expect(cleanUserMessage(undefined)).toBeNull();
    expect(cleanUserMessage('a'.repeat(MAX_USER_MESSAGE_LENGTH + 1))).toBeNull();
    expect(cleanUserMessage('a'.repeat(MAX_USER_MESSAGE_LENGTH))).toHaveLength(MAX_USER_MESSAGE_LENGTH);
  });
});
