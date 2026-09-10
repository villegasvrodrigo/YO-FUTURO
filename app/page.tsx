import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-7 py-20">
      <div className="max-w-md">
        <p className="mb-6 font-mono text-xs tracking-[0.16em] text-brass">
          YO FUTURO
        </p>
        <h1 className="mb-5 text-balance font-serif text-4xl leading-tight text-parchment sm:text-5xl">
          Cada día, tu yo futuro te escribe.
        </h1>
        <p className="mb-8 max-w-[40ch] text-[15px] leading-relaxed text-mist">
          Un mensaje generado con IA a partir de tus metas, tus valores y quién
          quieres llegar a ser — a la hora que tú elijas.
        </p>
        <nav className="flex gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
          >
            Crear cuenta
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
          >
            Entrar
          </Link>
        </nav>
      </div>
    </main>
  );
}
