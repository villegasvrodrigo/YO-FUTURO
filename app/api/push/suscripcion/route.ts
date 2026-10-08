import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushEnabled } from '@/lib/push/config';

// This phone's push subscription. POST saves it (or moves it to this account if the phone was
// on another one) and DELETE removes it. Only with a session and with notifications on. One row
// per phone (endpoint is unique). Written with the admin client: people can only read theirs.

const validText = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length < 2000;

async function sessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: NextRequest) {
  if (!pushEnabled()) return NextResponse.json({ error: 'apagado' }, { status: 404 });
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'sin-sesion' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint } = body;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!validText(endpoint) || !/^https:\/\//.test(endpoint) || !validText(p256dh) || !validText(auth)) {
    return NextResponse.json({ error: 'suscripcion' }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert(
      { endpoint, p256dh, auth, user_id: userId, user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) },
      { onConflict: 'endpoint' }
    );
  if (error) {
    console.error(`[push] no se pudo guardar el teléfono: ${error.message}`);
    return NextResponse.json({ error: 'guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: 'sin-sesion' }, { status: 401 });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  if (!validText(endpoint)) return NextResponse.json({ error: 'suscripcion' }, { status: 400 });

  await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
  return NextResponse.json({ ok: true });
}
