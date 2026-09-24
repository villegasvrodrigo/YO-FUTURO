import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmOnboarding, type ConfirmOnboardingProfileInput } from './confirmSave';

/**
 * Minimal stand-in for the two Supabase tables confirmOnboarding uses. `existingGoals` is what
 * the user already has (read first, so goals are never saved twice); `goalsRead` overrides
 * that read's result entirely, e.g. to make it fail.
 */
function fakeSupabase(overrides: {
  goalsInsert: ReturnType<typeof vi.fn>;
  profilesUpsert?: ReturnType<typeof vi.fn>;
  existingGoals?: string[];
  goalsRead?: { data: unknown; error: { message: string; code: string } | null };
}) {
  const goalsEq = vi.fn().mockResolvedValue(
    overrides.goalsRead ?? { data: (overrides.existingGoals ?? []).map((description) => ({ description })), error: null }
  );
  const goalsSelect = vi.fn(() => ({ eq: goalsEq }));
  const from = vi.fn((table: string) => {
    if (table === 'goals') return { insert: overrides.goalsInsert, select: goalsSelect };
    if (table === 'profiles') return { upsert: overrides.profilesUpsert };
    throw new Error(`unexpected table: ${table}`);
  });
  return Object.assign({ from } as unknown as SupabaseClient, { goalsSelect, goalsEq });
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

  describe('never saves the same goals twice', () => {
    it('reads the goals this user already has first', async () => {
      const goalsInsert = vi.fn().mockResolvedValue({ error: null });
      const profilesUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = fakeSupabase({ goalsInsert, profilesUpsert });

      await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar']);

      expect(supabase.goalsSelect).toHaveBeenCalledWith('description');
      expect(supabase.goalsEq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('a second confirmation with the same goals inserts nothing and still completes the profile', async () => {
      const goalsInsert = vi.fn().mockResolvedValue({ error: null });
      const profilesUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = fakeSupabase({ goalsInsert, profilesUpsert, existingGoals: ['Ahorrar', 'Meditar'] });

      const result = await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar', 'Meditar']);

      expect(result).toEqual({ success: true });
      expect(goalsInsert).not.toHaveBeenCalled();
      expect(profilesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', onboarding_completed: true }),
        { onConflict: 'id' }
      );
    });

    it('inserts only the goals that are missing', async () => {
      const goalsInsert = vi.fn().mockResolvedValue({ error: null });
      const profilesUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = fakeSupabase({ goalsInsert, profilesUpsert, existingGoals: ['Ahorrar'] });

      await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar', 'Meditar']);

      expect(goalsInsert).toHaveBeenCalledWith([{ user_id: 'user-1', description: 'Meditar' }]);
    });

    it('treats differences in case and spacing as the same goal, and drops repeats within the list', async () => {
      const goalsInsert = vi.fn().mockResolvedValue({ error: null });
      const profilesUpsert = vi.fn().mockResolvedValue({ error: null });
      const supabase = fakeSupabase({ goalsInsert, profilesUpsert, existingGoals: ['Tener estabilidad en el amor'] });

      await confirmOnboarding(supabase, 'user-1', PROFILE, [
        '  tener   ESTABILIDAD en el amor ',
        'Meditar',
        'meditar',
      ]);

      expect(goalsInsert).toHaveBeenCalledWith([{ user_id: 'user-1', description: 'Meditar' }]);
    });

    it('does not mark the profile complete when reading the existing goals fails', async () => {
      const goalsInsert = vi.fn();
      const profilesUpsert = vi.fn();
      const supabase = fakeSupabase({
        goalsInsert,
        profilesUpsert,
        goalsRead: { data: null, error: { message: 'db down', code: '500' } },
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await confirmOnboarding(supabase, 'user-1', PROFILE, ['Ahorrar']);

      expect(result).toEqual({
        success: false,
        stage: 'goals',
        message: 'No se pudieron guardar tus metas, intenta de nuevo.',
      });
      expect(goalsInsert).not.toHaveBeenCalled();
      expect(profilesUpsert).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
