'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Prellenado con el error que trae el redirect de /auth/confirm cuando un
  // enlace de confirmación es inválido o ya expiró.
  const [error, setError] = useState<string | null>(searchParams.get('error'));
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Entrar</h1>
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
              placeholder="••••••••"
              required
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
            className="mt-2 w-full rounded-lg bg-brass px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            Entrar
          </button>
        </form>
        <Link
          href="/login/recuperar"
          className="mt-3 block text-center text-sm text-mist underline underline-offset-4 transition-colors hover:text-brass"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </main>
  );
}
