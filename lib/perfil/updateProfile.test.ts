import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateProfile, type ProfileUpdate } from './updateProfile';

const UPDATE: ProfileUpdate = {
  name: 'Rodrigo',
  current_age: 30,
  future_self_age: 40,
  focus_area: 'finanzas',
  tone: 'directo',
  values: 'honestidad',
  delivery_hour_local: 8,
};

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

describe('updateProfile', () => {
  it('updates the fields of that one profile and reports success', async () => {
    const { client, from, update, eq, select } = fakeClient({ data: [{ id: 'p1' }], error: null });

    await expect(updateProfile(client, 'p1', UPDATE)).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith(UPDATE);
    expect(eq).toHaveBeenCalledWith('id', 'p1');
    expect(select).toHaveBeenCalledWith('id');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reports failure when Supabase returns an error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'violates check constraint' } });

    await expect(updateProfile(client, 'p1', UPDATE)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each([
    ['no rows (RLS hides the row without an error)', []],
    ['null data', null],
  ])('reports failure with %s', async (_label, data) => {
    const { client } = fakeClient({ data, error: null });

    await expect(updateProfile(client, 'p1', UPDATE)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the call rejects', async () => {
    const select = vi.fn().mockRejectedValue(new Error('network down'));
    const client = {
      from: () => ({ update: () => ({ eq: () => ({ select }) }) }),
    } as unknown as SupabaseClient;

    await expect(updateProfile(client, 'p1', UPDATE)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
