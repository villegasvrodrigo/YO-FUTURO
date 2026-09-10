'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import {
  mergeExtracted,
  EMPTY_EXTRACTED_PROFILE,
  type ChatMessage,
  type ExtractedProfile,
} from '@/lib/onboarding/extraction';
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
      setExtracted((prev) => mergeExtracted(prev, result.extracted));
      setTranscript([...nextTranscript, { role: 'assistant', content: result.assistantReply }]);
      setLastFailedTranscript(null);
      if (result.done) setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar la conversación');
      // Keep the accumulated transcript so the same turn can be retried inline.
      setLastFailedTranscript(nextTranscript);
    } finally {
      setSending(false);
    }
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

  const hasNarrativeResults =
    extracted.currentEnergySummary !== null ||
    extracted.blockingPattern !== null ||
    extracted.futureVision !== null;

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
          onClick={() => setDone(true)}
          className="mt-3 text-sm text-mist underline underline-offset-4 transition-colors hover:text-brass"
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
  const router = useRouter();

  async function confirmAndSave() {
    const profileErr = validateProfileStep({ name, currentAge, futureSelfAge, focusArea, tone, values });
    if (profileErr) return setError(profileErr);
    const goalsErr = validateGoals(goals);
    if (goalsErr) return setError(goalsErr);
    const hourErr = validateDeliveryHour(deliveryHour);
    if (hourErr) return setError(hourErr);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Sesión expirada, vuelve a iniciar sesión.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
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
    });
    if (profileError) return setError(profileError.message);

    const nonEmptyGoals = goals.map((g) => g.trim()).filter(Boolean);
    const { error: goalsError } = await supabase
      .from('goals')
      .insert(nonEmptyGoals.map((description) => ({ user_id: user.id, description })));
    if (goalsError) return setError(goalsError.message);

    router.push('/dashboard');
    router.refresh();
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
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            Confirmar y empezar
          </button>
        </div>
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
