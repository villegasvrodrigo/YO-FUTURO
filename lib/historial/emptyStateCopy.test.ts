import { describe, it, expect } from 'vitest';
import { emptyStateCopy } from './emptyStateCopy';

describe('emptyStateCopy', () => {
  it('includes the delivery hour and timezone', () => {
    expect(emptyStateCopy(8, 'America/Mexico_City')).toBe(
      'Tu yo futuro todavía no te ha escrito — tu primer mensaje llegará a las 8:00 de America/Mexico_City.'
    );
  });

  it('when the emails are paused: says the first message comes once they are resumed, with no hour', () => {
    const copy = emptyStateCopy(8, 'America/Mexico_City', true);

    expect(copy).toBe(
      'Tu yo futuro todavía no te ha escrito — tus correos están en pausa, así que tu primer mensaje llegará cuando los reanudes desde Perfil.'
    );
    expect(copy).not.toContain('8:00');
  });

  it('when not paused (false or not given): keeps the hour and timezone', () => {
    expect(emptyStateCopy(8, 'America/Mexico_City', false)).toContain('a las 8:00 de America/Mexico_City');
  });
});
