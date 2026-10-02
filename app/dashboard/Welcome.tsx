'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { WELCOME_DONE_MESSAGE, WELCOME_SEEN_KEY, type WelcomeStep } from './welcomeContent';

/** One step of the welcome, as it reads on screen (no state: tested on its own). */
export function WelcomeStepView({ step, index, total }: { step: WelcomeStep; index: number; total: number }) {
  return (
    <section>
      <p className="mb-3 font-mono text-xs tracking-[0.14em] text-brass">
        PASO {index + 1} DE {total}
      </p>
      <h2 className="font-serif text-3xl leading-tight text-parchment">{step.title}</h2>
      {step.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-4 text-[16px] leading-relaxed text-parchment/90">
          {paragraph}
        </p>
      ))}
      {step.notice && (
        <p className="mt-6 rounded-lg border border-brass/30 bg-brass/10 px-4 py-3 text-sm leading-relaxed text-parchment">
          {step.notice}
        </p>
      )}
      {step.note && <p className="mt-4 text-sm leading-relaxed text-mist">{step.note}</p>}
    </section>
  );
}

/**
 * The welcome, full screen over Inicio. `replay` is the "Ver la bienvenida otra vez" visit
 * from Perfil: then nothing is saved and no "Todo listo" appears. Otherwise, finishing or
 * skipping saves the mark in the account's data, so it never shows again, and shows the
 * "Todo listo" line on Inicio for this visit only.
 */
export function Welcome({ steps, name, replay }: { steps: WelcomeStep[]; name: string; replay: boolean }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // While open, the page behind doesn't scroll; each step starts at its top.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [index]);

  function close() {
    setOpen(false);
    if (replay) {
      // Back to plain /dashboard, so a reload doesn't open it again.
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    setDone(true);
    // A failed save only means it may show once more: never blocks the person.
    createClient()
      .auth.updateUser({ data: { [WELCOME_SEEN_KEY]: new Date().toISOString() } })
      .then(({ error }) => {
        if (error) console.error('[bienvenida] no se pudo guardar que ya la vio:', error.message);
      })
      .catch((err) => console.error('[bienvenida] no se pudo guardar que ya la vio:', err));
  }

  if (!open) {
    return done ? <WelcomeDone name={name} /> : null;
  }

  const last = index === steps.length - 1;
  return (
    <div
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida"
      className="fixed inset-0 z-50 overflow-y-auto bg-ink"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
        <header className="flex items-center justify-between gap-4">
          <p className="font-mono text-xs tracking-[0.14em] text-mist">YO FUTURO</p>
          <button type="button" onClick={close} className="font-mono text-xs text-mist underline underline-offset-4 hover:text-parchment">
            Saltar introducción
          </button>
        </header>

        <ol className="mt-5 flex gap-1.5" aria-hidden="true">
          {steps.map((step, i) => (
            <li key={step.label} className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-brass' : 'bg-rule'}`} />
          ))}
        </ol>

        <main className="flex-1 py-10">
          <WelcomeStepView step={steps[index]} index={index} total={steps.length} />
        </main>

        <nav className="flex items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="rounded-lg border border-rule px-5 py-3 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
            >
              Atrás
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => (last ? close() : setIndex(index + 1))}
            className="rounded-lg bg-brass px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            {last ? 'Empezar' : 'Siguiente'}
          </button>
        </nav>
      </div>
    </div>
  );
}

/** The "Todo listo" line on Inicio, right after finishing the welcome (this visit only). */
export function WelcomeDone({ name }: { name: string }) {
  return (
    <p role="status" className="mb-6 rounded-lg border border-brass/30 bg-brass/10 px-4 py-3 text-[15px] text-parchment">
      {WELCOME_DONE_MESSAGE(name)}
    </p>
  );
}

