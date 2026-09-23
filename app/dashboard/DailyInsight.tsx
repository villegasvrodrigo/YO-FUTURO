import type { LatestInsight } from '@/lib/insights/latest';

export const NO_INSIGHT_COPY = 'Tu insight llega con tu mensaje de hoy.';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-09-23" → "23 sep". Read straight from the text, so no time zone can shift the day. */
export function shortInsightDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${Number(match[3])} ${month}` : '';
}

/** The short explanation under the "Daily insight" title. Only when there is an insight. */
export function DailyInsightHint({ insight }: { insight: LatestInsight | null }) {
  if (!insight) return null;
  return (
    <p className="mt-1 text-sm text-parchment/70">
      <span aria-hidden="true" className="mr-1.5 text-brass">
        →
      </span>
      Una observación de tu yo futuro sobre lo que vas aprendiendo.
    </p>
  );
}

/**
 * The "Daily insight" card of the dashboard: the user's most recent insight with its date
 * (it may be from an earlier day, and the date makes that clear), or a friendly message
 * when there is none yet or it couldn't be read.
 */
export function DailyInsight({ insight }: { insight: LatestInsight | null }) {
  if (!insight) {
    return (
      <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
        <p className="text-sm text-mist">{NO_INSIGHT_COPY}</p>
      </div>
    );
  }

  const date = shortInsightDate(insight.insightDate);
  return (
    // Same side margin as the other dashboard cards (px-7); more room above and below and a
    // larger text than theirs, so this one reads slower.
    <div className="rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-10 sm:py-12">
      {date && (
        <time dateTime={insight.insightDate} className="mb-6 block font-mono text-xs uppercase tracking-[0.08em] text-mist">
          {date}
        </time>
      )}
      <p className="font-serif text-xl italic leading-relaxed text-parchment sm:text-[22px]">{insight.content}</p>
    </div>
  );
}
