import type { SupabaseClient } from '@supabase/supabase-js';
import { assertValidDate } from '@/lib/tasks/dates';

// One day of the history: its message, its tasks and its insight, joined by the person's
// LOCAL date (messages.message_date, daily_tasks.task_date, daily_insights.insight_date).
// Every read is meant for the signed-in user's own session client, so row-level security
// keeps it to their own rows; never pass the service-role client here.

export interface HistoryTask {
  id: string;
  position: number;
  description: string;
  completed: boolean;
}

export interface HistoryDayContent {
  message: string | null;
  tasks: HistoryTask[];
  insight: string | null;
}

// The three tables and the column that holds each one's local date.
const SOURCES = [
  { table: 'messages', column: 'message_date' },
  { table: 'daily_tasks', column: 'task_date' },
  { table: 'daily_insights', column: 'insight_date' },
] as const;

/** Whether the day has anything to show. */
export function hasContent(day: HistoryDayContent): boolean {
  return day.message !== null || day.tasks.length > 0 || day.insight !== null;
}

/** Trimmed text, or null when it is missing or blank. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Reads what the person has on `date` ("YYYY-MM-DD"): the message, the tasks in order and the
 * insight, the three at the same time. Throws on an invalid date or a failed read.
 */
export async function readHistoryDay(supabase: SupabaseClient, userId: string, date: string): Promise<HistoryDayContent> {
  assertValidDate(date);
  const [message, tasks, insight] = await Promise.all([
    supabase.from('messages').select('content').eq('user_id', userId).eq('message_date', date).maybeSingle(),
    supabase
      .from('daily_tasks')
      .select('id, position, description, completed')
      .eq('user_id', userId)
      .eq('task_date', date)
      .order('position', { ascending: true }),
    supabase.from('daily_insights').select('content').eq('user_id', userId).eq('insight_date', date).maybeSingle(),
  ]);
  const error = message.error ?? tasks.error ?? insight.error;
  if (error) throw new Error(error.message);

  return {
    message: text((message.data as { content?: unknown } | null)?.content),
    tasks: ((tasks.data as HistoryTask[] | null) ?? []).filter(
      (task) => typeof task?.description === 'string' && typeof task?.completed === 'boolean'
    ),
    insight: text((insight.data as { content?: unknown } | null)?.content),
  };
}

/**
 * The closest date strictly before (`'prev'`) or after (`'next'`) `date` on which the person
 * has a message, tasks or an insight; `'next'` never goes past `today`. Null when there is
 * none. One small read per table, at the same time. Throws on a failed read.
 */
export async function neighborDay(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  direction: 'prev' | 'next',
  today: string
): Promise<string | null> {
  assertValidDate(date);
  assertValidDate(today);
  if (direction === 'next' && date >= today) return null;

  const found = await Promise.all(
    SOURCES.map(async ({ table, column }) => {
      let query = supabase.from(table).select(column).eq('user_id', userId);
      query = direction === 'prev' ? query.lt(column, date) : query.gt(column, date).lte(column, today);
      const { data, error } = await query.order(column, { ascending: direction === 'next' }).limit(1);
      if (error) throw new Error(error.message);
      const value = (data as Record<string, unknown>[] | null)?.[0]?.[column];
      return typeof value === 'string' ? value : null;
    })
  );

  const dates = found.filter((value): value is string => value !== null).sort();
  if (dates.length === 0) return null;
  return direction === 'prev' ? dates[dates.length - 1] : dates[0];
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"), always positive. */
function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/** Of the two candidates around `date`, the closer one; on a tie, the earlier one. */
export function closestDay(date: string, prev: string | null, next: string | null): string | null {
  if (prev === null) return next;
  if (next === null) return prev;
  return daysApart(prev, date) <= daysApart(next, date) ? prev : next;
}

/** The raw `?dia=` value if it is a real "YYYY-MM-DD" date, otherwise null. Never throws. */
export function parseRequestedDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    assertValidDate(value);
    return value;
  } catch {
    return null;
  }
}

/**
 * The dates from `from` to `to` (both "YYYY-MM-DD", inclusive) on which the person has a
 * message or an insight, for the Progreso calendar (it already knows the days with tasks).
 * Returns an empty set — never throws — if anything fails (logged): the calendar then only
 * links the days with tasks.
 */
export async function messageOrInsightDates(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string
): Promise<Set<string>> {
  try {
    assertValidDate(from);
    assertValidDate(to);
    const found = await Promise.all(
      SOURCES.filter(({ table }) => table !== 'daily_tasks').map(async ({ table, column }) => {
        const { data, error } = await supabase
          .from(table)
          .select(column)
          .eq('user_id', userId)
          .gte(column, from)
          .lte(column, to);
        if (error) throw new Error(error.message);
        return ((data as Record<string, unknown>[] | null) ?? [])
          .map((row) => row[column])
          .filter((value): value is string => typeof value === 'string');
      })
    );
    return new Set(found.flat());
  } catch (err) {
    console.error(`[progreso] no se pudieron leer los días con mensaje o insight del perfil ${userId}:`, err);
    return new Set();
  }
}

// What Inicio's cards can page through, each on its own: the daily messages or the insights.
export type DayEntryKind = 'message' | 'insight';

export interface DayEntry {
  // The person's local date, "YYYY-MM-DD".
  date: string;
  content: string;
}

const ENTRY_SOURCES: Record<DayEntryKind, { table: string; column: string }> = {
  message: { table: 'messages', column: 'message_date' },
  insight: { table: 'daily_insights', column: 'insight_date' },
};

/**
 * The person's closest message or insight (`kind`) dated strictly before `before`
 * ("YYYY-MM-DD"), or null when there is none. Read only, one small query; meant for the
 * signed-in user's own client (browser or server), so row-level security keeps it to their
 * own rows. Throws on an invalid date or a failed read.
 */
export async function olderEntry(
  supabase: SupabaseClient,
  userId: string,
  kind: DayEntryKind,
  before: string
): Promise<DayEntry | null> {
  assertValidDate(before);
  const { table, column } = ENTRY_SOURCES[kind];
  const { data, error } = await supabase
    .from(table)
    .select(`${column}, content`)
    .eq('user_id', userId)
    .lt(column, before)
    .order(column, { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data as unknown as Record<string, unknown>[] | null)?.[0];
  const date = row?.[column];
  if (typeof date !== 'string' || typeof row?.content !== 'string') return null;
  return { date, content: row.content.trim() };
}

/** One earlier day of tasks, for Inicio's tasks card. */
export interface TasksDay {
  date: string;
  tasks: HistoryTask[];
}

/**
 * The person's closest day with tasks strictly before `before` ("YYYY-MM-DD"), with all its
 * tasks in order, or null when there is none. Read only, one small query (a day has at most
 * 3 tasks); meant for the signed-in user's own client. Throws on an invalid date or a failed
 * read.
 */
export async function olderTasks(supabase: SupabaseClient, userId: string, before: string): Promise<TasksDay | null> {
  assertValidDate(before);
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('id, task_date, position, description, completed')
    .eq('user_id', userId)
    .lt('task_date', before)
    .order('task_date', { ascending: false })
    .limit(3);
  if (error) throw new Error(error.message);
  const rows = ((data as (HistoryTask & { task_date?: unknown })[] | null) ?? []).filter(
    (row) => typeof row?.task_date === 'string' && typeof row.description === 'string' && typeof row.completed === 'boolean'
  );
  if (rows.length === 0) return null;
  // The 3 rows may reach into the day before: keep only the closest day's.
  const date = rows[0].task_date as string;
  const tasks = rows
    .filter((row) => row.task_date === date)
    .sort((a, b) => a.position - b.position)
    .map(({ id, position, description, completed }) => ({ id, position, description, completed }));
  return { date, tasks };
}
