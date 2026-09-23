import { describe, it, expect } from 'vitest';
import { HOUR_OPTIONS, hourLabel } from './hourLabel';

describe('hourLabel', () => {
  it.each([
    [0, '12:00 a. m. (medianoche)'],
    [1, '1:00 a. m.'],
    [8, '8:00 a. m.'],
    [11, '11:00 a. m.'],
    [12, '12:00 p. m. (mediodía)'],
    [13, '1:00 p. m.'],
    [20, '8:00 p. m.'],
    [23, '11:00 p. m.'],
  ])('%i → %s', (hour, expected) => {
    expect(hourLabel(hour)).toBe(expected);
  });
});

describe('HOUR_OPTIONS', () => {
  it('has the 24 hours in order, 0 to 23, each with its label', () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS.map((o) => o.value)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(HOUR_OPTIONS[8]).toEqual({ value: 8, label: '8:00 a. m.' });
  });

  it('has no repeated labels', () => {
    expect(new Set(HOUR_OPTIONS.map((o) => o.label)).size).toBe(24);
  });
});
