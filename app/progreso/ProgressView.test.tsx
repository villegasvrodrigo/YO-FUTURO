import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { buildProgress, GRID_DAYS, type TaskProgressRow } from '@/lib/tasks/progress';
import { NO_DATA_COPY, ProgressView } from './ProgressView';

const TODAY = '2026-09-22';

function day(date: string, done: number, total = 3): TaskProgressRow[] {
  return Array.from({ length: total }, (_, i) => ({ task_date: date, completed: i < done }));
}

// renderToString escapes quotes and accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('ProgressView (server render)', () => {
  it('with no data: shows only the friendly message', () => {
    const html = renderToString(<ProgressView progress={null} />);

    expect(html).toContain(escaped(NO_DATA_COPY));
    expect(html).not.toContain('Racha actual');
    expect(html).not.toContain('Cumplimiento');
    expect(count(html, 'role="img"')).toBe(0);
  });

  it('shows the streak, the completion and one dot per day of the grid', () => {
    const tasks = [...day('2026-09-22', 0), ...day('2026-09-21', 2), ...day('2026-09-20', 1)];
    const html = renderToString(<ProgressView progress={buildProgress(tasks, TODAY)} />);

    expect(html).toContain('Racha actual');
    expect(html).toMatch(/>2<\/p>/);
    expect(html).toContain('días seguidos');
    expect(html).toContain('33%');
    expect(count(html, 'role="img"')).toBe(GRID_DAYS);
  });

  it('says "día seguido" (singular) for a streak of 1', () => {
    const html = renderToString(<ProgressView progress={buildProgress(day(TODAY, 1), TODAY)} />);
    expect(html).toMatch(/>1<\/p>/);
    expect(html).toContain('>día seguido<');
    expect(html).not.toContain('seguidos');
  });

  it('says "días seguidos" (plural) for a streak of 0', () => {
    const html = renderToString(<ProgressView progress={buildProgress(day(TODAY, 0), TODAY)} />);
    expect(html).toMatch(/>0<\/p>/);
    expect(html).toContain('>días seguidos<');
  });

  it('labels each dot with its date and how many tasks were checked, and marks today', () => {
    const tasks = [...day('2026-09-21', 2), ...day('2026-09-22', 0)];
    const html = renderToString(<ProgressView progress={buildProgress(tasks, TODAY)} />);

    expect(html).toContain('2 de 3 tareas completadas');
    expect(html).toContain('Hoy, 22');
    expect(html).toContain('sin tareas');
  });

  it('shows a dash instead of 0% when there were no tasks in the last 30 days', () => {
    // Tasks 40 days ago still give data to the screen, but not to the 30-day figures.
    const html = renderToString(<ProgressView progress={buildProgress(day('2026-08-13', 3), TODAY)} />);

    expect(html).toContain('—');
    expect(html).toContain('sin tareas en 30 días');
    expect(html).not.toContain('0%');
  });
});
