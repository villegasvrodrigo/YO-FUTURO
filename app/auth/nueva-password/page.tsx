'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function NuevaPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Elige tu nueva contraseña</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-parchment">
              Contraseña nueva
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              className="w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1.5 block text-sm font-medium text-parchment"
            >
              Confirma la contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              required
              minLength={6}
              className="w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </main>
  );
}
