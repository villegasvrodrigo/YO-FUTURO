import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DELETE_FAILED, deleteMyAccount } from './deleteAccount';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const answer = (status: number) => vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status }));

describe('deleteMyAccount', () => {
  it('asks the server to delete the account with a POST, and reports success', async () => {
    const fetchFn = answer(200);

    await expect(deleteMyAccount(fetchFn)).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith('/api/account/delete', { method: 'POST' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['not signed in', 401],
    ['a server error', 500],
  ])('reports failure (the account stays) on %s', async (_label, status) => {
    await expect(deleteMyAccount(answer(status))).resolves.toEqual({ ok: false, error: DELETE_FAILED });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reports failure instead of throwing on a network error', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(deleteMyAccount(fetchFn)).resolves.toEqual({ ok: false, error: DELETE_FAILED });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('does not need a readable answer body to report a failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 502 }));

    await expect(deleteMyAccount(fetchFn)).resolves.toEqual({ ok: false, error: DELETE_FAILED });
  });

  it('says the account is still there when it fails', () => {
    expect(DELETE_FAILED).toContain('Tu cuenta sigue igual');
  });
});
