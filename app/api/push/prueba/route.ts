import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_VAPID_SUBJECT, pushEnabled } from '@/lib/push/config';
import { effectiveTimezone, localToday } from '@/lib/daily/today';
import { nextTestPushRecord, TEST_PUSH_LIMIT, testPushesSentToday, testPushPayload } from './limit';

// What Perfil gets back. Never technical details.
export type TestPushStatus = 'enviado' | 'limite' | 'sin-telefono' | 'error';

const answer = (status: TestPushStatus, code: number) => NextResponse.json({ status }, { status: code });

/**
 * POST /api/push/prueba: Perfil's "Enviar aviso de prueba". Sends one test notice only to the
 * signed-in person's own phones, at most TEST_PUSH_LIMIT per person per local day. It only
 * reads the database (the person's name, time zone and phones): it never changes or deletes a
 * phone, and it doesn't touch the cron, the email or the day's message.
 */
export async function POST() {
  if (!pushEnabled()) return answer('error', 404);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return answer('error', 401);

  try {
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('name, timezone').eq('id', user.id).maybeSingle();
    const { name, timezone } = (profile as { name?: string | null; timezone?: string | null } | null) ?? {};
    const today = localToday(new Date(), effectiveTimezone(timezone));

    const sent = testPushesSentToday(user.app_metadata, today);
    if (sent >= TEST_PUSH_LIMIT) return answer('limite', 429);

    const { data: phones, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user.id);
    if (error) throw new Error(`No se pudieron leer los teléfonos: ${error.message}`);
    const rows = (phones as { endpoint: string; p256dh: string; auth: string }[] | null) ?? [];
    if (rows.length === 0) return answer('sin-telefono', 409);

    // Counted before sending, so tapping many times at once can't go past the limit. If it
    // can't be counted, nothing is sent.
    const { error: countError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: nextTestPushRecord(sent, today),
    });
    if (countError) throw new Error(`No se pudo contar el aviso de prueba: ${countError.message}`);

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    const body = JSON.stringify(testPushPayload(name));
    const results = await Promise.allSettled(
      rows.map((row) =>
        webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, body, {
          TTL: 600,
          urgency: 'high',
        })
      )
    );
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`[push] aviso de prueba no enviado: estado=${(r.reason as { statusCode?: number })?.statusCode ?? '-'}`);
      }
    }
    return delivered > 0 ? answer('enviado', 200) : answer('error', 502);
  } catch (err) {
    console.error(`[push] aviso de prueba: ${err instanceof Error ? err.message : 'error desconocido'}`);
    return answer('error', 500);
  }
}
