import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_EXTRACTED_PROFILE } from './extraction';
import { loadOnboardingProgress, saveOnboardingProgress, clearOnboardingProgress } from './progress';

/** Minimal stand-in for the Supabase query builder chains this module actually uses. */
function fakeSupabase(overrides: {
  maybeSingle?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  deleteEq?: ReturnType<typeof vi.fn>;
}) {
  const eq = vi.fn().mockReturnValue({ maybeSingle: overrides.maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const deleteFn = vi.fn().mockReturnValue({ eq: overrides.deleteEq });
  const from = vi.fn().mockReturnValue({ select, upsert: overrides.upsert, delete: deleteFn });
  return { from, eq, select, deleteFn } as unknown as SupabaseClient;
}

describe('loadOnboardingProgress', () => {
  it('returns the saved progress for the given user', async () => {
    const saved = { transcript: [{ role: 'user', content: 'Hola' }], extracted: EMPTY_EXTRACTED_PROFILE, done: false };
    const maybeSingle = vi.fn().mockResolvedValue({ data: saved, error: null });
    const supabase = fakeSupabase({ maybeSingle });

    const result = await loadOnboardingProgress(supabase, 'user-1');

    expect(result).toEqual(saved);
    expect(supabase.from).toHaveBeenCalledWith('onboarding_progress');
  });

  it('returns null when there is no saved progress', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = fakeSupabase({ maybeSingle });

    const result = await loadOnboardingProgress(supabase, 'user-1');

    expect(result).toBeNull();
  });

  it('returns null (not a thrown error) when the query fails', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('db down') });
    const supabase = fakeSupabase({ maybeSingle });

    const result = await loadOnboardingProgress(supabase, 'user-1');

    expect(result).toBeNull();
  });
});

describe('saveOnboardingProgress', () => {
  it('upserts the transcript, extracted profile and done flag for the given user', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase({ upsert });
    const progress = { transcript: [{ role: 'user' as const, content: 'Hola' }], extracted: EMPTY_EXTRACTED_PROFILE, done: true };

    await saveOnboardingProgress(supabase, 'user-1', progress);

    expect(supabase.from).toHaveBeenCalledWith('onboarding_progress');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        transcript: progress.transcript,
        extracted: progress.extracted,
        done: true,
      })
    );
  });

  it('does not throw when the upsert fails (best-effort persistence)', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: new Error('db down') });
    const supabase = fakeSupabase({ upsert });

    await expect(
      saveOnboardingProgress(supabase, 'user-1', { transcript: [], extracted: EMPTY_EXTRACTED_PROFILE, done: false })
    ).resolves.not.toThrow();
  });
});

describe('clearOnboardingProgress', () => {
  it('deletes the progress row for the given user', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase({ deleteEq });

    await clearOnboardingProgress(supabase, 'user-1');

    expect(supabase.from).toHaveBeenCalledWith('onboarding_progress');
    expect(deleteEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('does not throw when the delete fails (best-effort cleanup)', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: new Error('db down') });
    const supabase = fakeSupabase({ deleteEq });

    await expect(clearOnboardingProgress(supabase, 'user-1')).resolves.not.toThrow();
  });
});
