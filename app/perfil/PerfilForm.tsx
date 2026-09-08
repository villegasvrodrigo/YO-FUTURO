'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import type { Profile, Goal, GoalStatus } from '@/lib/types';

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
    <main>
      <h1>Tu perfil</h1>
      {message && <p role="status">{message}</p>}

      <section>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
        <textarea value={values} onChange={(e) => setValues(e.target.value)} placeholder="Lo que valoras" />
        <input
          type="number"
          min={0}
          max={23}
          value={deliveryHour}
          onChange={(e) => setDeliveryHour(Number(e.target.value))}
        />
        <button type="button" onClick={saveProfile}>Guardar cambios</button>
      </section>

      <section>
        <h2>Tus metas</h2>
        <ul>
          {goalList.map((goal) => (
            <li key={goal.id}>
              {goal.description} — {goal.status}
              {goal.status === 'active' && (
                <button type="button" onClick={() => setGoalStatus(goal.id, 'achieved')}>
                  Marcar como lograda
                </button>
              )}
            </li>
          ))}
        </ul>
        <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="Nueva meta" />
        <button type="button" onClick={addGoal}>Agregar meta</button>
      </section>

      <button type="button" onClick={logout}>Cerrar sesión</button>

      <button type="button" onClick={() => setShowDeleteConfirm(true)}>Eliminar cuenta</button>
      {showDeleteConfirm && (
        <div role="dialog">
          <p>Escribe ELIMINAR para confirmar que quieres borrar tu cuenta permanentemente.</p>
          <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
          <button
            type="button"
            disabled={deleteConfirmText !== 'ELIMINAR'}
            onClick={deleteAccount}
          >
            Confirmar eliminación
          </button>
          <button type="button" onClick={() => setShowDeleteConfirm(false)}>Cancelar</button>
        </div>
      )}
    </main>
  );
}
