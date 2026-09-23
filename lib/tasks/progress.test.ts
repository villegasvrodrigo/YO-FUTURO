import { describe, it, expect } from 'vitest';
import {
  buildProgress,
  chooseMonth,
  earliestMonth,
  monthCalendar,
  streakStats,
  type TaskProgressRow,
} from './progress';

const TODAY = '2026-09-22';

// The 3 tasks of one day, with the first `done` of them checked.
function day(date: string, done: number, total = 3): TaskProgressRow[] {
  return Array.from({ length: total }, (_, i) => ({ task_date: date, completed: i < done }));
}

// A run of fulfilled days: one task checked on each of the `count` days ending on `last`.
function run(last: string, count: number): TaskProgressRow[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.parse(`${last}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10);
    return day(date, 1);
  }).flat();
}

describe('streakStats', () => {
  it('with no data: everything is 0', () => {
    expect(streakStats([], TODAY)).toEqual({ current: 0, best: 0, fulfilledDays: 0 });
  });

  it('counts fulfilled days (at least 1 checked) over the whole history', () => {
    const tasks = [...day('2026-09-22', 3), ...day('2026-09-21', 0), ...day('2026-09-20', 1), ...day('2025-01-10', 2)];
    expect(streakStats(tasks, TODAY).fulfilledDays).toBe(3);
  });

  it('days without tasks in the middle neither break nor add to any streak', () => {
    const tasks = [...day('2026-09-22', 1), ...day('2026-09-18', 1), ...day('2026-09-15', 1)];
    expect(streakStats(tasks, TODAY)).toEqual({ current: 3, best: 3, fulfilledDays: 3 });
  });

  it('a day with tasks but none checked breaks the streak', () => {
    const tasks = [...day('2026-09-22', 1), ...day('2026-09-21', 0), ...run('2026-09-20', 4)];
    expect(streakStats(tasks, TODAY)).toEqual({ current: 1, best: 4, fulfilledDays: 5 });
  });

  it('the best streak can be in the past, longer than the current one', () => {
    const tasks = [...run('2026-09-22', 2), ...day('2026-09-20', 0), ...run('2026-08-31', 10)];
    const stats = streakStats(tasks, TODAY);
    expect(stats.current).toBe(2);
    expect(stats.best).toBe(10);
  });

  it('today with nothing checked neither breaks the current streak nor the best one', () => {
    const tasks = [...day('2026-09-22', 0), ...run('2026-09-21', 5)];
    expect(streakStats(tasks, TODAY)).toEqual({ current: 5, best: 5, fulfilledDays: 5 });
  });

  it('today with at least one checked counts', () => {
    const tasks = [...day('2026-09-22', 2), ...run('2026-09-21', 5)];
    expect(streakStats(tasks, TODAY)).toEqual({ current: 6, best: 6, fulfilledDays: 6 });
  });

  it('keeps a streak going across a month and a year', () => {
    expect(streakStats(run('2027-01-02', 5), '2027-01-02')).toEqual({ current: 5, best: 5, fulfilledDays: 5 });
  });

  it('has no 90-day limit', () => {
    expect(streakStats(run('2026-09-22', 120), TODAY)).toEqual({ current: 120, best: 120, fulfilledDays: 120 });
  });

  it('ignores tasks dated after today', () => {
    const tasks = [...day('2026-09-23', 3), ...run('2026-09-22', 2)];
    expect(streakStats(tasks, TODAY)).toEqual({ current: 2, best: 2, fulfilledDays: 2 });
  });

  it('does not care about the order the rows come in', () => {
    const tasks = [...day('2026-09-20', 1), ...day('2026-09-22', 1), ...day('2026-09-21', 0)].reverse();
    expect(streakStats(tasks, TODAY)).toEqual({ current: 1, best: 1, fulfilledDays: 2 });
  });

  it('throws on an invalid today', () => {
    expect(() => streakStats([], '2026-02-31')).toThrow();
  });
});

describe('monthCalendar', () => {
  const dates = (weeks: { date: string }[][]) => weeks.map((week) => week.map((d) => d.date));

  it('lays out September 2026 (starts on Tuesday) in full Monday-first weeks', () => {
    const { month, weeks } = monthCalendar([], '2026-09', TODAY);

    expect(month).toBe('2026-09');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // Monday Aug 31 fills the first square; Sunday Oct 4 closes the last week.
    expect(weeks[0][0]).toMatchObject({ date: '2026-08-31', day: 31, inMonth: false });
    expect(weeks[0][1]).toMatchObject({ date: '2026-09-01', day: 1, inMonth: true });
    expect(weeks[4][6]).toMatchObject({ date: '2026-10-04', day: 4, inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('a month that starts on Sunday: February 2026 needs 5 weeks, the first with 6 days of January', () => {
    const { weeks } = monthCalendar([], '2026-02', '2026-02-10');

    expect(weeks).toHaveLength(5);
    expect(dates(weeks)[0]).toEqual([
      '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01',
    ]);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(28);
  });

  it('a month that starts on Monday: June 2026 starts with day 1 in the first square', () => {
    const { weeks } = monthCalendar([], '2026-06', TODAY);

    expect(weeks[0][0]).toMatchObject({ date: '2026-06-01', inMonth: true });
    expect(weeks).toHaveLength(5);
  });

  it('February in a leap year has 29 days, and a February that fits exactly takes 4 weeks', () => {
    expect(monthCalendar([], '2028-02', TODAY).weeks.flat().filter((d) => d.inMonth)).toHaveLength(29);
    // February 2027 starts on Monday and has 28 days: exactly 4 weeks.
    expect(monthCalendar([], '2027-02', TODAY).weeks).toHaveLength(4);
  });

  it('a month that needs 6 weeks: August 2026 (starts on Saturday, 31 days)', () => {
    expect(monthCalendar([], '2026-08', TODAY).weeks).toHaveLength(6);
  });

  it('carries each day\'s tasks: none, 0, 1, 2 or 3 checked', () => {
    const tasks = [...day('2026-09-01', 0), ...day('2026-09-02', 1), ...day('2026-09-03', 2), ...day('2026-09-04', 3)];
    const days = monthCalendar(tasks, '2026-09', TODAY).weeks.flat();
    const pick = (date: string) => days.find((d) => d.date === date)!;

    expect(pick('2026-09-05')).toMatchObject({ total: 0, done: 0 });
    expect(pick('2026-09-01')).toMatchObject({ total: 3, done: 0 });
    expect(pick('2026-09-02')).toMatchObject({ total: 3, done: 1 });
    expect(pick('2026-09-03')).toMatchObject({ total: 3, done: 2 });
    expect(pick('2026-09-04')).toMatchObject({ total: 3, done: 3 });
  });

  it('marks today, and every day after it as future', () => {
    const days = monthCalendar([], '2026-09', TODAY).weeks.flat();

    expect(days.filter((d) => d.isToday).map((d) => d.date)).toEqual([TODAY]);
    expect(days.find((d) => d.date === '2026-09-21')?.isFuture).toBe(false);
    expect(days.find((d) => d.date === '2026-09-23')?.isFuture).toBe(true);
  });

  it('a past month has no today and no future days', () => {
    const days = monthCalendar([], '2026-08', TODAY).weeks.flat().filter((d) => d.inMonth);

    expect(days.some((d) => d.isToday || d.isFuture)).toBe(false);
  });

  it('works across a year: January 2027 starts on Friday', () => {
    const { weeks } = monthCalendar([], '2027-01', '2027-01-15');

    expect(weeks[0][4]).toMatchObject({ date: '2027-01-01', inMonth: true });
    expect(weeks[0][0]).toMatchObject({ date: '2026-12-28', inMonth: false });
  });

  it('throws on an invalid month or today', () => {
    expect(() => monthCalendar([], '2026-13', TODAY)).toThrow();
    expect(() => monthCalendar([], '2026-09', '2026-02-31')).toThrow();
  });
});

describe('earliestMonth', () => {
  it('is null with no tasks', () => {
    expect(earliestMonth([], TODAY)).toBeNull();
  });

  it('is the month of the oldest task, in any order', () => {
    const tasks = [...day('2026-09-20', 1), ...day('2025-11-03', 0), ...day('2026-01-15', 2)];
    expect(earliestMonth(tasks, TODAY)).toBe('2025-11');
  });

  it('ignores tasks after today and malformed dates', () => {
    const tasks = [...day('2026-10-01', 1), { task_date: '', completed: true }, ...day('2026-09-10', 0)];
    expect(earliestMonth(tasks, TODAY)).toBe('2026-09');
  });
});

describe('chooseMonth', () => {
  const FIRST = '2026-06';
  const CURRENT = '2026-09';

  it('shows a valid month between the first and the current one as asked', () => {
    expect(chooseMonth('2026-07', FIRST, CURRENT)).toBe('2026-07');
    expect(chooseMonth(FIRST, FIRST, CURRENT)).toBe(FIRST);
    expect(chooseMonth(CURRENT, FIRST, CURRENT)).toBe(CURRENT);
  });

  it('shows the first month for a month before it', () => {
    expect(chooseMonth('2025-12', FIRST, CURRENT)).toBe(FIRST);
  });

  it('shows the current month for a future month', () => {
    expect(chooseMonth('2026-10', FIRST, CURRENT)).toBe(CURRENT);
    expect(chooseMonth('2030-01', FIRST, CURRENT)).toBe(CURRENT);
  });

  it.each([
    ['nothing', undefined],
    ['an empty text', ''],
    ['a month that does not exist', '2026-13'],
    ['a date instead of a month', '2026-07-01'],
    ['a word', 'julio'],
    ['a repeated parameter (a list)', ['2026-07', '2026-08']],
  ])('shows the current month for %s', (_label, requested) => {
    expect(chooseMonth(requested, FIRST, CURRENT)).toBe(CURRENT);
  });
});

describe('buildProgress', () => {
  const tasks = [...run('2026-09-22', 3), ...day('2026-07-15', 1)];

  it('is null with no tasks, so the screen shows its friendly message', () => {
    expect(buildProgress([], TODAY, undefined)).toBeNull();
  });

  it('shows the current month by default, with the whole-history numbers', () => {
    const data = buildProgress(tasks, TODAY, undefined)!;

    expect(data.calendar.month).toBe('2026-09');
    // The days without tasks between Jul 15 and Sep 20 are skipped, so Jul 15 joins the streak.
    expect(data.stats).toEqual({ current: 4, best: 4, fulfilledDays: 4 });
  });

  it('on the current month: the back arrow goes to the previous month, and there is no forward arrow', () => {
    const data = buildProgress(tasks, TODAY, undefined)!;

    expect(data.prevMonth).toBe('2026-08');
    expect(data.nextMonth).toBeNull();
  });

  it('on the first month with tasks: there is no back arrow', () => {
    const data = buildProgress(tasks, TODAY, '2026-07')!;

    expect(data.calendar.month).toBe('2026-07');
    expect(data.prevMonth).toBeNull();
    expect(data.nextMonth).toBe('2026-08');
  });

  it('in between: both arrows, and the numbers stay the whole-history ones', () => {
    const data = buildProgress(tasks, TODAY, '2026-08')!;

    expect(data.prevMonth).toBe('2026-07');
    expect(data.nextMonth).toBe('2026-09');
    expect(data.stats.fulfilledDays).toBe(4);
  });

  it('when the only month with tasks is the current one: no arrows at all', () => {
    const data = buildProgress(run('2026-09-22', 2), TODAY, undefined)!;

    expect(data.prevMonth).toBeNull();
    expect(data.nextMonth).toBeNull();
  });

  it('keeps an asked month in range: before the first shows the first, a future one the current', () => {
    expect(buildProgress(tasks, TODAY, '2025-01')!.calendar.month).toBe('2026-07');
    expect(buildProgress(tasks, TODAY, '2027-01')!.calendar.month).toBe('2026-09');
  });

  it('works across a year: on January, the back arrow goes to December of the year before', () => {
    const data = buildProgress([...run('2027-01-05', 10)], '2027-01-05', undefined)!;

    expect(data.calendar.month).toBe('2027-01');
    expect(data.prevMonth).toBe('2026-12');
  });
});

