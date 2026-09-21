import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { CompletionRing } from './CompletionRing';
import { TaskList, TaskListHint, TasksProvider, useDailyTasks } from './TaskList';
import type { DailyTask } from '@/lib/types';

function task(position: number, completed: boolean): DailyTask {
  return {
    id: `t${position}`,
    user_id: 'u1',
    task_date: '2026-09-21',
    position,
    description: `Tarea número ${position}`,
    completed,
    completed_at: completed ? '2026-09-21T15:00:00.000Z' : null,
    created_at: '2026-09-21T13:00:00.000Z',
  };
}

function render(tasks: DailyTask[]) {
  return renderToString(
    <TasksProvider initialTasks={tasks}>
      <CompletionRing />
      <TaskListHint />
      <TaskList />
    </TasksProvider>
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('TaskList + CompletionRing (server render)', () => {
  it('shows the 3 tasks in order, each with a checkbox', () => {
    const html = render([task(1, false), task(2, false), task(3, false)]);

    expect(count(html, 'type="checkbox"')).toBe(3);
    const at = (n: number) => html.indexOf(`Tarea número ${n}`);
    expect(at(1)).toBeGreaterThan(-1);
    expect(at(1)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(3));
  });

  it('renders already-completed tasks as checked', () => {
    const html = render([task(1, true), task(2, false), task(3, true)]);

    expect(count(html, 'checked=""')).toBe(2);
  });

  it.each([
    [[false, false, false], 0],
    [[true, false, false], 33],
    [[true, true, false], 67],
    [[true, true, true], 100],
  ])('the ring for %j reads %i%', (states, percent) => {
    const html = render(states.map((done, i) => task(i + 1, done)));

    expect(html).toContain(`aria-label="${percent}% del día completado"`);
  });

  it('with no tasks: shows the waiting message and a 0% ring', () => {
    const html = render([]);

    expect(html).toContain('Tus tareas llegan con tu mensaje de hoy.');
    expect(html).toContain('aria-label="0% del día completado"');
    expect(count(html, 'type="checkbox"')).toBe(0);
  });

  it('shows the short instruction when there are tasks', () => {
    const html = render([task(1, false), task(2, false), task(3, false)]);

    expect(html).toContain('Toca una tarea cuando la completes.');
  });

  it('does not show the instruction when there are no tasks', () => {
    expect(render([])).not.toContain('Toca una tarea');
  });

  it('makes the whole row (text included) part of the checkbox label', () => {
    const html = render([task(1, false)]);
    const label = html.slice(html.indexOf('<label'), html.indexOf('</label>'));

    expect(label).toContain('type="checkbox"');
    expect(label).toContain('Tarea número 1');
  });

  it('draws empty boxes with a visible soft-brass border, not the dark rule color', () => {
    const html = render([task(1, false)]);

    expect(html).toContain('border-brass/60');
    expect(html).not.toContain('border-rule bg-transparent');
  });

  it('does not show an error notice on first render', () => {
    expect(render([task(1, false), task(2, false), task(3, false)])).not.toContain('role="alert"');
  });

  it('useDailyTasks throws a clear error outside the provider', () => {
    function Orphan() {
      useDailyTasks();
      return null;
    }
    expect(() => renderToString(<Orphan />)).toThrow('dentro de <TasksProvider>');
  });
});
