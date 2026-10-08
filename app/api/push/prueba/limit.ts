// The test notice from Perfil: what it says and its daily limit per person, so nobody can use
// it to flood a phone. The count lives in the account's private data (Supabase app_metadata,
// which only the server can write), like the daily attempts: no table needed.
import type { PushPayload } from '@/lib/push/send';

export const TEST_PUSH_LIMIT = 5;

// The key in app_metadata: { date: "YYYY-MM-DD", sent: number } for the person's local day.
export const TEST_PUSH_KEY = 'yo_futuro_avisos_prueba';

/** "{Nombre}, así se verá tu aviso diario". Tapping it opens Inicio, like the real one. */
export function testPushPayload(name: string | null | undefined): PushPayload {
  const first = name?.trim();
  return {
    title: 'Yo Futuro',
    body: first ? `${first}, así se verá tu aviso diario` : 'Así se verá tu aviso diario',
    url: '/dashboard',
    // Its own tag: a test never replaces the day's real notice on the lock screen.
    tag: 'aviso-de-prueba',
  };
}

/** How many test notices the person already sent today (0 if the record is from another day). */
export function testPushesSentToday(appMetadata: Record<string, unknown> | null | undefined, today: string): number {
  const record = appMetadata?.[TEST_PUSH_KEY] as { date?: unknown; sent?: unknown } | undefined;
  if (!record || record.date !== today || typeof record.sent !== 'number') return 0;
  return record.sent;
}

/** The record to save after one more test notice today. */
export function nextTestPushRecord(sent: number, today: string): Record<string, { date: string; sent: number }> {
  return { [TEST_PUSH_KEY]: { date: today, sent: sent + 1 } };
}
