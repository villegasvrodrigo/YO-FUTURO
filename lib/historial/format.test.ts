import { describe, it, expect } from 'vitest';
import { completedSummary, historyHref, longDayTitle } from './format';

describe('longDayTitle', () => {
  it.each([
    ['2026-10-11', 'Domingo, 11 oct 2026'],
    ['2026-10-12', 'Lunes, 12 oct 2026'],
    ['2026-01-07', 'Miércoles, 7 ene 2026'],
    ['2026-02-31', ''],
    ['nada', ''],
  ])('%s → "%s"', (date, expected) => {
    expect(longDayTitle(date)).toBe(expected);
  });
});

describe('completedSummary', () => {
  it.each([
    [2, 3, '2 de 3 completadas'],
    [0, 3, '0 de 3 completadas'],
    [1, 1, '1 de 1 completada'],
  ])('%i of %i → "%s"', (done, total, expected) => {
    expect(completedSummary(done, total)).toBe(expected);
  });
});

describe('historyHref', () => {
  it('points to that day of the history', () => {
    expect(historyHref('2026-10-11')).toBe('/historial?dia=2026-10-11');
  });
});
