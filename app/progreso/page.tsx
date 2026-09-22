import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocalDateString } from '@/lib/messages/delivery';
import { getTaskHistory } from '@/lib/tasks/history';
import { buildProgress, type Progress } from '@/lib/tasks/progress';
import { BottomNav } from '@/app/_components/BottomNav';
import { ProgressView } from './ProgressView';

export default async function ProgresoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  // Read with the user's own session (never the service-role key) and computed on the
  // user's LOCAL date. No timezone, no tasks in the last 90 days or any problem here just
  // means the friendly no-data message is shown; it never breaks the screen.
  let progress: Progress | null = null;
  if (profile?.timezone) {
    try {
      const today = getLocalDateString(new Date(), profile.timezone);
      const tasks = await getTaskHistory(supabase, user.id, today);
      if (tasks.length > 0) progress = buildProgress(tasks, today);
    } catch (err) {
      console.error('[progreso] no se pudo calcular el progreso:', err);
    }
  }

  return (
    <>
      <ProgressView progress={progress} />
      <BottomNav />
    </>
  );
}
