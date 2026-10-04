'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MessageDay } from '@/lib/messages/messageDay';
import { DailyMessage } from './DailyMessage';

// How long the screen waits for /api/daily/today before giving up (the route allows 60 s).
const REQUEST_TIMEOUT_MS = 70_000;

export const WRITING_COPY = 'Tu yo futuro te está escribiendo…';
export const FAILED_COPY = 'Tu yo futuro no pudo escribirte en este momento.';
export const LIMIT_COPY = 'Lo intentará de nuevo más tarde, y te escribirá a tu correo a tu hora.';

export type PreparingState = 'writing' | 'failed' | 'limit';

/** Asks the server for today's message. Never throws: anything that isn't "ready" is a state. */
export async function requestToday(fetchFn: typeof fetch = fetch): Promise<'ready' | 'failed' | 'limit'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchFn('/api/daily/today', { method: 'POST', signal: controller.signal });
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    if (res.ok && body?.status === 'ready') return 'ready';
    if (body?.status === 'limit') return 'limit';
    return 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What Inicio shows in place of today's message while it doesn't exist yet (no state: tested
 * on its own). Writing: a card the size of the message card, so nothing jumps when the
 * message arrives. Failed: a kind notice with "Reintentar" and, under it, the last message
 * clearly dated, so it never looks like today's.
 */
export function PreparingTodayView({
  state,
  retrying,
  onRetry,
  lastMessage,
  lastDay,
}: {
  state: PreparingState;
  retrying: boolean;
  onRetry: () => void;
  lastMessage: { content: string } | null;
  lastDay: MessageDay | null;
}) {
  if (state === 'writing' || retrying) {
    return (
      <>
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-brass">Tu mensaje de hoy</p>
        <div className="mt-6 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8" role="status" aria-live="polite">
          <p className="animate-pulse font-serif text-lg italic leading-relaxed text-mist">{WRITING_COPY}</p>
          <div aria-hidden="true" className="mt-5 space-y-3">
            <div className="h-3 w-full animate-pulse rounded bg-rule" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-rule" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-rule" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div role="alert" className="mb-8 rounded-lg border border-brass/30 bg-brass/10 px-4 py-4">
        <p className="text-[15px] leading-relaxed text-parchment">{FAILED_COPY}</p>
        {state === 'limit' ? (
          <p className="mt-2 text-sm leading-relaxed text-mist">{LIMIT_COPY}</p>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-3 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            Reintentar
          </button>
        )}
      </div>
      {lastMessage && <DailyMessage message={lastMessage} day={lastDay} />}
    </>
  );
}

/**
 * Creates today's message the first time Inicio opens on a new day: one request per visit (the
 * ref guard survives React's double effects), and "Reintentar" is disabled while it waits.
 * When it is ready, Inicio is refreshed in place (no full reload) and shows the message.
 */
export function PreparingToday({ lastMessage, lastDay }: { lastMessage: { content: string } | null; lastDay: MessageDay | null }) {
  const router = useRouter();
  const [state, setState] = useState<PreparingState>('writing');
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    const outcome = await requestToday();
    if (outcome === 'ready') {
      router.refresh();
      return;
    }
    setState(outcome);
    setRetrying(false);
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  function retry() {
    if (retrying) return;
    setRetrying(true);
    void run();
  }

  return <PreparingTodayView state={state} retrying={retrying} onRetry={retry} lastMessage={lastMessage} lastDay={lastDay} />;
}
