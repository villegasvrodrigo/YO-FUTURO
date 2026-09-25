import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/progreso' }));

const { ScreenLoading } = await import('./ScreenLoading');
const { default: InicioLoading } = await import('@/app/dashboard/loading');
const { default: ChatLoading } = await import('@/app/chat/loading');
const { default: ProgresoLoading } = await import('@/app/progreso/loading');
const { default: PerfilLoading } = await import('@/app/perfil/loading');

const escaped = (text: string) => renderToString(<>{text}</>);

describe('ScreenLoading', () => {
  it.each([
    ['inicio', 'Tus tareas de hoy'],
    ['chat', 'TU YO FUTURO'],
    ['progreso', 'Tu progreso'],
  ] as const)('the %s loading screen shows its title and soft blocks', (kind, title) => {
    const html = renderToString(<ScreenLoading kind={kind} />);

    expect(html).toContain(escaped(title));
    expect(html).toContain('animate-pulse');
  });

  it('says it is loading, for screen readers', () => {
    const html = renderToString(<ScreenLoading kind="perfil" />);

    expect(html).toContain('role="status"');
    expect(html).toContain(escaped('Cargando…'));
  });

  it('keeps the bottom bar in place, with the screen being opened highlighted', () => {
    const html = renderToString(<ScreenLoading kind="progreso" />);
    const progreso = html.slice(html.lastIndexOf('<a ', html.indexOf('Progreso</')), html.indexOf('Progreso</'));

    expect(html.match(/<nav/g)).toHaveLength(1);
    expect(progreso).toContain('text-brass');
  });

  it('on the server, never assumes the account can use the chat: Chat stays "Próximamente"', () => {
    const html = renderToString(<ScreenLoading kind="inicio" />);

    expect(html).not.toContain('href="/chat"');
  });

  it('each screen with the bar has its own loading screen', () => {
    expect(renderToString(<InicioLoading />)).toContain(escaped('Tus tareas de hoy'));
    expect(renderToString(<ChatLoading />)).toContain('TU YO FUTURO');
    expect(renderToString(<ProgresoLoading />)).toContain('Tu progreso');
    expect(renderToString(<PerfilLoading />)).toContain(escaped('Cargando…'));
  });
});
