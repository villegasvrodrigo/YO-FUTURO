import { createAdminClient } from '@/lib/supabase/admin';
import { assertValidDate, shiftDate } from './dates';

type AdminClient = ReturnType<typeof createAdminClient>;

// How many calendar days before the given date count as "recently checked".
const RECENT_DAYS = 7;

/**
 * Returns the descriptions of the tasks this user CHECKED during the RECENT_DAYS days before
 * `date` (a "YYYY-MM-DD" local date; `date` itself is not included, since its tasks are only
 * just being handed out), newest day first and in position order within a day. It is the
 * real signal of what the person has been practicing, for the daily insight.
 * Returns [] — never throws — if there are none or if anything fails (logged).
 * Uses the service-role client: it runs in the cron, with no signed-in user.
 */
export async function getRecentCompletedTasks(
  userId: string,
  date: string,
  client?: AdminClient
): Promise<string[]> {
  try {
    assertValidDate(date);
    const from = shiftDate(date, -RECENT_DAYS);

    // Built inside the try: constructing the default client throws when env vars are missing.
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('description')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('task_date', from)
      .lt('task_date', date)
      .order('task_date', { ascending: false })
      .order('position', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? [])
      .map((row) => row.description)
      .filter((description): description is string => typeof description === 'string' && description.trim() !== '');
  } catch (err) {
    console.error(`[daily-tasks] no se pudieron leer las tareas marcadas del perfil ${userId}:`, err);
    return [];
  }
}
