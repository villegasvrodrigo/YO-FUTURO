'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { validateProfileStep, validateGoals, validateDeliveryHour } from '@/lib/onboarding/validate';
import type { FocusArea, Tone } from '@/lib/types';

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
    <main>
      <h1>Cuéntale a tu yo futuro sobre ti</h1>
      {error && <p role="alert">{error}</p>}

      {step === 1 && (
        <section>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          <input
            type="number"
            value={currentAge}
            onChange={(e) => setCurrentAge(Number(e.target.value))}
            placeholder="Edad actual"
          />
          <input
            type="number"
            value={futureSelfAge}
            onChange={(e) => setFutureSelfAge(Number(e.target.value))}
            placeholder="Edad de tu yo futuro"
          />
          <select value={focusArea} onChange={(e) => setFocusArea(e.target.value as FocusArea)}>
            <option value="carrera">Carrera</option>
            <option value="salud">Salud</option>
            <option value="relaciones">Relaciones</option>
            <option value="finanzas">Finanzas</option>
            <option value="personal">Personal</option>
          </select>
          <select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
            <option value="motivador">Motivador</option>
            <option value="exigente">Exigente</option>
            <option value="tierno">Tierno</option>
            <option value="directo">Directo</option>
          </select>
          <textarea
            value={values}
            onChange={(e) => setValues(e.target.value)}
            placeholder="¿Qué valoras más?"
          />
          <button type="button" onClick={nextFromStep1}>Siguiente</button>
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Tus metas</h2>
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
            />
          ))}
          <button type="button" onClick={() => setGoals([...goals, ''])}>Agregar otra meta</button>
          <button type="button" onClick={nextFromStep2}>Siguiente</button>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>¿Cuándo quieres recibir tu mensaje?</h2>
          <input
            type="number"
            min={0}
            max={23}
            value={deliveryHour}
            onChange={(e) => setDeliveryHour(Number(e.target.value))}
          />
          <p>Zona horaria detectada: {timezone}</p>
          <button type="button" onClick={finishOnboarding}>Terminar</button>
        </section>
      )}
    </main>
  );
}
