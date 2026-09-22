import { describe, it, expect } from 'vitest';
import {
  buildProgress,
  completionRate,
  currentStreak,
  GRID_DAYS,
  HISTORY_DAYS,
  lastDays,
  type TaskProgressRow,
} from './progress';

const TODAY = '2026-09-22';

// The 3 tasks of one day, with the first `done` of them checked.
function day(date: string, done: number, total = 3): TaskProgressRow[] {
  return Array.from({ length: total }, (_, i) => ({ task_date: date, completed: i < done }));
}

describe('currentStreak', () => {
  it('is 0 with no data', () => {
    expect(currentStreak([], TODAY)).toBe(0);
  });

  it('does not break on today with nothing checked, and counts yesterday', () => {
    const tasks = [...day('2026-09-22', 0), ...day('2026-09-21', 1)];
    expect(currentStreak(tasks, TODAY)).toBe(1);
  });

  it('is 0 when today is the only day and nothing is checked yet', () => {
    expect(currentStreak(day('2026-09-22', 0), TODAY)).toBe(0);
  });

  it('counts today once at least 1 task is checked', () => {
    const tasks = [...day('2026-09-22', 1), ...day('2026-09-21', 3)];
    expect(currentStreak(tasks, TODAY)).toBe(2);
  });

  it('a single checked task is enough for a day', () => {
    const tasks = [...day('2026-09-21', 1), ...day('2026-09-20', 1), ...day('2026-09-19', 1)];
    expect(currentStreak(tasks, TODAY)).toBe(3);
  });

  it('skips one day without tasks between two fulfilled days', () => {
    const tasks = [...day('2026-09-21', 2), ...day('2026-09-19', 1)];
    expect(currentStreak(tasks, TODAY)).toBe(2);
  });

  it('skips several days in a row without tasks', () => {
    const tasks = [...day('2026-09-22', 1), ...day('2026-09-15', 1), ...day('2026-09-14', 3)];
    expect(currentStreak(tasks, TODAY)).toBe(3);
  });

  it('counts a day that has fewer than 3 tasks when 1 is checked', () => {
    const tasks = [...day('2026-09-21', 1, 2), ...day('2026-09-20', 1)];
    expect(currentStreak(tasks, TODAY)).toBe(2);
  });

  it('breaks on an earlier day with tasks but none checked', () => {
    const tasks = [
      ...day('2026-09-22', 1),
      ...day('2026-09-21', 2),
      ...day('2026-09-20', 0),
      ...day('2026-09-19', 3),
      ...day('2026-09-18', 3),
    ];
    expect(currentStreak(tasks, TODAY)).toBe(2);
  });

  it('breaks on yesterday even when today is unchecked', () => {
    const tasks = [...day('2026-09-22', 0), ...day('2026-09-21', 0), ...day('2026-09-20', 3)];
    expect(currentStreak(tasks, TODAY)).toBe(0);
  });

  it('does not care about the order the rows come in', () => {
    const tasks = [...day('2026-09-20', 1), ...day('2026-09-22', 1), ...day('2026-09-21', 1)].reverse();
    expect(currentStreak(tasks, TODAY)).toBe(3);
  });

  it('keeps going across a month boundary', () => {
    const tasks = [...day('2026-10-02', 1), ...day('2026-10-01', 1), ...day('2026-09-30', 1), ...day('2026-09-29', 1)];
    expect(currentStreak(tasks, '2026-10-02')).toBe(4);
  });

  it('keeps going across a year boundary', () => {
    const tasks = [...day('2027-01-02', 1), ...day('2027-01-01', 1), ...day('2026-12-31', 1), ...day('2026-12-30', 1)];
    expect(currentStreak(tasks, '2027-01-02')).toBe(4);
  });

  it('keeps going across the end of February, normal and leap year', () => {
    const normal = [...day('2026-03-01', 1), ...day('2026-02-28', 1), ...day('2026-02-27', 1)];
    expect(currentStreak(normal, '2026-03-01')).toBe(3);
    const leap = [...day('2028-03-01', 1), ...day('2028-02-29', 1), ...day('2028-02-28', 1)];
    expect(currentStreak(leap, '2028-03-01')).toBe(3);
  });

  it(`never looks further back than ${HISTORY_DAYS} days`, () => {
    // One fulfilled day for each of the last 100 days: only 90 can count.
    const tasks = Array.from({ length: 100 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 8, 22 - i)).toISOString().slice(0, 10);
      return { task_date: date, completed: true };
    });
    expect(currentStreak(tasks, TODAY)).toBe(HISTORY_DAYS);
  });

  it(`ignores a fulfilled day older than ${HISTORY_DAYS} days even after a gap`, () => {
    // 2026-06-24 is 90 days before today, just outside the window.
    const tasks = [...day('2026-09-22', 1), ...day('2026-06-24', 3)];
    expect(currentStreak(tasks, TODAY)).toBe(1);
  });

  it('ignores tasks dated after today', () => {
    const tasks = [...day('2026-09-23', 3), ...day('2026-09-22', 1)];
    expect(currentStreak(tasks, TODAY)).toBe(1);
  });

  it('throws on an invalid today', () => {
    expect(() => currentStreak([], '2026-02-31')).toThrow();
  });
});

describe('lastDays', () => {
  it(`always returns ${GRID_DAYS} days, oldest first, ending today`, () => {
    const grid = lastDays([], TODAY);
    expect(grid).toHaveLength(GRID_DAYS);
    expect(grid[0].date).toBe('2026-08-24');
    expect(grid[GRID_DAYS - 1].date).toBe(TODAY);
  });

  it('with no data every day is a day without tasks', () => {
    expect(lastDays([], TODAY).every((d) => d.total === 0 && d.done === 0)).toBe(true);
  });

  it('tells apart a day without tasks from a day with 0 checked', () => {
    const grid = lastDays(day('2026-09-21', 0), TODAY);
    expect(grid[GRID_DAYS - 2]).toEqual({ date: '2026-09-21', total: 3, done: 0 });
    expect(grid[GRID_DAYS - 1]).toEqual({ date: TODAY, total: 0, done: 0 });
  });

  it('counts how many tasks were checked each day (0 to 3)', () => {
    const tasks = [...day('2026-09-19', 0), ...day('2026-09-20', 1), ...day('2026-09-21', 2), ...day('2026-09-22', 3)];
    expect(lastDays(tasks, TODAY).slice(-4).map((d) => d.done)).toEqual([0, 1, 2, 3]);
  });

  it('leaves out days before the window and after today', () => {
    const tasks = [...day('2026-08-23', 3), ...day('2026-09-23', 3)];
    expect(lastDays(tasks, TODAY).every((d) => d.total === 0)).toBe(true);
  });

  it('lists every date correctly across a month boundary', () => {
    const grid = lastDays(day('2026-09-30', 2), '2026-10-05', 7);
    expect(grid.map((d) => d.date)).toEqual([
      '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    ]);
    expect(grid[1]).toEqual({ date: '2026-09-30', total: 3, done: 2 });
  });

  it('lists every date correctly across a year boundary', () => {
    const grid = lastDays(day('2026-12-31', 1), '2027-01-02', 4);
    expect(grid.map((d) => d.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(grid[1].done).toBe(1);
  });

  it(`starts ${GRID_DAYS - 1} days back across a year boundary`, () => {
    const grid = lastDays([], '2027-01-10');
    expect(grid[0].date).toBe('2026-12-12');
    expect(grid[GRID_DAYS - 1].date).toBe('2027-01-10');
  });
});

describe('completionRate', () => {
  it('is null (no data) instead of 0% when there are no tasks', () => {
    expect(completionRate([], TODAY)).toBeNull();
  });

  it('is 0 when there are tasks but none are checked', () => {
    expect(completionRate(day('2026-09-21', 0), TODAY)).toBe(0);
  });

  it('is checked ÷ total × 100 over the window, rounded', () => {
    // 3 + 1 + 0 checked out of 9 → 44.4…%
    const tasks = [...day('2026-09-20', 3), ...day('2026-09-21', 1), ...day('2026-09-22', 0)];
    expect(completionRate(tasks, TODAY)).toBe(44);
  });

  it('includes today', () => {
    expect(completionRate(day(TODAY, 2), TODAY)).toBe(67);
  });

  it('days without tasks do not count', () => {
    const tasks = [...day('2026-09-01', 3), ...day('2026-09-22', 3)];
    expect(completionRate(tasks, TODAY)).toBe(100);
  });

  it(`ignores tasks from ${GRID_DAYS + 1} days ago and after today`, () => {
    // 2026-08-23 is 30 days before today: the first day outside the window.
    const tasks = [...day('2026-08-23', 0), ...day('2026-08-24', 3), ...day('2026-09-23', 0)];
    expect(completionRate(tasks, TODAY)).toBe(100);
  });

  it('is null when all tasks are older than the window', () => {
    expect(completionRate(day('2026-08-01', 3), TODAY)).toBeNull();
  });

  it('covers a window that crosses a year boundary', () => {
    const tasks = [...day('2026-12-15', 3), ...day('2027-01-05', 0), ...day('2026-12-01', 0)];
    // 2026-12-01 is outside the 30 days ending 2027-01-10; the other two days count.
    expect(completionRate(tasks, '2027-01-10')).toBe(50);
  });
});

describe('buildProgress', () => {
  it('with no data: streak 0, a grid of empty days, and no completion figure', () => {
    const progress = buildProgress([], TODAY);
    expect(progress.streak).toBe(0);
    expect(progress.grid).toHaveLength(GRID_DAYS);
    expect(progress.grid.every((d) => d.total === 0)).toBe(true);
    expect(progress.completion).toBeNull();
  });

  it('puts the three results together', () => {
    const tasks = [...day('2026-09-22', 0), ...day('2026-09-21', 2), ...day('2026-09-20', 1)];
    const progress = buildProgress(tasks, TODAY);
    expect(progress.streak).toBe(2);
    expect(progress.grid.slice(-3).map((d) => d.done)).toEqual([1, 2, 0]);
    expect(progress.completion).toBe(33);
  });
});
