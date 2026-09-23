import type { SupabaseClient } from '@supabase/supabase-js';

export const PAUSE_SAVED = 'Listo: tus correos están en pausa. No recibirás mensaje, tareas ni insight hasta que los reanudes.';
export const RESUME_SAVED =
  'Listo: tus correos se reanudaron. Si tu hora de envío de hoy ya pasó, el primero te llega mañana.';
export const PAUSE_FAILED = 'No se pudo cambiar la pausa. Revisa tu conexión e intenta de nuevo.';

/**
 * Pauses (true) or resumes (false) the user's daily emails, from the browser (row-level
 * security limits this to their own row). Only this one column is written, so it never
 * depends on the rest of the profile form being valid. Returns true only if exactly one row
 * was updated: when a policy hides the row, Supabase reports success with zero rows instead
 * of an error, and that must count as a failure. Never throws: problems are logged.
 */
export async function setDeliveryPaused(
  supabase: SupabaseClient,
  profileId: string,
  paused: boolean
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ delivery_paused: paused })
      .eq('id', profileId)
      .select('id');
    if (error) {
      console.error('[perfil] no se pudo cambiar la pausa:', error.message);
      return false;
    }
    if (data?.length !== 1) {
      console.error(`[perfil] no se cambió la pausa: se actualizaron ${data?.length ?? 0} filas`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[perfil] no se pudo cambiar la pausa:', err);
    return false;
  }
}
