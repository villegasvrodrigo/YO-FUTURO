import type { createAdminClient } from '@/lib/supabase/admin';
import { generateMessage } from '@/lib/messages/generate';
import { getLocalDateString } from '@/lib/messages/delivery';
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
