'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import type { Profile, Goal, GoalStatus } from '@/lib/types';

const fieldClass =
  'w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass';
const labelClass = 'mb-1.5 block text-sm font-medium text-parchment';

const statusLabel: Record<GoalStatus, string> = {
  active: 'activa',
  achieved: 'lograda',
  paused: 'pausada',
};

export function PerfilForm({ profile, goals }: { profile: Profile; goals: Goal[] }) {
  const [name, setName] = useState(profile.name);
  const [values, setValues] = useState(profile.values);
  const [deliveryHour, setDeliveryHour] = useState(profile.delivery_hour_local);
  const [goalList, setGoalList] = useState(goals);
  const [newGoal, setNewGoal] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const router = useRouter();

  async function saveProfile() {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ name, values, delivery_hour_local: deliveryHour })
      .eq('id', profile.id);
    setMessage(error ? error.message : 'Perfil actualizado');
  }

  async function addGoal() {
    if (!newGoal.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from('goals')
      .insert({ user_id: profile.id, description: newGoal.trim() })
      .select()
      .single();
    if (!error && data) {
      setGoalList([...goalList, data]);
      setNewGoal('');
    }
  }

  async function setGoalStatus(goalId: string, status: GoalStatus) {
    const supabase = createClient();
    const { error } = await supabase.from('goals').update({ status }).eq('id', goalId);
    if (!error) {
      setGoalList(goalList.map((g) => (g.id === goalId ? { ...g, status } : g)));
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function deleteAccount() {
    const res = await fetch('/api/account/delete', { method: 'POST' });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const body = await res.json();
      setMessage(body.error ?? 'No se pudo eliminar la cuenta');
    }
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="mb-6 font-serif text-3xl text-parchment">Tu perfil</h1>
        {message && (
          <p role="status" className="mb-6 rounded-lg border border-sage/30 bg-sage/10 px-3.5 py-2.5 text-sm text-sage">
            {message}
          </p>
        )}

        <section className="flex flex-col gap-4 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-7">
          <div>
            <label htmlFor="name" className={labelClass}>Nombre</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="values" className={labelClass}>Lo que valoras</label>
            <textarea
              id="values"
              value={values}
              onChange={(e) => setValues(e.target.value)}
              placeholder="Lo que valoras"
              rows={3}
              className={fieldClass}
            />
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
          </div>
          <button
            type="button"
            onClick={saveProfile}
            className="mt-1 self-start rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            Guardar cambios
          </button>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 font-serif text-xl text-parchment">Tus metas</h2>
          <ul className="mb-4 flex flex-col gap-2.5">
            {goalList.map((goal) => (
              <li
                key={goal.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-dusk-2 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[15px] text-parchment">{goal.description}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                      goal.status === 'achieved'
                        ? 'bg-sage/15 text-sage'
                        : 'bg-rule text-mist'
                    }`}
                  >
                    {statusLabel[goal.status]}
                  </span>
                </div>
                {goal.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => setGoalStatus(goal.id, 'achieved')}
                    className="shrink-0 font-mono text-xs text-brass transition-colors hover:text-parchment"
                  >
                    marcar lograda
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-2.5">
            <input
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              placeholder="Nueva meta"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={addGoal}
              className="shrink-0 rounded-lg border border-rule px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
            >
              Agregar
            </button>
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-3 border-t border-rule pt-8">
          <button
            type="button"
            onClick={logout}
            className="self-start font-mono text-xs text-mist transition-colors hover:text-parchment"
          >
            Cerrar sesión
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="self-start font-mono text-xs text-danger/80 transition-colors hover:text-danger"
          >
            Eliminar cuenta
          </button>

          {showDeleteConfirm && (
            <div role="dialog" className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-5 py-5">
              <p className="mb-3 text-sm text-parchment">
                Escribe <strong className="font-semibold">ELIMINAR</strong> para confirmar que quieres
                borrar tu cuenta permanentemente.
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="mb-3 w-full rounded-lg border border-danger/40 bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-danger focus:outline-none focus:ring-1 focus:ring-danger"
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={deleteConfirmText !== 'ELIMINAR'}
                  onClick={deleteAccount}
                  className="rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirmar eliminación
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-rule px-4 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
