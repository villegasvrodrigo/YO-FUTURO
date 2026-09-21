import type { SupabaseClient } from '@supabase/supabase-js';

/** Checked tasks ÷ total × 100, rounded to a whole number. 0 when there are no tasks. */
export function completionPercent(tasks: { completed: boolean }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((task) => task.completed).length;
  return Math.round((done / tasks.length) * 100);
}

/** The columns to write when a task is checked (completed_at = now) or unchecked (null). */
export function taskCompletionUpdate(
  completed: boolean,
  now: Date = new Date()
): { completed: boolean; completed_at: string | null } {
  return { completed, completed_at: completed ? now.toISOString() : null };
}

/**
 * Writes completed/completed_at of one task from the browser (row-level security limits
 * this to the user's own tasks). Returns true only if exactly one row was updated: when
 * a policy hides the row, Supabase reports success with zero rows instead of an error,
 * and that must count as a failure. Never throws.
 */
export async function saveTaskCompletion(
  supabase: SupabaseClient,
  taskId: string,
  update: { completed: boolean; completed_at: string | null }
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('daily_tasks')
      .update(update)
      .eq('id', taskId)
      .select('id');
    if (error) {
      console.error('[tasks] no se pudo actualizar la tarea:', error.message);
      return false;
    }
    return data?.length === 1;
  } catch (err) {
    console.error('[tasks] no se pudo actualizar la tarea:', err);
    return false;
  }
}
