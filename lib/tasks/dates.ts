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

// Month arithmetic on "YYYY-MM" strings (a calendar month), for the Progreso calendar.

/** Parses "YYYY-MM" into its year and month (1–12). Throws on anything that isn't one. */
function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new Error(`mes inválido: "${yearMonth}"`);
  return { year: Number(match[1]), month };
}

/** Whether `value` is a real "YYYY-MM" month. Never throws. */
export function isValidYearMonth(value: string): boolean {
  try {
    parseYearMonth(value);
    return true;
  } catch {
    return false;
  }
}

/** The "YYYY-MM" month a "YYYY-MM-DD" date belongs to. Throws on an invalid date. */
export function monthOf(date: string): string {
  assertValidDate(date);
  return date.slice(0, 7);
}

/** The month `months` months after `yearMonth` (negative goes back). Throws on an invalid month. */
export function shiftMonth(yearMonth: string, months: number): string {
  const { year, month } = parseYearMonth(yearMonth);
  const index = year * 12 + (month - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** How many days `yearMonth` has (28–31). Throws on an invalid month. */
export function daysInMonth(yearMonth: string): number {
  const { year, month } = parseYearMonth(yearMonth);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The weekday of a "YYYY-MM-DD" date, with the week starting on Monday: 0 = lunes … 6 = domingo. */
export function mondayIndex(date: string): number {
  // getUTCDay: 0 = Sunday … 6 = Saturday.
  return (new Date(parseDate(date)).getUTCDay() + 6) % 7;
}
