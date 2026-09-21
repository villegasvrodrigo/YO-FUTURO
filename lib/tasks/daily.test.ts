import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./generate', () => ({ generateDailyTasks: vi.fn() }));
vi.mock('./save', () => ({ getRecentTaskDescriptions: vi.fn() }));

import { prepareDailyTasks } from './daily';
import { generateDailyTasks } from './generate';
import { getRecentTaskDescriptions } from './save';
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

const TASKS = ['Tarea uno.', 'Tarea dos.', 'Tarea tres.'];
// 2026-09-21 15:00 UTC = 09:00 that same day in Mexico City.
const NOW = new Date('2026-09-21T15:00:00Z');

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getRecentTaskDescriptions).mockResolvedValue(['Ayer 1', 'Ayer 2']);
  vi.mocked(generateDailyTasks).mockResolvedValue(TASKS);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getRecentTaskDescriptions).mockReset();
  vi.mocked(generateDailyTasks).mockReset();
});

describe('prepareDailyTasks', () => {
  it('returns the user\'s local date and the 3 tasks', async () => {
    const result = await prepareDailyTasks(supabase, profile, goals, 'El mensaje de hoy.', NOW);

    expect(result).toEqual({ taskDate: '2026-09-21', tasks: TASKS });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses the date in the user\'s time zone, not the UTC date', async () => {
    // 2026-09-22 03:00 UTC is still the evening of Sep 21 in Mexico City.
    const result = await prepareDailyTasks(
      supabase,
      profile,
      goals,
      'x',
      new Date('2026-09-22T03:00:00Z')
    );

    expect(result?.taskDate).toBe('2026-09-21');
  });

  it('reads the recent tasks of that user for that date, with the admin client', async () => {
    await prepareDailyTasks(supabase, profile, goals, 'x', NOW);

    expect(getRecentTaskDescriptions).toHaveBeenCalledWith('user-1', '2026-09-21', supabase);
  });

  it('gives the AI the profile, the radiography, the active goals, the message and the recent tasks', async () => {
    await prepareDailyTasks(supabase, profile, goals, 'El mensaje de hoy.', NOW);

    expect(generateDailyTasks).toHaveBeenCalledTimes(1);
    expect(generateDailyTasks).toHaveBeenCalledWith({
      name: 'Rodrigo',
      focusArea: 'finanzas',
      tone: 'motivador',
      values: 'Valoro la paz y la libertad',
      goals: ['Facturar 200k en 6 meses', 'Confiar en mí mismo'],
      currentEnergySummary: 'Sientes ansiedad al revisar tu cuenta.',
      blockingPattern: 'Evitas hablar de dinero.',
      futureVision: 'Quieres vivir con calma y abundancia.',
      messageText: 'El mensaje de hoy.',
      taskDate: '2026-09-21',
      recentTasks: ['Ayer 1', 'Ayer 2'],
    });
  });

  it('passes null radiography and no goals through as they are', async () => {
    const bare = { ...profile, current_energy_summary: null, blocking_pattern: null, future_vision: null };

    await prepareDailyTasks(supabase, bare, [], 'x', NOW);

    expect(generateDailyTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        goals: [],
        currentEnergySummary: null,
        blockingPattern: null,
        futureVision: null,
      })
    );
  });

  it('still asks for tasks (with no recent ones) when the recent-tasks read finds nothing or failed', async () => {
    vi.mocked(getRecentTaskDescriptions).mockResolvedValue([]);

    const result = await prepareDailyTasks(supabase, profile, goals, 'x', NOW);

    expect(result?.tasks).toEqual(TASKS);
    expect(generateDailyTasks).toHaveBeenCalledWith(expect.objectContaining({ recentTasks: [] }));
  });

  it('only reads: it does not save anything', async () => {
    const write = vi.fn();
    const client = { from: write } as never;

    await prepareDailyTasks(client, profile, goals, 'x', NOW);

    expect(write).not.toHaveBeenCalled();
  });

  describe('when something goes wrong it returns null and never throws', () => {
    it('the AI returns no tasks', async () => {
      vi.mocked(generateDailyTasks).mockResolvedValue(null);

      await expect(prepareDailyTasks(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
    });

    it('the AI call rejects', async () => {
      vi.mocked(generateDailyTasks).mockRejectedValue(new Error('claude caído'));

      await expect(prepareDailyTasks(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('the recent-tasks read rejects', async () => {
      vi.mocked(getRecentTaskDescriptions).mockRejectedValue(new Error('db caída'));

      await expect(prepareDailyTasks(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
      expect(generateDailyTasks).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('the time zone is invalid: no AI call is made', async () => {
      const broken = { ...profile, timezone: 'No/Existe' };

      await expect(prepareDailyTasks(supabase, broken, goals, 'x', NOW)).resolves.toBeNull();
      expect(generateDailyTasks).not.toHaveBeenCalled();
      expect(getRecentTaskDescriptions).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('a step throws synchronously', async () => {
      vi.mocked(generateDailyTasks).mockImplementation(() => {
        throw new Error('boom');
      });

      await expect(prepareDailyTasks(supabase, profile, goals, 'x', NOW)).resolves.toBeNull();
    });
  });

  describe('deadline', () => {
    it('gives up at exactly 20 s if the AI call never finishes', async () => {
      vi.useFakeTimers();
      vi.mocked(generateDailyTasks).mockReturnValue(new Promise(() => {}));
      let result: unknown = 'pending';
      const pending = prepareDailyTasks(supabase, profile, goals, 'x', NOW).then((r) => {
        result = r;
      });

      await vi.advanceTimersByTimeAsync(19_999);
      expect(result).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('gives up at 20 s if the recent-tasks read never finishes', async () => {
      vi.useFakeTimers();
      vi.mocked(getRecentTaskDescriptions).mockReturnValue(new Promise(() => {}));
      const pending = prepareDailyTasks(supabase, profile, goals, 'x', NOW);

      await vi.advanceTimersByTimeAsync(20_000);

      await expect(pending).resolves.toBeNull();
      expect(generateDailyTasks).not.toHaveBeenCalled();
    });

    it('does not fail later if the abandoned work rejects after the deadline', async () => {
      vi.useFakeTimers();
      let rejectLate: (reason: Error) => void = () => {};
      vi.mocked(generateDailyTasks).mockReturnValue(
        new Promise((_, reject) => {
          rejectLate = reject;
        })
      );
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);

      const pending = prepareDailyTasks(supabase, profile, goals, 'x', NOW);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBeNull();
      rejectLate(new Error('llegó tarde'));
      await vi.advanceTimersByTimeAsync(10);

      expect(unhandled).not.toHaveBeenCalled();
      process.off('unhandledRejection', unhandled);
    });

    it('leaves no timer running after a normal answer', async () => {
      vi.useFakeTimers();

      await prepareDailyTasks(supabase, profile, goals, 'x', NOW);

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
