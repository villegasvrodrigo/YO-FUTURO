import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocalDateString } from '@/lib/messages/delivery';
import { getFullTaskHistory } from '@/lib/tasks/history';
import { buildProgress, type ProgressData } from '@/lib/tasks/progress';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { ProgressView } from './ProgressView';

export default async function ProgresoPage({ searchParams }: PageProps<'/progreso'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  // The month to show comes from the address (?mes=2026-08); buildProgress keeps it between
  // the first month with tasks and the current one.
  const { mes } = await searchParams;

  // Read with the user's own session (never the service-role key) and computed on the
  // user's LOCAL date. No timezone, no tasks yet or any problem here just means the
  // friendly no-data message is shown; it never breaks the screen.
  let progress: ProgressData | null = null;
  if (profile?.timezone) {
    try {
      const today = getLocalDateString(new Date(), profile.timezone);
      const tasks = await getFullTaskHistory(supabase, user.id, today);
      progress = buildProgress(tasks, today, mes);
    } catch (err) {
      console.error('[progreso] no se pudo calcular el progreso:', err);
    }
  }

  return (
    <>
      <ProgressView progress={progress} />
      <BottomNav chatEnabled={isChatEnabledFor(user.id)} />
    </>
  );
}
