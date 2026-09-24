import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveGoalStatus } from './goalStatus';

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
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as SupabaseClient, from, update, eq, select };
}

describe('saveGoalStatus', () => {
  it.each([
    ['marks a goal as achieved', 'achieved'],
    ['brings an achieved goal back to active', 'active'],
  ] as const)('%s, writing only the status of that one goal', async (_label, status) => {
    const { client, from, update, eq, select } = fakeClient({ data: [{ id: 'g1' }], error: null });

    await expect(saveGoalStatus(client, 'g1', status)).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('goals');
    expect(update).toHaveBeenCalledWith({ status });
    expect(eq).toHaveBeenCalledWith('id', 'g1');
    expect(select).toHaveBeenCalledWith('id');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports failure when Supabase returns an error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'permission denied' } });

    await expect(saveGoalStatus(client, 'g1', 'active')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each([
    ['no rows (RLS hides the goal without an error)', []],
    ['null data', null],
  ])('reports failure with %s', async (_label, data) => {
    const { client } = fakeClient({ data, error: null });

    await expect(saveGoalStatus(client, 'g1', 'active')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the call rejects', async () => {
    const select = vi.fn().mockRejectedValue(new Error('network down'));
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select }) }) }),
    } as unknown as SupabaseClient;

    await expect(saveGoalStatus(client, 'g1', 'achieved')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
