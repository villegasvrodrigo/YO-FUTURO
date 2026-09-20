import type { SupabaseClient } from '@supabase/supabase-js';
import type { FocusArea, Tone } from '@/lib/types';

export interface ConfirmOnboardingProfileInput {
  name: string;
  currentAge: number;
  futureSelfAge: number;
  focusArea: FocusArea;
  tone: Tone;
  values: string;
  deliveryHour: number;
  timezone: string;
  currentEnergySummary: string | null;
  blockingPattern: string | null;
  futureVision: string | null;
}

export type ConfirmOnboardingResult =
  | { success: true }
  | { success: false; stage: 'goals' | 'profile'; message: string };

/**
 * Saves the goals first and only marks `profiles.onboarding_completed` true once
 * that succeeds. Doing it the other way around (as this used to) left accounts
 * stuck "done" with zero goals whenever the second write failed — nothing ever
 * revisits onboarding once onboarding_completed is true, so that state was
 * permanent and invisible until someone checked /perfil.
 */
export async function confirmOnboarding(
  supabase: SupabaseClient,
  userId: string,
  profile: ConfirmOnboardingProfileInput,
  goals: string[]
): Promise<ConfirmOnboardingResult> {
  const nonEmptyGoals = goals.map((g) => g.trim()).filter(Boolean);

  const { error: goalsError } = await supabase
    .from('goals')
    .insert(nonEmptyGoals.map((description) => ({ user_id: userId, description })));
  if (goalsError) {
    // PostgrestError doesn't stringify usefully via console.error's default
    // formatting in every environment — log the fields that actually matter.
    console.error('[onboarding-confirm] goals insert failed', {
      message: goalsError.message,
      code: goalsError.code,
    });
    return { success: false, stage: 'goals', message: 'No se pudieron guardar tus metas, intenta de nuevo.' };
  }

  // Upsert, not insert: a prior click (or a retry after this same confirmation
  // failed partway through) may have already created the row, and "save again"
  // should update it in place rather than fail on the primary key.
  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      name: profile.name,
      current_age: profile.currentAge,
      future_self_age: profile.futureSelfAge,
      focus_area: profile.focusArea,
      tone: profile.tone,
      values: profile.values,
      delivery_hour_local: profile.deliveryHour,
      timezone: profile.timezone,
      onboarding_completed: true,
      current_energy_summary: profile.currentEnergySummary,
      blocking_pattern: profile.blockingPattern,
      future_vision: profile.futureVision,
    },
    { onConflict: 'id' }
  );
  if (profileError) {
    console.error('[onboarding-confirm] profile upsert failed', {
      message: profileError.message,
      code: profileError.code,
    });
    return { success: false, stage: 'profile', message: 'No se pudo guardar tu perfil, intenta de nuevo.' };
  }

  return { success: true };
}
