'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const COMING_SOON_LABEL: Record<'chat' | 'progreso', string> = {
  chat: 'Chat',
  progreso: 'Progreso',
};

const tabClass =
  'flex flex-1 flex-col items-center gap-1 py-2.5 font-mono text-[10px] uppercase tracking-wide transition-colors';

/**
 * Barra de navegación inferior fija del dashboard. Chat y Progreso son
 * pestañas atenuadas sin funcionalidad todavía — solo muestran un aviso de
 * "Próximamente" al tocarlas.
 */
export function BottomNav() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  function showComingSoon(key: keyof typeof COMING_SOON_LABEL) {
    setNotice(`${COMING_SOON_LABEL[key]} — Próximamente`);
  }

  return (
    <>
      {notice && (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-40 flex justify-center px-4">
          <p
            role="status"
            className="rounded-lg border border-brass/30 bg-dusk-2 px-3.5 py-2 text-xs text-brass shadow-lg"
          >
            {notice}
          </p>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-stretch justify-around">
          <Link href="/dashboard" className={`${tabClass} text-parchment hover:text-brass`}>
            Inicio
          </Link>
          <button
            type="button"
            onClick={() => showComingSoon('chat')}
            className={`${tabClass} cursor-not-allowed text-mist/40`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => showComingSoon('progreso')}
            className={`${tabClass} cursor-not-allowed text-mist/40`}
          >
            Progreso
          </button>
          <Link href="/perfil" className={`${tabClass} text-parchment hover:text-brass`}>
            Perfil
          </Link>
        </div>
      </nav>
    </>
  );
}
