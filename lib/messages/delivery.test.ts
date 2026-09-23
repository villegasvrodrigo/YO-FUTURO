import { describe, it, expect } from 'vitest';
import {
  isDueNow,
  isSameLocalDay,
  getLocalDateString,
  getLocalHour,
  summarizeDueProfiles,
} from './delivery';

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

describe('getLocalHour', () => {
  it('returns the local hour for a given instant and timezone', () => {
    const now = new Date('2026-01-15T14:00:00Z');
    expect(getLocalHour('America/Mexico_City', now)).toBe(8);
  });

  it('normalizes midnight to 0 instead of 24', () => {
    const now = new Date('2026-01-15T06:00:00Z');
    expect(getLocalHour('America/Mexico_City', now)).toBe(0);
  });

  it('throws for an invalid IANA timezone', () => {
    const now = new Date('2026-01-15T14:00:00Z');
    expect(() => getLocalHour('Not/AZone', now)).toThrow();
  });
});

describe('summarizeDueProfiles', () => {
  // 2026-01-15T14:00:00Z is 08:00 in America/Mexico_City (UTC-6).
  const now = new Date('2026-01-15T14:00:00Z');

  it('separates due profiles from non-due ones, keeping the total count', () => {
    const profiles = [
      { id: 'a', timezone: 'America/Mexico_City', delivery_hour_local: 8 },
      { id: 'b', timezone: 'America/Mexico_City', delivery_hour_local: 9 },
    ];

    const summary = summarizeDueProfiles(profiles, now);

    expect(summary.totalProfiles).toBe(2);
    expect(summary.due).toEqual([{ id: 'a', timezone: 'America/Mexico_City', localHour: 8 }]);
    expect(summary.excluded).toEqual([]);
  });

  it('excludes a profile with an invalid timezone instead of throwing, recording why', () => {
    const profiles = [{ id: 'bad', timezone: 'Not/AZone', delivery_hour_local: 8 }];

    const summary = summarizeDueProfiles(profiles, now);

    expect(summary.due).toEqual([]);
    expect(summary.excluded).toHaveLength(1);
    expect(summary.excluded[0].id).toBe('bad');
    expect(summary.excluded[0].error).toBeTruthy();
  });

  it('reports the reference instant as an ISO string', () => {
    const summary = summarizeDueProfiles([], now);

    expect(summary.nowUtcIso).toBe(now.toISOString());
  });

  describe('paused daily emails', () => {
    const mx = { timezone: 'America/Mexico_City', delivery_hour_local: 8 };

    it('never marks a paused profile as due, even at its hour', () => {
      const summary = summarizeDueProfiles([{ id: 'p', ...mx, delivery_paused: true }], now);

      expect(summary.due).toEqual([]);
      expect(summary.paused).toEqual([{ id: 'p', timezone: 'America/Mexico_City', dueThisHour: true }]);
    });

    it.each([
      ['false', false],
      ['null', null],
      ['a missing field (column not there yet)', undefined],
    ])('processes a profile as usual when the pause is %s', (_label, value) => {
      const profile = value === undefined ? { id: 'a', ...mx } : { id: 'a', ...mx, delivery_paused: value };

      const summary = summarizeDueProfiles([profile], now);

      expect(summary.due).toEqual([{ id: 'a', timezone: 'America/Mexico_City', localHour: 8 }]);
      expect(summary.paused).toEqual([]);
    });

    it('only pauses on an explicit true, not on other truthy-looking values', () => {
      const odd = [
        { id: 'a', ...mx, delivery_paused: 'true' as unknown as boolean },
        { id: 'b', ...mx, delivery_paused: 1 as unknown as boolean },
      ];

      const summary = summarizeDueProfiles(odd, now);

      expect(summary.due.map((p) => p.id)).toEqual(['a', 'b']);
      expect(summary.paused).toEqual([]);
    });

    it('a paused profile does not affect the others at the same hour', () => {
      const profiles = [
        { id: 'rodrigo', ...mx },
        { id: 'pausada', ...mx, delivery_paused: true },
        { id: 'michelle', ...mx, delivery_paused: false },
      ];

      const summary = summarizeDueProfiles(profiles, now);

      expect(summary.totalProfiles).toBe(3);
      expect(summary.due.map((p) => p.id)).toEqual(['rodrigo', 'michelle']);
      expect(summary.paused.map((p) => p.id)).toEqual(['pausada']);
    });

    it('counts paused profiles of every hour, and says whether this was their hour', () => {
      const profiles = [
        { id: 'now', ...mx, delivery_paused: true },
        { id: 'later', timezone: 'America/Mexico_City', delivery_hour_local: 20, delivery_paused: true },
      ];

      const summary = summarizeDueProfiles(profiles, now);

      expect(summary.paused).toEqual([
        { id: 'now', timezone: 'America/Mexico_City', dueThisHour: true },
        { id: 'later', timezone: 'America/Mexico_City', dueThisHour: false },
      ]);
    });

    it('keeps a paused profile with an invalid timezone as paused, without throwing', () => {
      const summary = summarizeDueProfiles(
        [{ id: 'bad', timezone: 'Not/AZone', delivery_hour_local: 8, delivery_paused: true }],
        now
      );

      expect(summary.paused).toEqual([{ id: 'bad', timezone: 'Not/AZone', dueThisHour: false }]);
      expect(summary.excluded).toEqual([]);
      expect(summary.due).toEqual([]);
    });
  });
});

describe('getLocalDateString', () => {
  it('returns the local calendar date as YYYY-MM-DD', () => {
    expect(getLocalDateString(new Date('2026-09-21T15:30:00Z'), 'UTC')).toBe('2026-09-21');
  });

  it('uses the date in the given time zone, not the UTC date (behind UTC)', () => {
    // 2026-09-22T03:00Z is still the evening of Sep 21 in Mexico City (UTC-6).
    expect(getLocalDateString(new Date('2026-09-22T03:00:00Z'), 'America/Mexico_City')).toBe('2026-09-21');
  });

  it('uses the date in the given time zone, not the UTC date (ahead of UTC)', () => {
    // 2026-09-21T20:00Z is already Sep 22 in Tokyo (UTC+9).
    expect(getLocalDateString(new Date('2026-09-21T20:00:00Z'), 'Asia/Tokyo')).toBe('2026-09-22');
  });

  it('pads single-digit months and days', () => {
    expect(getLocalDateString(new Date('2026-03-05T12:00:00Z'), 'UTC')).toBe('2026-03-05');
  });

  it('throws on an invalid time zone', () => {
    expect(() => getLocalDateString(new Date(), 'No/Existe')).toThrow(RangeError);
  });

  it('agrees with isSameLocalDay', () => {
    const a = new Date('2026-09-22T03:00:00Z');
    const b = new Date('2026-09-21T15:00:00Z');
    const zone = 'America/Mexico_City';
    expect(getLocalDateString(a, zone) === getLocalDateString(b, zone)).toBe(isSameLocalDay(a, b, zone));
  });
});
