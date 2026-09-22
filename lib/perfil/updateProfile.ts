import type { SupabaseClient } from '@supabase/supabase-js';
import type { FocusArea, Tone } from '@/lib/types';

export interface ProfileUpdate {
  name: string;
  current_age: number;
  future_self_age: number;
  focus_area: FocusArea;
  tone: Tone;
  values: string;
  delivery_hour_local: number;
}

export const SAVE_PROFILE_FAILED = 'No se pudieron guardar los cambios. Revisa tu conexión e intenta de nuevo.';

/**
 * Writes the editable fields of the user's own profile from the browser (row-level
 * security limits this to their own row). Returns true only if exactly one row was
 * updated: when a policy hides the row, Supabase reports success with zero rows instead of
 * an error, and that must count as a failure. Never throws: problems are logged.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  profileId: string,
  update: ProfileUpdate
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', profileId)
      .select('id');
    if (error) {
      console.error('[perfil] no se pudo guardar el perfil:', error.message);
      return false;
    }
    if (data?.length !== 1) {
      console.error(`[perfil] no se guardó el perfil: se actualizaron ${data?.length ?? 0} filas`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[perfil] no se pudo guardar el perfil:', err);
    return false;
  }
}
