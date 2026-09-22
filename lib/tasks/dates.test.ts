import { describe, it, expect } from 'vitest';
import { assertValidDate, shiftDate } from './dates';

describe('shiftDate', () => {
  it.each([
    ['yesterday within a month', '2026-09-22', -1, '2026-09-21'],
    ['tomorrow within a month', '2026-09-22', 1, '2026-09-23'],
    ['zero days', '2026-09-22', 0, '2026-09-22'],
    ['back across a month boundary', '2026-10-01', -1, '2026-09-30'],
    ['back into February (normal year)', '2026-03-01', -1, '2026-02-28'],
    ['back into February (leap year)', '2028-03-01', -1, '2028-02-29'],
    ['back across a year boundary', '2027-01-01', -1, '2026-12-31'],
    ['forward across a year boundary', '2026-12-31', 1, '2027-01-01'],
    ['29 days back across a month', '2026-10-10', -29, '2026-09-11'],
    ['89 days back', '2026-09-22', -89, '2026-06-25'],
    ['89 days back across a year', '2027-01-15', -89, '2026-10-18'],
  ])('%s: %s %+d → %s', (_label, date, days, expected) => {
    expect(shiftDate(date, days)).toBe(expected);
  });

  it.each(['', '2026-02-31', '2026-13-01', '22/09/2026', '2026-9-22', 'hoy'])(
    'throws on the invalid date %j',
    (bad) => {
      expect(() => shiftDate(bad, -1)).toThrow();
    }
  );
});

describe('assertValidDate', () => {
  it('accepts real dates, including Feb 29 of a leap year', () => {
    expect(() => assertValidDate('2026-09-22')).not.toThrow();
    expect(() => assertValidDate('2028-02-29')).not.toThrow();
  });

  it('rejects Feb 29 of a normal year and malformed strings', () => {
    expect(() => assertValidDate('2026-02-29')).toThrow();
    expect(() => assertValidDate('2026-02-31')).toThrow();
    expect(() => assertValidDate('ayer')).toThrow();
  });
});
