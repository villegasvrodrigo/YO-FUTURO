import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/historial', useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

const { DayView, LOAD_FAILED_COPY, NO_INSIGHT_COPY, NO_MESSAGE_COPY, NO_TASKS_COPY } = await import('./DayView');

const TODAY = '2026-10-12';
const FULL = {
  message: 'Hoy elegiste lo difícil.',
  tasks: [
    { id: 't1', position: 1, description: 'Caminar 20 minutos', completed: true },
    { id: 't2', position: 2, description: 'Escribir una página', completed: false },
    { id: 't3', position: 3, description: 'Llamar a mamá', completed: true },
  ],
  insight: 'Estás aprendiendo a sostener lo que empiezas.',
};

// renderToString escapes quotes and accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);

const render = (props: Partial<Parameters<typeof DayView>[0]> = {}) =>
  renderToString(<DayView date="2026-10-11" today={TODAY} content={FULL} prev="2026-10-09" next={TODAY} {...props} />);

describe('DayView (server render)', () => {
  it("shows the day's title, message, tasks and insight", () => {
    const html = render();

    expect(html).toContain('dateTime="2026-10-11"');
    expect(html).toContain('Domingo, 11 oct 2026');
    expect(html).toContain(escaped(FULL.message));
    for (const t of FULL.tasks) expect(html).toContain(escaped(t.description));
    expect(html).toContain(escaped(FULL.insight));
    expect(html).toContain('2 de 3 completadas');
  });

  it('shows the tasks read only: no checkbox, no button, the state is said for screen readers', () => {
    const html = render();

    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('Toca una tarea');
    expect(html.split('Completada: ').length - 1).toBe(2);
    expect(html.split('Sin completar: ').length - 1).toBe(1);
  });

  it('has arrows to the previous and next days with something', () => {
    const html = render();

    expect(html).toContain('href="/historial?dia=2026-10-09"');
    expect(html).toContain('aria-label="Día anterior: Viernes, 9 oct 2026"');
    expect(html).toContain('href="/historial?dia=2026-10-12"');
    expect(html).toContain('aria-label="Día siguiente: Lunes, 12 oct 2026"');
  });

  it('hides an arrow at the ends', () => {
    const html = render({ prev: null, next: null });

    expect(html).not.toContain('Día anterior');
    expect(html).not.toContain('Día siguiente');
  });

  it('has a date picker up to today that sends ?dia=, with 16 px text so the iPhone does not zoom', () => {
    const html = render();

    expect(html).toMatch(/<form[^>]*action="\/historial"/);
    const input = html.match(/<input[^>]*type="date"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('name="dia"');
    expect(input).toContain('max="2026-10-12"');
    expect(input).toContain('value="2026-10-11"');
    expect(input).toContain('text-base');
  });

  it('says so when a part of the day is missing', () => {
    const html = render({ content: { message: null, tasks: [], insight: null } });

    expect(html).toContain(escaped(NO_MESSAGE_COPY));
    expect(html).toContain(escaped(NO_TASKS_COPY));
    expect(html).toContain(escaped(NO_INSIGHT_COPY));
    expect(html).not.toContain('completadas');
  });

  it('marks today and points to Inicio to check its tasks', () => {
    const html = render({ date: TODAY, next: null });

    expect(html).toContain('Hoy · Lunes, 12 oct 2026');
    expect(html).toContain('href="/dashboard"');
  });

  it('shows only a notice when the day could not be read', () => {
    const html = render({ content: null });

    expect(html).toContain(escaped(LOAD_FAILED_COPY));
    expect(html).not.toContain('Daily insight');
  });
});
