import type { SupabaseClient } from '@supabase/supabase-js';

// Days with a conversation loaded per tap on "Ver días anteriores".
export const HISTORY_DAYS_PER_PAGE = 7;

// Supabase returns at most 1,000 rows per request and silently cuts the rest, so reads go in
// pages of this size. Safety stop: 50 pages.
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** One earlier day of conversation, its messages in order. */
export interface HistoryDay {
  // The day, "YYYY-MM-DD" (the person's local date, chat_messages.chat_date).
  date: string;
  messages: HistoryMessage[];
}

export interface HistoryPage {
  // Oldest day first, so they can go straight above the ones already on screen.
  days: HistoryDay[];
  // Whether there are more days with a conversation before the oldest one returned.
  hasMore: boolean;
}

/** Reads every page of a query (see PAGE_SIZE). Throws on a database error. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let n = 0; n < MAX_PAGES; n++) {
    const { data, error } = await page(n * PAGE_SIZE, n * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * The (up to) 7 days with a conversation right before `before` ("YYYY-MM-DD"), with all their
 * messages, crisis ones included, exactly as they were. Only reads. Meant for the person's own
 * session client: row-level security keeps it to their own conversations. Throws on a
 * database error.
 */
export async function readEarlierDays(supabase: SupabaseClient, userId: string, before: string): Promise<HistoryPage> {
  // 1. Which days: the dates before `before`, newest first, until one more than a page (to
  // know whether there are more). A day's rows come together in this order.
  const dates: string[] = [];
  for (let n = 0; n < MAX_PAGES && dates.length <= HISTORY_DAYS_PER_PAGE; n++) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('chat_date')
      .eq('user_id', userId)
      .lt('chat_date', before)
      .order('chat_date', { ascending: false })
      .range(n * PAGE_SIZE, n * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of (data as { chat_date: string }[] | null) ?? []) {
      if (dates[dates.length - 1] !== row.chat_date) dates.push(row.chat_date);
      if (dates.length > HISTORY_DAYS_PER_PAGE) break;
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  const hasMore = dates.length > HISTORY_DAYS_PER_PAGE;
  const days = dates.slice(0, HISTORY_DAYS_PER_PAGE);
  if (days.length === 0) return { days: [], hasMore: false };

  // 2. Their messages, oldest day first and in the order they were written.
  const oldest = days[days.length - 1];
  const rows = await readAll<{ chat_date: string; role: 'user' | 'assistant'; content: string }>((from, to) =>
    supabase
      .from('chat_messages')
      .select('chat_date, role, content')
      .eq('user_id', userId)
      .gte('chat_date', oldest)
      .lt('chat_date', before)
      .order('chat_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to)
  );

  const byDay = new Map<string, HistoryMessage[]>();
  for (const date of [...days].reverse()) byDay.set(date, []);
  for (const row of rows) byDay.get(row.chat_date)?.push({ role: row.role, content: row.content });

  return { days: [...byDay].map(([date, messages]) => ({ date, messages })), hasMore };
}
