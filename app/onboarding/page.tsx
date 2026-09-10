'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import {
  mergeExtracted,
  EMPTY_EXTRACTED_PROFILE,
  type ChatMessage,
  type ExtractedProfile,
} from '@/lib/onboarding/extraction';
import {
  loadOnboardingProgress,
  saveOnboardingProgress,
  clearOnboardingProgress,
} from '@/lib/onboarding/progress';
import { ONBOARDING_GREETING } from '@/lib/onboarding/script';
import type { FocusArea, Tone } from '@/lib/types';

const fieldClass =
  'w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass';
const labelClass = 'mb-1.5 block text-sm font-medium text-parchment';

export default function OnboardingPage() {
  const [transcript, setTranscript] = useState<ChatMessage[]>([
    { role: 'assistant', content: ONBOARDING_GREETING },
  ]);
  const [input, setInput] = useState('');
  const [extracted, setExtracted] = useState<ExtractedProfile>(EMPTY_EXTRACTED_PROFILE);
  const [done, setDone] = useState(false);
  const [resultsConfirmed, setResultsConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedTranscript, setLastFailedTranscript] = useState<ChatMessage[] | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [synthesisTranscript, setSynthesisTranscript] = useState<ChatMessage[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Resume a previously-saved conversation on load, so a refresh, a closed tab, or a
  // return the next day picks up exactly where the user left off instead of restarting.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoaded(true);
        return;
      }
      if (!cancelled) setUserId(user.id);

      const progress = await loadOnboardingProgress(supabase, user.id);
      if (cancelled) return;
      if (!progress) {
        setLoaded(true);
        return;
      }

      setTranscript(progress.transcript);
      setExtracted(progress.extracted);
      if (progress.done) {
        const hasNarrative =
          progress.extracted.currentEnergySummary !== null ||
          progress.extracted.blockingPattern !== null ||
          progress.extracted.futureVision !== null;
        if (hasNarrative) {
          setDone(true);
        } else {
          // The script finished last time but extraction/synthesis never completed — pick that back up.
          await finalizeOnboarding(progress.transcript, progress.extracted);
        }
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount only — resuming saved progress is a one-time hydration step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistProgress(t: ChatMessage[], e: ExtractedProfile, d: boolean) {
    if (!userId) return;
    const supabase = createClient();
    await saveOnboardingProgress(supabase, userId, { transcript: t, extracted: e, done: d });
  }

  async function requestTurn(nextTranscript: ChatMessage[]) {
    if (sending) return;
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: nextTranscript }),
      });
      if (!res.ok) {
        if (res.status === 400) {
          // Validation failure (e.g. the conversation grew too long) — retrying the
          // identical payload would fail identically, so don't offer a retry loop.
          setError(
            'Esta conversación se hizo muy larga para continuar. Usa "Ya terminé, revisar mis datos" para avanzar con lo que ya compartiste.'
          );
          setLastFailedTranscript(null);
          return;
        }
        let message = 'No se pudo continuar la conversación';
        try {
          const body = await res.json();
          message = body.error ?? message;
        } catch {
          // Non-JSON error body (e.g. a platform error page): keep the default message.
        }
        throw new Error(message);
      }
      const result = await res.json();
      const finalTranscript = [...nextTranscript, { role: 'assistant' as const, content: result.assistantReply }];
      setTranscript(finalTranscript);
      setLastFailedTranscript(null);
      await persistProgress(finalTranscript, extracted, result.finished);
      // The turn call only ever returns plain conversational text now — the profile
      // fields and narrative results come from two separate, dedicated calls kicked
      // off once the script signals it's finished (via Claude's own [FIN] marker, or
      // the safety-cap fallback inside runOnboardingTurn).
      if (result.finished) await finalizeOnboarding(finalTranscript, extracted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar la conversación');
      // Keep the accumulated transcript so the same turn can be retried inline.
      setLastFailedTranscript(nextTranscript);
    } finally {
      setSending(false);
    }
  }

  // Runs once the script is finished (naturally, via the safety cap, or because the
  // user cut it short with "Ya terminé") — extraction and synthesis are independent,
  // both need only the finished transcript, so they run in parallel.
  async function finalizeOnboarding(finalTranscript: ChatMessage[], baseExtracted: ExtractedProfile) {
    setSynthesizing(true);
    setSynthesisError(null);
    try {
      const [extraction, synthesis] = await Promise.all([
        fetchJson('/api/onboarding/extract', finalTranscript, 'No se pudieron extraer tus datos'),
        fetchJson('/api/onboarding/synthesize', finalTranscript, 'No se pudieron generar tus resultados'),
      ]);
      const mergedExtracted = mergeExtracted(mergeExtracted(baseExtracted, extraction), synthesis);
      setExtracted(mergedExtracted);
      await persistProgress(finalTranscript, mergedExtracted, true);
      setSynthesisTranscript(null);
      setDone(true);
    } catch (err) {
      setSynthesisError(err instanceof Error ? err.message : 'No se pudieron generar tus resultados');
      setSynthesisTranscript(finalTranscript);
    } finally {
      setSynthesizing(false);
    }
  }

  async function fetchJson(url: string, transcript: ChatMessage[], defaultErrorMessage: string) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    if (!res.ok) {
      let message = defaultErrorMessage;
      try {
        const body = await res.json();
        message = body.error ?? message;
      } catch {
        // Non-JSON error body (e.g. a platform error page): keep the default message.
      }
      throw new Error(message);
    }
    return res.json();
  }

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const nextTranscript = [...transcript, { role: 'user' as const, content: input.trim() }];
    setTranscript(nextTranscript);
    setInput('');
    await requestTurn(nextTranscript);
  }

  async function retryLastTurn() {
    if (!lastFailedTranscript) return;
    await requestTurn(lastFailedTranscript);
  }

  async function retryFinalize() {
    if (!synthesisTranscript) return;
    await finalizeOnboarding(synthesisTranscript, extracted);
  }

  const hasNarrativeResults =
    extracted.currentEnergySummary !== null ||
    extracted.blockingPattern !== null ||
    extracted.futureVision !== null;

  if (!loaded) {
    return <LoadingScreen />;
  }

  if (synthesizing) {
    return <SynthesizingScreen />;
  }

  if (synthesisError) {
    return <SynthesisErrorScreen message={synthesisError} onRetry={retryFinalize} />;
  }

  if (done && !resultsConfirmed && hasNarrativeResults) {
    return <ResultsScreen extracted={extracted} onContinue={() => setResultsConfirmed(true)} />;
  }

  if (done) {
    return <ConfirmationScreen extracted={extracted} />;
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="mb-4 font-mono text-xs tracking-[0.14em] text-brass">
          CUÉNTALE A TU YO FUTURO
        </p>
        <div className="mb-4 flex flex-col gap-3">
          {transcript.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-3 text-[15px] leading-relaxed ${
                m.role === 'assistant' ? 'bg-dusk-2 text-parchment' : 'ml-8 bg-brass/10 text-parchment'
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="rounded-lg bg-dusk-2 px-4 py-3 text-[15px] italic text-mist" role="status">
              Escribiendo…
            </div>
          )}
        </div>
        {error && (
          <div className="mb-4 flex items-center gap-2.5">
            <p role="alert" className="flex-1 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
            {lastFailedTranscript && (
              <button
                type="button"
                onClick={retryLastTurn}
                disabled={sending}
                className="shrink-0 rounded-lg border border-rule px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60 disabled:opacity-50"
              >
                Reintentar
              </button>
            )}
          </div>
        )}
        <div className="flex gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
            placeholder="Escribe tu respuesta..."
            disabled={sending}
            className={fieldClass}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={sending}
            className="shrink-0 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
        <button
          type="button"
          onClick={() => finalizeOnboarding(transcript, extracted)}
          disabled={sending}
          className="mt-3 text-sm text-mist underline underline-offset-4 transition-colors hover:text-brass disabled:opacity-50"
        >
          Ya terminé, revisar mis datos
        </button>
      </div>
    </main>
  );
}

function ConfirmationScreen({ extracted }: { extracted: ExtractedProfile }) {
  const [name, setName] = useState(extracted.name ?? '');
  const [currentAge, setCurrentAge] = useState(extracted.currentAge ?? 25);
  const [futureSelfAge, setFutureSelfAge] = useState(extracted.futureSelfAge ?? 40);
  const [focusArea, setFocusArea] = useState<FocusArea>(extracted.focusArea ?? 'finanzas');
  const [tone, setTone] = useState<Tone>(extracted.tone ?? 'motivador');
  const [values, setValues] = useState(extracted.values ?? '');
  const [goals, setGoals] = useState<string[]>(
    extracted.goals && extracted.goals.length > 0 ? extracted.goals : ['']
  );
  const [deliveryHour, setDeliveryHour] = useState(extracted.deliveryHour ?? 8);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function confirmAndSave() {
    // Guards against a double-click sending two concurrent inserts — with no protection
    // here, the second one always lost the race to the profiles table's primary key and
    // surfaced a raw Postgres error instead of a friendly message.
    if (saving) return;

    const profileErr = validateProfileStep({ name, currentAge, futureSelfAge, focusArea, tone, values });
    if (profileErr) return setError(profileErr);
    const goalsErr = validateGoals(goals);
    if (goalsErr) return setError(goalsErr);
    const hourErr = validateDeliveryHour(deliveryHour);
    if (hourErr) return setError(hourErr);
    setError(null);
    setSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Sesión expirada, vuelve a iniciar sesión.');
        return;
      }

      // Upsert, not insert: a prior click (or a retry after this same confirmation
      // failed partway through, like this one) may have already created the row, and
      // "save again" should update it in place rather than fail on the primary key.
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: user.id,
          name,
          current_age: currentAge,
          future_self_age: futureSelfAge,
          focus_area: focusArea,
          tone,
          values,
          delivery_hour_local: deliveryHour,
          timezone,
          onboarding_completed: true,
          current_energy_summary: extracted.currentEnergySummary,
          blocking_pattern: extracted.blockingPattern,
          future_vision: extracted.futureVision,
        },
        { onConflict: 'id' }
      );
      if (profileError) {
        console.error('[onboarding-confirm] profile upsert failed', profileError);
        setError('No se pudo guardar tu perfil, intenta de nuevo.');
        return;
      }

      const nonEmptyGoals = goals.map((g) => g.trim()).filter(Boolean);
      const { error: goalsError } = await supabase
        .from('goals')
        .insert(nonEmptyGoals.map((description) => ({ user_id: user.id, description })));
      if (goalsError) {
        console.error('[onboarding-confirm] goals insert failed', goalsError);
        setError('No se pudieron guardar tus metas, intenta de nuevo.');
        return;
      }

      // The profile now holds everything permanently — the in-progress conversation
      // snapshot has served its purpose and would only cause confusion if left behind.
      await clearOnboardingProgress(supabase, user.id);

      router.push('/dashboard');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="mb-2 font-mono text-xs tracking-[0.14em] text-brass">
          ASÍ TE VAMOS A RECORDAR
        </p>
        <h1 className="mb-8 text-balance font-serif text-3xl italic text-parchment">
          Revisa y ajusta antes de empezar
        </h1>

        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="name" className={labelClass}>Tu nombre</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="currentAge" className={labelClass}>Edad actual</label>
              <input
                id="currentAge"
                type="number"
                value={currentAge}
                onChange={(e) => setCurrentAge(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="futureSelfAge" className={labelClass}>Edad de tu yo futuro</label>
              <input
                id="futureSelfAge"
                type="number"
                value={futureSelfAge}
                onChange={(e) => setFutureSelfAge(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="focusArea" className={labelClass}>Área de vida a enfocar</label>
            <select
              id="focusArea"
              value={focusArea}
              onChange={(e) => setFocusArea(e.target.value as FocusArea)}
              className={fieldClass}
            >
              <option className="bg-dusk-2 text-parchment" value="finanzas">Dinero y abundancia</option>
              <option className="bg-dusk-2 text-parchment" value="relaciones">Amor y relaciones</option>
              <option className="bg-dusk-2 text-parchment" value="paz">Paz</option>
              <option className="bg-dusk-2 text-parchment" value="cuerpo">Mi cuerpo</option>
            </select>
          </div>
          <div>
            <label htmlFor="tone" className={labelClass}>Tono del mensaje</label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className={fieldClass}
            >
              <option className="bg-dusk-2 text-parchment" value="motivador">Motivador</option>
              <option className="bg-dusk-2 text-parchment" value="exigente">Exigente</option>
              <option className="bg-dusk-2 text-parchment" value="tierno">Tierno</option>
              <option className="bg-dusk-2 text-parchment" value="directo">Directo</option>
            </select>
          </div>
          <div>
            <label htmlFor="values" className={labelClass}>Lo que valoras</label>
            <textarea
              id="values"
              value={values}
              onChange={(e) => setValues(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Tus metas</label>
            <div className="flex flex-col gap-2.5">
              {goals.map((goal, i) => (
                <input
                  key={i}
                  value={goal}
                  onChange={(e) => {
                    const next = [...goals];
                    next[i] = e.target.value;
                    setGoals(next);
                  }}
                  placeholder={`Meta ${i + 1}`}
                  className={fieldClass}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setGoals([...goals, ''])}
              className="mt-2 rounded-lg border border-rule px-4 py-2 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
            >
              Agregar otra meta
            </button>
          </div>
          <div>
            <label htmlFor="deliveryHour" className={labelClass}>Hora de entrega (0–23)</label>
            <input
              id="deliveryHour"
              type="number"
              min={0}
              max={23}
              value={deliveryHour}
              onChange={(e) => setDeliveryHour(Number(e.target.value))}
              className={fieldClass}
            />
            <p className="mt-1.5 font-mono text-xs text-mist">
              Zona horaria detectada: <span className="text-brass">{timezone}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={confirmAndSave}
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Confirmar y empezar'}
          </button>
        </div>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <p role="status" className="font-mono text-xs tracking-[0.14em] text-mist">
        CARGANDO…
      </p>
    </main>
  );
}

function SynthesizingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="mb-3 font-mono text-xs tracking-[0.14em] text-brass">TU RADIOGRAFÍA</p>
        <h1 role="status" className="text-balance font-serif text-2xl italic text-parchment">
          Preparando tus resultados…
        </h1>
        <p className="mt-3 text-sm text-mist">
          Esto puede tardar un poco más — estamos leyendo toda la conversación con cuidado.
        </p>
      </div>
    </main>
  );
}

function SynthesisErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="mb-3 font-mono text-xs tracking-[0.14em] text-brass">TU RADIOGRAFÍA</p>
        <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}

function ResultsScreen({
  extracted,
  onContinue,
}: {
  extracted: ExtractedProfile;
  onContinue: () => void;
}) {
  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="mb-2 font-mono text-xs tracking-[0.14em] text-brass">TU RADIOGRAFÍA</p>
        <h1 className="mb-8 font-serif text-3xl text-parchment">Esto es lo que encontramos</h1>

        <div className="flex flex-col gap-6">
          <ResultCard title="Tu energía actual" content={extracted.currentEnergySummary} />
          <ResultCard title="El patrón que te detiene" content={extracted.blockingPattern} />
          <ResultCard title="Quién quieres ser" content={extracted.futureVision} />
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
        >
          Continuar
        </button>
      </div>
    </main>
  );
}

function ResultCard({ title, content }: { title: string; content: string | null }) {
  return (
    <div className="rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-mist">{title}</p>
      <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">
        {content?.trim() ? content : 'No pudimos generar esta sección — puedes continuar de todas formas.'}
      </p>
    </div>
  );
}
