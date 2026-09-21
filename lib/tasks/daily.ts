import type { createAdminClient } from '@/lib/supabase/admin';
import { getLocalDateString } from '@/lib/messages/delivery';
import type { Goal, Profile } from '@/lib/types';
import { generateDailyTasks } from './generate';
import { getRecentTaskDescriptions } from './save';

type AdminClient = ReturnType<typeof createAdminClient>;

// Budget for everything that happens before the email is sent: the read of recent tasks
// plus the AI call (which has its own 15 s limit inside generateDailyTasks). If the total
// goes over this, the email goes out without tasks.
const PREPARE_DEADLINE_MS = 20_000;

export interface PreparedTasks {
  // The user's LOCAL date today: the value to store in daily_tasks.task_date.
  taskDate: string;
  tasks: string[];
}

/**
 * Gets today's 3 tasks ready for one user: works out the user's local date, reads the tasks
 * they got in the last 3 days (so the AI doesn't repeat them) and asks the AI for today's.
 * Returns null — never throws, and never takes longer than the deadline — if anything goes
 * wrong, so the daily email can always go out without tasks. Only reads; it saves nothing.
 */
export async function prepareDailyTasks(
  supabase: AdminClient,
  profile: Profile,
  activeGoals: Goal[],
  messageText: string,
  now: Date
): Promise<PreparedTasks | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error(
        `[daily-tasks] sin tareas para el perfil ${profile?.id}: pasaron ${PREPARE_DEADLINE_MS / 1000} s`
      );
      resolve(null);
    }, PREPARE_DEADLINE_MS);
  });

  try {
    return await Promise.race([build(supabase, profile, activeGoals, messageText, now), deadline]);
  } catch (err) {
    console.error(`[daily-tasks] sin tareas para el perfil ${profile?.id}:`, err);
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
): Promise<PreparedTasks | null> {
  const taskDate = getLocalDateString(now, profile.timezone);
  const recentTasks = await getRecentTaskDescriptions(profile.id, taskDate, supabase);

  const tasks = await generateDailyTasks({
    name: profile.name,
    focusArea: profile.focus_area,
    tone: profile.tone,
    values: profile.values,
    goals: activeGoals.map((goal) => goal.description),
    currentEnergySummary: profile.current_energy_summary,
    blockingPattern: profile.blocking_pattern,
    futureVision: profile.future_vision,
    messageText,
    taskDate,
    recentTasks,
  });

  return tasks ? { taskDate, tasks } : null;
}
