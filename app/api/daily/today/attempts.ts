// The daily limit of AI attempts to create a person's day from the app, so reloading the page
// can't run up costs. Kept in the account's private data (Supabase app_metadata, which only the
// server can write): no table needed. A soft limit: two tabs at the very same instant could
// both count as one attempt, which is fine.

export const DAILY_ATTEMPTS_LIMIT = 5;

// The key in app_metadata: { date: "YYYY-MM-DD", attempts: number } for the person's local day.
export const ATTEMPTS_KEY = 'yo_futuro_intentos_dia';

interface AttemptsRecord {
  date?: unknown;
  attempts?: unknown;
}

/** How many attempts the person already used today (0 if the record is from another day). */
export function attemptsUsedToday(appMetadata: Record<string, unknown> | null | undefined, today: string): number {
  const record = appMetadata?.[ATTEMPTS_KEY] as AttemptsRecord | undefined;
  if (!record || record.date !== today || typeof record.attempts !== 'number') return 0;
  return record.attempts;
}

/** The record to save after one more attempt today. */
export function nextAttemptsRecord(used: number, today: string): Record<string, { date: string; attempts: number }> {
  return { [ATTEMPTS_KEY]: { date: today, attempts: used + 1 } };
}
