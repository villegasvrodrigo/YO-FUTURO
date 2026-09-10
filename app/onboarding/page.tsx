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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    if (!input.trim() || sending) return;
    const nextTranscript = [...transcript, { role: 'user' as const, content: input.trim() }];
    setTranscript(nextTranscript);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: nextTranscript }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'No se pudo continuar la conversación');
      }
      const result = await res.json();
      setExtracted((prev) => mergeExtracted(prev, result.extracted));
      setTranscript([...nextTranscript, { role: 'assistant', content: result.assistantReply }]);
      if (result.done) setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo continuar la conversación');
    } finally {
      setSending(false);
    }
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
        </div>
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
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
      </div>
    </main>
  );
}

function ConfirmationScreen({ extracted }: { extracted: ExtractedProfile }) {
  const [name, setName] = useState(extracted.name ?? '');
  const [currentAge, setCurrentAge] = useState(extracted.currentAge ?? 25);
  const [futureSelfAge, setFutureSelfAge] = useState(extracted.futureSelfAge ?? 40);
  const [focusArea, setFocusArea] = useState<FocusArea>(extracted.focusArea ?? 'personal');
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
              <option className="bg-dusk-2 text-parchment" value="carrera">Carrera</option>
              <option className="bg-dusk-2 text-parchment" value="salud">Salud</option>
              <option className="bg-dusk-2 text-parchment" value="relaciones">Relaciones</option>
              <option className="bg-dusk-2 text-parchment" value="finanzas">Finanzas</option>
              <option className="bg-dusk-2 text-parchment" value="personal">Personal</option>
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
