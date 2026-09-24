import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GoalList } from './GoalList';
import { GOAL_STATUS_FAILED } from '@/lib/perfil/goalStatus';
import type { Goal } from '@/lib/types';

const noop = () => {};
const goal = (id: string, status: Goal['status'], description = `Meta ${id}`): Goal => ({
  id,
  user_id: 'u1',
  description,
  status,
  created_at: '2026-09-01T00:00:00Z',
});

// renderToString escapes accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);
const render = (goals: Goal[], pendingId: string | null = null, error: { goalId: string; message: string } | null = null) =>
  renderToString(<GoalList goals={goals} pendingId={pendingId} error={error} onSetStatus={noop} />);

describe('GoalList (server render)', () => {
  it('an active goal offers "marcar lograda"', () => {
    const html = render([goal('g1', 'active')]);

    expect(html).toContain('>activa<');
    expect(html).toContain('marcar lograda');
    expect(html).not.toContain('reactivar');
  });

  it('an achieved goal offers "reactivar", so a mistaken tap never loses it', () => {
    const html = render([goal('g1', 'achieved')]);

    expect(html).toContain('>lograda<');
    expect(html).toContain('reactivar');
    expect(html).not.toContain('marcar lograda');
  });

  it('a paused goal can also be reactivated', () => {
    const html = render([goal('g1', 'paused')]);

    expect(html).toContain('>pausada<');
    expect(html).toContain('reactivar');
  });

  it('while a goal is being saved: that one says "guardando…" and every action waits', () => {
    const html = render([goal('g1', 'active'), goal('g2', 'achieved')], 'g1');

    expect(html).toContain('guardando…');
    expect(html).not.toContain('marcar lograda');
    expect(html).toContain('reactivar');
    expect((html.match(/<button[^>]*disabled/g) ?? []).length).toBe(2);
  });

  it('shows a failed save under that goal only', () => {
    const html = render(
      [goal('g1', 'active', 'Ahorrar'), goal('g2', 'active', 'Meditar')],
      null,
      { goalId: 'g2', message: GOAL_STATUS_FAILED }
    );

    expect(html).toContain(escaped(GOAL_STATUS_FAILED));
    expect(html.indexOf('Meditar')).toBeLessThan(html.indexOf('role="alert"'));
    expect(html.indexOf('Ahorrar')).toBeLessThan(html.indexOf('Meditar'));
    expect(html.split('role="alert"').length - 1).toBe(1);
  });

  it('shows no message when nothing failed', () => {
    expect(render([goal('g1', 'active')])).not.toContain('role="alert"');
  });
});
