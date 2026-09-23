import { describe, it, expect } from 'vitest';
import { DEFAULT_DELIVERY_HOUR, initialDeliveryHour } from './deliveryHour';

describe('initialDeliveryHour', () => {
  it('defaults to 8', () => {
    expect(DEFAULT_DELIVERY_HOUR).toBe(8);
  });

  it.each([0, 1, 8, 12, 20, 23])('keeps the valid hour %i', (hour) => {
    expect(initialDeliveryHour(hour)).toBe(hour);
  });

  it.each([
    ['no hour (null)', null],
    ['undefined', undefined],
    ['24', 24],
    ['25', 25],
    ['-1', -1],
    ['7.5', 7.5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a string "8"', '8'],
    ['an empty string', ''],
    ['an object', {}],
  ])('uses 8 for %s', (_label, proposed) => {
    expect(initialDeliveryHour(proposed)).toBe(DEFAULT_DELIVERY_HOUR);
  });
});
