import { mondayIndex } from '@/lib/tasks/dates';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "2026-10-11" → "Domingo, 11 oct 2026". Read straight from the text, so no time zone can
 * shift the day. Empty string for anything that isn't a real date.
 */
export function longDayTitle(date: string): string {
  try {
    const weekday = WEEKDAYS[mondayIndex(date)];
    return `${weekday}, ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
  } catch {
    return '';
  }
}

/** "2 de 3 completadas" (or "1 de 1 completada"). */
export function completedSummary(done: number, total: number): string {
  return `${done} de ${total} ${total === 1 ? 'completada' : 'completadas'}`;
}

/** The address of one day of the history. */
export function historyHref(date: string): string {
  return `/historial?dia=${date}`;
}
