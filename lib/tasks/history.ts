import type { SupabaseClient } from '@supabase/supabase-js';
import { assertValidDate } from './dates';
import type { TaskProgressRow } from './progress';

// Supabase returns at most 1,000 rows per request and silently cuts the rest, so the whole
// history is read in pages of this size.
export const HISTORY_PAGE_SIZE = 1000;
// Safety stop: 100 pages = 100,000 rows, about 90 years of 3 tasks a day.
const MAX_HISTORY_PAGES = 100;

/**
 * Reads ALL of this user's tasks up to `today` (the user's local date, "YYYY-MM-DD"),
 * oldest first — only the date and whether each one was checked — page by page, so the
 * 1,000-row limit never cuts it short. Meant for the signed-in user's own session client
 * (row-level security keeps it to their own tasks); never pass the service-role client.
 * Returns [] — never throws — if there are none or if anything fails (logged); a failed
 * page loses the whole read rather than showing a partial, wrong history.
 */
export async function getFullTaskHistory(
  supabase: SupabaseClient,
  userId: string,
  today: string
): Promise<TaskProgressRow[]> {
  try {
    assertValidDate(today);
    const rows: TaskProgressRow[] = [];

    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const from = page * HISTORY_PAGE_SIZE;
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('task_date, completed')
        .eq('user_id', userId)
        .lte('task_date', today)
        // A stable, unique order (one task per user, date and position), so pages never
        // overlap or skip rows.
        .order('task_date', { ascending: true })
        .order('position', { ascending: true })
        .range(from, from + HISTORY_PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message);
      }
      const pageRows = data ?? [];
      rows.push(
        ...pageRows.filter(
          (row): row is TaskProgressRow =>
            typeof row?.task_date === 'string' && typeof row?.completed === 'boolean'
        )
      );
      if (pageRows.length < HISTORY_PAGE_SIZE) {
        return rows;
      }
    }

    console.error(`[progreso] el historial del perfil ${userId} superó ${MAX_HISTORY_PAGES} páginas; se muestra lo leído`);
    return rows;
  } catch (err) {
    console.error(`[progreso] no se pudo leer el historial completo del perfil ${userId}:`, err);
    return [];
  }
}
