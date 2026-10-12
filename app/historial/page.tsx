import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { emptyStateCopy } from '@/lib/historial/emptyStateCopy';
import {
  closestDay,
  hasContent,
  neighborDay,
  parseRequestedDay,
  readHistoryDay,
  type HistoryDayContent,
} from '@/lib/historial/day';
import { effectiveTimezone, localToday } from '@/lib/daily/today';
import { shiftDate } from '@/lib/tasks/dates';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { historyHref } from '@/lib/historial/format';
import { DayView } from './DayView';

/**
 * The history, one day at a time (?dia=2026-10-11, the person's LOCAL date): that day's
 * message, tasks and insight. A day with nothing, an invalid date or one after today leads to
 * the closest day that has something; with no date at all, to the latest one.
 */
export default async function HistorialPage({ searchParams }: PageProps<'/historial'>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { dia }] = await Promise.all([
    (async () =>
      await supabase
        .from('profiles')
        .select('delivery_hour_local, timezone, delivery_paused')
        .eq('id', user.id)
        .maybeSingle())(),
    searchParams,
  ]);

  // The person's today, with the fallback time zone when theirs is missing or invalid (like Inicio).
  const today = localToday(new Date(), effectiveTimezone(profile?.timezone));
  const requested = parseRequestedDay(dia);

  const screen = (children: React.ReactNode) => (
    <>
      {/* Extra room at the bottom (like Progreso) so the floating bar never covers the insight. */}
      <main className="flex flex-1 justify-center px-6 pb-56 pt-8">
        <div className="w-full max-w-xl">{children}</div>
      </main>
      <BottomNav chatEnabled={isChatEnabledFor(user.id)} />
    </>
  );
  const failed = (date: string, err: unknown) => {
    console.error(`[historial] no se pudo leer el día ${date} del perfil ${user.id}:`, err);
    return screen(<DayView date={date} today={today} content={null} prev={null} next={null} />);
  };

  // Where to send the person when the requested day can't be shown as it is.
  let target: string | null;
  if (requested && requested <= today) {
    let content: HistoryDayContent;
    let prev: string | null;
    let next: string | null;
    try {
      [content, prev, next] = await Promise.all([
        readHistoryDay(supabase, user.id, requested),
        neighborDay(supabase, user.id, requested, 'prev', today),
        neighborDay(supabase, user.id, requested, 'next', today),
      ]);
    } catch (err) {
      return failed(requested, err);
    }
    if (hasContent(content)) {
      return screen(<DayView date={requested} today={today} content={content} prev={prev} next={next} />);
    }
    target = closestDay(requested, prev, next);
  } else {
    // No date, an invalid one or one after today: the latest day up to today.
    try {
      target = await neighborDay(supabase, user.id, shiftDate(today, 1), 'prev', today);
    } catch (err) {
      return failed(today, err);
    }
  }

  if (target) redirect(historyHref(target));

  // Nothing in the whole history yet.
  return screen(
    <>
      <h1 className="mb-6 font-serif text-3xl text-parchment">Historial</h1>
      <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
        <p className="font-serif text-lg italic leading-relaxed text-mist">
          {profile
            ? emptyStateCopy(profile.delivery_hour_local, profile.timezone, profile.delivery_paused === true)
            : 'Tu yo futuro todavía no te ha escrito.'}
        </p>
      </div>
    </>
  );
}
