import { describe, it, expect } from 'vitest';
import { insightOnTheWay, tasksVersion, INSIGHT_WAIT_MINUTES } from './todayRefresh';

describe('tasksVersion (the tasks list key)', () => {
  const t = (id: string, completed = false) => ({ id, completed });

  it('changes when today\'s tasks arrive, so the list starts over with them (no reload needed)', () => {
    const before = tasksVersion([]);
    const after = tasksVersion([t('a'), t('b'), t('c')]);

    expect(before).not.toBe(after);
  });

  it('stays the same when a box is checked, so the list keeps its state', () => {
    expect(tasksVersion([t('a'), t('b')])).toBe(tasksVersion([t('a', true), t('b')]));
  });
});

describe('insightOnTheWay', () => {
  const now = new Date('2026-10-04T18:00:00Z');
  const base = {
    hasTodayMessage: true,
    messageGeneratedAt: '2026-10-04T17:59:30Z',
    latestInsightDate: '2026-10-03',
    today: '2026-10-04',
    now,
  };

  it('waits right after today\'s message is created, while today\'s insight is missing', () => {
    expect(insightOnTheWay(base)).toBe(true);
    expect(insightOnTheWay({ ...base, latestInsightDate: null })).toBe(true);
  });

  it('stops waiting once today\'s insight is there', () => {
    expect(insightOnTheWay({ ...base, latestInsightDate: '2026-10-04' })).toBe(false);
  });

  it(`stops waiting ${INSIGHT_WAIT_MINUTES} minutes after the message (if the insight failed, Inicio stays normal)`, () => {
    expect(INSIGHT_WAIT_MINUTES).toBe(3);
    expect(insightOnTheWay({ ...base, messageGeneratedAt: '2026-10-04T17:57:30Z' })).toBe(true);
    expect(insightOnTheWay({ ...base, messageGeneratedAt: '2026-10-04T17:56:59Z' })).toBe(false);
  });

  it('never waits without today\'s message', () => {
    expect(insightOnTheWay({ ...base, hasTodayMessage: false })).toBe(false);
    expect(insightOnTheWay({ ...base, messageGeneratedAt: null })).toBe(false);
  });
});
