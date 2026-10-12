import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { InsightBrowser, MessageBrowser, PastTasks, TasksBrowser } from './DayBrowser';
import { CompletionRing } from './CompletionRing';
import { TasksProvider } from './TaskList';
import type { DailyTask } from '@/lib/types';

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

const todayTask = (position: number, completed: boolean): DailyTask => ({
  id: `t${position}`,
  user_id: 'u1',
  task_date: TODAY,
  position,
  description: `Tarea de hoy ${position}`,
  completed,
  completed_at: null,
  created_at: '',
});

describe('TasksBrowser (server render)', () => {
  const render = (tasks: DailyTask[]) =>
    renderToString(
      <TasksProvider initialTasks={tasks}>
        <CompletionRing />
        <TasksBrowser userId="u1" today={TODAY} />
      </TasksProvider>
    );

  it("starts on today's tasks: the usual title, hint and checkboxes, with its own arrows", () => {
    const html = render([todayTask(1, true), todayTask(2, false)]);

    expect(html).toContain('Tus tareas de hoy');
    expect(html).toContain('>12 oct<');
    expect(html).toContain('Toca una tarea cuando la completes.');
    expect(html.split('type="checkbox"').length - 1).toBe(2);
    expect(button(html, escaped('Tareas del día anterior'))).not.toContain('disabled=""');
    expect(button(html, escaped('Tareas del día siguiente'))).toContain('disabled=""');
    expect(html).not.toContain('Volver a hoy');
    expect(html).toContain('touch-pan-y');
  });

  it('the ring still counts only today', () => {
    const html = render([todayTask(1, true), todayTask(2, false)]);

    expect(html).toContain('50%');
  });

  it('with no tasks today yet, still starts on today with its usual message', () => {
    const html = render([]);

    expect(html).toContain('Tus tareas de hoy');
    expect(html).toContain(escaped('Tus tareas llegan con tu mensaje de hoy.'));
  });
});

describe('PastTasks (an earlier day, server render)', () => {
  const tasks = [
    { id: 'a', position: 1, description: 'Caminar', completed: true },
    { id: 'b', position: 2, description: 'Escribir', completed: false },
    { id: 'c', position: 3, description: 'Llamar', completed: true },
  ];

  it('is read only: no checkbox, no button, nothing to tap', () => {
    const html = renderToString(<PastTasks tasks={tasks} />);

    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<label');
  });

  it('completed ones crossed out with their ✓; the others plain with an empty box', () => {
    const html = renderToString(<PastTasks tasks={tasks} />);
    const row = (text: string) => html.match(new RegExp(`<li[^>]*>(?:(?!</li>).)*${text}(?:(?!</li>).)*</li>`))?.[0] ?? '';

    expect(row('Caminar')).toContain('line-through');
    expect(row('Caminar')).toContain('<svg');
    expect(row('Escribir')).not.toContain('line-through');
    expect(row('Escribir')).not.toContain('<svg');
    expect(html.split('Completada: ').length - 1).toBe(2);
    expect(html.split('Sin completar: ').length - 1).toBe(1);
  });

  it('says how many were completed', () => {
    expect(renderToString(<PastTasks tasks={tasks} />)).toContain('2 de 3 completadas');
  });
});
