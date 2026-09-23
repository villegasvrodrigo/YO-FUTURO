import { describe, it, expect } from 'vitest';
import { dailySubject, FALLBACK_SUBJECT } from './subject';

const MX = 'America/Mexico_City';

describe('dailySubject', () => {
  it('has the local date, weekday first, in Spanish', () => {
    // 2026-09-23 14:00 UTC = 8:00 a.m. on Wednesday Sep 23 in Mexico City.
    expect(dailySubject(new Date('2026-09-23T14:00:00Z'), MX)).toBe('Tu mensaje de hoy · miércoles 23 de septiembre');
  });

  it.each([
    ['2026-09-21T14:00:00Z', 'lunes 21 de septiembre'],
    ['2026-09-26T14:00:00Z', 'sábado 26 de septiembre'],
    ['2026-09-27T14:00:00Z', 'domingo 27 de septiembre'],
    ['2026-10-01T14:00:00Z', 'jueves 1 de octubre'],
    ['2027-01-01T14:00:00Z', 'viernes 1 de enero'],
    ['2028-02-29T14:00:00Z', 'martes 29 de febrero'],
  ])('%s → "… · %s"', (instant, date) => {
    expect(dailySubject(new Date(instant), MX)).toBe(`Tu mensaje de hoy · ${date}`);
  });

  it("uses each person's time zone, not UTC", () => {
    // 2026-09-24 03:00 UTC: still Wednesday night in Mexico City, already Thursday in Madrid.
    const instant = new Date('2026-09-24T03:00:00Z');
    expect(dailySubject(instant, MX)).toBe('Tu mensaje de hoy · miércoles 23 de septiembre');
    expect(dailySubject(instant, 'Europe/Madrid')).toBe('Tu mensaje de hoy · jueves 24 de septiembre');
  });

  it('is different on different days, so emails are not stacked into one conversation', () => {
    const monday = dailySubject(new Date('2026-09-21T14:00:00Z'), MX);
    const tuesday = dailySubject(new Date('2026-09-22T14:00:00Z'), MX);
    expect(monday).not.toBe(tuesday);
  });

  it('falls back to the old fixed subject with an invalid time zone, without throwing', () => {
    expect(dailySubject(new Date('2026-09-23T14:00:00Z'), 'No/Existe')).toBe(FALLBACK_SUBJECT);
    expect(dailySubject(new Date('no es fecha'), MX)).toBe(FALLBACK_SUBJECT);
  });
});
