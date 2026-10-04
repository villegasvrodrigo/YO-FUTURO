import type { createAdminClient } from '@/lib/supabase/admin';
import { generateMessage } from '@/lib/messages/generate';
import { getLocalDateString } from '@/lib/messages/delivery';
import { FALLBACK_TIMEZONE } from '@/lib/chat/rules';
import { prepareDailyTasks } from '@/lib/tasks/daily';
import { saveDailyTasks } from '@/lib/tasks/save';
import { prepareDailyInsight } from '@/lib/insights/daily';
import { saveDailyInsight } from '@/lib/insights/save';
import type { Goal, MessageRecord, Profile } from '@/lib/types';

// The person's day: today's message (with its tasks and insight) belongs to their local
// calendar day, which changes at their midnight. Shared by the daily cron (which emails it at
// their hour) and, later, the app (which creates it when they open Inicio first).
//
// The database keeps it to one message per person per day (unique index messages_one_per_day
// on user_id + message_date), and messages.email_claimed_at lets exactly one run send its email.

type AdminClient = ReturnType<typeof createAdminClient>;

/** A message row with the two columns of the day's design (both optional in old rows). */
export type DayMessage = MessageRecord & {
  message_date?: string | null;
  email_claimed_at?: string | null;
};

// Postgres' code for a unique constraint violation (here: one message per person per day).
export const UNIQUE_VIOLATION = '23505';

// A run that claimed an email but never sent it (it crashed) is given up on after this long:
// another run may claim it again, so the email is never stuck.
export const EMAIL_CLAIM_TIMEOUT_MINUTES = 15;

/** The person's local day as "YYYY-MM-DD". Throws (RangeError) on an invalid time zone. */
export function localToday(now: Date, timezone: string): string {
  return getLocalDateString(now, timezone);
}

/**
 * The person's time zone if it is a valid one, otherwise the fallback (Mexico City, the same
 * one the chat uses). Never throws. The app uses it so an odd time zone never leaves someone
 * without their day; the cron keeps excluding those profiles from the email.
 */
export function effectiveTimezone(timezone: string | null | undefined): string {
  if (timezone) {
    try {
      getLocalDateString(new Date(), timezone);
      return timezone;
    } catch {
      // Invalid: fall back below.
    }
  }
  return FALLBACK_TIMEZONE;
}

/** Whether `message` is the person's message of today (by message_date, or by when it was made). */
export function isTodayMessage(message: DayMessage | null | undefined, now: Date, timezone: string): boolean {
  if (!message) return false;
  return findTodayMessage([message], localToday(now, timezone), timezone) !== null;
}

/**
 * Today's message among the person's most recent ones: by its message_date, or, for an old
 * row without it, by the day it was generated in their time zone. Null when there is none.
 */
export function findTodayMessage(recent: DayMessage[], today: string, timezone: string): DayMessage | null {
  return (
    recent.find((message) =>
      message.message_date
        ? message.message_date === today
        : getLocalDateString(new Date(message.generated_at), timezone) === today
    ) ?? null
  );
}

/**
 * Writes the day's message with the AI, retrying once if the first attempt fails. Throws if
 * both fail (the cron counts that person as failed).
 */
export async function generateWithRetry(profile: Profile, goals: Goal[], recentMessages: MessageRecord[]) {
  try {
    return await generateMessage(profile, goals, recentMessages);
  } catch (err) {
    console.error(`[dia] primer intento de generación falló para el perfil ${profile.id}, reintentando:`, err);
    return await generateMessage(profile, goals, recentMessages);
  }
}

export type SaveTodayResult = { status: 'saved'; message: DayMessage } | { status: 'duplicate' };

/**
 * Saves today's message (pending email). With `claimEmail`, it is saved already claimed for
 * this run, which is about to send it. If the person already has a message today (another
 * run, or the app, saved it first), returns 'duplicate' instead of saving a second one.
 * Throws on any other database error.
 */
export async function saveTodayMessage(
  supabase: AdminClient,
  input: { userId: string; content: string; modelUsed: string; today: string; now: Date; claimEmail: boolean }
): Promise<SaveTodayResult> {
  const row = {
    user_id: input.userId,
    content: input.content,
    model_used: input.modelUsed,
    send_status: 'pending' as const,
    message_date: input.today,
    ...(input.claimEmail ? { email_claimed_at: input.now.toISOString() } : {}),
  };
  const { data, error } = await supabase.from('messages').insert(row).select().single();

  if ((error as { code?: string } | null)?.code === UNIQUE_VIOLATION) return { status: 'duplicate' };
  if (error || !data) throw new Error(`No se pudo guardar el mensaje: ${error?.message}`);
  // What was saved, completed with what the database returns (its id and timestamps).
  return { status: 'saved', message: { ...row, ...(data as Partial<DayMessage>) } as DayMessage };
}

/** Today's message read from the database (after a duplicate), or null. Throws on error. */
export async function readTodayMessage(supabase: AdminClient, userId: string, today: string): Promise<DayMessage | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('message_date', today)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el mensaje de hoy: ${error.message}`);
  return (data as DayMessage | null) ?? null;
}

/**
 * Claims the email of a pending message for this run, in a single database operation: it
 * only succeeds if nobody claimed it, or the last claim is older than
 * EMAIL_CLAIM_TIMEOUT_MINUTES (that run crashed). True when this run got it (and must send
 * it); false when another run has it. Throws on a database error.
 */
export async function claimTodayEmail(supabase: AdminClient, messageId: string, now: Date): Promise<boolean> {
  const stale = new Date(now.getTime() - EMAIL_CLAIM_TIMEOUT_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from('messages')
    .update({ email_claimed_at: now.toISOString() })
    .eq('id', messageId)
    .eq('send_status', 'pending')
    .or(`email_claimed_at.is.null,email_claimed_at.lt.${stale}`)
    .select('id');
  if (error) throw new Error(`No se pudo apartar el correo: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Today's tasks already saved, in order, or null when there are none. Throws on error. */
export async function readTodayTasks(supabase: AdminClient, userId: string, today: string): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('description, position')
    .eq('user_id', userId)
    .eq('task_date', today)
    .order('position', { ascending: true });
  if (error) throw new Error(`No se pudieron leer las tareas de hoy: ${error.message}`);
  const tasks = ((data as { description: string }[] | null) ?? []).map((task) => task.description);
  return tasks.length > 0 ? tasks : null;
}

export type CreateTodayResult =
  // Today's message was already there (made earlier, by the cron, the app or another tab).
  | { status: 'existing'; message: DayMessage }
  // Made now. `makeInsight` writes and saves the day's insight: call it after answering, so
  // nobody waits for it. It never throws.
  | { status: 'created'; message: DayMessage; tasks: string[] | null; makeInsight: () => Promise<void> }
  // The AI would have been called, but `allowGeneration` said no (the daily attempts limit).
  | { status: 'limit' };

/**
 * Makes sure the person has today's message (their local day, with the fallback time zone),
 * for the app: if it exists it is returned as is; if not, the message is written by the AI and
 * saved WITHOUT claiming its email (so the cron sends that same message at their hour), then
 * today's tasks. The insight is left for `makeInsight`. If another tab or run saved today's
 * message first, that one is returned. `allowGeneration` runs right before calling the AI and
 * may refuse it. Works the same for paused people (the pause is only the email). Throws when
 * the AI fails twice or on a database error: nothing is saved then.
 */
export async function createTodayForPerson(
  supabase: AdminClient,
  profile: Profile,
  now: Date,
  options: { allowGeneration?: () => Promise<boolean> } = {}
): Promise<CreateTodayResult> {
  const timezone = effectiveTimezone(profile.timezone);
  const person: Profile = { ...profile, timezone };
  const today = localToday(now, timezone);

  const { data: recent, error: recentError } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', profile.id)
    .order('generated_at', { ascending: false })
    .limit(2);
  if (recentError) throw new Error(`No se pudieron leer los mensajes: ${recentError.message}`);
  const messages = (recent as DayMessage[] | null) ?? [];

  const existing = findTodayMessage(messages, today, timezone);
  if (existing) return { status: 'existing', message: existing };

  if (options.allowGeneration && !(await options.allowGeneration())) return { status: 'limit' };

  const { data: goalRows } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'active')
    // Stable order: the day's goal rotates by date and needs the same order every time.
    .order('created_at', { ascending: true });
  const goals = (goalRows as Goal[] | null) ?? [];

  const { content, modelUsed } = await generateWithRetry(person, goals, messages);
  const saved = await saveTodayMessage(supabase, { userId: profile.id, content, modelUsed, today, now, claimEmail: false });
  if (saved.status === 'duplicate') {
    const theirs = await readTodayMessage(supabase, profile.id, today);
    if (!theirs) throw new Error('El mensaje de hoy existe pero no se pudo leer');
    return { status: 'existing', message: theirs };
  }

  // Tasks now (they are part of what the person sees right away). Never throws: null if the
  // AI fails or is slow, and the message stays without tasks (the cron tries them again).
  const prepared = await prepareDailyTasks(supabase, person, goals, content, now);
  if (prepared) await saveDailyTasks(profile.id, prepared.taskDate, prepared.tasks, supabase);

  const makeInsight = async () => {
    try {
      const insight = await prepareDailyInsight(supabase, person, goals, content, now);
      if (insight) await saveDailyInsight(profile.id, insight.insightDate, insight, supabase);
    } catch (err) {
      console.error(`[dia] sin insight: perfil ${profile.id}:`, err instanceof Error ? err.message : 'error desconocido');
    }
  };

  return { status: 'created', message: saved.message, tasks: prepared?.tasks ?? null, makeInsight };
}
