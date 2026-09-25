import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getLocalDateString } from '@/lib/messages/delivery';
import { getFullTaskHistory } from '@/lib/tasks/history';
import { buildProgress, type ProgressData } from '@/lib/tasks/progress';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { ProgressView } from './ProgressView';

// The time zone that is furthest ahead (UTC+14): no one's local date is ever later than its.
const LATEST_TIMEZONE = 'Pacific/Kiritimati';

export default async function ProgresoPage({ searchParams }: PageProps<'/progreso'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The reads run at the same time instead of one after another. The task history needs the
  // user's local "today", which needs the profile's time zone; so it is read up to the latest
  // date anywhere on Earth right now (UTC+14) and cut down to the user's today once the
  // profile arrives. The result is exactly the same as reading up to the user's today.
  const now = new Date();
  const [{ data: profile }, history, { mes }] = await Promise.all([
    (async () => await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle())(),
    getFullTaskHistory(supabase, user.id, getLocalDateString(now, LATEST_TIMEZONE)),
    // The month to show comes from the address (?mes=2026-08); buildProgress keeps it between
    // the first month with tasks and the current one.
    searchParams,
  ]);

  // Read with the user's own session (never the service-role key) and computed on the
  // user's LOCAL date. No timezone, no tasks yet or any problem here just means the
  // friendly no-data message is shown; it never breaks the screen.
  let progress: ProgressData | null = null;
  if (profile?.timezone) {
    try {
      const today = getLocalDateString(now, profile.timezone);
      const tasks = history.filter((task) => task.task_date <= today);
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
