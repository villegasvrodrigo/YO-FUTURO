import { shiftDate } from '@/lib/tasks/dates';

// The pieces of the chat screen that only show things (no state), kept apart so they can be
// tested on their own.

export interface ChatBubble {
  role: 'user' | 'assistant';
  content: string;
}

// From this many messages left (and fewer), a discreet notice says how many remain.
export const REMAINING_NOTICE_FROM = 5;

export const LIMIT_GOODBYE = 'Por hoy ya conversamos lo suficiente. Gracias por darte este tiempo. Seguimos mañana.';

/** "Te quedan 3 mensajes hoy", only when 5 or fewer are left (and at least one). */
export function remainingNotice(messagesLeft: number): string | null {
  if (messagesLeft <= 0 || messagesLeft > REMAINING_NOTICE_FROM) return null;
  return messagesLeft === 1 ? 'Te queda 1 mensaje hoy' : `Te quedan ${messagesLeft} mensajes hoy`;
}

/**
 * Today's conversation: the yo futuro's messages on the left in the card color, the
 * person's on the right in brass, like the onboarding conversation. While a reply is on its
 * way, a "writing" line closes the list.
 */
export function ChatMessages({ messages, sending }: { messages: ChatBubble[]; sending: boolean }) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      {messages.map((m, i) =>
        m.role === 'assistant' ? (
          <div key={i} className="mr-8">
            {/* Same look as the "TU YO FUTURO" title at the top of the screen, smaller. */}
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brass">Tu yo futuro</p>
            <div className="whitespace-pre-line rounded-lg bg-dusk-2 px-4 py-3 text-[15px] leading-relaxed text-parchment">
              {m.content}
            </div>
          </div>
        ) : (
          <div
            key={i}
            className="ml-8 whitespace-pre-line rounded-lg bg-brass/10 px-4 py-3 text-[15px] leading-relaxed text-parchment"
          >
            <span className="sr-only">Tú: </span>
            {m.content}
          </div>
        )
      )}
      {sending && (
        <div className="mr-8 rounded-lg bg-dusk-2 px-4 py-3 text-[15px] italic text-mist" role="status">
          Tu yo futuro está escribiendo…
        </div>
      )}
    </div>
  );
}

/** The discreet "messages left" line, or nothing while there are plenty. */
export function RemainingNotice({ messagesLeft }: { messagesLeft: number }) {
  const text = remainingNotice(messagesLeft);
  if (!text) return null;
  return <p className="mb-2 font-mono text-[11px] text-mist">{text}</p>;
}

/** The support line, always visible (small) once the box is locked for the day. */
export function CrisisLine() {
  return (
    <p className="mt-3 text-xs leading-relaxed text-mist">
      Si estás pasando por un momento difícil: Línea de la Vida{' '}
      <a href="tel:8009112000" className="text-parchment underline underline-offset-2">
        800 911 2000
      </a>{' '}
      o{' '}
      <a href="tel:911" className="text-parchment underline underline-offset-2">
        911
      </a>
    </p>
  );
}

/** The warm goodbye shown once today's messages are used up. */
export function LimitGoodbye() {
  return (
    <div className="mb-4 rounded-lg border border-brass/30 bg-brass/10 px-4 py-3 text-[15px] leading-relaxed text-parchment">
      {LIMIT_GOODBYE}
    </div>
  );
}

/** What an account that can't use the chat yet sees if it opens /chat directly. */
export function ChatNotAvailable() {
  return (
    <div className="rounded-lg bg-dusk-2 px-5 py-6 text-center">
      <p className="font-serif text-2xl text-parchment">Muy pronto</p>
      <p className="mt-2 text-[15px] leading-relaxed text-mist">
        El chat con tu yo futuro todavía no está disponible. Mientras tanto, tu mensaje y tus tareas de cada día te
        esperan en el inicio.
      </p>
      <a
        href="/dashboard"
        className="mt-5 inline-block rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90"
      >
        Ir al inicio
      </a>
    </div>
  );
}

/**
 * The name of a conversation day, as its separator shows it: "Hoy", "Ayer", or the weekday and
 * date ("miércoles 23 de septiembre", with the year when it isn't this year's). `date` and
 * `today` are "YYYY-MM-DD" in the person's time zone.
 */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  try {
    if (date === shiftDate(today, -1)) return 'Ayer';
  } catch {
    // No valid "today": just the date below.
  }
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(today.startsWith(`${year}-`) ? {} : { year: 'numeric' }),
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    // "miércoles, 23 de septiembre" → "miércoles 23 de septiembre".
    .replace(',', '');
}

/** The line with a day's name between conversation days. */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-rule" />
      <span className="font-mono text-[11px] tracking-[0.05em] text-mist">{label}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
