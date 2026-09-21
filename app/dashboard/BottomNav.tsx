'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const COMING_SOON_LABEL: Record<'chat' | 'progreso', string> = {
  chat: 'Chat',
  progreso: 'Progreso',
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" />
    </svg>
  );
}

const itemClass =
  'flex flex-col items-center gap-1 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors';

function NavLink({ href, label, active, children }: { href: string; label: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${itemClass} ${active ? 'text-brass' : 'text-mist hover:text-parchment'}`}>
      {children}
      {label}
    </Link>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${itemClass} cursor-not-allowed text-mist/40`}>
      {children}
      {label}
    </button>
  );
}

/**
 * Barra de navegación inferior flotante del dashboard. Chat y Progreso son
 * pestañas atenuadas sin funcionalidad todavía — solo muestran un aviso de
 * "Próximamente" al tocarlas.
 */
export function BottomNav() {
  const pathname = usePathname();
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
        <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <p
            role="status"
            className="rounded-lg border border-brass/30 bg-dusk-2 px-3.5 py-2 text-xs text-brass shadow-lg"
          >
            {notice}
          </p>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
        <div className="flex items-center gap-1 rounded-full border border-[#454b5f] bg-[#303545] px-1.5 py-1.5 shadow-xl">
          <NavLink href="/dashboard" label="Inicio" active={pathname === '/dashboard'}>
            <HomeIcon />
          </NavLink>
          <NavButton label="Chat" onClick={() => showComingSoon('chat')}>
            <ChatIcon />
          </NavButton>
          <NavButton label="Progreso" onClick={() => showComingSoon('progreso')}>
            <ChartIcon />
          </NavButton>
          <NavLink href="/perfil" label="Perfil" active={pathname === '/perfil'}>
            <UserIcon />
          </NavLink>
        </div>
      </nav>
    </>
  );
}
