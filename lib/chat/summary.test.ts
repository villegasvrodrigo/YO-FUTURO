import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildSummaryPrompt,
  generateChatSummary,
  summarizableMessages,
  summaryMentionsCrisis,
  SUMMARY_INSTRUCTIONS,
  SUMMARY_MODEL,
  type SummaryInput,
} from './summary';

const usage = { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function answering(resumen: string | null) {
  const parse = vi.fn().mockResolvedValue({ parsed_output: resumen === null ? null : { resumen }, usage });
  return { parse, client: { messages: { parse } } as unknown as Anthropic };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ');

const input: SummaryInput = {
  name: 'Ana',
  date: '2026-09-22',
  messages: [
    { role: 'user', content: 'Hoy no pude revisar mi saldo.', is_crisis: false },
    { role: 'assistant', content: '¿Qué tal si lo miras solo un minuto?', is_crisis: false },
  ],
};

describe('summarizableMessages', () => {
  it('leaves out every crisis message (and empty ones)', () => {
    const messages = [
      { role: 'user' as const, content: 'Avancé con el ahorro.', is_crisis: false },
      { role: 'user' as const, content: 'detalle de crisis', is_crisis: true },
      { role: 'assistant' as const, content: 'respuesta de crisis', is_crisis: true },
      { role: 'assistant' as const, content: '  ', is_crisis: false },
    ];

    expect(summarizableMessages(messages)).toEqual([messages[0]]);
  });
});

describe('summaryMentionsCrisis', () => {
  it.each([
    'Ana dijo que no quiere vivir así.',
    'Habló de pensamientos de MORIR.',
    'Contó que su pareja la golpea.',
    'Mencionó que se provoca el vómito.',
    'Tuvo una crisis.',
  ])('catches "%s", written in the third person', (summary) => {
    expect(summaryMentionsCrisis(summary)).toBe(true);
  });

  it('lets an ordinary summary through', () => {
    expect(summaryMentionsCrisis('Ana habló de su miedo a revisar el saldo y quedó en mirarlo un minuto.')).toBe(false);
  });
});

describe('buildSummaryPrompt', () => {
  it('gives the name, the date and who said what, in order', () => {
    expect(buildSummaryPrompt(input)).toBe(`Nombre de la persona: Ana
Fecha de la conversación: 2026-09-22

Conversación:
Ana: Hoy no pude revisar mi saldo.

Yo futuro: ¿Qué tal si lo miras solo un minuto?`);
  });
});

describe('SUMMARY_INSTRUCTIONS', () => {
  it('ask for a short third-person summary with what matters and no crisis details', () => {
    expect(SUMMARY_INSTRUCTIONS).toContain('tercera persona');
    expect(SUMMARY_INSTRUCTIONS).toContain('Entre 60 y 100 palabras');
    expect(SUMMARY_INSTRUCTIONS).toContain('Incluye solo lo importante: de qué hablaron, qué logró o avanzó, qué le estaba costando y qué quedó como siguiente paso.');
    expect(SUMMARY_INSTRUCTIONS).toContain('No incluyas ningún detalle sobre hacerse daño');
    expect(SUMMARY_INSTRUCTIONS).toContain('"resumen"');
  });
});

describe('generateChatSummary', () => {
  it('returns the summary, the model and the tokens', async () => {
    const summary = `Ana habló de ${words(40)}`;
    const { client } = answering(`  ${summary}  `);

    expect(await generateChatSummary(input, client)).toEqual({
      content: summary,
      modelUsed: 'claude-sonnet-5',
      usage: { inputTokens: 900, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
  });

  it('asks Sonnet 5, without thinking, with the instructions and the conversation', async () => {
    const { parse, client } = answering(words(60));

    await generateChatSummary(input, client);

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe(SUMMARY_MODEL);
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.system).toBe(SUMMARY_INSTRUCTIONS);
    expect(request.messages).toEqual([{ role: 'user', content: buildSummaryPrompt(input) }]);
  });

  it.each([
    ['missing', null],
    ['empty', '   '],
    ['too short', words(10)],
    ['too long', words(160)],
    ['leaked JSON', `{"resumen": "${words(30)}"}`],
  ])('throws on a %s summary', async (_, resumen) => {
    await expect(generateChatSummary(input, answering(resumen).client)).rejects.toThrow();
  });

  it('throws when the API fails', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(generateChatSummary(input, { messages: { parse } } as unknown as Anthropic)).rejects.toThrow('overloaded');
  });
});
