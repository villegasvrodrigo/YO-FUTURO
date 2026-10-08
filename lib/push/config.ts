// The switch and keys of the push notifications, all in environment variables (Vercel and
// .env.local): PUSH_ENABLED ("true" to turn them on), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT (mailto:…). Off — or on but without both keys — nothing is shown or sent: no
// button in Perfil, no service worker, no notification from the cron.

/** Whether notifications are on: PUSH_ENABLED is "true" and both keys exist. */
export function pushEnabled(): boolean {
  return (
    process.env.PUSH_ENABLED?.trim().toLowerCase() === 'true' &&
    !!process.env.VAPID_PUBLIC_KEY?.trim() &&
    !!process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

export interface PushClientConfig {
  enabled: boolean;
  // The public key the phone needs to subscribe (it is not secret).
  publicKey: string;
}

/** The only thing the browser needs: whether it is on, and the public key. */
export function pushClientConfig(): PushClientConfig {
  return pushEnabled() ? { enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY!.trim() } : { enabled: false, publicKey: '' };
}

// The contact the push services see; also the privacy notice's address.
export const DEFAULT_VAPID_SUBJECT = 'mailto:contacto@villegasvrodrigo.com';
