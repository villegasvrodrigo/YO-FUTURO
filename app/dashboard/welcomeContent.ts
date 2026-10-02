import { hourLabel } from '@/lib/messages/hourLabel';
import { CATCH_UP_HOURS, hoursPastDelivery } from '@/lib/messages/delivery';

// The welcome shown once on Inicio, the first time after the onboarding (and again from
// Perfil, "Ver la bienvenida otra vez"). Only explains how the app is used: everything it
// mentions was already set up in the onboarding.

// The key in the account's data (Supabase user_metadata) that says the welcome was seen: the
// date it was finished or skipped. No column in the database.
export const WELCOME_SEEN_KEY = 'bienvenida_yo_futuro';

// The address on Perfil's link that shows the welcome again.
export const WELCOME_REPLAY_PARAM = 'bienvenida';

export const WELCOME_DONE_MESSAGE = (name: string) =>
  name ? `Todo listo, ${name}. Tu yo futuro ya está contigo.` : 'Todo listo. Tu yo futuro ya está contigo.';

export interface WelcomeStep {
  // Short name for the step bar.
  label: string;
  title: string;
  paragraphs: string[];
  // A highlighted notice (spam, or the support line).
  notice?: string;
  // A small note under everything.
  note?: string;
}

export interface WelcomeInput {
  name: string;
  futureSelfAge: number | null;
  deliveryHour: number | null;
  timezone: string | null;
  // The sender's address, for the spam notice.
  sender: string;
  // Whether the person already received any daily message (then there is no "first" one).
  hasAnyMessage: boolean;
  chatEnabled: boolean;
  now: Date;
}

/**
 * Whether today's first message is still coming today or only tomorrow, in the words of step
 * 2; null when it can't be said (no hour or time zone) or when they already got messages.
 * "Today" while their hour hasn't passed, or passed by CATCH_UP_HOURS or less (the cron's
 * same-day recovery still sends it).
 */
export function firstMessageLine(input: Pick<WelcomeInput, 'deliveryHour' | 'timezone' | 'hasAnyMessage' | 'now'>): string | null {
  if (input.hasAnyMessage || input.deliveryHour === null || !input.timezone) return null;
  try {
    const late = hoursPastDelivery(input.deliveryHour, input.timezone, input.now);
    if (late === null || late <= CATCH_UP_HOURS) return 'Tu primer mensaje te llega hoy.';
    // "8:00 a. m." already ends in a period: no second one.
    const hour = hourLabel(input.deliveryHour);
    return `Tu primer mensaje te llega mañana a las ${hour}${hour.endsWith('.') ? '' : '.'}`;
  } catch {
    return null;
  }
}

/** The steps, in order, with the person's data filled in. The chat step only when it is on. */
export function buildWelcomeSteps(input: WelcomeInput): WelcomeStep[] {
  const name = input.name.trim();
  const age = input.futureSelfAge ? `de los ${input.futureSelfAge} años` : 'del futuro';
  const hour = input.deliveryHour === null ? null : hourLabel(input.deliveryHour);
  const first = firstMessageLine(input);

  const steps: (WelcomeStep | null)[] = [
    {
      label: 'Qué es',
      title: name ? `${name}, tu yo futuro ya te conoce.` : 'Tu yo futuro ya te conoce.',
      paragraphs: [
        `Con todo lo que compartiste, a partir de ahora te va a escribir la versión de ti ${age}: alguien que ya recorrió el camino que estás empezando. No se trata de días perfectos, sino de dar un paso pequeño cada día y no soltarte de quien quieres ser.`,
      ],
    },
    {
      label: 'Tu correo',
      title: 'Todos los días te llega un correo',
      paragraphs: [
        hour
          ? `Cada día, a las ${hour}, tu yo futuro te escribe un mensaje corto, junto con tus tareas del día.`
          : 'Cada día, a tu hora, tu yo futuro te escribe un mensaje corto, junto con tus tareas del día.',
        ...(first ? [first] : []),
      ],
      notice: `El primer día revisa tu carpeta de Spam o Promociones. Si el correo llega ahí, márcalo como "No es spam" y agrega ${input.sender} a tus contactos para que los siguientes lleguen a tu bandeja.`,
      note: 'Puedes cambiar la hora o pausar los correos cuando quieras desde Perfil.',
    },
    {
      label: 'Tus tareas',
      title: 'Tres tareas pequeñas al día',
      paragraphs: [
        'Con tu mensaje llegan tres tareas que puedes hacer hoy mismo. Márcalas aquí, en Inicio, cuando las termines. Si las tocas en el correo, te traen aquí para marcarlas.',
        'Abajo, en Inicio, verás tu Daily insight: una observación breve sobre lo que estás aprendiendo.',
      ],
    },
    input.chatEnabled
      ? {
          label: 'El chat',
          title: 'Puedes escribirle cuando lo necesites',
          paragraphs: [
            'En Chat puedes conversar con tu yo futuro sobre tus metas, tus tareas o lo que te esté frenando. Tienes 20 mensajes al día, y al día siguiente recuerda lo importante de su última conversación.',
          ],
          notice:
            'El chat no es un servicio de emergencias. Si estás pasando por un momento difícil, llama a la Línea de la Vida al 800 911 2000 o al 911.',
        }
      : null,
    {
      label: 'Tu progreso',
      title: 'Mira cómo vas',
      paragraphs: [
        'En Progreso ves tu racha, tu mejor racha y un calendario con los días que cumpliste. Un día cuenta cuando marcas al menos una tarea, y los días sin tareas no rompen tu racha.',
      ],
    },
  ];
  return steps.filter((step): step is WelcomeStep => step !== null);
}

/** The address part of a sender like "Yo Futuro <hola@yofuturo.app>". */
export function senderAddress(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return (match ? match[1] : from).trim();
}
