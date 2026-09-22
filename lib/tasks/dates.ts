const MS_PER_DAY = 86_400_000;

// Calendar arithmetic on "YYYY-MM-DD" strings, done in UTC so time zones and DST never
// shift the result. Same rules as the private helpers in save.ts, which the cron uses and
// is left untouched on purpose.

/** Parses "YYYY-MM-DD" to UTC midnight in ms. Throws on anything that isn't a real date. */
function parseDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`fecha inválida: "${date}"`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Date.UTC rolls impossible dates over (2026-02-31 becomes March 3): round-trip to reject them.
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new Error(`fecha inválida: "${date}"`);
  }
  return ms;
}

/** Throws if `date` is not a real "YYYY-MM-DD" calendar date. */
export function assertValidDate(date: string): void {
  parseDate(date);
}

/** The date `days` calendar days after `date` (negative goes back). Throws on an invalid date. */
export function shiftDate(date: string, days: number): string {
  return new Date(parseDate(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
