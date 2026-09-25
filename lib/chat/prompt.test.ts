import { describe, it, expect } from 'vitest';
import { buildChatContext, CHAT_INSTRUCTIONS, type ChatContextInput } from './prompt';

const input: ChatContextInput = {
  name: 'Ana',
  currentAge: 34,
  futureSelfAge: 44,
  tone: 'tierno',
  values: 'La paz y la libertad',
  focusArea: 'finanzas',
  goals: ['Sanar mi relación con el dinero', '  ', 'Ahorrar para un año sabático'],
  currentEnergySummary: 'Hoy sientes ansiedad al revisar tu cuenta.',
  blockingPattern: 'Evitas hablar de dinero.',
  futureVision: 'Alguien tranquila con el dinero.',
  todayMessage: 'Ana, cada paso pequeño cuenta.',
  todayTasks: [
    { description: 'Anota tres gastos de esta semana.', completed: true },
    { description: 'Graba una nota de voz.', completed: false },
  ],
  lastSummary: { date: '2026-09-22', content: 'Hablamos de su miedo a revisar su saldo.', hadCrisis: false },
};

describe('CHAT_INSTRUCTIONS', () => {
  it('keep the voice of the daily email and ask for short replies', () => {
    expect(CHAT_INSTRUCTIONS).toContain('"yo futuro"');
    expect(CHAT_INSTRUCTIONS).toContain('primera persona');
    expect(CHAT_INSTRUCTIONS).toContain('Respuestas cortas');
  });

  it('carry the crisis protocol with both numbers', () => {
    expect(CHAT_INSTRUCTIONS).toContain('Situaciones de crisis');
    expect(CHAT_INSTRUCTIONS).toContain('800 911 2000');
    expect(CHAT_INSTRUCTIONS).toContain('911 si está en peligro');
  });

  it('count serious eating and body behaviors as a crisis, and always ask if the person is safe', () => {
    expect(CHAT_INSTRUCTIONS).toContain(
      'o que quiere hacerle daño a otra persona, o conductas graves con la comida o el cuerpo, como provocarse el vómito, dejar de comer por días o castigar su cuerpo.'
    );
    expect(CHAT_INSTRUCTIONS).toContain('Pregúntale si ahora está a salvo.');
    expect(CHAT_INSTRUCTIONS).not.toContain('Puedes preguntarle si ahora está a salvo.');
  });

  it('never deduce gender from the name, and give the numbers directly in a crisis', () => {
    expect(CHAT_INSTRUCTIONS).toContain(
      '- Usa el género con el que la persona se refiere a sí misma en sus mensajes. No lo deduzcas de su nombre. Si no lo sabes, usa formas neutras (por ejemplo, «a solas» en vez de «solo» o «sola»).'
    );
    expect(CHAT_INSTRUCTIONS).toContain(
      '- Da los números de forma directa, nunca como condicional (no digas «si en algún momento piensas…»): la persona ya te está diciendo cómo se siente.'
    );
    // Right after the line that gives the numbers.
    expect(CHAT_INSTRUCTIONS.indexOf('Da los números de forma directa')).toBeGreaterThan(CHAT_INSTRUCTIONS.indexOf('Dale estos números'));
  });

  it('ask for the JSON the server reads', () => {
    expect(CHAT_INSTRUCTIONS).toContain('"respuesta"');
    expect(CHAT_INSTRUCTIONS).toContain('"crisis"');
  });

  it("hold no person's data, so they are the same for everyone", () => {
    expect(CHAT_INSTRUCTIONS).not.toContain('Ana');
  });
});

describe('buildChatContext', () => {
  it("includes the person's profile, radiografía, goals, today's email and tasks", () => {
    const context = buildChatContext(input);

    expect(context).toContain('Datos de Ana');
    expect(context).toContain('Hoy tiene 34 años; tú le hablas desde los 44.');
    expect(context).toContain('Tono que eligió: tierno');
    expect(context).toContain('Lo que valora: La paz y la libertad');
    expect(context).toContain('- Sanar mi relación con el dinero\n- Ahorrar para un año sabático');
    expect(context).toContain('Cómo está su energía: Hoy sientes ansiedad al revisar tu cuenta.');
    expect(context).toContain('El patrón que suele frenarle: Evitas hablar de dinero.');
    expect(context).toContain('Quién quiere llegar a ser: Alguien tranquila con el dinero.');
    expect(context).toContain('Su mensaje de hoy:\nAna, cada paso pequeño cuenta.');
    expect(context).toContain('- [hecha] Anota tres gastos de esta semana.\n- [pendiente] Graba una nota de voz.');
  });

  it('includes the last conversation, with no crisis note when there was none', () => {
    const context = buildChatContext(input);

    expect(context).toContain('Fue el 2026-09-22. Hablamos de su miedo a revisar su saldo.');
    expect(context).not.toContain('momento difícil');
  });

  it('after a crisis, adds only the general note', () => {
    const context = buildChatContext({
      ...input,
      lastSummary: { date: '2026-09-22', content: 'Conversamos un rato.', hadCrisis: true },
    });

    expect(context).toContain('Conversamos un rato.\nNota: la última vez fue un momento difícil.');
  });

  it('says so when something is missing, instead of leaving it blank', () => {
    const context = buildChatContext({
      ...input,
      goals: [],
      currentEnergySummary: null,
      blockingPattern: '  ',
      todayMessage: null,
      todayTasks: [],
      lastSummary: null,
    });

    expect(context).toContain('- (sin metas activas registradas)');
    expect(context).toContain('Cómo está su energía: (no disponible)');
    expect(context).toContain('El patrón que suele frenarle: (no disponible)');
    expect(context).toContain('(todavía no le llega el mensaje de hoy)');
    expect(context).toContain('- (hoy no tiene tareas)');
    expect(context).toContain('(es su primera conversación contigo)');
  });

  it('is identical for the same data, so it can be cached between messages', () => {
    expect(buildChatContext(input)).toBe(buildChatContext({ ...input }));
  });
});
