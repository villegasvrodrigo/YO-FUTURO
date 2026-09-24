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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, timezone, delivery_paused')
    .eq('id', user.id)
    .maybeSingle();

  const { data: latestMessage } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const name = profile?.name?.trim();
  // Which day the latest message is from, in the user's time zone: the title and the line
  // under the message say "today" only when it really is today.
  const latestMessageDay = latestMessage ? messageDay(latestMessage.generated_at, profile?.timezone, new Date()) : null;

  // Today's tasks: the ones saved for the user's LOCAL date today. Any problem here (bad
  // timezone, failed read) just means no tasks are shown; it never breaks the dashboard.
  let tasks: DailyTask[] = [];
  if (profile?.timezone) {
    try {
      const today = getLocalDateString(new Date(), profile.timezone);
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('task_date', today)
        .order('position', { ascending: true });
      if (error) {
        console.error('[dashboard] no se pudieron leer las tareas de hoy:', error.message);
      } else {
        tasks = (data as DailyTask[]) ?? [];
      }
    } catch (err) {
      console.error('[dashboard] no se pudo calcular la fecha local para las tareas:', err);
    }
  }

  // The most recent insight, from whatever day, read with the user's own session. A failed
  // read just shows the friendly message; it never breaks the dashboard.
  const latestInsight = await getLatestInsight(supabase, user.id);

  return (
    <>
      <main className="flex flex-1 justify-center px-6 pb-40 pt-8">
        <TasksProvider initialTasks={tasks}>
          <div className="w-full max-w-xl">
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

            <DailyMessage message={latestMessage} day={latestMessageDay} />

            <section className="mt-10">
              <h2 className="font-serif text-2xl text-parchment">Tus tareas de hoy</h2>
              <TaskListHint />
              <div className="mt-3 rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                <TaskList paused={profile?.delivery_paused === true} />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-serif text-2xl text-parchment">Daily insight</h2>
              <DailyInsightHint insight={latestInsight} />
              <div className="mt-3">
                <DailyInsight insight={latestInsight} paused={profile?.delivery_paused === true} />
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
