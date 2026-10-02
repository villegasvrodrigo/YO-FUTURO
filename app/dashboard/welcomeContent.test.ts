import { describe, it, expect } from 'vitest';
import { buildWelcomeSteps, firstMessageLine, senderAddress, WELCOME_DONE_MESSAGE, type WelcomeInput } from './welcomeContent';

// 2026-10-02 15:00 UTC is 09:00 in Mexico City.
const input: WelcomeInput = {
  name: 'Rodrigo',
  futureSelfAge: 50,
  deliveryHour: 8,
  timezone: 'America/Mexico_City',
  sender: 'hola@yofuturo.app',
  hasAnyMessage: false,
  chatEnabled: true,
  now: new Date('2026-10-02T15:00:00Z'),
};

describe('buildWelcomeSteps', () => {
  it('has the 5 agreed steps, with the person\'s data and the 3 adjustments', () => {
    expect(buildWelcomeSteps(input)).toEqual([
      {
        label: 'Qué es',
        title: 'Rodrigo, tu yo futuro ya te conoce.',
        paragraphs: [
          'Con todo lo que compartiste, a partir de ahora te va a escribir la versión de ti de los 50 años: alguien que ya recorrió el camino que estás empezando. No se trata de días perfectos, sino de dar un paso pequeño cada día y no soltarte de quien quieres ser.',
        ],
      },
      {
        label: 'Tu correo',
        title: 'Todos los días te llega un correo',
        paragraphs: [
          'Cada día, a las 8:00 a. m., tu yo futuro te escribe un mensaje corto, junto con tus tareas del día.',
          'Tu primer mensaje te llega hoy.',
        ],
        notice:
          'El primer día revisa tu carpeta de Spam o Promociones. Si el correo llega ahí, márcalo como "No es spam" y agrega hola@yofuturo.app a tus contactos para que los siguientes lleguen a tu bandeja.',
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
      {
        label: 'El chat',
        title: 'Puedes escribirle cuando lo necesites',
        paragraphs: [
          'En Chat puedes conversar con tu yo futuro sobre tus metas, tus tareas o lo que te esté frenando. Tienes 20 mensajes al día, y al día siguiente recuerda lo importante de su última conversación.',
        ],
        notice:
          'El chat no es un servicio de emergencias. Si estás pasando por un momento difícil, llama a la Línea de la Vida al 800 911 2000 o al 911.',
      },
      {
        label: 'Tu progreso',
        title: 'Mira cómo vas',
        paragraphs: [
          'En Progreso ves tu racha, tu mejor racha y un calendario con los días que cumpliste. Un día cuenta cuando marcas al menos una tarea, y los días sin tareas no rompen tu racha.',
        ],
      },
    ]);
  });

  it('calls the insight section by the name the dashboard shows ("Daily insight")', () => {
    const text = JSON.stringify(buildWelcomeSteps(input));
    expect(text).toContain('Daily insight');
    expect(text).not.toMatch(/tu insight/);
  });

  it('skips the chat step when the chat is switched off (4 steps)', () => {
    const steps = buildWelcomeSteps({ ...input, chatEnabled: false });

    expect(steps.map((s) => s.label)).toEqual(['Qué es', 'Tu correo', 'Tus tareas', 'Tu progreso']);
  });

  it('works without a name, age or hour', () => {
    const steps = buildWelcomeSteps({ ...input, name: '  ', futureSelfAge: null, deliveryHour: null });

    expect(steps[0].title).toBe('Tu yo futuro ya te conoce.');
    expect(steps[0].paragraphs[0]).toContain('la versión de ti del futuro:');
    expect(steps[1].paragraphs).toEqual(['Cada día, a tu hora, tu yo futuro te escribe un mensaje corto, junto con tus tareas del día.']);
  });
});

describe('firstMessageLine', () => {
  const at = (iso: string) => ({ ...input, now: new Date(iso) });

  it('"today" before the hour, or up to 4 hours after it (the cron still sends it)', () => {
    expect(firstMessageLine(at('2026-10-02T12:00:00Z'))).toBe('Tu primer mensaje te llega hoy.'); // 06:00
    expect(firstMessageLine(at('2026-10-02T18:30:00Z'))).toBe('Tu primer mensaje te llega hoy.'); // 12:30
  });

  it('"tomorrow at <hour>" more than 4 hours after it', () => {
    expect(firstMessageLine(at('2026-10-02T19:00:00Z'))).toBe('Tu primer mensaje te llega mañana a las 8:00 a. m.'); // 13:00
    // An evening hour, and midnight (whose label doesn't end in a period).
    expect(firstMessageLine({ ...input, deliveryHour: 2, now: new Date('2026-10-02T15:00:00Z') })).toBe(
      'Tu primer mensaje te llega mañana a las 2:00 a. m.'
    );
    expect(firstMessageLine({ ...input, deliveryHour: 0, now: new Date('2026-10-02T15:00:00Z') })).toBe(
      'Tu primer mensaje te llega mañana a las 12:00 a. m. (medianoche).'
    );
  });

  it('no line for someone who already got messages, or without hour or time zone', () => {
    expect(firstMessageLine({ ...input, hasAnyMessage: true })).toBeNull();
    expect(firstMessageLine({ ...input, deliveryHour: null })).toBeNull();
    expect(firstMessageLine({ ...input, timezone: 'Not/AZone' })).toBeNull();
  });
});

describe('helpers', () => {
  it('senderAddress takes the address out of "Name <address>"', () => {
    expect(senderAddress('Yo Futuro <hola@yofuturo.app>')).toBe('hola@yofuturo.app');
    expect(senderAddress('hola@yofuturo.app')).toBe('hola@yofuturo.app');
  });

  it('the closing line', () => {
    expect(WELCOME_DONE_MESSAGE('Rodrigo')).toBe('Todo listo, Rodrigo. Tu yo futuro ya está contigo.');
  });
});
