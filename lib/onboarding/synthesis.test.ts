import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { describeSynthesisError, looksCutOff, runOnboardingSynthesis } from './synthesis';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

type Output = { currentEnergySummary: string; blockingPattern: string; futureVision: string };

function resolvingParse(parsedOutput: Output | null) {
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

// The two texts actually found cut in the database: each stops where a quotation began.
const CUT_PATTERN = 'Nace de una herida temprana: su papá, la figura de quien más buscaba amor, le repetía "';
const CUT_ENERGY = 'Hoy vive una relación desgastante con su cuerpo. Ella misma lo describe sin rodeos: "';

describe('looksCutOff', () => {
  it.each([
    ['ends right after an opening straight quote', CUT_PATTERN],
    ['ends with a colon and a quote', CUT_ENERGY],
    ['ends with a colon', 'Ella misma lo describe sin rodeos:'],
    ['ends with an opening latin quote', 'Su papá le repetía «'],
    ['ends without a final period', 'Evitas hablar de dinero cuando te sientes vulnerable'],
    ['ends with a comma', 'Evitas hablar de dinero,'],
    ['is empty', '   '],
  ])('is true when the text %s', (_label, text) => {
    expect(looksCutOff(text)).toBe(true);
  });

  it.each([
    ['ends with a period', 'Evitas hablar de dinero cuando te sientes vulnerable.'],
    ['ends with a question or an exclamation mark', '¿Y si ya puedes? ¡Claro que sí!'],
    ['ends with an ellipsis', 'Todavía no lo sabes…'],
    ['ends with a quotation closed after its period', 'Su papá le repetía «nunca alcanza.»'],
    ['has a complete quotation in the middle', 'Su papá le repetía «nunca alcanza» y eso te marcó.'],
    ['has trailing spaces or line breaks', 'Quieres ser alguien tranquilo.  \n'],
  ])('is false when the text %s', (_label, text) => {
    expect(looksCutOff(text)).toBe(false);
  });
});

describe('runOnboardingSynthesis — cut texts', () => {
  const transcript = [{ role: 'user' as const, content: 'Hola' }];

  it('asks once, and only once, when every text is complete', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('asks for the results once more when a text comes back cut, and uses the complete second answer', async () => {
    const complete = okSynthesis({ blockingPattern: 'Su papá le repetía «nunca alcanza», y eso te marcó.' });
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ parsed_output: okSynthesis({ blockingPattern: CUT_PATTERN }) })
      .mockResolvedValueOnce({ parsed_output: complete });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(parse).toHaveBeenCalledTimes(2);
    expect(result).toEqual(complete);
    warn.mockRestore();
  });

  it('never asks more than twice', async () => {
    const parse = resolvingParse(okSynthesis({ blockingPattern: CUT_PATTERN }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(parse).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('when a text is cut both times, returns null for it (the screen shows the "not ready" notice), never the broken text', async () => {
    const parse = resolvingParse(okSynthesis({ blockingPattern: CUT_PATTERN, currentEnergySummary: CUT_ENERGY }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(result.blockingPattern).toBeNull();
    expect(result.currentEnergySummary).toBeNull();
    expect(result.futureVision).toBe(okSynthesis().futureVision);
    expect(JSON.stringify(result)).not.toContain('le repetía');
    warn.mockRestore();
  });

  it('keeps each complete text from either attempt', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ parsed_output: okSynthesis({ blockingPattern: CUT_PATTERN }) })
      .mockResolvedValueOnce({
        parsed_output: okSynthesis({ futureVision: 'Quieres ser alguien que ya no dice:' }),
      });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runOnboardingSynthesis(transcript, fakeClient(parse));

    // blockingPattern: complete only in the second; futureVision: complete only in the first.
    expect(result.blockingPattern).toBe(okSynthesis().blockingPattern);
    expect(result.futureVision).toBe(okSynthesis().futureVision);
    warn.mockRestore();
  });

  it('if the second attempt fails, keeps the complete texts of the first and nulls the cut one', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ parsed_output: okSynthesis({ blockingPattern: CUT_PATTERN }) })
      .mockRejectedValueOnce(new Error('network error'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(result).toEqual({ ...okSynthesis(), blockingPattern: null });
    warn.mockRestore();
    error.mockRestore();
  });

  it('the second attempt makes no extra SDK retry, so both fit in the time the screen waits', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce({ parsed_output: okSynthesis({ blockingPattern: CUT_PATTERN }) })
      .mockResolvedValueOnce({ parsed_output: okSynthesis() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(parse.mock.calls[0][1]).toEqual({ timeout: 60_000, maxRetries: 1 });
    expect(parse.mock.calls[1][1]).toEqual({ timeout: 60_000, maxRetries: 0 });
    warn.mockRestore();
  });

  it('asks for latin quotes « » and never straight quotes when quoting', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis(transcript, fakeClient(parse));

    const system: string = parse.mock.calls[0][0].system;
    expect(system).toContain('comillas latinas « »');
    expect(system).toContain('Nunca uses comillas rectas');
    expect(system).toContain('que termine en punto');
  });

  it('keeps the token limit and the thinking settings as they were', async () => {
    const parse = resolvingParse(okSynthesis());

    await runOnboardingSynthesis(transcript, fakeClient(parse));

    expect(parse.mock.calls[0][0].max_tokens).toBe(4096);
    expect(parse.mock.calls[0][0].thinking).toBeUndefined();
  });
});

describe('runOnboardingSynthesis — logs the real reason of a failure, never the user\'s answers', () => {
  // Private details that must never reach the logs.
  const PRIVATE = 'mi papá me decía que nunca iba a ser suficiente';
  const transcript = [{ role: 'user' as const, content: PRIVATE }];
  const USER_MESSAGE = 'No se pudieron generar tus resultados, intenta de nuevo.';

  function captureErrors() {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logged = () => spy.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
    return { spy, logged };
  }

  it('an error from the Claude API: logs its type, status and API error type; the user sees the same message as always', async () => {
    const apiError = new Anthropic.APIError(
      529,
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      '529 Overloaded',
      undefined
    );
    const parse = vi.fn().mockRejectedValue(apiError);
    const { spy, logged } = captureErrors();

    await expect(runOnboardingSynthesis(transcript, fakeClient(parse))).rejects.toThrow(USER_MESSAGE);

    expect(logged()).toContain('falló la llamada a la IA');
    expect(logged()).toContain('status=529');
    expect(logged()).toContain('tipo=overloaded_error');
    expect(logged()).not.toContain(PRIVATE);
    spy.mockRestore();
  });

  it('a timeout: logs that it was a timeout', async () => {
    const parse = vi.fn().mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    const { spy, logged } = captureErrors();

    await expect(runOnboardingSynthesis(transcript, fakeClient(parse))).rejects.toThrow(USER_MESSAGE);

    expect(logged()).toContain('APIConnectionTimeoutError');
    spy.mockRestore();
  });

  it('any other error: logs its type but NOT its message, which could echo the answer', async () => {
    const parse = vi.fn().mockRejectedValue(new SyntaxError(`Unexpected token in JSON: "${PRIVATE}`));
    const { spy, logged } = captureErrors();

    await expect(runOnboardingSynthesis(transcript, fakeClient(parse))).rejects.toThrow(USER_MESSAGE);

    expect(logged()).toContain('SyntaxError');
    expect(logged()).not.toContain(PRIVATE);
    spy.mockRestore();
  });

  it('no structured answer: logs the stop reason (for example "refusal" or "max_tokens")', async () => {
    const parse = vi.fn().mockResolvedValue({ parsed_output: null, stop_reason: 'max_tokens' });
    const { spy, logged } = captureErrors();

    await expect(runOnboardingSynthesis(transcript, fakeClient(parse))).rejects.toThrow();

    expect(logged()).toContain('stop_reason=max_tokens');
    spy.mockRestore();
  });

  it('a blank or leaked text: logs which section it was, without its content', async () => {
    const parse = resolvingParse(okSynthesis({ futureVision: `${PRIVATE} extracted:{` }));
    const { spy, logged } = captureErrors();

    await expect(runOnboardingSynthesis(transcript, fakeClient(parse))).rejects.toThrow(USER_MESSAGE);

    expect(logged()).toContain('el texto futureVision vino vacío o con formato inválido');
    expect(logged()).not.toContain(PRIVATE);
    spy.mockRestore();
  });

  it('logs nothing when everything goes well', async () => {
    const { spy } = captureErrors();

    await runOnboardingSynthesis(transcript, fakeClient(resolvingParse(okSynthesis())));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('describeSynthesisError', () => {
  it('describes errors that are not Error objects without crashing', () => {
    expect(describeSynthesisError('algo raro')).toBe('error de tipo string');
    expect(describeSynthesisError(undefined)).toBe('error de tipo undefined');
  });
});

