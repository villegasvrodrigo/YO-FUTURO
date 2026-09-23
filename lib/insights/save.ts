import { createAdminClient } from '@/lib/supabase/admin';
import { assertValidDate, shiftDate } from '@/lib/tasks/dates';

type AdminClient = ReturnType<typeof createAdminClient>;

// How many calendar days before the given date count as "recent insights".
const RECENT_DAYS = 7;
// Postgres error code for a unique_violation.
const UNIQUE_VIOLATION = '23505';

export type SaveInsightResult = 'saved' | 'skipped' | 'failed';

/**
 * Stores the insight of one user for one day (insightDate, "YYYY-MM-DD" in the user's local
 * time). It is one plain INSERT: if that user already has an insight for that date, the
 * unique constraint rejects it, and that is treated as "nothing to do" — nothing is ever
 * overwritten. Never throws: every problem is logged and reported as 'failed'.
 * Uses the service-role client, since users have no insert policy on daily_insights.
 */
export async function saveDailyInsight(
  userId: string,
  insightDate: string,
  insight: { content: string; modelUsed: string },
  client?: AdminClient
): Promise<SaveInsightResult> {
  try {
    assertValidDate(insightDate);
    const content = typeof insight?.content === 'string' ? insight.content.trim() : '';
    const modelUsed = typeof insight?.modelUsed === 'string' ? insight.modelUsed.trim() : '';
    if (content === '' || modelUsed === '') {
      throw new Error('El insight llegó sin texto o sin modelo');
    }

    // Built inside the try: constructing the default client throws when env vars are missing.
    const supabase = client ?? createAdminClient();
    const { error } = await supabase.from('daily_insights').insert({
      user_id: userId,
      insight_date: insightDate,
      content,
      model_used: modelUsed,
    });

    if (error?.code === UNIQUE_VIOLATION) {
      console.log(`[daily-insight] ya existía un insight del perfil ${userId} para ${insightDate}: no se guardó nada`);
      return 'skipped';
    }
    if (error) {
      throw new Error(error.message);
    }
    return 'saved';
  } catch (err) {
    console.error(`[daily-insight] no se guardó el insight del perfil ${userId} para ${insightDate}:`, err);
    return 'failed';
  }
}

/**
 * Returns the texts of this user's insights from the RECENT_DAYS days before `insightDate`
 * (not including `insightDate` itself), newest first, ready to pass to generateDailyInsight
 * as `recentInsights`. Returns [] — never throws — if there are none or if anything fails
 * (logged), so a read problem only costs variety.
 */
export async function getRecentInsights(
  userId: string,
  insightDate: string,
  client?: AdminClient
): Promise<string[]> {
  try {
    assertValidDate(insightDate);
    const from = shiftDate(insightDate, -RECENT_DAYS);

    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
      .from('daily_insights')
      .select('content')
      .eq('user_id', userId)
      .gte('insight_date', from)
      .lt('insight_date', insightDate)
      .order('insight_date', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }
    return (data ?? [])
      .map((row) => row.content)
      .filter((content): content is string => typeof content === 'string' && content.trim() !== '');
  } catch (err) {
    console.error(`[daily-insight] no se pudieron leer los insights recientes del perfil ${userId}:`, err);
    return [];
  }
}
