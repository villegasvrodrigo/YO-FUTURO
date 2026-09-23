import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DailyInsight, NO_INSIGHT_COPY, shortInsightDate } from './DailyInsight';

const INSIGHT = {
  insightDate: '2026-09-23',
  content: 'Estás aprendiendo que tu esfuerzo no necesita pruebas inmediatas para ser real.',
};

// renderToString escapes accents and quotes in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);

describe('DailyInsight (server render)', () => {
  it('shows the insight text with its date', () => {
    const html = renderToString(<DailyInsight insight={INSIGHT} />);

    expect(html).toContain(escaped(INSIGHT.content));
    expect(html).toContain('>23 sep<');
    expect(html).toContain('dateTime="2026-09-23"');
    expect(html).not.toContain(escaped(NO_INSIGHT_COPY));
  });

  it('shows the friendly message when there is no insight', () => {
    const html = renderToString(<DailyInsight insight={null} />);

    expect(html).toContain(escaped(NO_INSIGHT_COPY));
    expect(html).not.toContain('<time');
  });

  it('never shows the old placeholder text', () => {
    for (const insight of [INSIGHT, null]) {
      expect(renderToString(<DailyInsight insight={insight} />)).not.toContain('Pronto verás aquí');
    }
  });
});

describe('shortInsightDate', () => {
  it.each([
    ['2026-09-23', '23 sep'],
    ['2026-01-05', '5 ene'],
    ['2026-12-31', '31 dic'],
    ['2028-02-29', '29 feb'],
  ])('%s → %s', (date, expected) => {
    expect(shortInsightDate(date)).toBe(expected);
  });

  it.each(['', '23/09/2026', '2026-13-01', 'hoy'])('is empty for the unexpected value %j', (bad) => {
    expect(shortInsightDate(bad)).toBe('');
  });
});
