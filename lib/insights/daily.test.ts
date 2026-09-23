import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./generate', () => ({ generateDailyInsight: vi.fn() }));
vi.mock('./save', () => ({ getRecentInsights: vi.fn() }));
vi.mock('@/lib/tasks/checked', () => ({ getRecentCompletedTasks: vi.fn() }));

import { prepareDailyInsight } from './daily';
import { generateDailyInsight } from './generate';
import { getRecentInsights } from './save';
import { getRecentCompletedTasks } from '@/lib/tasks/checked';
import type { Goal, Profile } from '@/lib/types';

const supabase = { fake: 'admin client' } as never;

const profile: Profile = {
  id: 'user-1',
  name: 'Rodrigo',
  current_age: 30,
  future_self_age: 60,
  values: 'Valoro la paz y la libertad',
  focus_area: 'finanzas',
  tone: 'motivador',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: 'Sientes ansiedad al revisar tu cuenta.',
  blocking_pattern: 'Evitas hablar de dinero.',
  future_vision: 'Quieres vivir con calma y abundancia.',
  created_at: '',
  updated_at: '',
};

const goals: Goal[] = [
  { id: 'g1', user_id: 'user-1', description: 'Facturar 200k en 6 meses', status: 'active', created_at: '' },
  { id: 'g2', user_id: 'user-1', description: 'Confiar en mí mismo', status: 'active', created_at: '' },
];

const INSIGHT = { content: 'Estás aprendiendo que la calma también se practica.', modelUsed: 'claude-sonnet-5' };
// 2026-09-23 15:00 UTC = 09:00 that same day in Mexico City.
const NOW = new Date('2026-09-23T15:00:00Z');

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getRecentCompletedTasks).mockResolvedValue(['Tarea marcada ayer.']);
  vi.mocked(getRecentInsights).mockResolvedValue(['Insight de ayer.']);
  vi.mocked(generateDailyInsight).mockResolvedValue(INSIGHT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getRecentCompletedTasks).mockReset();
  vi.mocked(getRecentInsights).mockReset();
  vi.mocked(generateDailyInsight).mockReset();
});

describe('prepareDailyInsight', () => {
  it("returns the user's local date, the insight and the model", async () => {
    const result = await prepareDailyInsight(supabase, profile, goals, 'El mensaje de hoy.', NOW);

    expect(result).toEqual({ insightDate: '2026-09-23', ...INSIGHT });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("uses the date in the user's time zone, not the UTC date", async () => {
    // 2026-09-24 03:00 UTC is still the evening of Sep 23 in Mexico City.
    const result = await prepareDailyInsight(supabase, profile, goals, 'x', new Date('2026-09-24T03:00:00Z'));

    expect(result?.insightDate).toBe('2026-09-23');
    expect(getRecentInsights).toHaveBeenCalledWith('user-1', '2026-09-23', supabase);
  });

  it('reads the checked tasks and the recent insights of that user for that date, with the admin client', async () => {
    await prepareDailyInsight(supabase, profile, goals, 'x', NOW);

    expect(getRecentCompletedTasks).toHaveBeenCalledWith('user-1', '2026-09-23', supabase);
    expect(getRecentInsights).toHaveBeenCalledWith('user-1', '2026-09-23', supabase);
  });

  it('gives the AI the profile, the radiography, the goals, the message, the checked tasks and the recent insights', async () => {
    await prepareDailyInsight(supabase, profile, goals, 'El mensaje de hoy.', NOW);

    expect(generateDailyInsight).toHaveBeenCalledTimes(1);
    expect(generateDailyInsight).toHaveBeenCalledWith({
      name: 'Rodrigo',
      focusArea: 'finanzas',
      tone: 'motivador',
      values: 'Valoro la paz y la libertad',
      goals: ['Facturar 200k en 6 meses', 'Confiar en mí mismo'],
      currentEnergySummary: 'Sientes ansiedad al revisar tu cuenta.',
      blockingPattern: 'Evitas hablar de dinero.',
      futureVision: 'Quieres vivir con calma y abundancia.',
      messageText: 'El mensaje de hoy.',
      insightDate: '2026-09-23',
      recentInsights: ['Insight de ayer.'],
      completedTasks: ['Tarea marcada ayer.'],
    });
  });

  it('passes null radiography and no goals through as they are', async () => {
    const bare = { ...profile, current_energy_summary: null, blocking_pattern: null, future_vision: null };

    await prepareDailyInsight(supabase, bare, [], 'x', NOW);

    expect(generateDailyInsight).toHaveBeenCalledWith(
      expect.objectContaining({ goals: [], currentEnergySummary: null, blockingPattern: null, futureVision: null })
    );
  });

  it('still asks for an insight when both reads find nothing (or failed and returned [])', async () => {
    vi.mocked(getRecentCompletedTasks).mockResolvedValue([]);
    vi.mocked(getRecentInsights).mockResolvedValue([]);

    const result = await prepareDailyInsight(supabase, profile, goals, 'x', NOW);

    expect(result?.content).toBe(INSIGHT.content);
    expect(generateDailyInsight).toHaveBeenCalledWith(
      expect.objectContaining({ recentInsights: [], completedTasks: [] })
    );
  });

  it('runs the two reads at the same time, not one after the other', async () => {
    let resolveChecked: (value: string[]) => void = () => {};
    vi.mocked(getRecentCompletedTasks).mockReturnValue(new Promise((r) => (resolveChecked = r)));

    const pending = prepareDailyInsight(supabase, profile, goals, 'x', NOW);
    await Promise.resolve();

    expect(getRecentInsights).toHaveBeenCalled();
    resolveChecked([]);
    await pending;
  });

  it('only reads: it does not save anything', async () => {
    const write = vi.fn();
    const client = { from: write } as never;

    await prepareDailyInsight(client, profile, goals, 'x', NOW);

    expect(write).not.toHaveBeenCalled();
  });

  describe('when something goes wrong it returns null and never throws', () => {
    it('the AI gives no insight', async () => {
      vi.mocked(generateDailyInsight).mockResolvedValue(null);

      await expect(prepareDailyInsight(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
    });

    it('the AI call rejects', async () => {
      vi.mocked(generateDailyInsight).mockRejectedValue(new Error('claude caído'));

      await expect(prepareDailyInsight(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('a read rejects', async () => {
      vi.mocked(getRecentInsights).mockRejectedValue(new Error('db caída'));

      await expect(prepareDailyInsight(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
      expect(generateDailyInsight).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('the time zone is invalid: no read and no AI call are made', async () => {
      const broken = { ...profile, timezone: 'No/Existe' };

      await expect(prepareDailyInsight(supabase, broken, goals, 'x', NOW)).resolves.toBeNull();
      expect(getRecentCompletedTasks).not.toHaveBeenCalled();
      expect(getRecentInsights).not.toHaveBeenCalled();
      expect(generateDailyInsight).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('a step throws synchronously', async () => {
      vi.mocked(generateDailyInsight).mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(prepareDailyInsight(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
    });
  });

  describe('deadline', () => {
    it('gives up at exactly 20 s if the AI call never finishes', async () => {
      vi.useFakeTimers();
      vi.mocked(generateDailyInsight).mockReturnValue(new Promise(() => {}));
      let result: unknown = 'pending';
      const pending = prepareDailyInsight(supabase, profile, goals, 'x', NOW).then((r) => {
        result = r;
      });

      await vi.advanceTimersByTimeAsync(19_999);
      expect(result).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('gives up at 20 s if a read never finishes', async () => {
      vi.useFakeTimers();
      vi.mocked(getRecentCompletedTasks).mockReturnValue(new Promise(() => {}));
      const pending = prepareDailyInsight(supabase, profile, goals, 'x', NOW);

      await vi.advanceTimersByTimeAsync(20_000);

      await expect(pending).resolves.toBeNull();
      expect(generateDailyInsight).not.toHaveBeenCalled();
    });

    it('does not fail later if the abandoned work rejects after the deadline', async () => {
      vi.useFakeTimers();
      let rejectLate: (reason: Error) => void = () => {};
      vi.mocked(generateDailyInsight).mockReturnValue(
        new Promise((_, reject) => {
          rejectLate = reject;
        })
      );
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);

      const pending = prepareDailyInsight(supabase, profile, goals, 'x', NOW);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBeNull();
      rejectLate(new Error('llegó tarde'));
      await vi.advanceTimersByTimeAsync(10);

      expect(unhandled).not.toHaveBeenCalled();
      process.off('unhandledRejection', unhandled);
    });

    it('leaves no timer running after a normal answer', async () => {
      vi.useFakeTimers();

      await prepareDailyInsight(supabase, profile, goals, 'x', NOW);

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
