import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MISSING_SECTION_COPY, ResultCard } from './ResultCard';

// renderToString escapes accents and quotes in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);
const TEXT = 'Hoy sientes ansiedad cada vez que revisas tu cuenta, pero ya nombraste el patrón.';

describe('ResultCard (server render)', () => {
  it('with content: shows it as a result, gold top line and serif italic text', () => {
    const html = renderToString(<ResultCard title="Tu energía actual" content={TEXT} />);

    expect(html).toContain('Tu energía actual');
    expect(html).toContain(escaped(TEXT));
    expect(html).toContain('border-brass-dim');
    expect(html).toContain('font-serif');
    expect(html).not.toContain(escaped(MISSING_SECTION_COPY));
  });

  it.each([
    ['null', null],
    ['an empty text', ''],
    ['only spaces', '   \n '],
  ])('with %s: keeps the title and shows the gentle notice, not styled as a result', (_label, content) => {
    const html = renderToString(<ResultCard title="El patrón que te detiene" content={content} />);

    expect(html).toContain('El patrón que te detiene');
    expect(html).toContain(escaped(MISSING_SECTION_COPY));
    expect(html).toContain('border-rule');
    expect(html).not.toContain('border-brass-dim');
    expect(html).not.toContain('font-serif');
    expect(html).toContain('text-sm leading-relaxed text-mist');
  });

  it('never shows the old technical error text', () => {
    const html = renderToString(<ResultCard title="Quién quieres ser" content={null} />);

    expect(html).not.toContain('No pudimos generar');
  });
});
