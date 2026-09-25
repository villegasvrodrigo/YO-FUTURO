import type { HistoryPage } from '@/app/api/chat/history/readHistory';

export const HISTORY_ERROR = 'No pude cargar los días anteriores. Intenta de nuevo.';

// A stalled connection must not leave the button waiting forever.
const HISTORY_TIMEOUT_MS = 20_000;

export type HistoryOutcome = ({ kind: 'ok' } & HistoryPage) | { kind: 'error'; message: string };

/** Asks /api/chat/history for the 7 days with a conversation before `before`. Never throws. */
export async function fetchEarlierDays(
  before: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = HISTORY_TIMEOUT_MS
): Promise<HistoryOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`/api/chat/history?before=${encodeURIComponent(before)}`, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as Partial<HistoryPage> | null;
    if (!res.ok || !body || !Array.isArray(body.days) || typeof body.hasMore !== 'boolean') {
      return { kind: 'error', message: HISTORY_ERROR };
    }
    return { kind: 'ok', days: body.days, hasMore: body.hasMore };
  } catch {
    return { kind: 'error', message: HISTORY_ERROR };
  } finally {
    clearTimeout(timer);
  }
}
