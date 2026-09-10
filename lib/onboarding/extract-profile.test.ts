import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { extractOnboardingProfile } from './extract-profile';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

function resolvingParse(parsedOutput: Record<string, unknown> | null) {
  return vi.fn().mockResolvedValue({ parsed_output: parsedOutput });
}

function okExtraction(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Rodrigo',
    currentAge: 42,
    futureSelfAge: 60,
    focusArea: 'finanzas',
    tone: 'motivador',
    values: 'la libertad y la calma',
    goals: ['Ahorrar', 'Pagar deudas'],
    ...overrides,
  };
}

describe('extractOnboardingProfile', () => {
  it('returns the extracted profile fields from Claude', async () => {
    const parse = resolvingParse(okExtraction());

    const result = await extractOnboardingProfile(
      [{ role: 'user', content: 'Hola' }],
      fakeClient(parse)
    );

    expect(result).toEqual(okExtraction());
    expect(parse.mock.calls[0][0]).toEqual(expect.objectContaining({ model: 'claude-sonnet-5' }));
  });

  it('bounds the call to 30s and at most 1 SDK-level retry', async () => {
    const parse = resolvingParse(okExtraction());

    await extractOnboardingProfile([{ role: 'user', content: 'Hola' }], fakeClient(parse));

    expect(parse.mock.calls[0][1]).toEqual({ timeout: 30_000, maxRetries: 1 });
  });

  it('drops leading assistant messages so Claude always receives a user message first', async () => {
    const parse = resolvingParse(okExtraction());

    await extractOnboardingProfile(
      [
        { role: 'assistant', content: 'Hola, soy tu guía.' },
        { role: 'user', content: 'Me llamo Ana' },
      ],
      fakeClient(parse)
    );

    expect(parse.mock.calls[0][0].messages).toEqual([{ role: 'user', content: 'Me llamo Ana' }]);
  });

  it('nulls out an out-of-enum focusArea or tone instead of throwing', async () => {
    const parse = resolvingParse(okExtraction({ focusArea: 'algo-random', tone: 'sarcastico' }));

    const result = await extractOnboardingProfile(
      [{ role: 'user', content: 'Hola' }],
      fakeClient(parse)
    );

    expect(result.focusArea).toBeNull();
    expect(result.tone).toBeNull();
  });

  it('keeps a valid focusArea and tone as-is', async () => {
    const parse = resolvingParse(okExtraction({ focusArea: 'paz', tone: 'tierno' }));

    const result = await extractOnboardingProfile(
      [{ role: 'user', content: 'Hola' }],
      fakeClient(parse)
    );

    expect(result.focusArea).toBe('paz');
    expect(result.tone).toBe('tierno');
  });

  it('throws a clean user-facing error when the Claude call fails', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      extractOnboardingProfile([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron extraer tus datos, intenta de nuevo.');
  });

  it('throws when Claude does not return a parsed output', async () => {
    const parse = resolvingParse(null);

    await expect(
      extractOnboardingProfile([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('Claude no devolvió una respuesta estructurada válida');
  });

  it('rejects a blank values field instead of returning a blank result', async () => {
    const parse = resolvingParse(okExtraction({ values: '' }));

    await expect(
      extractOnboardingProfile([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron extraer tus datos, intenta de nuevo.');
  });

  it('rejects a values field that leaks raw JSON syntax', async () => {
    const parse = resolvingParse(okExtraction({ values: 'la calma...extracted:{' }));

    await expect(
      extractOnboardingProfile([{ role: 'user', content: 'Hola' }], fakeClient(parse))
    ).rejects.toThrow('No se pudieron extraer tus datos, intenta de nuevo.');
  });

  it('allows a null values field (not enough information yet)', async () => {
    const parse = resolvingParse(okExtraction({ values: null }));

    const result = await extractOnboardingProfile(
      [{ role: 'user', content: 'Hola' }],
      fakeClient(parse)
    );

    expect(result.values).toBeNull();
  });
});
