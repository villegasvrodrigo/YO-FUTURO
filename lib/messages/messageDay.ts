import { getLocalDateString } from './delivery';

export interface MessageDay {
  // The message's calendar date in the user's time zone, "YYYY-MM-DD".
  date: string;
  // Whether that date is today, also in the user's time zone.
  isToday: boolean;
}

/**
 * Which day a message belongs to for this user: its date in the user's time zone and
 * whether that is today. Returns null — never throws — when there is no time zone, or the
 * time zone or the timestamp is invalid; the dashboard then shows the message without
 * claiming a day.
 */
export function messageDay(generatedAt: string, timezone: string | null | undefined, now: Date): MessageDay | null {
  if (!timezone) return null;
  try {
    const date = getLocalDateString(new Date(generatedAt), timezone);
    return { date, isToday: date === getLocalDateString(now, timezone) };
  } catch {
    return null;
  }
}
