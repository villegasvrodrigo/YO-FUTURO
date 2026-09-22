import type { SupabaseClient } from '@supabase/supabase-js';
import { assertValidDate, shiftDate } from './dates';
import { HISTORY_DAYS, type TaskProgressRow } from './progress';

/**
 * Reads this user's tasks from the last HISTORY_DAYS days ending on `today` (the user's
 * local date, "YYYY-MM-DD"), today included, oldest first — only the date and whether each
 * one was checked. Meant for the signed-in user's own session client, so row-level
 * security keeps it to their own tasks; never pass the service-role client here.
 * Returns [] — never throws — if there are none or if anything fails (logged), so the
 * Progreso screen falls back to its no-data message.
 */
export async function getTaskHistory(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<TaskProgressRow[]> {
  try {
    assertValidDate(today);
    const from = shiftDate(today, -(HISTORY_DAYS - 1));

    const { data, error } = await supabase
      .from('daily_tasks')
      .select('task_date, completed')
      .eq('user_id', userId)
      .gte('task_date', from)
      .lte('task_date', today)
      .order('task_date', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? []).filter(
      (row): row is TaskProgressRow =>
        typeof row?.task_date === 'string' && typeof row?.completed === 'boolean'
    );
  } catch (err) {
    console.error(`[progreso] no se pudieron leer las tareas del perfil ${userId}:`, err);
    return [];
  }
}
