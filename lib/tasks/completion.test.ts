import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { completionPercent, taskCompletionUpdate, saveTaskCompletion } from './completion';

const task = (completed: boolean) => ({ completed });

describe('completionPercent', () => {
  it('is 0 when there are no tasks', () => {
    expect(completionPercent([])).toBe(0);
  });

  it.each([
    [[false, false, false], 0],
    [[true, false, false], 33],
    [[true, true, false], 67],
    [[true, true, true], 100],
  ])('for %j it is %i', (states, expected) => {
    expect(completionPercent(states.map(task))).toBe(expected);
  });

  it('is checked ÷ total × 100 for any total', () => {
    expect(completionPercent([task(true), task(false)])).toBe(50);
    expect(completionPercent([task(true)])).toBe(100);
  });
});

describe('taskCompletionUpdate', () => {
  const now = new Date('2026-09-21T19:00:00Z');

  it('stamps completed_at with the current time when checking', () => {
    expect(taskCompletionUpdate(true, now)).toEqual({
      completed: true,
      completed_at: '2026-09-21T19:00:00.000Z',
    });
  });

  it('clears completed_at when unchecking', () => {
    expect(taskCompletionUpdate(false, now)).toEqual({ completed: false, completed_at: null });
  });
});

describe('saveTaskCompletion', () => {
  const update = { completed: true, completed_at: '2026-09-21T19:00:00.000Z' };
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeClient(result: unknown) {
    const select = vi.fn().mockResolvedValue(result);
    const eq = vi.fn(() => ({ select }));
    const updateFn = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update: updateFn }));
    return { client: { from } as unknown as SupabaseClient, from, updateFn, eq, select };
  }

  it('updates completed and completed_at of that one task and reports success', async () => {
    const { client, from, updateFn, eq, select } = fakeClient({ data: [{ id: 't1' }], error: null });

    await expect(saveTaskCompletion(client, 't1', update)).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('daily_tasks');
    expect(updateFn).toHaveBeenCalledWith(update);
    expect(eq).toHaveBeenCalledWith('id', 't1');
    expect(select).toHaveBeenCalledWith('id');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports failure when Supabase returns an error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } });

    await expect(saveTaskCompletion(client, 't1', update)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports failure when no row was updated (RLS hides the row without an error)', async () => {
    const { client } = fakeClient({ data: [], error: null });

    await expect(saveTaskCompletion(client, 't1', update)).resolves.toBe(false);
  });

  it('reports failure instead of throwing when the call rejects', async () => {
    const select = vi.fn().mockRejectedValue(new Error('network down'));
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select }) }) }),
    } as unknown as SupabaseClient;

    await expect(saveTaskCompletion(client, 't1', update)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
