import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ONBOARDING_SCRIPT, ONBOARDING_GREETING } from './script';
import { runOnboardingTurn } from './chat';

// The questions exactly as agreed (steps 2 to 16; 11 is the encouragement).
const AGREED = [
  '¿Cuántos años tienes?',
  'Tu yo futuro te va a escribir desde más adelante en tu vida. ¿Desde qué edad quieres que te hable? Por ejemplo, desde los 45.',
  '¿Qué área de tu vida quieres trabajar más ahora: Dinero y abundancia, Amor y relaciones, Paz, o Tu cuerpo?',
  'Del área que elegiste, ¿qué es lo que más te gustaría cambiar?',
  'Piensa en un recuerdo de cuando eras más joven, relacionado con esto, que te haya dolido o marcado. ¿Qué pasó y cómo lo viviste?',
  'Mientras crecías, ¿a quién admirabas más o de quién buscabas su aprobación o amor?',
  'Hoy, en tu día a día, ¿cómo es tu relación con esto que quieres cambiar? Cuéntamelo con toda honestidad.',
  'Cuando piensas en esto o te toca enfrentarlo, ¿qué sientes en el cuerpo y qué emociones aparecen?',
  'Piensa en alguna vez cuando las cosas iban bien. ¿Cómo te sentías y qué hacías diferente?',
  'Vas muy bien, ya vamos a la mitad.',
  'En cualquier momento de tu vida, ¿cuál ha sido la situación más difícil o dolorosa relacionada con esto que quieres cambiar? Cuéntamelo con el mayor detalle posible, es importante.',
  'Cuando las cosas no salen como esperas, ¿qué sueles hacer?',
  'Imagina que todo sale bien. ¿Cómo te gustaría estar dentro de un año? Y si quieres, cuéntame también tu visión a largo plazo.',
  'Imagina que ya estás viviendo tu realidad deseada. ¿Cómo es? ¿Cómo piensas, cómo actúas, cómo te sientes?',
  '¿Te comprometes a ser esa versión de ti, aunque a veces no sea fácil y tengas que incomodarte, y a dejar de regresar a los patrones que te han estado frenando?',
];

async function systemPrompt(): Promise<string> {
  const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
  await runOnboardingTurn([{ role: 'user', content: 'Me llamo Carlos' }], ONBOARDING_SCRIPT, {
    messages: { create },
  } as unknown as Anthropic);
  return create.mock.calls[0][0].system as string;
}

describe('ONBOARDING_SCRIPT', () => {
  it('has 16 steps: the note about the greeting, 14 questions and the encouragement at 11', () => {
    expect(ONBOARDING_SCRIPT).toHaveLength(16);
    expect(ONBOARDING_SCRIPT[0].kind).toBe('note');
    expect(ONBOARDING_SCRIPT[10].kind).toBe('encouragement');
    expect(ONBOARDING_SCRIPT.filter((s) => s.kind === 'question')).toHaveLength(14);
  });

  it('keeps the greeting as it was, and tells the guide to use the name without asking again', () => {
    expect(ONBOARDING_GREETING).toBe(
      'Hola. Antes de escribirte tu primer mensaje, quiero conocerte un poco. Para empezar, ¿cómo te llamas?'
    );
    expect(ONBOARDING_SCRIPT[0].text).toContain(ONBOARDING_GREETING);
    expect(ONBOARDING_SCRIPT[0].text).toContain('no lo preguntes de nuevo');
  });

  it('has exactly the agreed questions, in order', () => {
    expect(ONBOARDING_SCRIPT.slice(1).map((s) => s.text)).toEqual(AGREED);
  });
});

describe('the onboarding conversation instructions', () => {
  it('give every question word for word, numbered in order', async () => {
    const system = await systemPrompt();

    ONBOARDING_SCRIPT.slice(1).forEach((step, i) => {
      expect(system).toContain(`«${step.text}»`);
      if (step.kind === 'question') expect(system).toContain(`${i + 2}. Pregunta textual: «${step.text}»`);
    });
    expect(system).toContain('11. Frase de aliento textual, en el mismo mensaje que la pregunta 12 y justo antes de ella');
  });

  it('ask for one textual question per message, with at most one short sentence before it', async () => {
    const system = await systemPrompt();

    expect(system).toContain('Haz UNA sola pregunta por mensaje, en el orden del guion.');
    expect(system).toContain('Escribe cada pregunta TEXTUAL, palabra por palabra');
    expect(system).toContain('nunca juntes dos preguntas en un mismo mensaje');
    expect(system).toContain('solo UNA frase breve, de 15 palabras como máximo, reconociendo la respuesta anterior');
    expect(system).toContain('Después de la pregunta no escribas nada más.');
  });

  it('keep the rest as it was: no tone, values or goals questions, the [FIN] closing', async () => {
    const system = await systemPrompt();

    expect(system).toContain('No preguntes por el tono que prefiere para los mensajes, ni directamente por sus valores o sus metas');
    expect(system).toContain('agregando la palabra exacta [FIN] al final');
  });
});
