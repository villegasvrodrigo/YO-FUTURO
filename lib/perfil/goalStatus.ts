import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalStatus } from '@/lib/types';

export const GOAL_STATUS_FAILED = 'No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.';

/**
 * Changes the status of one of the user's goals from the browser (row-level security limits
 * this to their own goals): 'achieved' to mark it done, 'active' to bring it back. Returns
 * true only if exactly one row was updated: when a policy hides the row, Supabase reports
 * success with zero rows instead of an error, and that must count as a failure. Never
 * throws: problems are logged.
 */
export async function saveGoalStatus(
  supabase: SupabaseClient,
  goalId: string,
  status: GoalStatus
): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('goals').update({ status }).eq('id', goalId).select('id');
    if (error) {
      console.error('[perfil] no se pudo cambiar el estado de la meta:', error.message);
      return false;
    }
    if (data?.length !== 1) {
      console.error(`[perfil] no se cambió el estado de la meta: se actualizaron ${data?.length ?? 0} filas`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[perfil] no se pudo cambiar el estado de la meta:', err);
    return false;
  }
}
