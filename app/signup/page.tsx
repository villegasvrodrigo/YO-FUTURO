'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { PrivacyLink } from '@/app/_components/PrivacyLink';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setNotice(null);
    setSending(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      if (!data.session) {
        // Con "Confirm email" activado en Supabase, el registro no devuelve
        // sesión: redirigir aquí haría que el middleware devolviera al login
        // sin explicación.
        setNotice(
          "Te enviamos un correo para confirmar tu cuenta. Si no lo ves en unos minutos, revisa tu carpeta de Spam o Promociones y márcalo como 'No es spam'. El remitente es no-reply@frequency.rodrigovillegasvilla.com."
        );
        return;
      }
      router.push('/onboarding');
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Crear cuenta</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-parchment">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tú@ejemplo.com"
              required
              disabled={sending}
              className="w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-parchment">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
              disabled={sending}
              className="w-full rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-[15px] text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg border border-sage/30 bg-sage/10 px-3.5 py-2.5 text-sm text-sage">
              {notice}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
          >
            {sending ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>
        <footer className="mt-10 text-center">
          <PrivacyLink />
        </footer>
      </div>
    </main>
  );
}
