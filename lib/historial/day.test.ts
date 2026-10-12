import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  closestDay,
  hasContent,
  messageOrInsightDates,
  neighborDay,
  parseRequestedDay,
  readHistoryDay,
} from './day';
import { createHistoryTestDb, historyTestClient, type HistoryTestDb } from './testDb';

const ME = 'u1';
const OTHER = 'u2';
const TODAY = '2026-10-12';

let db: HistoryTestDb;
let client: SupabaseClient;

beforeEach(() => {
  db = createHistoryTestDb();
  client = historyTestClient(db) as unknown as SupabaseClient;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const task = (user_id: string, task_date: string, position: number, completed: boolean) => ({
  id: `${user_id}-${task_date}-${position}`,
  user_id,
  task_date,
  position,
  description: `Tarea ${position} del ${task_date}`,
  completed,
});

describe('readHistoryDay', () => {
  it("joins the day's message, tasks (in order) and insight by the local date", async () => {
    db.messages.push(
      { user_id: ME, message_date: '2026-10-10', content: '  Hola, ayer.  ' },
      { user_id: ME, message_date: '2026-10-11', content: 'Otro día' }
    );
    db.daily_tasks.push(task(ME, '2026-10-10', 3, false), task(ME, '2026-10-10', 1, true), task(ME, '2026-10-11', 1, true));
    db.daily_insights.push({ user_id: ME, insight_date: '2026-10-10', content: 'Aprendes algo.' });

    const day = await readHistoryDay(client, ME, '2026-10-10');

    expect(day.message).toBe('Hola, ayer.');
    expect(day.tasks.map((t) => [t.position, t.completed])).toEqual([
      [1, true],
      [3, false],
    ]);
    expect(day.insight).toBe('Aprendes algo.');
    expect(hasContent(day)).toBe(true);
  });

  it("never mixes in another person's rows", async () => {
    db.messages.push({ user_id: OTHER, message_date: '2026-10-10', content: 'Ajeno' });
    db.daily_tasks.push(task(OTHER, '2026-10-10', 1, true));
    db.daily_insights.push({ user_id: OTHER, insight_date: '2026-10-10', content: 'Ajeno' });

    const day = await readHistoryDay(client, ME, '2026-10-10');

    expect(day).toEqual({ message: null, tasks: [], insight: null });
    expect(hasContent(day)).toBe(false);
  });

  it('treats a blank message or insight as missing', async () => {
    db.messages.push({ user_id: ME, message_date: '2026-10-10', content: '   ' });
    db.daily_insights.push({ user_id: ME, insight_date: '2026-10-10', content: '' });

    expect(await readHistoryDay(client, ME, '2026-10-10')).toEqual({ message: null, tasks: [], insight: null });
  });

  it('throws on a failed read and on an invalid date', async () => {
    db.failTables.add('daily_insights');
    await expect(readHistoryDay(client, ME, '2026-10-10')).rejects.toThrow('daily_insights no responde');
    await expect(readHistoryDay(client, ME, '2026-02-31')).rejects.toThrow('fecha inválida');
  });
});

describe('neighborDay', () => {
  beforeEach(() => {
    db.messages.push({ user_id: ME, message_date: '2026-10-01', content: 'a' });
    db.daily_tasks.push(task(ME, '2026-10-04', 1, false));
    db.daily_insights.push({ user_id: ME, insight_date: '2026-10-08', content: 'b' });
    // Another person's day right next to the 5th: must be ignored.
    db.messages.push({ user_id: OTHER, message_date: '2026-10-06', content: 'c' });
    // A day after "today" (another time zone's tomorrow): never a next day.
    db.daily_tasks.push(task(ME, '2026-10-13', 1, false));
  });

  it('finds the closest earlier day with anything, from any of the three tables', async () => {
    await expect(neighborDay(client, ME, '2026-10-05', 'prev', TODAY)).resolves.toBe('2026-10-04');
    await expect(neighborDay(client, ME, '2026-10-04', 'prev', TODAY)).resolves.toBe('2026-10-01');
    await expect(neighborDay(client, ME, '2026-10-01', 'prev', TODAY)).resolves.toBeNull();
  });

  it('finds the closest later day with anything, never after today', async () => {
    await expect(neighborDay(client, ME, '2026-10-05', 'next', TODAY)).resolves.toBe('2026-10-08');
    await expect(neighborDay(client, ME, '2026-10-08', 'next', TODAY)).resolves.toBeNull();
    await expect(neighborDay(client, ME, TODAY, 'next', TODAY)).resolves.toBeNull();
  });

  it('throws on a failed read', async () => {
    db.failTables.add('messages');
    await expect(neighborDay(client, ME, '2026-10-05', 'prev', TODAY)).rejects.toThrow('messages no responde');
  });
});

describe('closestDay', () => {
  it.each([
    ['2026-10-05', '2026-10-04', '2026-10-08', '2026-10-04'],
    ['2026-10-07', '2026-10-04', '2026-10-08', '2026-10-08'],
    // A tie goes to the earlier day.
    ['2026-10-06', '2026-10-04', '2026-10-08', '2026-10-04'],
    ['2026-10-06', null, '2026-10-08', '2026-10-08'],
    ['2026-10-06', '2026-10-04', null, '2026-10-04'],
    ['2026-10-06', null, null, null],
  ])('around %s, between %s and %s → %s', (date, prev, next, expected) => {
    expect(closestDay(date, prev, next)).toBe(expected);
  });
});

describe('parseRequestedDay', () => {
  it.each([
    ['2026-10-11', '2026-10-11'],
    ['2026-02-31', null],
    ['ayer', null],
    ['2026-10-11T00:00', null],
    [undefined, null],
    [['2026-10-11', '2026-10-10'], null],
  ])('%s → %s', (value, expected) => {
    expect(parseRequestedDay(value)).toBe(expected);
  });
});

describe('messageOrInsightDates', () => {
  it("returns the month's days with a message or an insight, only this person's", async () => {
    db.messages.push(
      { user_id: ME, message_date: '2026-09-30', content: 'fuera' },
      { user_id: ME, message_date: '2026-10-03', content: 'a' },
      { user_id: OTHER, message_date: '2026-10-04', content: 'ajeno' }
    );
    db.daily_insights.push({ user_id: ME, insight_date: '2026-10-31', content: 'b' });

    const dates = await messageOrInsightDates(client, ME, '2026-10-01', '2026-10-31');

    expect([...dates].sort()).toEqual(['2026-10-03', '2026-10-31']);
  });

  it('returns an empty set, without throwing, when a read fails', async () => {
    db.messages.push({ user_id: ME, message_date: '2026-10-03', content: 'a' });
    db.failTables.add('daily_insights');

    await expect(messageOrInsightDates(client, ME, '2026-10-01', '2026-10-31')).resolves.toEqual(new Set());
    expect(console.error).toHaveBeenCalled();
  });
});
