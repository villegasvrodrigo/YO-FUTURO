import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDueNow, isSameLocalDay } from '@/lib/messages/delivery';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

// El batch por hora puede tardar: procesamos usuarios en tandas y cada uno
// hace una llamada a Claude más un envío de email.
export const maxDuration = 300;

// Cuántos usuarios se procesan en paralelo por tanda. Limita la presión
// sobre los rate limits de Claude y Resend.
const CHUNK_SIZE = 10;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('onboarding_completed', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueProfiles = (profiles as Profile[]).filter((p) => {
    try {
      return isDueNow(p.delivery_hour_local, p.timezone, now);
    } catch (err) {
      // Una `timezone` inválida hace que Intl.DateTimeFormat lance RangeError.
      // Se excluye ese perfil en lugar de tumbar el batch completo.
      console.error(`[cron] timezone inválida para el perfil ${p.id}:`, err);
      return false;
    }
  });

  // Tandas secuenciales: dentro de cada tanda los usuarios corren en
  // paralelo, pero se espera a que termine antes de empezar la siguiente.
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < dueProfiles.length; i += CHUNK_SIZE) {
    const chunk = dueProfiles.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map((profile) => processUser(supabase, profile, now))
    );
    results.push(...chunkResults);
  }

  // `allSettled` conserva el orden, así que el índice del resultado
  // corresponde al perfil en la misma posición de `dueProfiles`.
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `[cron] falló el procesamiento del perfil ${dueProfiles[index]?.id}:`,
        result.reason
      );
    }
  });

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - succeeded;

  return NextResponse.json({ processed: results.length, succeeded, failed });
}

// La spec pide 1 reintento si Claude falla; si el segundo intento también
// falla se propaga el error para que quede como rechazo de este usuario
// (registrado arriba) y se reintente en la corrida siguiente. No se
// inserta fila en `messages` porque `content` es NOT NULL y no existe
// contenido real que guardar.
async function generateWithRetry(
  profile: Profile,
  goals: Goal[],
  recentMessages: MessageRecord[]
) {
  try {
    return await generateMessage(profile, goals, recentMessages);
  } catch (err) {
    console.error(
      `[cron] primer intento de generación falló para el perfil ${profile.id}, reintentando:`,
      err
    );
    return await generateMessage(profile, goals, recentMessages);
  }
}

async function processUser(
  supabase: ReturnType<typeof createAdminClient>,
  profile: Profile,
  now: Date
) {
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', profile.id)
    .order('generated_at', { ascending: false })
    .limit(2);

  const messages = (recentMessages as MessageRecord[]) ?? [];
  const lastMessage = messages[0];
  if (
    lastMessage &&
    isSameLocalDay(new Date(lastMessage.generated_at), now, profile.timezone)
  ) {
    // Already sent a message today (local calendar day) for this user —
    // skip to avoid duplicate sends from DST fall-back repeated hours or
    // an overlapping/retried cron invocation.
    return;
  }

  const { content, modelUsed } = await generateWithRetry(
    profile,
    (goals as Goal[]) ?? [],
    messages
  );

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({ user_id: profile.id, content, model_used: modelUsed, send_status: 'pending' })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo guardar el mensaje: ${insertError?.message}`);
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const email = authUser?.user?.email;
  if (!email) {
    throw new Error('Usuario sin email registrado');
  }

  const emailResult = await sendDailyEmail(email, content);

  await supabase
    .from('messages')
    .update({
      send_status: emailResult.status,
      sent_at: emailResult.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', inserted.id);

  await supabase.from('email_log').insert({
    message_id: inserted.id,
    provider_id: emailResult.providerId,
    status: emailResult.status,
    error: emailResult.error,
  });
}
