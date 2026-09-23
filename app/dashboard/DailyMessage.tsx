import type { MessageDay } from '@/lib/messages/messageDay';
import { shortInsightDate } from './DailyInsight';

/**
 * The dashboard's message block: a title and date that tell the truth about which day the
 * message is from (in the user's time zone), and the message card. With no known day (no
 * valid time zone), it shows the message without claiming a date.
 */
export function DailyMessage({
  message,
  day,
}: {
  message: { content: string } | null;
  day: MessageDay | null;
}) {
  const date = day ? shortInsightDate(day.date) : '';
  const title = !message || day?.isToday ? 'Tu mensaje de hoy' : 'Tu último mensaje';

  return (
    <>
      <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-brass">{title}</p>
      {message && date && (
        <p className="mb-6 font-mono text-xs text-mist">
          <time dateTime={day?.date}>{date}</time>
        </p>
      )}

      {message ? (
        <div className="mt-6 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
          <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">
            {message.content}
          </p>
          {day && (
            <span className="mt-5 block font-mono text-xs text-mist">
              {day.isToday ? 'Generado hoy' : `Generado el ${date}`}
            </span>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
          <p className="font-serif text-lg italic leading-relaxed text-mist">
            Tu yo futuro todavía no te ha escrito.
          </p>
        </div>
      )}
    </>
  );
}

/** A short, discreet notice that the daily emails are paused, with a link to resume them. */
export function PausedNotice() {
  return (
    <p role="status" className="mb-8 rounded-lg border border-rule bg-dusk-2 px-4 py-3 text-sm text-mist">
      Tus correos diarios están en pausa.{' '}
      <a href="/perfil" className="text-brass underline underline-offset-4 transition-colors hover:text-brass/80">
        Reanúdalos en Perfil
      </a>
    </p>
  );
}
