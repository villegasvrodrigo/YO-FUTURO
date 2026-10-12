import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { InsightBrowser, MessageBrowser } from './DayBrowser';

const TODAY = '2026-10-12';

// renderToString escapes quotes and accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';

describe('MessageBrowser (server render)', () => {
  it("on today's message: the usual title and date, ‹ on and › off, no way back needed", () => {
    const html = renderToString(<MessageBrowser userId="u1" today={TODAY} initial={{ date: TODAY, content: 'Hola, hoy.' }} />);

    expect(html).toContain('Tu mensaje de hoy');
    expect(html).toContain('>12 oct<');
    expect(html).toContain('Hola, hoy.');
    expect(button(html, 'Mensaje anterior')).not.toContain('disabled=""');
    expect(button(html, 'Mensaje siguiente')).toContain('disabled=""');
    expect(html).not.toContain('Volver a hoy');
  });

  it('on a message of an earlier day, the title says which day', () => {
    const html = renderToString(<MessageBrowser userId="u1" today={TODAY} initial={{ date: '2026-10-09', content: 'El 9.' }} />);

    expect(html).toContain('Tu mensaje del 9 oct');
    expect(html).not.toContain('Tu mensaje de hoy');
  });

  it('the card can be swiped sideways and still scrolls the page vertically', () => {
    const html = renderToString(<MessageBrowser userId="u1" today={TODAY} initial={{ date: TODAY, content: 'Hola.' }} />);

    expect(html).toContain('touch-pan-y');
  });
});

describe('InsightBrowser (server render)', () => {
  it("shows the insight with its day once (not again inside the card), and its own arrows", () => {
    const content = 'Estás aprendiendo a sostener lo que empiezas.';
    const html = renderToString(<InsightBrowser userId="u1" today={TODAY} initial={{ date: TODAY, content }} />);

    expect(html).toContain(escaped(content));
    expect(html).toContain('Hoy · 12 oct');
    expect(html.split('<time').length - 1).toBe(1);
    expect(button(html, 'Insight anterior')).not.toContain('disabled=""');
    expect(button(html, 'Insight siguiente')).toContain('disabled=""');
    expect(html).not.toContain('Mensaje anterior');
  });

  it("an insight from an earlier day shows just its date", () => {
    const html = renderToString(<InsightBrowser userId="u1" today={TODAY} initial={{ date: '2026-10-11', content: 'Ayer.' }} />);

    expect(html).toContain('>11 oct<');
    expect(html).not.toContain('Hoy ·');
  });
});
