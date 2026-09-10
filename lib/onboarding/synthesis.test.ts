import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runOnboardingSynthesis } from './synthesis';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

function resolvingParse(
  parsedOutput: { currentEnergySummary: string; blockingPattern: string; futureVision: string } | null
) {
  return vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
}

function okSynthesis(overrides: Partial<Record<string, string>> = {}) {
  return {
    currentEnergySummary: 'Hoy sientes ansiedad cada vez que revisas tu cuenta.',
    blockingPattern: 'Evitas hablar de dinero cuando te sientes vulnerable.',
    futureVision: 'Quieres ser alguien tranquilo y seguro con el dinero.',
    ...overrides,
  };
}

describe('runOnboardingSynthesis', () => {
  it('returns the three narrative fields from Claude', async () => {
    const parse = resolvingParse(okSynthesis());

    const result = await runOnboardingSynthesis(
      [{ role: 'user', content: 'Hola' }],
      fakeClient(parse)
    );

    expect(result).toEqual(okSynthesis());
    expect(parse.mock.calls[0][0]).toEqual(expect.objectContaining({ model: 'claude-sonnet-5' }));
  });

  it('bounds the call to 60s and at most 1 SDK-level retry', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse));

    expect(parse.mock.calls[0][1]).toEqual({ timeout: 60_000, maxRetries: 1 });
  });

  it('drops leading assistant messages so Claude always receives a user message first', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis(
      [
        { role: 'assistant', content: 'Hola, soy tu guía.' },
        { role: 'user', content: 'Me llamo Ana' },
      ],
      fakeClient(parse)
    );

    expect(parse.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Me llamo Ana' }]);
  });

  it('throws a clean user-facing error when the Claude call fails', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron generar tus resultados, intenta de nuevo.');
  });

  it('throws when Claude does not return a parsed output', async () => {
    const parse = resolvingParse(null);

    await expect(
      runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('Claude no devolvió una respuesta estructurada válida');
  });

  it('rejects a blank narrative field instead of returning a blank result', async () => {
    const parse = resolvingParse(okSynthesis({ blockingPattern: '' }));

    await expect(
      runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron generar tus resultados, intenta de nuevo.');
  });

  it('rejects a narrative field that leaks raw JSON syntax', async () => {
    const parse = resolvingParse(okSynthesis({ futureVision: 'quiere ser...extracted:{' }));

    await expect(
      runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron generar tus resultados, intenta de nuevo.');
  });

  it('asks for enough output tokens to fit three narrative texts', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis([{ role: 'user', content: 'Hola' }], fakeClient(parse));

    expect(parse.mock.calls[0][0].max_tokens).toBe(4096);
  });
});
