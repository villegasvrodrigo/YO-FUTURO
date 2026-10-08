import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PushButtonView, PUSH_COPY, PUSH_FAILED, TEST_PUSH_COPY } from './PushButton';
import { sendTestPush } from './push';

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

describe('"Enviar aviso de prueba"', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('appears only once notifications are on in this phone', () => {
    expect(view('activo')).toContain('>Enviar aviso de prueba</button>');
    for (const status of ['inactivo', 'navegador', 'bloqueado', 'no-soportado', 'cargando'] as const) {
      expect(view(status)).not.toContain('Enviar aviso de prueba');
    }
  });

  it('waits while sending, and shows the result next to the button', () => {
    expect(view('activo', { testBusy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Enviando…<\/button>/);
    expect(view('activo', { testResult: 'enviado' })).toContain(escaped(TEST_PUSH_COPY.enviado));
    expect(view('activo', { testResult: 'limite' })).toContain(escaped(TEST_PUSH_COPY.limite));
    expect(view('activo', { testResult: 'error' })).toContain(escaped(TEST_PUSH_COPY.error));
  });

  it('turns the server answer into a kind result, never a crash', async () => {
    const answer = (status: number) => vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));

    answer(200);
    expect(await sendTestPush()).toBe('enviado');
    answer(429);
    expect(await sendTestPush()).toBe('limite');
    answer(502);
    expect(await sendTestPush()).toBe('error');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    expect(await sendTestPush()).toBe('error');
  });
});
