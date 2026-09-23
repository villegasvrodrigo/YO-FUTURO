import { getLocalDateString } from '@/lib/messages/delivery';
import { mondayIndex } from '@/lib/tasks/dates';

// The old fixed subject: used only if the date can't be worked out (invalid time zone).
export const FALLBACK_SUBJECT = 'Tu mensaje de hoy de tu yo futuro';

// Written out by hand (not with Intl) so the wording never depends on the server's locale
// data: always "miércoles 23 de septiembre", never "miércoles, 23 de septiembre".
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * The subject of the daily email, with that day's date in the user's time zone, in
 * Spanish: "Tu mensaje de hoy · miércoles 23 de septiembre". A different subject each day
 * keeps Gmail from stacking the emails into one conversation. Never throws: with an
 * invalid time zone it falls back to the old fixed subject.
 */
export function dailySubject(now: Date, timezone: string): string {
  try {
    const date = getLocalDateString(now, timezone);
    const weekday = WEEKDAYS[mondayIndex(date)];
    const day = Number(date.slice(8, 10));
    const month = MONTHS[Number(date.slice(5, 7)) - 1];
    return `Tu mensaje de hoy · ${weekday} ${day} de ${month}`;
  } catch {
    return FALLBACK_SUBJECT;
  }
}
