// Push notifications in the browser (from Segunda Naturaleza). The service worker is only
// registered when the person taps "Activar notificaciones", and only in the installed app.
const SW_URL = '/sw.js';

/** Whether the app is open from the home screen (not in a browser tab). */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export type PushStatus = 'cargando' | 'navegador' | 'no-soportado' | 'bloqueado' | 'activo' | 'inactivo';

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

/** Where this phone stands. On iPhone, Safari only offers push in the installed app. */
export async function pushStatus(): Promise<PushStatus> {
  if (!isStandalone()) return 'navegador';
  if (!pushSupported()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

const base64UrlToBytes = (b64: string) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

/** Asks for permission (only on a tap), registers the service worker, subscribes and saves it. */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'bloqueado' : 'inactivo';
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  const res = await fetch('/api/push/suscripcion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error(`No se pudo guardar el teléfono (${res.status})`);
  return 'activo';
}

/** Turns them off on this phone: unsubscribes and removes it from the server. */
export async function disablePush(): Promise<PushStatus> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await fetch('/api/push/suscripcion', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return 'inactivo';
}

export type TestPushResult = 'enviado' | 'limite' | 'error';

/** Perfil's "Enviar aviso de prueba": asks the server to send one to this person's phones. */
export async function sendTestPush(): Promise<TestPushResult> {
  try {
    const res = await fetch('/api/push/prueba', { method: 'POST' });
    if (res.ok) return 'enviado';
    return res.status === 429 ? 'limite' : 'error';
  } catch {
    return 'error';
  }
}
