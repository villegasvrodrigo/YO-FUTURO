'use client';

import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { olderEntry, type DayEntry, type DayEntryKind } from '@/lib/historial/day';
import { DailyInsight, shortInsightDate } from './DailyInsight';
import {
  canGoOlder,
  dayBrowserReducer,
  initialBrowserState,
  needsOlder,
  swipeDirection,
  type DayBrowserState,
} from './dayNavigation';

export const LOAD_OLDER_FAILED_COPY = 'No se pudo cargar el día anterior.';

/** The card's state and moves; earlier days are read in the browser, read only, one ahead. */
function useDayBrowser(kind: DayEntryKind, userId: string, initial: DayEntry) {
  const [state, dispatch] = useReducer(dayBrowserReducer, initial, initialBrowserState);
  const inFlight = useRef(false);
  const need = needsOlder(state);
  const lastDate = state.entries[state.entries.length - 1].date;

  useEffect(() => {
    if (!need || inFlight.current) return;
    inFlight.current = true;
    olderEntry(createClient(), userId, kind, lastDate).then(
      (entry) => {
        inFlight.current = false;
        dispatch({ type: 'loaded', entry });
      },
      (err) => {
        inFlight.current = false;
        console.error(`[inicio] no se pudo leer el día anterior (${kind}):`, err);
        dispatch({ type: 'failed' });
      }
    );
  }, [need, lastDate, kind, userId]);

  return {
    state,
    entry: state.entries[state.index],
    older: () => dispatch({ type: 'older' }),
    newer: () => dispatch({ type: 'newer' }),
    latest: () => dispatch({ type: 'latest' }),
  };
}

function Arrow({
  direction,
  label,
  disabled,
  busy,
  onClick,
}: {
  direction: 'prev' | 'next';
  label: string;
  disabled: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    // 44 px: a comfortable target for a thumb.
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-full text-brass transition-colors enabled:hover:bg-rule/60 enabled:active:bg-rule/80 disabled:text-mist/30 ${
        busy ? 'animate-pulse' : ''
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}

function Arrows({ noun, state, older, newer }: { noun: string; state: DayBrowserState; older: () => void; newer: () => void }) {
  return (
    <div className="-mr-2 flex shrink-0 items-center">
      <Arrow direction="prev" label={`${noun} anterior`} disabled={!canGoOlder(state)} busy={state.wantOlder} onClick={older} />
      <Arrow direction="next" label={`${noun} siguiente`} disabled={state.index === 0} onClick={newer} />
    </div>
  );
}

/**
 * The small line under a card's title, always one line high so nothing below moves: the
 * notice if the earlier day couldn't be read, "Volver a hoy" (or to the newest one, when
 * Inicio started on an earlier day) away from the start, otherwise `atStart`.
 */
function SubLine({
  state,
  startIsToday,
  latest,
  atStart,
}: {
  state: DayBrowserState;
  startIsToday: boolean;
  latest: () => void;
  atStart: React.ReactNode;
}) {
  if (state.notice) {
    return (
      <p role="status" className="font-mono text-xs leading-5 text-danger">
        {LOAD_OLDER_FAILED_COPY}
      </p>
    );
  }
  if (state.index === 0) return <p className="font-mono text-xs leading-5 text-mist">{atStart}</p>;
  return (
    <button
      type="button"
      onClick={latest}
      className="font-mono text-xs leading-5 text-brass underline underline-offset-4 transition-colors hover:text-brass/80"
    >
      {startIsToday ? 'Volver a hoy' : 'Volver al más reciente'}
    </button>
  );
}

/**
 * The card itself: swiping sideways over it changes the day (vertical moves still scroll the
 * page). It never gets shorter than the tallest day seen, so going back and forth never makes
 * the page below jump up and down.
 */
function SwipeCard({
  dayKey,
  older,
  newer,
  children,
}: {
  dayKey: string;
  older: () => void;
  newer: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const tallest = useRef(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    tallest.current = Math.max(tallest.current, node.offsetHeight);
    node.style.minHeight = `${tallest.current}px`;
  }, [dayKey]);

  return (
    <div
      ref={ref}
      className="touch-pan-y"
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        const t = e.changedTouches[0];
        start.current = null;
        if (!from || !t) return;
        const direction = swipeDirection(t.clientX - from.x, t.clientY - from.y);
        if (direction === 'older') older();
        if (direction === 'newer') newer();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Inicio's message card, with arrows (and a swipe) to the messages of earlier days and back.
 * The title says "Tu mensaje de hoy" only on today's; otherwise "Tu mensaje del 9 oct".
 */
export function MessageBrowser({ userId, today, initial }: { userId: string; today: string; initial: DayEntry }) {
  const { state, entry, older, newer, latest } = useDayBrowser('message', userId, initial);
  const date = shortInsightDate(entry.date);
  const title = entry.date === today ? 'Tu mensaje de hoy' : `Tu mensaje del ${date}`;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-brass">{title}</p>
          <SubLine
            state={state}
            startIsToday={initial.date === today}
            latest={latest}
            atStart={<time dateTime={entry.date}>{date}</time>}
          />
        </div>
        <Arrows noun="Mensaje" state={state} older={older} newer={newer} />
      </div>

      <SwipeCard dayKey={entry.date} older={older} newer={newer}>
        <div className="mt-4 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
          <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">{entry.content}</p>
        </div>
      </SwipeCard>
    </>
  );
}

/** Inicio's insight card, with its own arrows (and swipe), apart from the message's. */
export function InsightBrowser({ userId, today, initial }: { userId: string; today: string; initial: DayEntry }) {
  const { state, entry, older, newer, latest } = useDayBrowser('insight', userId, initial);
  const date = shortInsightDate(entry.date);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-mist">
            <time dateTime={entry.date}>{entry.date === today ? `Hoy · ${date}` : date}</time>
          </p>
          <SubLine state={state} startIsToday={initial.date === today} latest={latest} atStart={' '} />
        </div>
        <Arrows noun="Insight" state={state} older={older} newer={newer} />
      </div>

      <SwipeCard dayKey={entry.date} older={older} newer={newer}>
        <div className="mt-2">
          <DailyInsight insight={{ insightDate: entry.date, content: entry.content }} showDate={false} />
        </div>
      </SwipeCard>
    </>
  );
}
