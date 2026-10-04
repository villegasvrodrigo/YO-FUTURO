'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// How often Inicio checks whether today's insight arrived.
export const INSIGHT_CHECK_MS = 4000;

export const INSIGHT_ON_THE_WAY_COPY = 'Tu insight está en camino…';

/**
 * The insight card while today's insight is still being written: a soft waiting line, and a
 * quiet refresh of Inicio every few seconds (no reload, nothing jumps). As soon as the insight
 * exists, Inicio shows it instead of this card; Inicio itself stops sending this card after a
 * few minutes, so the checks never go on forever.
 */
export function InsightOnTheWay() {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), INSIGHT_CHECK_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div role="status" aria-live="polite" className="rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-6">
      <p className="animate-pulse text-sm text-mist">{INSIGHT_ON_THE_WAY_COPY}</p>
    </div>
  );
}
