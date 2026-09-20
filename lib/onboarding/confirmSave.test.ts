import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmOnboarding, type ConfirmOnboardingProfileInput } from './confirmSave';

/** Minimal stand-in for the two Supabase tables confirmOnboarding writes to. */
function fakeSupabase(overrides: {
  goalsInsert: ReturnType<typeof vi.fn>;
  profilesUpsert?: ReturnType<typeof vi.fn>;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'goals') return { insert: overrides.goalsInsert };
    if (table === 'profiles') return { upsert: overrides.profilesUpsert };
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

const PROFILE: ConfirmOnboardingProfileInput = {
  name: 'Ana',
  currentAge: 30,
  futureSelfAge: 45,
  focusArea: 'finanzas',
  tone: 'motivador',
  values: 'la libertad',
  deliveryHour: 8,
  timezone: 'America/Mexico_City',
  currentEnergySummary: 'Resumen',
  blockingPattern: 'Patrón',
  futureVision: 'Visión',
};

describe('confirmOnboarding', () => {
  it('does not mark the profile complete when the goals insert fails', async () => {
    const goalsInsert = vi.fn().mockResolvedValue({ error: { message: 'db down', code: '500' } });
    const profilesUpsert = vi.fn();
    const supabase = fakeSupabase({ goalsInsert, profilesUpsert });

    const result = await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar']);

    expect(result).toEqual({
      success: false,
      stage: 'goals',
      message: 'No se pudieron guardar tus metas, intenta de nuevo.',
    });
    expect(profilesUpsert).not.toHaveBeenCalled();
  });

  it('inserts the goals before touching the profile row', async () => {
    const calls: string[] = [];
    const goalsInsert = vi.fn().mockImplementation(async () => {
      calls.push('goals');
      return { error: null };
    });
    const profilesUpsert = vi.fn().mockImplementation(async () => {
      calls.push('profiles');
      return { error: null };
    });
    const supabase = fakeSupabase({ goalsInsert, profilesUpsert });

    await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar']);

    expect(calls).toEqual(['goals', 'profiles']);
  });

  it('marks onboarding_completed true only once the goals were saved successfully', async () => {
    const goalsInsert = vi.fn().mockResolvedValue({ error: null });
    const profilesUpsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase({ goalsInsert, profilesUpsert });

    const result = await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar', '  ', 'Meditar']);

    expect(result).toEqual({ success: true });
    expect(goalsInsert).toHaveBeenCalledWith([
      { user_id: 'user-1', description: 'Ahorrar' },
      { user_id: 'user-1', description: 'Meditar' },
    ]);
    expect(profilesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1', onboarding_completed: true }),
      { onConflict: 'id' }
    );
  });

  it('reports a profile-stage failure when goals saved but the profile upsert fails', async () => {
    const goalsInsert = vi.fn().mockResolvedValue({ error: null });
    const profilesUpsert = vi.fn().mockResolvedValue({ error: { message: 'constraint violation', code: '23505' } });
    const supabase = fakeSupabase({ goalsInsert, profilesUpsert });

    const result = await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar']);

    expect(result).toEqual({
      success: false,
      stage: 'profile',
      message: 'No se pudo guardar tu perfil, intenta de nuevo.',
    });
  });
});
