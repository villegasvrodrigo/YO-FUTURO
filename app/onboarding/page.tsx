'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import type { FocusArea, Tone } from '@/lib/types';

const fieldClass =
  'w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass';
const labelClass = 'mb-1.5 block text-sm font-medium text-parchment';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [currentAge, setCurrentAge] = useState(25);
  const [futureSelfAge, setFutureSelfAge] = useState(40);
  const [focusArea, setFocusArea] = useState<FocusArea>('personal');
  const [tone, setTone] = useState<Tone>('motivador');
  const [values, setValues] = useState('');
  const [goals, setGoals] = useState<string[]>(['']);
  const [deliveryHour, setDeliveryHour] = useState(8);
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const router = useRouter();

  function nextFromStep1() {
    const err = validateProfileStep({ name, currentAge, futureSelfAge, focusArea, tone, values });
    if (err) return setError(err);
    setError(null);
    setStep(2);
  }

  function nextFromStep2() {
    const err = validateGoals(goals);
    if (err) return setError(err);
    setError(null);
    setStep(3);
  }

  async function finishOnboarding() {
    const err = validateDeliveryHour(deliveryHour);
    if (err) return setError(err);
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
          PASO {step} DE 3
        </p>
        <h1 className="mb-8 text-balance font-serif text-3xl text-parchment">
          Cuéntale a tu yo futuro sobre ti
        </h1>

        {error && (
          <p role="alert" className="mb-5 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-4">
            <div>
              <label htmlFor="name" className={labelClass}>Tu nombre</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="¿Cómo te llamas?"
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="currentAge" className={labelClass}>Edad actual</label>
                <input
                  id="currentAge"
                  type="number"
                  value={currentAge}
                  onChange={(e) => setCurrentAge(Number(e.target.value))}
                  placeholder="25"
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
                  placeholder="40"
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
              <label htmlFor="values" className={labelClass}>¿Qué valoras más?</label>
              <textarea
                id="values"
                value={values}
                onChange={(e) => setValues(e.target.value)}
                placeholder="La honestidad, el tiempo con mi familia, seguir aprendiendo..."
                rows={3}
                className={fieldClass}
              />
            </div>
            <button
              type="button"
              onClick={nextFromStep1}
              className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
            >
              Siguiente
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-xl text-parchment">Tus metas</h2>
            <div className="flex flex-col gap-3">
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
              className="w-full rounded-lg border border-rule px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
            >
              Agregar otra meta
            </button>
            <button
              type="button"
              onClick={nextFromStep2}
              className="w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
            >
              Siguiente
            </button>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-xl text-parchment">
              ¿Cuándo quieres recibir tu mensaje?
            </h2>
            <div>
              <label htmlFor="deliveryHour" className={labelClass}>Hora (0–23)</label>
              <input
                id="deliveryHour"
                type="number"
                min={0}
                max={23}
                value={deliveryHour}
                onChange={(e) => setDeliveryHour(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
            <p className="font-mono text-sm text-mist">
              Zona horaria detectada: <span className="text-brass">{timezone}</span>
            </p>
            <button
              type="button"
              onClick={finishOnboarding}
              className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
            >
              Terminar
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
