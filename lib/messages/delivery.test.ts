import { describe, it, expect } from 'vitest';
import { isDueNow, isSameLocalDay } from './delivery';

describe('isDueNow', () => {
  it('returns true when the local hour matches the delivery hour', () => {
    // 2026-01-15T14:00:00Z is 08:00 in America/Mexico_City (UTC-6)
    const now = new Date('2026-01-15T14:00:00Z');
    expect(isDueNow(8, 'America/Mexico_City', now)).toBe(true);
  });

  it('returns false when the local hour does not match', () => {
    const now = new Date('2026-01-15T14:00:00Z');
    expect(isDueNow(9, 'America/Mexico_City', now)).toBe(false);
  });

  it('handles midnight correctly (0, not 24)', () => {
    // 2026-01-15T06:00:00Z is 00:00 in America/Mexico_City (UTC-6)
    const now = new Date('2026-01-15T06:00:00Z');
    expect(isDueNow(0, 'America/Mexico_City', now)).toBe(true);
  });

  it('works across a different timezone (UTC+9)', () => {
    // 2026-01-15T23:00:00Z is 08:00 the next day in Asia/Tokyo (UTC+9)
    const now = new Date('2026-01-15T23:00:00Z');
    expect(isDueNow(8, 'Asia/Tokyo', now)).toBe(true);
  });
});

describe('isSameLocalDay', () => {
  it('returns true for two instants on the same UTC day in a UTC timezone', () => {
    const a = new Date('2026-01-15T10:00:00Z');
    const b = new Date('2026-01-15T20:00:00Z');
    expect(isSameLocalDay(a, b, 'UTC')).toBe(true);
  });

  it('returns false for two instants on different calendar dates', () => {
    const a = new Date('2026-01-15T10:00:00Z');
    const b = new Date('2026-01-16T10:00:00Z');
    expect(isSameLocalDay(a, b, 'UTC')).toBe(false);
  });

  it('returns true when two different UTC dates fall on the same local calendar day (negative offset)', () => {
    // America/Los_Angeles is UTC-8 in January.
    // a is 2026-01-16 03:00 UTC -> 2026-01-15 19:00 local.
    // b is 2026-01-15 23:00 UTC -> 2026-01-15 15:00 local.
    // Different UTC calendar dates (16th vs 15th), same local calendar date (15th).
    // A naive UTC-date comparison would wrongly say these differ.
    const a = new Date('2026-01-16T03:00:00Z');
    const b = new Date('2026-01-15T23:00:00Z');
    expect(isSameLocalDay(a, b, 'America/Los_Angeles')).toBe(true);
  });
});
