import { describe, it, expect } from 'vitest';
import { messageDay } from './messageDay';

const MX = 'America/Mexico_City';
// 2026-09-23 18:00 UTC = 12:00 noon on Sep 23 in Mexico City.
const NOW = new Date('2026-09-23T18:00:00Z');

describe('messageDay', () => {
  it("is today for a message generated earlier today in the user's time zone", () => {
    expect(messageDay('2026-09-23T14:17:37Z', MX, NOW)).toEqual({ date: '2026-09-23', isToday: true });
  });

  it('is not today for a message from a previous day', () => {
    expect(messageDay('2026-09-22T14:17:37Z', MX, NOW)).toEqual({ date: '2026-09-22', isToday: false });
  });

  it('uses the local date, not the UTC one', () => {
    // 2026-09-23 02:00 UTC is still the evening of Sep 22 in Mexico City.
    expect(messageDay('2026-09-23T02:00:00Z', MX, NOW)).toEqual({ date: '2026-09-22', isToday: false });
    // 2026-09-24 03:00 UTC is still Sep 23 at 9 p.m. in Mexico City: "today" for that evening.
    expect(messageDay('2026-09-23T20:00:00Z', MX, new Date('2026-09-24T03:00:00Z'))).toEqual({
      date: '2026-09-23',
      isToday: true,
    });
  });

  it.each([
    ['no time zone', '2026-09-23T14:00:00Z', null],
    ['an empty time zone', '2026-09-23T14:00:00Z', ''],
    ['an invalid time zone', '2026-09-23T14:00:00Z', 'No/Existe'],
    ['an invalid timestamp', 'ayer', MX],
  ])('is null (without throwing) with %s', (_label, generatedAt, timezone) => {
    expect(messageDay(generatedAt, timezone, NOW)).toBeNull();
  });
});
