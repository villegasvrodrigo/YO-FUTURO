import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DailyMessage, PausedNotice } from './DailyMessage';

const MESSAGE = { content: 'Hoy diste un paso más.' };

describe('DailyMessage (server render)', () => {
  it("for today's message: says today, with its date", () => {
    const html = renderToString(<DailyMessage message={MESSAGE} day={{ date: '2026-09-23', isToday: true }} />);

    expect(html).toContain('>Tu mensaje de hoy<');
    expect(html).toContain('>23 sep<');
    expect(html).toContain('>Generado hoy<');
    expect(html).toContain(MESSAGE.content);
  });

  it('for an older message: does not claim today and says its date', () => {
    const html = renderToString(<DailyMessage message={MESSAGE} day={{ date: '2026-09-22', isToday: false }} />);

    expect(html).toContain('>Tu último mensaje<');
    expect(html).toContain('>Generado el 22 sep<');
    expect(html).not.toContain('de hoy');
    expect(html).not.toContain('Generado hoy');
  });

  it('with no known day (no valid time zone): shows the message without claiming a date', () => {
    const html = renderToString(<DailyMessage message={MESSAGE} day={null} />);

    expect(html).toContain('>Tu último mensaje<');
    expect(html).toContain(MESSAGE.content);
    expect(html).not.toContain('Generado');
    expect(html).not.toContain('<time');
  });

  it('never shows the model name', () => {
    for (const day of [{ date: '2026-09-23', isToday: true }, { date: '2026-09-22', isToday: false }, null]) {
      const html = renderToString(<DailyMessage message={MESSAGE} day={day} />);
      expect(html).not.toContain('claude');
      expect(html).not.toContain('sonnet');
    }
  });

  it('with no message yet: keeps the friendly waiting text', () => {
    const html = renderToString(<DailyMessage message={null} day={null} />);

    expect(html).toContain('todavía no te ha escrito');
    expect(html).not.toContain('Generado');
  });
});

describe('PausedNotice', () => {
  it('says the emails are paused and links to Perfil to resume them', () => {
    const html = renderToString(<PausedNotice />);

    expect(html).toContain('Tus correos diarios están en pausa.');
    expect(html).toContain('href="/perfil"');
    expect(html).toContain('Reanúdalos en Perfil');
  });
});
