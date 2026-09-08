import { describe, it, expect } from 'vitest';
import { emptyStateCopy } from './emptyStateCopy';

describe('emptyStateCopy', () => {
  it('includes the delivery hour and timezone', () => {
    expect(emptyStateCopy(8, 'America/Mexico_City')).toBe(
      'Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a las 8:00 de America/Mexico_City.'
    );
  });
});
