import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isChatEnabledFor } from '@/lib/chat/access';
import { assertValidDate } from '@/lib/tasks/dates';
import { readEarlierDays } from './readHistory';

/**
 * GET /api/chat/history?before=YYYY-MM-DD: the 7 days with a conversation right before that
 * date (see readEarlierDays). Only reads, with the person's own session, so it can only ever
 * return their own conversations. The yo futuro's memory doesn't use this at all.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (!isChatEnabledFor(user.id)) {
    return NextResponse.json(
      { error: 'El chat todavía no está disponible.', code: 'not_available' },
      { status: 403 }
    );
  }

  const before = request.nextUrl.searchParams.get('before') ?? '';
  try {
    assertValidDate(before);
  } catch {
    return NextResponse.json({ error: 'Fecha inválida.', code: 'invalid_date' }, { status: 400 });
  }

  try {
    return NextResponse.json(await readEarlierDays(supabase, user.id, before));
  } catch (err) {
    // Only the error's own text: never message content or personal data.
    console.error(`[chat-historial] no se pudo leer: ${err instanceof Error ? err.message : 'error desconocido'}`);
    return NextResponse.json(
      { error: 'No pude cargar los días anteriores. Intenta de nuevo.', code: 'unavailable' },
      { status: 500 }
    );
  }
}
