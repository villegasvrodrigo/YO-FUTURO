import Link from 'next/link';
import Form from 'next/form';
import { DailyInsight } from '@/app/dashboard/DailyInsight';
import type { HistoryDayContent, HistoryTask } from '@/lib/historial/day';
import { completedSummary, historyHref, longDayTitle } from '@/lib/historial/format';

export const NO_MESSAGE_COPY = 'Ese día no hubo mensaje.';
export const NO_TASKS_COPY = 'Ese día no hubo tareas.';
export const NO_INSIGHT_COPY = 'Ese día no hubo insight.';
export const LOAD_FAILED_COPY = 'No se pudo cargar este día. Inténtalo de nuevo en un momento.';

function DayArrow({ date, direction }: { date: string | null; direction: 'prev' | 'next' }) {
  const label = direction === 'prev' ? 'Día anterior' : 'Día siguiente';
  // 44 px: a comfortable target for a thumb.
  const className = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full';
  // At the ends the arrow keeps its place (so the title stays centered) but is not shown.
  if (!date) return <span aria-hidden="true" className={className} />;
  return (
    <Link
      href={historyHref(date)}
      aria-label={`${label}: ${longDayTitle(date)}`}
      className={`${className} text-brass transition-colors hover:bg-rule/60 active:bg-rule/80`}
    >
      <svg
        width="22"
        height="22"
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

/** Jump to any date: the phone's own date picker, up to today. Works without JavaScript too. */
function DatePicker({ date, today }: { date: string; today: string }) {
  return (
    <Form action="/historial" className="mt-4 flex items-center justify-center gap-2">
      <label htmlFor="historial-dia" className="sr-only">
        Elegir fecha
      </label>
      {/* Keyed by the day, so it shows the new day after each navigation. 16 px text: smaller
          makes the iPhone zoom in when it is tapped. Dark color scheme for the picker. */}
      <input
        key={date}
        id="historial-dia"
        type="date"
        name="dia"
        defaultValue={date}
        max={today}
        required
        className="h-11 min-w-0 rounded-lg border border-rule bg-dusk-2 px-3 font-mono text-base text-parchment [color-scheme:dark] focus:border-brass focus:outline-none"
      />
      <button
        type="submit"
        className="h-11 shrink-0 rounded-lg border border-brass/40 px-4 font-mono text-xs uppercase tracking-[0.1em] text-brass transition-colors hover:bg-brass/10 active:bg-brass/20"
      >
        Ver
      </button>
    </Form>
  );
}

function Card({ muted, children }: { muted: boolean; children: React.ReactNode }) {
  return (
    <div className={`mt-3 rounded border-t-2 bg-dusk-2 px-7 py-6 ${muted ? 'border-rule' : 'border-brass-dim'}`}>
      {children}
    </div>
  );
}

/** The day's tasks as they were left: read only, nothing here can be checked or unchecked. */
function PastTasks({ tasks }: { tasks: HistoryTask[] }) {
  return (
    <ul className="-my-1 flex flex-col gap-1">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start gap-3.5 py-2">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
              task.completed ? 'border-brass bg-brass' : 'border-brass/40 bg-transparent'
            }`}
          >
            {task.completed && (
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className={`text-[15px] leading-relaxed ${task.completed ? 'text-mist line-through' : 'text-parchment'}`}>
            <span className="sr-only">{task.completed ? 'Completada: ' : 'Sin completar: '}</span>
            {task.description}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One day of the history: its date between arrows to the previous and next days that have
 * something, a date picker, and the day's message, tasks (read only) and insight. With
 * `content` null the day couldn't be read: only a short notice under the same header.
 */
export function DayView({
  date,
  today,
  content,
  prev,
  next,
}: {
  date: string;
  today: string;
  content: HistoryDayContent | null;
  prev: string | null;
  next: string | null;
}) {
  const isToday = date === today;
  const done = content?.tasks.filter((task) => task.completed).length ?? 0;

  return (
    <>
      <h1 className="mb-6 font-serif text-3xl text-parchment">Historial</h1>

      <div className="flex items-center justify-between gap-2">
        <DayArrow date={prev} direction="prev" />
        <h2 className="min-w-0 truncate text-center font-mono text-sm uppercase tracking-[0.08em] text-brass">
          <time dateTime={date}>{isToday ? `Hoy · ${longDayTitle(date)}` : longDayTitle(date)}</time>
        </h2>
        <DayArrow date={next} direction="next" />
      </div>
      <DatePicker date={date} today={today} />

      {isToday && (
        <p className="mt-6 text-center text-sm text-mist">
          Las tareas de hoy se marcan en{' '}
          <Link href="/dashboard" className="text-brass underline underline-offset-4">
            Inicio
          </Link>
          .
        </p>
      )}

      {content === null ? (
        <div role="alert" className="mt-8 rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
          <p className="text-sm text-mist">{LOAD_FAILED_COPY}</p>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h3 className="font-serif text-2xl text-parchment">Mensaje</h3>
            {content.message ? (
              <Card muted={false}>
                <p className="whitespace-pre-line py-2 font-serif text-lg italic leading-relaxed text-parchment">
                  {content.message}
                </p>
              </Card>
            ) : (
              <Card muted>
                <p className="text-sm text-mist">{NO_MESSAGE_COPY}</p>
              </Card>
            )}
          </section>

          <section className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-2xl text-parchment">Tareas</h3>
              {content.tasks.length > 0 && (
                <p className="shrink-0 font-mono text-xs text-mist">{completedSummary(done, content.tasks.length)}</p>
              )}
            </div>
            <Card muted={content.tasks.length === 0}>
              {content.tasks.length > 0 ? (
                <PastTasks tasks={content.tasks} />
              ) : (
                <p className="text-sm text-mist">{NO_TASKS_COPY}</p>
              )}
            </Card>
          </section>

          <section className="mt-8">
            <h3 className="font-serif text-2xl text-parchment">Daily insight</h3>
            <div className="mt-3">
              {content.insight ? (
                <DailyInsight insight={{ insightDate: date, content: content.insight }} showDate={false} />
              ) : (
                <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
                  <p className="text-sm text-mist">{NO_INSIGHT_COPY}</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
