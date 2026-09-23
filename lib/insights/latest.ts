import type { SupabaseClient } from '@supabase/supabase-js';

export interface LatestInsight {
  // The user's local date the insight is for, "YYYY-MM-DD".
  insightDate: string;
  content: string;
}

/**
 * Reads this user's most recent insight (the newest insight_date), whatever day it is from.
 * Meant for the signed-in user's own session client, so row-level security keeps it to
 * their own insights; never pass the service-role client here.
 * Returns null — never throws — when there is none or anything fails (logged), so the
 * dashboard falls back to its friendly message.
 */
export async function getLatestInsight(supabase: SupabaseClient, userId: string): Promise<LatestInsight | null> {
  try {
    const { data, error } = await supabase
      .from('daily_insights')
      .select('insight_date, content')
      .eq('user_id', userId)
      .order('insight_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    if (!data || typeof data.insight_date !== 'string' || typeof data.content !== 'string') {
      return null;
    }
    const content = data.content.trim();
    return content === '' ? null : { insightDate: data.insight_date, content };
  } catch (err) {
    console.error(`[dashboard] no se pudo leer el insight del perfil ${userId}:`, err);
    return null;
  }
}
