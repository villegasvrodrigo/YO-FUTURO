import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSameLocalDay, summarizeDueProfiles } from '@/lib/messages/delivery';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';
import { buildEmailText } from '@/lib/email/body';
import { prepareDailyTasks } from '@/lib/tasks/daily';
import { saveDailyTasks } from '@/lib/tasks/save';
import { prepareDailyInsight } from '@/lib/insights/daily';
import { saveDailyInsight } from '@/lib/insights/save';
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

  const summary = summarizeDueProfiles(profiles as Profile[], now);
  console.log(
    `[cron] hora de referencia (UTC): ${summary.nowUtcIso} — perfiles con onboarding completo: ${summary.totalProfiles}, elegibles esta hora: ${summary.due.length}, excluidos por timezone inválida: ${summary.excluded.length}`
  );
  summary.due.forEach((p) => {
    console.log(`[cron]   elegible: perfil ${p.id} (timezone=${p.timezone}, hora local=${p.localHour})`);
  });
  summary.excluded.forEach((p) => {
    // Una `timezone` inválida hace que Intl.DateTimeFormat lance RangeError.
    // Se excluye ese perfil en lugar de tumbar el batch completo.
    console.error(`[cron]   excluido: perfil ${p.id} (timezone=${p.timezone}) — ${p.error}`);
  });

  const dueProfileIds = new Set(summary.due.map((p) => p.id));
  const dueProfiles = (profiles as Profile[]).filter((p) => dueProfileIds.has(p.id));

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
        `[cron]   falló: perfil ${dueProfiles[index]?.id}:`,
        result.reason
      );
    }
  });

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - succeeded;

  console.log(`[cron] resumen: procesados=${results.length}, exitosos=${succeeded}, fallidos=${failed}`);

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
    .eq('status', 'active')
    // Orden estable: la meta del día rota según la fecha y necesita el mismo orden siempre.
    .order('created_at', { ascending: true });

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
    console.log(
      `[cron]   saltado: perfil ${profile.id} — ya se generó un mensaje hoy (mensaje ${lastMessage.id}, ${lastMessage.generated_at})`
    );
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

  // Insight del día (opcional): arranca ya, al mismo tiempo que las tareas, pero el correo
  // NO lo espera y no lo incluye. Se espera y se guarda al final, después del envío. Nunca
  // lanza un error y devuelve null si algo falla o tarda más de 20 s; el .catch es solo una
  // red de seguridad para que un rechazo inesperado no quede sin manejar mientras se envía.
  const insightPromise = prepareDailyInsight(supabase, profile, (goals as Goal[]) ?? [], content, now).catch(
    (err) => {
      console.error(`[cron]   sin insight: perfil ${profile.id}:`, err);
      return null;
    }
  );

  // Tareas del día (opcionales): nunca lanza un error y devuelve null si algo falla o
  // tarda más de 20 s. Con null, el correo sale exactamente como antes de las tareas.
  const dailyTasks = await prepareDailyTasks(supabase, profile, (goals as Goal[]) ?? [], content, now);

  const emailResult = await sendDailyEmail(email, buildEmailText(content, dailyTasks?.tasks ?? null));

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

  // Tareas del día: se guardan al final, ya con el mensaje y su log cerrados. Nunca lanza
  // un error: si falla, solo queda registrado.
  if (dailyTasks) {
    await saveDailyTasks(profile.id, dailyTasks.taskDate, dailyTasks.tasks, supabase);
  }

  // Insight del día: se espera y se guarda hasta aquí, con el correo ya enviado. Nunca lanza
  // un error: si no hay insight o no se pudo guardar, solo queda registrado.
  const dailyInsight = await insightPromise;
  if (dailyInsight) {
    await saveDailyInsight(profile.id, dailyInsight.insightDate, dailyInsight, supabase);
  }

  console.log(`[cron]   enviado: perfil ${profile.id} (mensaje ${inserted.id}, email status=${emailResult.status})`);
}
