import { BottomNav } from '@/app/_components/BottomNav';

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-dusk-2 ${className}`} />;
}

// Shown at once while a day of the history loads (on each arrow or date change too): the
// title, soft blocks where the day will be, and the bottom bar already in place.
export default function HistorialLoading() {
  return (
    <>
      <main className="flex flex-1 justify-center px-6 pb-56 pt-8">
        <div className="w-full max-w-xl">
          <p role="status" className="sr-only">
            Cargando…
          </p>
          <h1 className="mb-6 font-serif text-3xl text-parchment">Historial</h1>
          <Block className="h-11 w-full" />
          <Block className="mx-auto mt-4 h-11 w-56" />
          <Block className="mt-8 h-40 w-full" />
          <Block className="mt-8 h-32 w-full" />
        </div>
      </main>
      <BottomNav chatEnabled="last-known" />
    </>
  );
}
