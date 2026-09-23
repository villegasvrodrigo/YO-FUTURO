import type { DaySummary, Progress } from '@/lib/tasks/progress';

export const NO_DATA_COPY =
  'Aquí verás tu racha y cómo vas con tus tareas. Aparecerá en cuanto tu yo futuro te mande las primeras y marques alguna.';

// How full each dot of the grid looks. A day without tasks is only an outline, so it
// never gets confused with a day that had tasks and none were checked.
function dotClass(day: DaySummary): string {
  if (day.total === 0) return 'border border-rule';
  if (day.done === 0) return 'border border-brass/30 bg-brass/10';
  if (day.done === 1) return 'bg-brass/40';
  if (day.done === 2) return 'bg-brass/70';
  return 'bg-brass';
}

// "2026-09-22" is a calendar date, not an instant: format it in UTC so the day never shifts.
function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function dayLabel(day: DaySummary): string {
  if (day.total === 0) return `${shortDate(day.date)}: sin tareas`;
  return `${shortDate(day.date)}: ${day.done} de ${day.total} tareas completadas`;
}

const LEGEND: { label: string; sample: DaySummary }[] = [
  { label: 'Sin tareas', sample: { date: '', total: 0, done: 0 } },
  { label: '0', sample: { date: '', total: 3, done: 0 } },
  { label: '1', sample: { date: '', total: 3, done: 1 } },
  { label: '2', sample: { date: '', total: 3, done: 2 } },
  { label: '3', sample: { date: '', total: 3, done: 3 } },
];

/**
 * The Progreso screen: current streak, the last 30 days as a grid of dots and the
 * completion percentage. `progress` null means there is nothing to show yet (no tasks in
 * the last 90 days, no timezone, or a failed read): only the friendly message appears.
 */
export function ProgressView({ progress }: { progress: Progress | null }) {
  return (
    <main className="flex flex-1 justify-center px-6 pb-40 pt-8">
      <div className="w-full max-w-xl">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Tu progreso</h1>

        {progress === null ? (
          <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
            <p className="font-serif text-lg italic leading-relaxed text-mist">{NO_DATA_COPY}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <section className="rounded border-t-2 border-brass-dim bg-dusk-2 px-6 py-6">
                <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-brass">Racha actual</h2>
                <p className="mt-3 font-mono text-4xl font-semibold text-brass">{progress.streak}</p>
                <p className="mt-1 text-sm text-mist">{progress.streak === 1 ? 'día seguido' : 'días seguidos'}</p>
              </section>

              <section className="rounded border-t-2 border-brass-dim bg-dusk-2 px-6 py-6">
                <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-brass">Cumplimiento</h2>
                <p className="mt-3 font-mono text-4xl font-semibold text-brass">
                  {progress.completion === null ? '—' : `${progress.completion}%`}
                </p>
                <p className="mt-1 text-sm text-mist">
                  {progress.completion === null ? 'sin tareas en 30 días' : 'de tus tareas en 30 días'}
                </p>
              </section>
            </div>
            <p className="mt-3 text-xs text-mist">
              Un día cuenta para tu racha cuando marcas al menos una tarea. Los días sin tareas no la rompen.
            </p>

            <section className="mt-10">
              <h2 className="font-serif text-2xl text-parchment">Últimos 30 días</h2>
              <div className="mt-3 rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                <ol className="grid grid-cols-10 gap-2.5" aria-label="Tareas completadas en los últimos 30 días">
                  {progress.grid.map((day, i) => {
                    const isToday = i === progress.grid.length - 1;
                    return (
                      <li key={day.date} className="flex justify-center">
                        <span
                          role="img"
                          aria-label={isToday ? `Hoy, ${dayLabel(day)}` : dayLabel(day)}
                          title={dayLabel(day)}
                          className={`block h-4 w-4 rounded-full ${dotClass(day)} ${
                            isToday ? 'ring-2 ring-parchment/60 ring-offset-2 ring-offset-dusk-2' : ''
                          }`}
                        />
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-mist">
                  {LEGEND.map(({ label, sample }) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className={`block h-3 w-3 rounded-full ${dotClass(sample)}`} />
                      {label}
                    </span>
                  ))}
                  <span>· tareas marcadas</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
