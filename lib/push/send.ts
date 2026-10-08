import webpush from 'web-push';
import type { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_VAPID_SUBJECT, pushEnabled } from './config';

type AdminClient = ReturnType<typeof createAdminClient>;

/** What the service worker shows: the title, the line, the page it opens and its tag. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * The daily notice, right after the email: "{Nombre}, tu yo futuro te escribió". Never the
 * message itself (it shows on the lock screen). Tapping it opens Inicio.
 */
export function dailyPushPayload(name: string | null | undefined): PushPayload {
  const first = name?.trim();
  return {
    title: 'Yo Futuro',
    body: first ? `${first}, tu yo futuro te escribió` : 'Tu yo futuro te escribió',
    url: '/dashboard',
    tag: 'mensaje-del-dia',
  };
}

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSender = (subscription: Subscription, body: string) => Promise<unknown>;

const defaultSender: PushSender = (subscription, body) => {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
  // TTL: if the phone is off, the push service keeps it 6 hours at most.
  return webpush.sendNotification(subscription, body, { TTL: 6 * 3600, urgency: 'normal' });
};

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

/**
 * Sends `payload` to every phone of the person. Never throws, so it can never make the email
 * fail: with notifications off (or without keys) it does nothing; a phone that is no longer
 * subscribed (404/410) is deleted; any other failure is only logged (no personal data).
 */
export async function sendPushToUser(
  admin: AdminClient,
  userId: string,
  payload: PushPayload,
  send: PushSender = defaultSender
): Promise<PushResult> {
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  if (!pushEnabled()) return result;
  try {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = (data as { id: string; endpoint: string; p256dh: string; auth: string }[] | null) ?? [];
    await Promise.all(
      rows.map(async (row) => {
        try {
          await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload));
          result.sent++;
          await admin.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', row.id);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            result.removed++;
            await admin.from('push_subscriptions').delete().eq('id', row.id);
          } else {
            result.failed++;
            console.error(`[push] no se pudo mandar el aviso: estado=${status ?? '-'}`);
          }
        }
      })
    );
  } catch (err) {
    result.failed++;
    console.error(`[push] no se pudieron leer los teléfonos: ${err instanceof Error ? err.message : 'error desconocido'}`);
  }
  return result;
}
