import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Cuenta eliminada · YO FUTURO',
};

/**
 * Where "Eliminar cuenta" lands once the account is gone: confirms it, in the same voice as
 * the privacy notice. Public, since by then there is no account and no session.
 */
export default function CuentaEliminadaPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="mb-4 font-mono text-xs tracking-[0.16em] text-brass">YO FUTURO</p>
        <h1 className="mb-5 text-balance font-serif text-3xl leading-tight text-parchment sm:text-4xl">
          Tu cuenta fue eliminada.
        </h1>
        <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-parchment/85">
          <p>
            Borré tu perfil, tus metas, tus mensajes, tus tareas y tus insights. Ya no recibirás
            correos.
          </p>
          <p className="text-mist">Si algún día quieres volver, puedes crear una cuenta nueva.</p>
        </div>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg border border-rule px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:border-brass/60"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
