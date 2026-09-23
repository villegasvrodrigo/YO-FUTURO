import { describe, it, expect } from 'vitest';
import { assertValidDate, daysInMonth, isValidYearMonth, mondayIndex, monthOf, shiftDate, shiftMonth } from './dates';

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

describe('isValidYearMonth', () => {
  it.each(['2026-09', '2026-01', '2026-12', '2028-02'])('accepts %s', (value) => {
    expect(isValidYearMonth(value)).toBe(true);
  });

  it.each(['', '2026-9', '2026-00', '2026-13', '2026-09-01', 'septiembre', '26-09'])('rejects %j', (value) => {
    expect(isValidYearMonth(value)).toBe(false);
  });
});

describe('monthOf', () => {
  it('is the "YYYY-MM" of a date', () => {
    expect(monthOf('2026-09-23')).toBe('2026-09');
    expect(monthOf('2027-01-01')).toBe('2027-01');
  });

  it('throws on an invalid date', () => {
    expect(() => monthOf('2026-02-31')).toThrow();
  });
});

describe('shiftMonth', () => {
  it.each([
    ['2026-09', -1, '2026-08'],
    ['2026-09', 1, '2026-10'],
    ['2026-09', 0, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-03', -14, '2025-01'],
    ['2026-11', 14, '2028-01'],
  ])('%s %+d → %s', (month, n, expected) => {
    expect(shiftMonth(month, n)).toBe(expected);
  });

  it('throws on an invalid month', () => {
    expect(() => shiftMonth('2026-13', 1)).toThrow();
  });
});

describe('daysInMonth', () => {
  it.each([
    ['2026-01', 31],
    ['2026-02', 28],
    ['2028-02', 29],
    ['2100-02', 28],
    ['2000-02', 29],
    ['2026-04', 30],
    ['2026-09', 30],
    ['2026-12', 31],
  ])('%s has %i days', (month, days) => {
    expect(daysInMonth(month)).toBe(days);
  });
});

describe('mondayIndex', () => {
  it.each([
    ['2026-09-21', 0], // lunes
    ['2026-09-22', 1], // martes
    ['2026-09-23', 2], // miércoles
    ['2026-09-26', 5], // sábado
    ['2026-09-27', 6], // domingo
    ['2026-02-01', 6], // un mes que empieza en domingo
    ['2026-06-01', 0], // un mes que empieza en lunes
    ['2027-01-01', 4], // viernes, cambio de año
    ['2028-02-29', 1], // martes, año bisiesto
  ])('%s → %i', (date, expected) => {
    expect(mondayIndex(date)).toBe(expected);
  });

  it('throws on an invalid date', () => {
    expect(() => mondayIndex('2026-02-30')).toThrow();
  });
});
