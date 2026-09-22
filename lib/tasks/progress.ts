import { completionPercent } from './completion';
import { shiftDate } from './dates';

// How many days of tasks the Progreso screen reads, today included. The streak cannot go
// further back than this.
export const HISTORY_DAYS = 90;
// How many days the grid and the completion percentage cover, today included.
export const GRID_DAYS = 30;

/** The only columns of daily_tasks the progress calculations need. */
export interface TaskProgressRow {
  task_date: string;
  completed: boolean;
}

/** One day of the grid. total 0 means the day had no tasks at all. */
export interface DaySummary {
  date: string;
  total: number;
  done: number;
}

export interface Progress {
  streak: number;
  // GRID_DAYS entries, oldest first; the last one is today.
  grid: DaySummary[];
  // % of the tasks of the last GRID_DAYS days that were checked (today included);
  // null when there were no tasks in those days.
  completion: number | null;
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

/**
 * Consecutive "fulfilled" days (at least 1 task checked) counting back from `today`, the
 * user's local date. Days with no tasks are skipped: they neither add nor break the streak.
 * Today with nothing checked is skipped too, since the day isn't over. Any earlier day with
 * tasks but none checked ends the streak. Only the last HISTORY_DAYS days are looked at.
 * Throws if `today` is not a valid "YYYY-MM-DD" date.
 */
export function currentStreak(tasks: TaskProgressRow[], today: string): number {
  const byDay = countByDay(tasks);
  let streak = 0;
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const day = byDay.get(shiftDate(today, -i));
    if (!day) continue;
    if (day.done > 0) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

/**
 * The last `days` days ending on `today`, oldest first, each with how many tasks it had and
 * how many were checked. Throws if `today` is not a valid "YYYY-MM-DD" date.
 */
export function lastDays(tasks: TaskProgressRow[], today: string, days: number = GRID_DAYS): DaySummary[] {
  const byDay = countByDay(tasks);
  const result: DaySummary[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = shiftDate(today, -i);
    const day = byDay.get(date) ?? { total: 0, done: 0 };
    result.push({ date, total: day.total, done: day.done });
  }
  return result;
}

/**
 * Checked tasks ÷ total tasks × 100 over the last `days` days ending on `today` (today
 * included), rounded. null when there were no tasks in that window, so the screen can show
 * a friendly message instead of "0%". Throws if `today` is not a valid "YYYY-MM-DD" date.
 */
export function completionRate(
  tasks: TaskProgressRow[],
  today: string,
  days: number = GRID_DAYS
): number | null {
  const from = shiftDate(today, -(days - 1));
  // "YYYY-MM-DD" strings compare in calendar order.
  const inWindow = tasks.filter((task) => task.task_date >= from && task.task_date <= today);
  return inWindow.length === 0 ? null : completionPercent(inWindow);
}

/** Everything the Progreso screen shows. Throws if `today` is not a valid "YYYY-MM-DD" date. */
export function buildProgress(tasks: TaskProgressRow[], today: string): Progress {
  return {
    streak: currentStreak(tasks, today),
    grid: lastDays(tasks, today),
    completion: completionRate(tasks, today),
  };
}
