import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocalDateString } from '@/lib/messages/delivery';
import type { DailyTask } from '@/lib/types';
import { BottomNav } from '@/app/_components/BottomNav';
import { CompletionRing } from './CompletionRing';
import { TaskList, TaskListHint, TasksProvider } from './TaskList';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, timezone')
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

            <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-brass">
              Tu mensaje de hoy
            </p>
            {latestMessage && (
              <p className="mb-6 font-mono text-xs text-mist">
                {new Date(latestMessage.generated_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                })}
              </p>
            )}

            {latestMessage ? (
              <div className="mt-6 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
                <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">
                  {latestMessage.content}
                </p>
                <span className="mt-5 block font-mono text-xs text-mist">
                  {latestMessage.model_used} · generado hoy
                </span>
              </div>
            ) : (
              <div className="mt-6 rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
                <p className="font-serif text-lg italic leading-relaxed text-mist">
                  Tu yo futuro todavía no te ha escrito.
                </p>
              </div>
            )}

            <section className="mt-10">
              <h2 className="font-serif text-2xl text-parchment">Tus tareas de hoy</h2>
              <TaskListHint />
              <div className="mt-3 rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                <TaskList />
              </div>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 font-serif text-2xl text-parchment">Daily insight</h2>
              <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                <p className="text-sm text-mist">Pronto verás aquí tu daily insight.</p>
              </div>
            </section>

            <nav className="mt-8 flex gap-5 font-mono text-xs">
              <a href="/historial" className="text-mist transition-colors hover:text-brass">
                Ver historial
              </a>
              <a href="/perfil" className="text-mist transition-colors hover:text-brass">
                Editar perfil
              </a>
            </nav>
          </div>
        </TasksProvider>
      </main>
      <BottomNav />
    </>
  );
}
