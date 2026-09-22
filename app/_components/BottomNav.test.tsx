import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

let pathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { BottomNav } = await import('./BottomNav');

// The opening tag of the nav item whose label is `label` (link or button).
function itemTag(html: string, label: string): string {
  const end = html.indexOf(`${label}</`);
  const start = Math.max(html.lastIndexOf('<a ', end), html.lastIndexOf('<button', end));
  return html.slice(start, html.indexOf('>', start) + 1);
}

describe('BottomNav', () => {
  it('Progreso is a real link to /progreso', () => {
    const html = renderToString(<BottomNav />);
    expect(itemTag(html, 'Progreso')).toContain('href="/progreso"');
  });

  it('Chat is still a button (the "Próximamente" notice), not a link', () => {
    const html = renderToString(<BottomNav />);
    const chat = itemTag(html, 'Chat');
    expect(chat.startsWith('<button')).toBe(true);
    expect(chat).not.toContain('href=');
  });

  it.each([
    ['/dashboard', 'Inicio'],
    ['/progreso', 'Progreso'],
    ['/perfil', 'Perfil'],
  ])('on %s only %s is highlighted', (path, label) => {
    pathname = path;
    const html = renderToString(<BottomNav />);
    for (const other of ['Inicio', 'Progreso', 'Perfil']) {
      expect(itemTag(html, other).includes('text-brass')).toBe(other === label);
    }
  });
});
