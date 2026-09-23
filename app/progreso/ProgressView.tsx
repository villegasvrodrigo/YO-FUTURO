import Link from 'next/link';
import type { CalendarDay, ProgressData } from '@/lib/tasks/progress';

export const NO_DATA_COPY =
  'Aquí verás tu racha y cómo vas con tus tareas. Aparecerá en cuanto tu yo futuro te mande las primeras y marques alguna.';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = [
  { short: 'L', long: 'lunes' },
  { short: 'M', long: 'martes' },
  { short: 'M', long: 'miércoles' },
  { short: 'J', long: 'jueves' },
  { short: 'V', long: 'viernes' },
  { short: 'S', long: 'sábado' },
  { short: 'D', long: 'domingo' },
];

/** "2026-09" → "Septiembre 2026". */
export function monthTitle(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

// How a day of the month looks: more gold the more tasks were checked. A day without tasks
// is only an outline, so it never gets confused with a day that had tasks and none checked.
function dayClass(day: CalendarDay): string {
  if (day.isFuture) return 'text-mist/40';
  if (day.total === 0) return 'border border-rule text-mist';
  if (day.done === 0) return 'border border-brass/30 bg-brass/10 text-parchment/80';
  if (day.done === 1) return 'bg-brass/35 text-parchment';
  if (day.done === 2) return 'bg-brass/65 text-ink';
  return 'bg-brass text-ink';
}

function dayLabel(day: CalendarDay): string {
  const date = `${day.day} ${MONTH_SHORT[Number(day.date.slice(5, 7)) - 1]}`;
  const prefix = day.isToday ? `Hoy, ${date}` : date;
  if (day.isFuture) return prefix;
  if (day.total === 0) return `${prefix}: sin tareas`;
  return `${prefix}: ${day.done} de ${day.total} tareas completadas`;
}

const LEGEND: { label: string; sample: CalendarDay }[] = [
  { label: 'Sin tareas', sample: { total: 0, done: 0 } },
  { label: '0', sample: { total: 3, done: 0 } },
  { label: '1', sample: { total: 3, done: 1 } },
  { label: '2', sample: { total: 3, done: 2 } },
  { label: '3', sample: { total: 3, done: 3 } },
].map(({ label, sample }) => ({
  label,
  sample: { date: '', day: 0, inMonth: true, isToday: false, isFuture: false, ...sample },
}));

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded border-t-2 border-brass-dim bg-dusk-2 px-3 py-5 text-center sm:px-5">
      {/* Room for two lines, so a label that wraps on a phone ("Días cumplidos") doesn't
          push its number below the others. */}
      <h2 className="flex min-h-[2.5em] items-center justify-center font-mono text-[10px] uppercase leading-tight tracking-[0.1em] text-brass sm:text-xs">
        {label}
      </h2>
      <p className="mt-2 font-mono text-3xl font-semibold text-brass sm:text-4xl">{value}</p>
      <p className="mt-0.5 text-xs text-mist">{value === 1 ? 'día' : 'días'}</p>
    </section>
  );
}

function MonthArrow({ month, direction }: { month: string | null; direction: 'prev' | 'next' }) {
  const label = direction === 'prev' ? 'Mes anterior' : 'Mes siguiente';
  const className = 'flex h-10 w-10 items-center justify-center rounded-full';
  // At the ends the arrow keeps its place (so the title stays centered) but is not shown.
  if (!month) return <span aria-hidden="true" className={className} />;
  return (
    <Link
      href={`/progreso?mes=${month}`}
      aria-label={`${label}: ${monthTitle(month)}`}
      className={`${className} text-brass transition-colors hover:bg-rule/60`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </Link>
  );
}

/**
 * The Progreso screen: three numbers (current streak, best streak, fulfilled days) and the
 * calendar of one month, weeks starting on Monday, each day colored by how many tasks were
 * checked, today framed, with arrows to the months before. `progress` null means there is
 * nothing to show yet (no tasks, no timezone, or a failed read): only the friendly message.
 */
export function ProgressView({ progress }: { progress: ProgressData | null }) {
  return (
    // Extra room at the bottom (more than the dashboard's pb-40) so the floating bottom bar
    // never covers the calendar legend, the last thing on the page.
    <main className="flex flex-1 justify-center px-6 pb-56 pt-8">
      <div className="w-full max-w-xl">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Tu progreso</h1>

        {progress === null ? (
          <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
            <p className="font-serif text-lg italic leading-relaxed text-mist">{NO_DATA_COPY}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Racha actual" value={progress.stats.current} />
              <StatCard label="Mejor racha" value={progress.stats.best} />
              <StatCard label="Días cumplidos" value={progress.stats.fulfilledDays} />
            </div>
            <p className="mt-3 text-xs text-mist">
              Un día cuenta cuando marcas al menos una tarea. Los días sin tareas no rompen la racha.
            </p>

            <section className="mt-10 rounded border-t-2 border-rule bg-dusk-2 px-4 py-6 sm:px-7">
              <div className="mb-5 flex items-center justify-between">
                <MonthArrow month={progress.prevMonth} direction="prev" />
                <h2 className="font-serif text-2xl text-parchment">{monthTitle(progress.calendar.month)}</h2>
                <MonthArrow month={progress.nextMonth} direction="next" />
              </div>

              <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={monthTitle(progress.calendar.month)}>
                <div role="row" className="contents">
                  {WEEKDAYS.map((weekday, i) => (
                    <abbr
                      key={i}
                      role="columnheader"
                      title={weekday.long}
                      className="pb-1 text-center font-mono text-[11px] uppercase text-mist no-underline"
                    >
                      {weekday.short}
                    </abbr>
                  ))}
                </div>
                {progress.calendar.weeks.map((week, w) => (
                  <div role="row" key={w} className="contents">
                    {week.map((day) =>
                      day.inMonth ? (
                        <span
                          key={day.date}
                          role="gridcell"
                          aria-label={dayLabel(day)}
                          title={dayLabel(day)}
                          className={`flex aspect-square items-center justify-center rounded-md font-mono text-sm ${dayClass(day)} ${
                            day.isToday ? 'ring-2 ring-parchment/70 ring-offset-2 ring-offset-dusk-2' : ''
                          }`}
                        >
                          {day.day}
                        </span>
                      ) : (
                        // Days of the neighbouring months only fill the grid.
                        <span key={day.date} role="gridcell" aria-hidden="true" />
                      )
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-wide text-mist">
                {LEGEND.map(({ label, sample }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className={`block h-3.5 w-3.5 rounded-sm ${dayClass(sample)}`} />
                    {label}
                  </span>
                ))}
                <span>· tareas marcadas</span>
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="block h-3.5 w-3.5 rounded-sm ring-2 ring-parchment/70 ring-offset-1 ring-offset-dusk-2"
                  />
                  Hoy
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
