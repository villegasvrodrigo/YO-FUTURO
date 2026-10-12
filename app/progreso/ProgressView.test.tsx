import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { buildProgress, type TaskProgressRow } from '@/lib/tasks/progress';
import { linksToHistory, monthTitle, NO_DATA_COPY, ProgressView } from './ProgressView';

const TODAY = '2026-09-22';

function day(date: string, done: number, total = 3): TaskProgressRow[] {
  return Array.from({ length: total }, (_, i) => ({ task_date: date, completed: i < done }));
}

const TASKS = [...day('2026-09-22', 0), ...day('2026-09-21', 2), ...day('2026-09-20', 1), ...day('2026-08-10', 3)];

// renderToString escapes quotes and accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);
const count = (html: string, needle: string) => html.split(needle).length - 1;
const render = (month?: string) => renderToString(<ProgressView progress={buildProgress(TASKS, TODAY, month)} />);

describe('ProgressView (server render)', () => {
  it('with no data: shows only the friendly message', () => {
    const html = renderToString(<ProgressView progress={null} />);

    expect(html).toContain(escaped(NO_DATA_COPY));
    expect(html).not.toContain('Racha actual');
    expect(html).not.toContain('role="grid"');
  });

  it('shows the three cards and no 30-day percentage', () => {
    const html = render();

    expect(html).toContain('>Racha actual</h2>');
    expect(html).toContain('>Mejor racha</h2>');
    expect(html).toContain(`>${escaped('Días cumplidos')}</h2>`);
    expect(html).not.toContain('Cumplimiento');
    expect(html).not.toContain('%');
  });

  it('shows the whole-history numbers in the cards', () => {
    const html = render();

    // Current streak 3 (Aug 10, Sep 20, Sep 21; today unchecked), best 3, fulfilled 3.
    expect(count(html, '>3</p>')).toBe(3);
  });

  it('says "día" for 1 and "días" otherwise', () => {
    const html = renderToString(<ProgressView progress={buildProgress(day(TODAY, 1), TODAY, undefined)} />);

    expect(count(html, `>${escaped('día')}</p>`)).toBe(3);
  });

  it('shows the month title and the weekdays, Monday first', () => {
    const html = render();

    expect(html).toContain('>Septiembre 2026</h2>');
    const headers = [...html.matchAll(/role="columnheader"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(headers).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    expect(html).toContain('title="lunes"');
    expect(html).toContain('title="domingo"');
  });

  it("draws one square per day of the month, with each day's number", () => {
    const html = render();

    // Days that lead to the history are drawn as a link inside the cell.
    expect(count(html, 'role="gridcell" aria-label=') + count(html, 'role="gridcell"><a')).toBe(30);
    expect(html).toContain('aria-label="21 sep: 2 de 3 tareas completadas. Ver ese día"');
    expect(html).toContain('aria-label="19 sep: sin tareas"');
    expect(html).toContain('aria-label="30 sep"');
  });

  it('frames today', () => {
    const html = render();
    const today = html.match(/<span role="gridcell" aria-label="Hoy, 22 sep[^"]*"[^>]*class="([^"]*)"/);

    expect(today).not.toBeNull();
    expect(today![1]).toContain('ring-2');
    expect(count(html, 'ring-offset-dusk-2')).toBe(2); // today + the "Hoy" legend sample
  });

  it('shows the legend with the five levels and today', () => {
    const html = render();

    for (const label of ['Sin tareas', '>0<', '>1<', '>2<', '>3<', 'tareas marcadas', 'Hoy']) {
      expect(html).toContain(label);
    }
  });

  it('on the current month: a back arrow to the previous month, no forward arrow', () => {
    const html = render();

    expect(html).toContain('href="/progreso?mes=2026-08"');
    expect(html).toContain('aria-label="Mes anterior: Agosto 2026"');
    expect(html).not.toContain('Mes siguiente');
  });

  it('on the first month with tasks: a forward arrow, no back arrow', () => {
    const html = render('2026-08');

    expect(html).toContain('>Agosto 2026</h2>');
    expect(html).toContain('href="/progreso?mes=2026-09"');
    expect(html).not.toContain('Mes anterior');
  });
});

describe('calendar days that lead to the history', () => {
  it('past days with tasks link to that day of the history, without prefetching', () => {
    const html = render();

    expect(html).toContain('href="/historial?dia=2026-09-21"');
    expect(html).toContain('href="/historial?dia=2026-09-20"');
    expect(count(html, 'href="/historial?dia=')).toBe(2);
  });

  it('past days with only a message or an insight link too', () => {
    const html = renderToString(
      <ProgressView progress={buildProgress(TASKS, TODAY, undefined)} historyDays={new Set(['2026-09-05', '2026-09-30'])} />
    );

    expect(html).toContain('href="/historial?dia=2026-09-05"');
    // Sep 30 is in the future: never a link.
    expect(html).not.toContain('href="/historial?dia=2026-09-30"');
  });

  it('today, future days, days with nothing and days of other months are not links', () => {
    const base = { day: 1, inMonth: true, isToday: false, isFuture: false, total: 0, done: 0 };
    const empty = new Set<string>();

    expect(linksToHistory({ ...base, date: '2026-09-22', isToday: true, total: 3 }, empty)).toBe(false);
    expect(linksToHistory({ ...base, date: '2026-09-23', isFuture: true }, new Set(['2026-09-23']))).toBe(false);
    expect(linksToHistory({ ...base, date: '2026-09-19' }, empty)).toBe(false);
    expect(linksToHistory({ ...base, date: '2026-09-19' }, undefined)).toBe(false);
    expect(linksToHistory({ ...base, date: '2026-08-31', inMonth: false, total: 3 }, empty)).toBe(false);
    expect(linksToHistory({ ...base, date: '2026-09-19', total: 3 }, undefined)).toBe(true);
    expect(linksToHistory({ ...base, date: '2026-09-19' }, new Set(['2026-09-19']))).toBe(true);
  });
});

describe('monthTitle', () => {
  it.each([
    ['2026-09', 'Septiembre 2026'],
    ['2027-01', 'Enero 2027'],
    ['2026-12', 'Diciembre 2026'],
  ])('%s → %s', (month, expected) => {
    expect(monthTitle(month)).toBe(expected);
  });
});
