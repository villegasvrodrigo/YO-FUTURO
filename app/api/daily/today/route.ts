import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createTodayForPerson, effectiveTimezone, localToday } from '@/lib/daily/today';
import type { Profile } from '@/lib/types';
import { attemptsUsedToday, DAILY_ATTEMPTS_LIMIT, nextAttemptsRecord } from './attempts';

// The AI writes the message (with one retry) and the tasks: allow for both.
export const maxDuration = 60;

// What the screen gets back. Never technical details.
export type TodayStatus = 'ready' | 'failed' | 'limit' | 'not_ready';

/**
 * POST /api/daily/today: makes sure the signed-in person has today's message and tasks
 * (their local day), creating them if needed — the first time they open Inicio that day.
 * The email isn't sent here: the cron sends this same message at their hour. The insight is
 * written after answering. At most DAILY_ATTEMPTS_LIMIT AI attempts per person per day.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ status: 'not_ready' satisfies TodayStatus }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: profile, error } = await admin.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
    if (!profile || !(profile as Profile).onboarding_completed) {
      return NextResponse.json({ status: 'not_ready' satisfies TodayStatus }, { status: 403 });
    }

    const now = new Date();
    const today = localToday(now, effectiveTimezone((profile as Profile).timezone));
    const result = await createTodayForPerson(admin, profile as Profile, now, {
      // Counted right before the AI is called: opening Inicio when the day already exists is free.
      allowGeneration: async () => {
        const used = attemptsUsedToday(user.app_metadata, today);
        if (used >= DAILY_ATTEMPTS_LIMIT) return false;
        const { error: countError } = await admin.auth.admin.updateUserById(user.id, {
          app_metadata: nextAttemptsRecord(used, today),
        });
        if (countError) console.error(`[dia] no se pudo contar el intento: ${countError.message}`);
        return true;
      },
    });

    if (result.status === 'limit') {
      console.log(`[dia] límite de intentos de hoy alcanzado: perfil ${user.id}`);
      return NextResponse.json({ status: 'limit' satisfies TodayStatus }, { status: 429 });
    }
    if (result.status === 'created') {
      // The insight, after answering: nobody waits for it.
      after(result.makeInsight);
      console.log(`[dia] mensaje de hoy creado desde la app: perfil ${user.id}`);
    }
    return NextResponse.json({ status: 'ready' satisfies TodayStatus });
  } catch (err) {
    // Only the error's own text in the logs (never the message or personal data); the screen
    // gets the friendly notice.
    console.error(`[dia] no se pudo crear el mensaje de hoy: ${err instanceof Error ? err.message : 'error desconocido'}`);
    return NextResponse.json({ status: 'failed' satisfies TodayStatus }, { status: 502 });
  }
}
