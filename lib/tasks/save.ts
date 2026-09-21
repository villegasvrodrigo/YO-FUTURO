import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

const TASK_COUNT = 3;
// How many calendar days before the given date count as "recent tasks".
const RECENT_DAYS = 3;
// Postgres error code for a unique_violation.
const UNIQUE_VIOLATION = '23505';

const MS_PER_DAY = 86_400_000;

export type SaveTasksResult = 'saved' | 'skipped' | 'failed';

/**
 * Stores the 3 tasks of one user for one day (task_date, "YYYY-MM-DD" in the user's local
 * time), as positions 1, 2 and 3. It is one plain INSERT of the 3 rows: if tasks for that
 * user and date already exist, the unique constraint rejects the whole insert, and that is
 * treated as "nothing to do" — nothing is overwritten and nothing is partly filled in.
 * Never throws: every problem is logged and reported as 'failed'.
 * Uses the service-role client, since users have no insert policy on daily_tasks.
 */
export async function saveDailyTasks(
  userId: string,
  taskDate: string,
  tasks: string[],
  client?: AdminClient
): Promise<SaveTasksResult> {
  try {
    assertValidDate(taskDate);
    const descriptions = tasks.map((task) => (typeof task === 'string' ? task.trim() : ''));
    if (descriptions.length !== TASK_COUNT || descriptions.some((task) => task === '')) {
      throw new Error(`Se esperaban ${TASK_COUNT} tareas con texto y llegaron ${tasks.length}`);
    }

    // Built inside the try: constructing the default client throws when env vars are missing.
    const supabase = client ?? createAdminClient();
    const { error } = await supabase.from('daily_tasks').insert(
      descriptions.map((description, i) => ({
        user_id: userId,
        task_date: taskDate,
        position: i + 1,
        description,
      }))
    );

    if (error?.code === UNIQUE_VIOLATION) {
      console.log(`[daily-tasks] ya existían tareas del perfil ${userId} para ${taskDate}: no se guardó nada`);
      return 'skipped';
    }
    if (error) {
      throw new Error(error.message);
    }
    return 'saved';
  } catch (err) {
    console.error(`[daily-tasks] no se guardaron las tareas del perfil ${userId} para ${taskDate}:`, err);
    return 'failed';
  }
}

/**
 * Returns the descriptions of this user's tasks from the 3 days before `taskDate`
 * (not including `taskDate` itself), newest day first and in position order within a day,
 * ready to pass to generateDailyTasks as `recentTasks`. Returns [] — never throws — if
 * there are none or if anything fails (logged), so a read problem only costs variety.
 */
export async function getRecentTaskDescriptions(
  userId: string,
  taskDate: string,
  client?: AdminClient
): Promise<string[]> {
  try {
    assertValidDate(taskDate);
    const from = shiftDate(taskDate, -RECENT_DAYS);

    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('description')
      .eq('user_id', userId)
      .gte('task_date', from)
      .lt('task_date', taskDate)
      .order('task_date', { ascending: false })
      .order('position', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? [])
      .map((row) => row.description)
      .filter((description): description is string => typeof description === 'string' && description.trim() !== '');
  } catch (err) {
    console.error(`[daily-tasks] no se pudieron leer las tareas recientes del perfil ${userId}:`, err);
    return [];
  }
}

// Calendar arithmetic on "YYYY-MM-DD" strings, done in UTC so time zones and DST never
// shift the result. Throws on anything that isn't a real date.
function parseDate(taskDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(taskDate);
  if (!match) throw new Error(`taskDate inválida: "${taskDate}"`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Date.UTC rolls impossible dates over (2026-02-31 becomes March 3): round-trip to reject them.
  if (new Date(ms).toISOString().slice(0, 10) !== taskDate) {
    throw new Error(`taskDate inválida: "${taskDate}"`);
  }
  return ms;
}

function assertValidDate(taskDate: string): void {
  parseDate(taskDate);
}

function shiftDate(taskDate: string, days: number): string {
  return new Date(parseDate(taskDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
