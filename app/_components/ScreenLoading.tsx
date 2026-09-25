import { BottomNav } from './BottomNav';

// What a screen with the bottom bar shows while it loads (each screen's loading.tsx): the
// screen's title and soft blocks where its content will be, with the bar already in place.
// It appears as soon as the bar is tapped, so the tap is never mistaken for a missed one.

export type LoadingScreenKind = 'inicio' | 'chat' | 'progreso' | 'perfil';

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-dusk-2 ${className}`} />;
}

function Content({ kind }: { kind: LoadingScreenKind }) {
  switch (kind) {
    case 'inicio':
      return (
        <>
          <p className="mb-0.5 font-mono text-[17px] uppercase tracking-[0.1em] text-mist sm:text-[21px]">Hola,</p>
          <Block className="mb-10 h-8 w-40" />
          <Block className="h-40 w-full" />
          <h2 className="mt-10 font-serif text-2xl text-parchment">Tus tareas de hoy</h2>
          <Block className="mt-3 h-36 w-full" />
        </>
      );
    case 'chat':
      return (
        <>
          <p className="mb-4 font-mono text-xs tracking-[0.14em] text-brass">TU YO FUTURO</p>
          <Block className="mb-3 mr-8 h-16" />
          <Block className="mb-3 ml-8 h-10" />
          <Block className="mr-8 h-20" />
        </>
      );
    case 'progreso':
      return (
        <>
          <h1 className="mb-8 font-serif text-3xl text-parchment">Tu progreso</h1>
          <div className="grid grid-cols-3 gap-3">
            <Block className="h-20" />
            <Block className="h-20" />
            <Block className="h-20" />
          </div>
          <Block className="mt-8 h-72 w-full" />
        </>
      );
    case 'perfil':
      return (
        <>
          <Block className="mb-8 h-9 w-32" />
          <Block className="mb-4 h-12 w-full" />
          <Block className="mb-4 h-12 w-full" />
          <Block className="h-32 w-full" />
        </>
      );
  }
}

export function ScreenLoading({ kind }: { kind: LoadingScreenKind }) {
  return (
    <>
      <main className={`flex flex-1 justify-center px-6 pb-40 ${kind === 'perfil' ? 'pt-16' : 'pt-8'}`}>
        <div className="w-full max-w-xl">
          <p role="status" className="sr-only">
            Cargando…
          </p>
          <Content kind={kind} />
        </div>
      </main>
      <BottomNav chatEnabled="last-known" />
    </>
  );
}
