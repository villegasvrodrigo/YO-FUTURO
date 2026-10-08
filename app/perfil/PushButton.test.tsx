import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PushButtonView, PUSH_COPY, PUSH_FAILED } from './PushButton';

const escaped = (text: string) => renderToString(<>{text}</>);
const view = (status: Parameters<typeof PushButtonView>[0]['status'], extra: Partial<Parameters<typeof PushButtonView>[0]> = {}) =>
  renderToString(<PushButtonView status={status} busy={false} error={null} onEnable={() => {}} onDisable={() => {}} {...extra} />);

describe('PushButtonView (Perfil → Notificaciones)', () => {
  it('in the browser: asks to add the app to the home screen, without a button', () => {
    const html = view('navegador');

    expect(html).toContain(escaped(PUSH_COPY.navegador));
    expect(html).not.toContain('<button');
  });

  it('in the installed app: "Activar notificaciones"', () => {
    expect(view('inactivo')).toContain('>Activar notificaciones</button>');
  });

  it('once on: "Desactivar notificaciones"', () => {
    const html = view('activo');

    expect(html).toContain(escaped(PUSH_COPY.activo));
    expect(html).toContain('>Desactivar notificaciones</button>');
  });

  it('blocked or unsupported: explains it, without a button', () => {
    expect(view('bloqueado')).not.toContain('<button');
    expect(view('no-soportado')).not.toContain('<button');
  });

  it('while working the button waits, and a failure shows a kind notice', () => {
    expect(view('inactivo', { busy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Un momento…<\/button>/);
    expect(view('inactivo', { error: PUSH_FAILED })).toContain(escaped(PUSH_FAILED));
  });
});
