import type { DailyTask } from '@/lib/types';

// What Inicio needs to show a day that was just created without a manual reload.

/**
 * A short fingerprint of today's tasks (which tasks, not whether they are checked). Inicio
 * gives it to the tasks list as its React key: when the tasks change — they arrive after the
 * app creates today's message — the list starts over with them, while checking a box (same
 * tasks) keeps the list as it is.
 */
export function tasksVersion(tasks: Pick<DailyTask, 'id'>[]): string {
  return tasks.length > 0 ? tasks.map((task) => task.id).join('|') : 'sin-tareas';
}

// How long after today's message is created Inicio keeps waiting for its insight (it is
// written after the message, in the background). Past it, Inicio stops waiting and shows the
// insight card as usual (the last insight, dated, or its friendly empty text).
export const INSIGHT_WAIT_MINUTES = 3;

/**
 * Whether today's insight is still on its way: today's message exists, was created less than
 * INSIGHT_WAIT_MINUTES ago, and today's insight isn't there yet.
 */
export function insightOnTheWay(input: {
  hasTodayMessage: boolean;
  messageGeneratedAt: string | null | undefined;
  latestInsightDate: string | null | undefined;
  today: string;
  now: Date;
}): boolean {
  if (!input.hasTodayMessage || !input.messageGeneratedAt) return false;
  if (input.latestInsightDate === input.today) return false;
  const age = input.now.getTime() - new Date(input.messageGeneratedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < INSIGHT_WAIT_MINUTES * 60_000;
}
