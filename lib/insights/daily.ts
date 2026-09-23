import type { createAdminClient } from '@/lib/supabase/admin';
import { getLocalDateString } from '@/lib/messages/delivery';
import { getRecentCompletedTasks } from '@/lib/tasks/checked';
import type { Goal, Profile } from '@/lib/types';
import { generateDailyInsight } from './generate';
import { getRecentInsights } from './save';

type AdminClient = ReturnType<typeof createAdminClient>;

// Budget for everything: the two reads plus the AI call (which has its own 15 s limit inside
// generateDailyInsight). Same budget as the daily tasks. Past it, the day has no insight.
const PREPARE_DEADLINE_MS = 20_000;

export interface PreparedInsight {
  // The user's LOCAL date today: the value to store in daily_insights.insight_date.
  insightDate: string;
  content: string;
  modelUsed: string;
}

/**
 * Gets today's insight ready for one user: works out the user's local date, reads the tasks
 * they checked and the insights they got in the last 7 days, and asks the AI for today's.
 * The profile, active goals and today's message come from the caller (the cron already has
 * them). Returns null — never throws, and never takes longer than the deadline — if anything
 * goes wrong, so a missing insight never affects anything else. Only reads; it saves nothing.
 */
export async function prepareDailyInsight(
  supabase: AdminClient,
  profile: Profile,
  activeGoals: Goal[],
  messageText: string,
  now: Date
): Promise<PreparedInsight | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[daily-insight] sin insight para el perfil ${profile?.id}: pasaron ${PREPARE_DEADLINE_MS / 1000} s`
      );
      resolve(null);
    }, PREPARE_DEADLINE_MS);
  });

  try {
    return await Promise.race([build(supabase, profile, activeGoals, messageText, now), deadline]);
  } catch (err) {
    console.error(`[daily-insight] sin insight para el perfil ${profile?.id}:`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function build(
  supabase: AdminClient,
  profile: Profile,
  activeGoals: Goal[],
  messageText: string,
  now: Date
): Promise<PreparedInsight | null> {
  const insightDate = getLocalDateString(now, profile.timezone);
  // Independent reads: run them together. Each already returns [] on failure.
  const [completedTasks, recentInsights] = await Promise.all([
    getRecentCompletedTasks(profile.id, insightDate, supabase),
    getRecentInsights(profile.id, insightDate, supabase),
  ]);

  const insight = await generateDailyInsight({
    name: profile.name,
    focusArea: profile.focus_area,
    tone: profile.tone,
    values: profile.values,
    goals: activeGoals.map((goal) => goal.description),
    currentEnergySummary: profile.current_energy_summary,
    blockingPattern: profile.blocking_pattern,
    futureVision: profile.future_vision,
    messageText,
    insightDate,
    recentInsights,
    completedTasks,
  });

  return insight ? { insightDate, content: insight.content, modelUsed: insight.modelUsed } : null;
}
