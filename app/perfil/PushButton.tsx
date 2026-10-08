'use client';

import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushStatus, sendTestPush, type PushStatus, type TestPushResult } from './push';

export const PUSH_COPY: Record<Exclude<PushStatus, 'cargando'>, string> = {
  navegador: 'Agrega la app a tu pantalla de inicio para recibir notificaciones.',
  'no-soportado': 'Este teléfono no puede recibir notificaciones de la app.',
  bloqueado: 'Bloqueaste las notificaciones. Puedes permitirlas en los ajustes de tu teléfono.',
  activo: 'Recibes un aviso cuando tu yo futuro te escribe.',
  inactivo: 'Recibe un aviso cuando tu yo futuro te escribe.',
};
export const PUSH_FAILED = 'No se pudieron activar. Inténtalo de nuevo.';
export const TEST_PUSH_COPY: Record<TestPushResult, string> = {
  enviado: 'Listo. En unos segundos debería llegar a tu teléfono.',
  limite: 'Ya enviaste los 5 avisos de prueba de hoy. Puedes probar de nuevo mañana.',
  error: 'No se pudo enviar el aviso de prueba. Inténtalo de nuevo en un momento.',
};

/** What the Notificaciones section shows (no state: tested on its own). */
export function PushButtonView({
  status,
  busy,
  error,
  onEnable,
  onDisable,
  testBusy = false,
  testResult = null,
  onTest = () => {},
}: {
  status: PushStatus;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  testBusy?: boolean;
  testResult?: TestPushResult | null;
  onTest?: () => void;
}) {
  return (
    <section className="mt-8 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-7">
      <h2 className="mb-3 font-serif text-xl text-parchment">Notificaciones</h2>
      {status === 'cargando' ? null : <p className="text-sm leading-relaxed text-mist">{PUSH_COPY[status]}</p>}
      {(status === 'inactivo' || status === 'activo') && (
        <button
          type="button"
          onClick={status === 'activo' ? onDisable : onEnable}
          disabled={busy}
          className={
            status === 'activo'
              ? 'mt-4 rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60 disabled:opacity-50'
              : 'mt-4 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50'
          }
        >
          {busy ? 'Un momento…' : status === 'activo' ? 'Desactivar notificaciones' : 'Activar notificaciones'}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {/* Only once this phone has them on: a test notice to the person's own phones. */}
      {status === 'activo' && (
        <div className="mt-6 border-t border-rule pt-5">
          <button
            type="button"
            onClick={onTest}
            disabled={testBusy || busy}
            className="rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60 disabled:opacity-50"
          >
            {testBusy ? 'Enviando…' : 'Enviar aviso de prueba'}
          </button>
          {testResult && (
            <p
              role={testResult === 'enviado' ? 'status' : 'alert'}
              className={`mt-3 text-sm ${testResult === 'enviado' ? 'text-mist' : 'text-danger'}`}
            >
              {TEST_PUSH_COPY[testResult]}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Perfil's Notificaciones section. Perfil only shows it when notifications are on
 * (PUSH_ENABLED with its keys). The permission is asked only when the button is tapped.
 */
export function PushButton({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<PushStatus>('cargando');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestPushResult | null>(null);

  useEffect(() => {
    pushStatus()
      .then(setStatus)
      .catch(() => setStatus('no-soportado'));
  }, []);

  async function run(action: () => Promise<PushStatus>) {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch {
      setError(PUSH_FAILED);
    }
    setBusy(false);
  }

  async function test() {
    setTestBusy(true);
    setTestResult(null);
    setTestResult(await sendTestPush());
    setTestBusy(false);
  }

  return (
    <PushButtonView
      status={status}
      busy={busy}
      error={error}
      onEnable={() => run(() => enablePush(publicKey))}
      onDisable={() => {
        setTestResult(null);
        run(disablePush);
      }}
      testBusy={testBusy}
      testResult={testResult}
      onTest={test}
    />
  );
}
