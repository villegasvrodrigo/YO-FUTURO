import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// A tapped link whose screen is still loading: useLinkStatus reports it as pending.
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className: string; children: React.ReactNode }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: true }),
}));

const { BottomNav } = await import('./BottomNav');

describe('BottomNav while a tapped screen loads', () => {
  it('turns the tapped item gold at once', () => {
    const html = renderToString(<BottomNav chatEnabled />);
    const progreso = html.slice(html.lastIndexOf('<a ', html.indexOf('Progreso</')), html.indexOf('Progreso</'));

    expect(progreso).toMatch(/<span data-pending="true" class="[^"]*text-brass/);
  });
});
