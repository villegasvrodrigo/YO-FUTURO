import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchJsonWithTimeout } from './fetchWithTimeout';

/** Mimics real fetch: the returned promise only settles when the request's signal aborts. */
function abortableFetchMock() {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const err = new DOMException('The operation was aborted.', 'AbortError');
        reject(err);
      });
    });
  });
}

describe('fetchJsonWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed JSON body on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ hello: 'world' }) })
    );

    const result = await fetchJsonWithTimeout('/api/x', [], 'default error', 5000, 'timed out');

    expect(result).toEqual({ hello: 'world' });
  });

  it('throws the server-provided error message for a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'algo salió mal' }) })
    );

    await expect(fetchJsonWithTimeout('/api/x', [], 'default error', 5000, 'timed out')).rejects.toThrow(
      'algo salió mal'
    );
  });

  it('falls back to the default error message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) })
    );

    await expect(fetchJsonWithTimeout('/api/x', [], 'default error', 5000, 'timed out')).rejects.toThrow(
      'default error'
    );
  });

  it('aborts and rejects with the timeout message once timeoutMs elapses', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', abortableFetchMock());

    const promise = fetchJsonWithTimeout('/api/x', [], 'default error', 5000, 'timed out');
    const assertion = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5000);

    await assertion;
  });
});
