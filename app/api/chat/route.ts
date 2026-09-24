import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isChatEnabledFor } from '@/lib/chat/access';
import { createChatStore } from './store';
import { sendChatMessage, CHAT_ERRORS } from './sendMessage';

// The reply call allows 25 s plus one retry; this leaves room for the reads and the save.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Before anything else: other accounts never reach the AI or the database.
  if (!isChatEnabledFor(user.id)) {
    return NextResponse.json(
      { error: 'El chat todavía no está disponible.', code: 'not_available' },
      { status: 403 }
    );
  }

  let message: unknown;
  try {
    message = (await request.json())?.message;
  } catch {
    // Malformed JSON body: sendChatMessage rejects the missing message.
    message = undefined;
  }

  let store;
  try {
    store = createChatStore(createAdminClient());
  } catch (err) {
    console.error(`[chat] sin cliente de base de datos: ${err instanceof Error ? err.message : 'error desconocido'}`);
    return NextResponse.json({ error: CHAT_ERRORS.unavailable, code: 'unavailable' }, { status: 500 });
  }

  const result = await sendChatMessage({ userId: user.id, message, now: new Date(), store });
  return NextResponse.json(result.body, { status: result.status });
}
