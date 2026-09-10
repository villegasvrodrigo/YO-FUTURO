import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ExtractedProfile } from './extraction';

export interface OnboardingProgress {
  transcript: ChatMessage[];
  extracted: ExtractedProfile;
  done: boolean;
}

/** Reads the caller's own saved onboarding progress, relying on RLS to scope it to them. */
export async function loadOnboardingProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<OnboardingProgress | null> {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('transcript, extracted, done')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[onboarding-progress] load failed', error);
    return null;
  }
  return (data as OnboardingProgress | null) ?? null;
}

/**
 * Upserts the caller's onboarding progress. Best-effort: a failure here should never
 * block or fail the onboarding conversation itself, so errors are logged, not thrown.
 */
export async function saveOnboardingProgress(
  supabase: SupabaseClient,
  userId: string,
  progress: OnboardingProgress
): Promise<void> {
  const { error } = await supabase.from('onboarding_progress').upsert({
    user_id: userId,
    transcript: progress.transcript,
    extracted: progress.extracted,
    done: progress.done,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[onboarding-progress] save failed', error);
  }
}

/** Deletes the caller's saved progress once onboarding is fully confirmed. Best-effort. */
export async function clearOnboardingProgress(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from('onboarding_progress').delete().eq('user_id', userId);

  if (error) {
    console.error('[onboarding-progress] clear failed', error);
  }
}
