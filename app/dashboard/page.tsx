import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocalDateString } from '@/lib/messages/delivery';
import type { DailyTask } from '@/lib/types';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { CompletionRing } from './CompletionRing';
import { TaskList, TaskListHint, TasksProvider } from './TaskList';
import { DailyInsight, DailyInsightHint } from './DailyInsight';
import { DailyMessage, PausedNotice } from './DailyMessage';
import { messageDay } from '@/lib/messages/messageDay';
import { getLatestInsight } from '@/lib/insights/latest';
import { Welcome } from './Welcome';
import { buildWelcomeSteps, senderAddress, WELCOME_REPLAY_PARAM, WELCOME_SEEN_KEY } from './welcomeContent';
import { PreparingToday } from './PreparingToday';
import { effectiveTimezone, isTodayMessage, localToday, type DayMessage } from '@/lib/daily/today';
import { InsightOnTheWay } from './InsightOnTheWay';
import { insightOnTheWay, tasksVersion } from './todayRefresh';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Today's tasks: the ones saved for the user's LOCAL date today (with the fallback time zone
// when theirs is missing or invalid, like the rest of their day). A failed read just means no
// tasks are shown; it never breaks the dashboard.
async function readTodayTasks(supabase: Supabase, userId: string, timezone: string | null | undefined): Promise<DailyTask[]> {
  try {
    const today = getLocalDateString(new Date(), effectiveTimezone(timezone));
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('task_date', today)
      .order('position', { ascending: true });
    if (error) {
      console.error('[dashboard] no se pudieron leer las tareas de hoy:', error.message);
      return [];
    }
    return (data as DailyTask[]) ?? [];
  } catch (err) {
    console.error('[dashboard] no se pudo calcular la fecha local para las tareas:', err);
    return [];
  }
}

export default async function DashboardPage({ searchParams }: PageProps<'/dashboard'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The reads run at the same time instead of one after another. Only the tasks wait, for the
  // profile's time zone. (Each query is awaited once, inside its own async function: a
  // Supabase query runs again every time it is awaited.)
  const profileRead = (async () =>
    (await supabase.from('profiles').select('name, timezone, delivery_paused, future_self_age, delivery_hour_local').eq('id', user.id).maybeSingle()).data)();
  const messageRead = (async () =>
    (
      await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data)();
  const tasksRead = profileRead.then((profile) => readTodayTasks(supabase, user.id, profile?.timezone));
  // The most recent insight, from whatever day, read with the user's own session. A failed
  // read just shows the friendly message; it never breaks the dashboard.
  const insightRead = getLatestInsight(supabase, user.id);

  const [profile, latestMessage, tasks, latestInsight] = await Promise.all([profileRead, messageRead, tasksRead, insightRead]);

  const name = profile?.name?.trim();

  // The welcome: once, the first time Inicio opens after the onboarding (existing accounts
  // included: they have no mark yet), and again from Perfil's "Ver la bienvenida otra vez"
  // (?bienvenida=1). The mark lives in the account's data, not in a table.
  const replayWelcome = (await searchParams)[WELCOME_REPLAY_PARAM] === '1';
  const showWelcome = replayWelcome || !user.user_metadata?.[WELCOME_SEEN_KEY];
  const welcomeSteps = showWelcome
    ? buildWelcomeSteps({
        name: name ?? '',
        futureSelfAge: profile?.future_self_age ?? null,
        deliveryHour: profile?.delivery_hour_local ?? null,
        timezone: profile?.timezone ?? null,
        sender: senderAddress(process.env.RESEND_FROM_ADDRESS || 'Yo Futuro <hola@yofuturo.app>'),
        hasAnyMessage: !!latestMessage,
        chatEnabled: isChatEnabledFor(user.id),
        now: new Date(),
      })
    : null;
  // Which day the latest message is from, in the user's time zone: the title and the line
  // under the message say "today" only when it really is today.
  // Which day the latest message is, in the person's day (fallback time zone if theirs is
  // invalid): today's is shown; any other day never is shown as today's — Inicio creates
  // today's message instead (PreparingToday) and only shows the last one, dated, if that fails.
  const now = new Date();
  const timezone = effectiveTimezone(profile?.timezone);
  const hasTodayMessage = isTodayMessage(latestMessage as DayMessage | null, now, timezone);
  const computedDay = latestMessage ? messageDay(latestMessage.generated_at, timezone, now) : null;
  const latestMessageDay = computedDay
    ? { date: (latestMessage as DayMessage).message_date ?? computedDay.date, isToday: hasTodayMessage }
    : null;
  // Right after the app creates today's message, its insight is still being written: Inicio
  // says so and refreshes itself until it arrives (InsightOnTheWay).
  const waitingForInsight = insightOnTheWay({
    hasTodayMessage,
    messageGeneratedAt: latestMessage?.generated_at,
    latestInsightDate: latestInsight?.insightDate,
    today: localToday(now, timezone),
    now,
  });

  return (
    <>
      <main className="flex flex-1 justify-center px-6 pb-40 pt-8">
        {/* Keyed by which tasks there are: when today's tasks arrive (Inicio refreshed after
            creating today's message), the list starts over with them; checking a box keeps it. */}
        <TasksProvider key={tasksVersion(tasks)} initialTasks={tasks}>
          <div className="w-full max-w-xl">
            {welcomeSteps && <Welcome steps={welcomeSteps} name={name ?? ''} replay={replayWelcome} />}
            <div className="mb-10 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 font-mono text-[17px] uppercase tracking-[0.1em] text-mist sm:text-[21px]">
                  Hola,
                </p>
                <p className="truncate font-sans text-[27px] font-bold leading-none text-brass sm:text-[36px]">
                  {name || 'de nuevo'}
                </p>
              </div>
              <CompletionRing />
            </div>

            {profile?.delivery_paused === true && <PausedNotice />}

            {hasTodayMessage ? (
              <DailyMessage message={latestMessage} day={latestMessageDay} />
            ) : (
              <PreparingToday lastMessage={latestMessage} lastDay={latestMessageDay} />
            )}

            <section className="mt-10">
              <h2 className="font-serif text-2xl text-parchment">Tus tareas de hoy</h2>
              <TaskListHint />
              <div className="mt-3 rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                <TaskList />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-2xl text-parchment">Daily insight</h2>
              {!waitingForInsight && <DailyInsightHint insight={latestInsight} />}
              <div className="mt-3">
                {waitingForInsight ? <InsightOnTheWay /> : <DailyInsight insight={latestInsight} />}
              </div>
            </section>

            <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-3 font-mono text-xs">
              <a href="/historial" className="text-mist transition-colors hover:text-brass">
                Ver historial
              </a>
              <a href="/perfil" className="text-mist transition-colors hover:text-brass">
                Editar perfil
              </a>
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSdVC2-0O2E34_q-dpTvbBM9SrUvG1LnaC9Q2SPa4uht9NzG2g/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="text-mist transition-colors hover:text-brass"
              >
                Enviar opinión
              </a>
              <a href="/privacidad" className="text-mist transition-colors hover:text-brass">
                Aviso de privacidad
              </a>
            </nav>
          </div>
        </TasksProvider>
      </main>
      <BottomNav chatEnabled={isChatEnabledFor(user.id)} />
    </>
  );
}
