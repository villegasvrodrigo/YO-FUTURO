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
    for (const html of [renderToString(<BottomNav />), renderToString(<BottomNav chatEnabled={false} />)]) {
      const chat = itemTag(html, 'Chat');
      expect(chat.startsWith('<button')).toBe(true);
      expect(chat).not.toContain('href=');
    }
  });

  it('for an account that can use the chat, Chat is a link to /chat, highlighted there', () => {
    pathname = '/dashboard';
    expect(itemTag(renderToString(<BottomNav chatEnabled />), 'Chat')).toContain('href="/chat"');
    expect(itemTag(renderToString(<BottomNav chatEnabled />), 'Chat')).not.toContain('text-brass');

    pathname = '/chat';
    const html = renderToString(<BottomNav chatEnabled />);
    expect(itemTag(html, 'Chat')).toContain('text-brass');
    expect(itemTag(html, 'Inicio')).not.toContain('text-brass');
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

  it('shows normally unless it is asked to hide', () => {
    const navTag = (html: string) => html.slice(html.indexOf('<nav'), html.indexOf('>', html.indexOf('<nav')) + 1);

    const shown = navTag(renderToString(<BottomNav chatEnabled />));
    expect(shown).not.toContain('hidden');
    expect(shown).toMatch(/class="[^"]*\bflex\b/);

    const hidden = navTag(renderToString(<BottomNav chatEnabled hidden />));
    expect(hidden).toContain('hidden=""');
    expect(hidden).toMatch(/class="[^"]*\bhidden\b/);
    expect(hidden).not.toMatch(/class="[^"]*\bflex\b/);
  });
});
