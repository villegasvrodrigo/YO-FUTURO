import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATCH_UP_HOURS, summarizeDueProfiles } from '@/lib/messages/delivery';
import { sendDailyEmail } from '@/lib/email/send';
import { buildEmailText } from '@/lib/email/body';
import { buildEmailHtml } from '@/lib/email/html';
import { dailySubject } from '@/lib/email/subject';
import { prepareDailyTasks } from '@/lib/tasks/daily';
import { saveDailyTasks } from '@/lib/tasks/save';
import { prepareDailyInsight } from '@/lib/insights/daily';
import { saveDailyInsight } from '@/lib/insights/save';
import type { Profile, Goal } from '@/lib/types';
import {
  claimTodayEmail,
  findTodayMessage,
  generateWithRetry,
  localToday,
  readTodayMessage,
  readTodayTasks,
  saveTodayMessage,
  type DayMessage,
} from '@/lib/daily/today';

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
  const catchUps = summary.due.filter((p) => p.hoursLate > 0).length;
  console.log(
    `[cron] hora de referencia (UTC): ${summary.nowUtcIso} — perfiles con onboarding completo: ${summary.totalProfiles}, elegibles esta hora: ${summary.due.length} (a su hora: ${summary.due.length - catchUps}, recuperación de hasta ${CATCH_UP_HOURS} h: ${catchUps}), excluidos por timezone inválida: ${summary.excluded.length}, en pausa: ${summary.paused.length}`
  );
  summary.due.forEach((p) => {
    const when = p.hoursLate === 0 ? 'a su hora' : `recuperación, ${p.hoursLate} h después de su hora`;
    console.log(`[cron]   elegible: perfil ${p.id} (timezone=${p.timezone}, hora local=${p.localHour}, ${when})`);
  });
  summary.paused
    .filter((p) => p.dueThisHour)
    .forEach((p) => {
      console.log(`[cron]   en pausa: perfil ${p.id} (le tocaba esta hora; no se genera ni se envía nada)`);
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

// Cada persona, a su hora (o dentro de la recuperación de CATCH_UP_HOURS):
// - Si su mensaje de hoy (su día local) ya se mandó: no se hace nada.
// - Si ya existe y su correo sigue pendiente (por ejemplo, lo creó la app): se aparta el
//   correo y se manda ESE mensaje, con sus tareas de hoy. No se genera otro.
// - Si no existe: se genera (con 1 reintento), se guarda ya apartado y se manda, como siempre.
// Si la IA falla las dos veces se propaga el error: la persona cuenta en "failed" y, como no
// queda mensaje, las corridas de las siguientes CATCH_UP_HOURS horas lo vuelven a intentar;
// pasado ese margen, o si cambia el día en su zona horaria, ese día se queda sin correo.
// Dos corridas al mismo tiempo nunca mandan dos correos: la base guarda un solo mensaje por
// persona por día, y solo una corrida logra apartar su correo (email_claimed_at).
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
  const activeGoals = (goals as Goal[]) ?? [];

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', profile.id)
    .order('generated_at', { ascending: false })
    .limit(2);
  const messages = (recentMessages as DayMessage[]) ?? [];

  const today = localToday(now, profile.timezone);
  let message = findTodayMessage(messages, today, profile.timezone);
  // Whether this run made today's message now (then it also makes the tasks and insight).
  let created = false;
  // Whether this run holds today's email (and so must send it).
  let claimed = false;

  if (!message) {
    const { content, modelUsed } = await generateWithRetry(profile, activeGoals, messages);
    const saved = await saveTodayMessage(supabase, {
      userId: profile.id,
      content,
      modelUsed,
      today,
      now,
      claimEmail: true,
    });
    if (saved.status === 'saved') {
      message = saved.message;
      created = true;
      claimed = true;
    } else {
      // Another run (or the app) saved today's message first: use that one.
      message = await readTodayMessage(supabase, profile.id, today);
      if (!message) throw new Error('El mensaje de hoy existe pero no se pudo leer');
    }
  }

  if (!claimed) {
    if (message.send_status !== 'pending') {
      // Already sent (or tried) today — skip to avoid duplicate sends: the same-day recovery
      // runs (CATCH_UP_HOURS), DST repeated hours or an overlapping cron invocation.
      // Returning here also means today's tasks and insight are never generated twice.
      console.log(
        `[cron]   saltado: perfil ${profile.id} — ya se mandó el correo de hoy (mensaje ${message.id}, ${message.generated_at})`
      );
      return;
    }
    if (!(await claimTodayEmail(supabase, message.id, now))) {
      console.log(`[cron]   saltado: perfil ${profile.id} — otra corrida está mandando su correo de hoy`);
      return;
    }
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const email = authUser?.user?.email;
  if (!email) {
    throw new Error('Usuario sin email registrado');
  }

  const content = message.content;

  // Insight del día (opcional), solo si este mensaje se acaba de crear aquí: quien creó un
  // mensaje ya existente (la app) hizo también su insight. Arranca ya, al mismo tiempo que las
  // tareas, pero el correo NO lo espera y no lo incluye; se guarda al final. Nunca lanza un
  // error y devuelve null si algo falla o tarda más de 20 s; el .catch es solo una red de
  // seguridad para que un rechazo inesperado no quede sin manejar mientras se envía.
  const insightPromise = created
    ? prepareDailyInsight(supabase, profile, activeGoals, content, now).catch((err) => {
        console.error(`[cron]   sin insight: perfil ${profile.id}:`, err);
        return null;
      })
    : Promise.resolve(null);

  // Tareas del día: las que ya están guardadas para hoy (mensaje ya existente) o, si no hay,
  // unas nuevas (opcionales: nunca lanza un error y devuelve null si algo falla o tarda más de
  // 20 s; con null, el correo sale sin tareas).
  let emailTasks: string[] | null = null;
  let newTasks: Awaited<ReturnType<typeof prepareDailyTasks>> = null;
  if (!created) {
    emailTasks = await readTodayTasks(supabase, profile.id, today).catch((err) => {
      console.error(`[cron]   no se pudieron leer las tareas de hoy: perfil ${profile.id}:`, err);
      return null;
    });
  }
  if (!emailTasks) {
    newTasks = await prepareDailyTasks(supabase, profile, activeGoals, content, now);
    emailTasks = newTasks?.tasks ?? null;
  }

  // Two versions of the same email: the plain text (as always) and the designed HTML. If the
  // HTML can't be built, buildEmailHtml returns null and only the text goes out.
  const emailResult = await sendDailyEmail(
    email,
    buildEmailText(content, emailTasks),
    dailySubject(now, profile.timezone),
    { html: buildEmailHtml(content, emailTasks, now, profile.timezone) }
  );

  await supabase
    .from('messages')
    .update({
      send_status: emailResult.status,
      sent_at: emailResult.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', message.id);

  await supabase.from('email_log').insert({
    message_id: message.id,
    provider_id: emailResult.providerId,
    status: emailResult.status,
    error: emailResult.error,
  });

  // Tareas nuevas: se guardan al final, ya con el mensaje y su log cerrados. Nunca lanza un
  // error: si falla, solo queda registrado.
  if (newTasks) {
    await saveDailyTasks(profile.id, newTasks.taskDate, newTasks.tasks, supabase);
  }

  // Insight del día: se espera y se guarda hasta aquí, con el correo ya enviado. Nunca lanza
  // un error: si no hay insight o no se pudo guardar, solo queda registrado.
  const dailyInsight = await insightPromise;
  if (dailyInsight) {
    await saveDailyInsight(profile.id, dailyInsight.insightDate, dailyInsight, supabase);
  }

  console.log(
    `[cron]   enviado: perfil ${profile.id} (mensaje ${message.id}${created ? '' : ', ya existía'}, email status=${emailResult.status})`
  );
}
