import { getLocalDateString } from '@/lib/messages/delivery';

// Messages a person can send to the chat per day (their local day, which ends at midnight).
// Messages handled as a crisis never count toward it.
export const DAILY_MESSAGE_LIMIT = 20;

// Longest message a person can send. Longer text is rejected, not cut, so nothing they wrote
// is silently lost.
export const MAX_USER_MESSAGE_LENGTH = 2000;

// Used when a profile's time zone is missing or invalid: the chat must still work, and the
// beta's users are in Mexico. The daily email excludes those profiles instead.
export const FALLBACK_TIMEZONE = 'America/Mexico_City';

/** The fields of a chat_messages row that decide whether it counts toward the limit. */
export interface CountableMessage {
  role: 'user' | 'assistant';
  is_crisis: boolean;
}

/**
 * The chat day a moment belongs to, as "YYYY-MM-DD" in the person's local time zone (the
 * value stored in chat_messages.chat_date). Never throws: an invalid time zone falls back to
 * FALLBACK_TIMEZONE.
 */
export function chatDate(now: Date, timezone: string | null | undefined): string {
  if (timezone) {
    try {
      return getLocalDateString(now, timezone);
    } catch {
      // Invalid time zone (Intl throws RangeError): use the fallback below.
    }
  }
  return getLocalDateString(now, FALLBACK_TIMEZONE);
}

/** How many of the day's messages count toward the limit: the person's, except crises. */
export function messagesUsed(todaysMessages: CountableMessage[]): number {
  return todaysMessages.filter((m) => m.role === 'user' && !m.is_crisis).length;
}

/** How many messages the person can still send today (never below 0). */
export function messagesLeft(todaysMessages: CountableMessage[]): number {
  return Math.max(0, DAILY_MESSAGE_LIMIT - messagesUsed(todaysMessages));
}

/** Whether the person already used today's messages, so the box stays locked until midnight. */
export function hasReachedLimit(todaysMessages: CountableMessage[]): boolean {
  return messagesLeft(todaysMessages) === 0;
}

/**
 * The person's message ready to send (trimmed), or null when it can't be sent: not text,
 * empty or longer than MAX_USER_MESSAGE_LENGTH.
 */
export function cleanUserMessage(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.length > MAX_USER_MESSAGE_LENGTH) return null;
  return trimmed;
}
