import { describe, it, expect } from 'vitest';
import {
  applyCrisisProtocol,
  hasCrisisPhrase,
  hasCrisisResources,
  withCrisisResources,
  CRISIS_FALLBACK_REPLY,
  CRISIS_RESOURCES_TEXT,
} from './crisis';

describe('the fixed texts', () => {
  it('give the Línea de la Vida and 911', () => {
    expect(CRISIS_RESOURCES_TEXT).toContain('800 911 2000');
    expect(hasCrisisResources(CRISIS_RESOURCES_TEXT)).toBe(true);
    expect(hasCrisisResources(CRISIS_FALLBACK_REPLY)).toBe(true);
  });

  it('the fixed reply starts with its own paragraph, then the resources text', () => {
    expect(CRISIS_FALLBACK_REPLY).toBe(
      `Gracias por contármelo. Lo que sientes importa. Ahora mismo lo más importante eres tú, no las tareas ni las metas.\n\n${CRISIS_RESOURCES_TEXT}`
    );
  });
});

describe('hasCrisisResources', () => {
  it('needs both numbers', () => {
    expect(hasCrisisResources('Llama a la Línea de la Vida, 800 911 2000, o al 911.')).toBe(true);
    expect(hasCrisisResources('Llama a la Línea de la Vida, 800 911 2000.')).toBe(false);
    expect(hasCrisisResources('Si estás en peligro, llama al 911.')).toBe(false);
    expect(hasCrisisResources('Estoy aquí contigo.')).toBe(false);
  });

  it('accepts the number written with dashes, dots or no spaces', () => {
    expect(hasCrisisResources('Línea de la Vida: 800-911-2000. Emergencias: 911')).toBe(true);
    expect(hasCrisisResources('Línea de la Vida: 8009112000 o 911')).toBe(true);
    expect(hasCrisisResources('Línea de la Vida: 800.911.2000 y el 911')).toBe(true);
  });

  it('does not take a longer number for 911', () => {
    expect(hasCrisisResources('800 911 2000, o el 9110')).toBe(false);
  });
});

describe('withCrisisResources', () => {
  it('adds the fixed text when a number is missing', () => {
    const reply = 'Gracias por decírmelo. Busca a alguien de confianza.';

    expect(withCrisisResources(reply)).toBe(`${reply}\n\n${CRISIS_RESOURCES_TEXT}`);
  });

  it('leaves a reply that already has both numbers as it is', () => {
    const reply = 'Llama a la Línea de la Vida al 800 911 2000, y al 911 si estás en peligro.';

    expect(withCrisisResources(reply)).toBe(reply);
  });
});

describe('hasCrisisPhrase', () => {
  it.each([
    'Ya no quiero vivir',
    'A veces pienso en el SUICIDIO',
    'he pensado en quitarme la vida',
    'Tengo ganas de morir',
    'me quiero morir',
    'quiero hacerme daño',
    'Mi pareja me golpea',
    'mi papá me maltrata',
    'mi jefe abusa de mí',
    'Me quiero matar',
    'a veces me voy a matar, pienso',
    'me quiero quitar la vida',
    'Me quiero hacer daño',
    'Ya no quiero estar aquí',
    'Todos estarían mejor sin mí',
    'no quiero despertar mañana',
    'Todos estarían más tranquilos si yo no existiera',
    'sería más fácil si no existiera',
    'Mi familia estaría mejor sin mí',
    'Estarían MÁS TRANQUILOS SIN MÍ',
  ])('recognizes "%s"', (message) => {
    expect(hasCrisisPhrase(message)).toBe(true);
  });

  it.each([
    'Me estoy matando de trabajo',
    'Voy a cortarme el pelo',
    'Me pega la nostalgia los domingos',
    'Hoy no quiero hacer mis tareas',
    'Estoy muy cansada y frustrada',
  ])('does not flag the everyday "%s"', (message) => {
    expect(hasCrisisPhrase(message)).toBe(false);
  });
});

describe('applyCrisisProtocol', () => {
  it("keeps an ordinary reply untouched", () => {
    expect(applyCrisisProtocol('hoy avancé', '¡Eso es!', false)).toEqual({ isCrisis: false, reply: '¡Eso es!' });
  });

  it('a crisis flagged by the model keeps its reply and always ends up with both numbers', () => {
    const reply = 'Gracias por contármelo. No estás a solas en esto.';

    expect(applyCrisisProtocol('no aguanto más', reply, true)).toEqual({
      isCrisis: true,
      reply: `${reply}\n\n${CRISIS_RESOURCES_TEXT}`,
    });
  });

  it('a crisis phrase the model missed gets the fixed crisis reply, never the tasks reply', () => {
    const result = applyCrisisProtocol('ya no quiero vivir', 'Vamos con tu tarea de hoy.', false);

    expect(result).toEqual({ isCrisis: true, reply: CRISIS_FALLBACK_REPLY });
  });
});
