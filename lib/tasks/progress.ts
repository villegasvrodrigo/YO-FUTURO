import { daysInMonth, isValidYearMonth, mondayIndex, monthOf, shiftDate, shiftMonth } from './dates';

/** The only columns of daily_tasks the progress calculations need. */
export interface TaskProgressRow {
  task_date: string;
  completed: boolean;
}

function countByDay(tasks: TaskProgressRow[]): Map<string, { total: number; done: number }> {
  const byDay = new Map<string, { total: number; done: number }>();
  for (const task of tasks) {
    const day = byDay.get(task.task_date) ?? { total: 0, done: 0 };
    day.total += 1;
    if (task.completed) day.done += 1;
    byDay.set(task.task_date, day);
  }
  return byDay;
}

// Whole-history numbers and the monthly calendar of the Progreso screen. They read every
// task passed in, with no day limit.

export interface StreakStats {
  // The streak running up to today.
  current: number;
  // The longest streak ever, with the same rules.
  best: number;
  // Days with at least one task checked, in the whole history.
  fulfilledDays: number;
}

/**
 * Current streak, best streak and fulfilled days over the whole history, up to `today` (the
 * user's local date). Same rules as the streak: a day counts when at least 1 task is
 * checked; days with no tasks are skipped; today with nothing checked is skipped too, since
 * the day isn't over; any earlier day with tasks but none checked breaks the streak. Tasks
 * dated after today are ignored. Throws if `today` is not a valid "YYYY-MM-DD" date.
 */
export function streakStats(tasks: TaskProgressRow[], today: string): StreakStats {
  shiftDate(today, 0); // validates today
  const byDay = countByDay(tasks);
  // Only days that had tasks matter: the others are skipped by the rules.
  const days = [...byDay.keys()].filter((date) => date <= today).sort();

  let best = 0;
  let run = 0;
  let fulfilledDays = 0;
  for (const date of days) {
    const { done } = byDay.get(date)!;
    if (done > 0) {
      fulfilledDays += 1;
      run += 1;
      best = Math.max(best, run);
    } else if (date !== today) {
      run = 0;
    }
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const date = days[i];
    const { done } = byDay.get(date)!;
    if (done > 0) {
      current += 1;
    } else if (date !== today) {
      break;
    }
  }

  return { current, best, fulfilledDays };
}

/** One square of the monthly calendar. */
export interface CalendarDay {
  date: string;
  // Day of the month, 1–31.
  day: number;
  // False for the days of the previous/next month that fill the first and last week.
  inMonth: boolean;
  // Tasks that day and how many were checked. total 0 means the day had no tasks.
  total: number;
  done: number;
  isToday: boolean;
  // After today: nothing can have happened yet.
  isFuture: boolean;
}

export interface MonthCalendar {
  // "YYYY-MM".
  month: string;
  // Weeks of 7 days, Monday first. The first and last weeks are completed with days of the
  // neighbouring months (inMonth false), so every week is full.
  weeks: CalendarDay[][];
}

/**
 * The calendar of `month` ("YYYY-MM") with each day's tasks, weeks starting on Monday.
 * `today` is the user's local date. Throws on an invalid month or date.
 */
export function monthCalendar(tasks: TaskProgressRow[], month: string, today: string): MonthCalendar {
  shiftDate(today, 0); // validates today
  const byDay = countByDay(tasks);
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const start = shiftDate(first, -mondayIndex(first));
  const end = shiftDate(last, 6 - mondayIndex(last));

  const weeks: CalendarDay[][] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    if (mondayIndex(date) === 0) weeks.push([]);
    const counts = byDay.get(date) ?? { total: 0, done: 0 };
    weeks[weeks.length - 1].push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.slice(0, 7) === month,
      total: counts.total,
      done: counts.done,
      isToday: date === today,
      isFuture: date > today,
    });
  }
  return { month, weeks };
}

/**
 * The first month ("YYYY-MM") with any task, up to `today`, or null when there are none:
 * how far back the calendar's arrow can go. Throws if `today` is invalid.
 */
export function earliestMonth(tasks: TaskProgressRow[], today: string): string | null {
  shiftDate(today, 0); // validates today
  let earliest: string | null = null;
  for (const task of tasks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.task_date)) continue;
    if (task.task_date <= today && (earliest === null || task.task_date < earliest)) {
      earliest = task.task_date;
    }
  }
  return earliest === null ? null : monthOf(earliest);
}

/**
 * The month ("YYYY-MM") the calendar shows, from the `?mes=` value in the address:
 * a valid month between `first` and `current` (both included) is shown as asked; one
 * before `first` shows `first`, one after `current` shows `current`, and anything else
 * (missing, a list, not a month) shows `current`.
 */
export function chooseMonth(requested: unknown, first: string, current: string): string {
  if (typeof requested !== 'string' || !isValidYearMonth(requested)) return current;
  if (requested < first) return first;
  if (requested > current) return current;
  return requested;
}

export interface ProgressData {
  stats: StreakStats;
  calendar: MonthCalendar;
  // The months the arrows lead to, or null at the ends (no tasks before, or the future).
  prevMonth: string | null;
  nextMonth: string | null;
}

/**
 * Everything the Progreso screen shows, from the user's whole task history, their local
 * date `today` and the requested month (the raw `?mes=` value). Null when there are no
 * tasks yet, so the screen shows its friendly message. Throws if `today` is invalid.
 */
export function buildProgress(tasks: TaskProgressRow[], today: string, requestedMonth: unknown): ProgressData | null {
  const first = earliestMonth(tasks, today);
  if (first === null) return null;
  const current = monthOf(today);
  const month = chooseMonth(requestedMonth, first, current);
  return {
    stats: streakStats(tasks, today),
    calendar: monthCalendar(tasks, month, today),
    prevMonth: month > first ? shiftMonth(month, -1) : null,
    nextMonth: month < current ? shiftMonth(month, 1) : null,
  };
}
