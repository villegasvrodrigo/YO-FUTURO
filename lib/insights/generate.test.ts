import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  copiesLongPhrase,
  countWords,
  generateDailyInsight,
  INSIGHT_ANGLES,
  INSIGHT_MODEL,
  INSIGHT_OPENINGS,
  pickAngle,
  pickOpening,
  splitSentences,
  type DailyInsightInput,
} from './generate';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

function resolvingParse(insight: unknown) {
  return vi.fn().mockResolvedValue({ parsed_output: { insight } });
}

const input: DailyInsightInput = {
  name: 'Ana',
  focusArea: 'finanzas',
  tone: 'tierno',
  values: 'Valoro la paz y la libertad',
  goals: ['Sanar mi relación con el dinero', 'Ahorrar para un año sabático'],
  currentEnergySummary: 'Hoy sientes ansiedad cada vez que revisas tu cuenta.',
  blockingPattern: 'Evitas hablar de dinero cuando te sientes vulnerable.',
  futureVision: 'Quieres ser alguien tranquila y segura con el dinero.',
  messageText: 'Ana, cada paso pequeño hoy es una promesa cumplida a la que serás.',
  insightDate: '2026-09-23',
  recentInsights: ['Vas notando que la calma también se entrena.'],
  completedTasks: ['Anota tres gastos de esta semana sin juzgarte.'],
};

// The style example from the spec: 4 sentences, one paragraph.
const GOOD =
  'Estás aprendiendo que tu esfuerzo no necesita pruebas inmediatas para ser real. ' +
  'El trabajo que haces pesa incluso antes de que te responda. ' +
  'Nota cuándo las ganas de buscar resultados te empujan a la duda. ' +
  'Puedes seguir sin necesitar la respuesta hoy.';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('generateDailyInsight', () => {
  it('returns the insight and the model that wrote it', async () => {
    const result = await generateDailyInsight(input, fakeClient(resolvingParse(GOOD)));

    expect(result).toEqual({ content: GOOD, modelUsed: 'claude-sonnet-5' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('calls claude-sonnet-5 without thinking, with a 15 s timeout and no retries', async () => {
    const parse = resolvingParse(GOOD);

    await generateDailyInsight(input, fakeClient(parse));

    const [params, options] = parse.mock.calls[0];
    expect(INSIGHT_MODEL).toBe('claude-sonnet-5');
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.thinking).toEqual({ type: 'disabled' });
    expect(params.output_config.format).toBeDefined();
    expect(options).toEqual(expect.objectContaining({ timeout: 15_000, maxRetries: 0 }));
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts 5 sentences, so one sentence more than asked does not cost the insight', async () => {
    const five = `${GOOD} Todo eso ya es parte de ti.`;
    expect(splitSentences(five)).toHaveLength(5);

    await expect(generateDailyInsight(input, fakeClient(resolvingParse(five)))).resolves.toEqual({
      content: five,
      modelUsed: 'claude-sonnet-5',
    });
  });

  it('accepts up to 75 words and rejects 76', async () => {
    // 3 sentences of 25 words each = 75 words; one more word = 76.
    const sentence = (n: number) => `Estás ${'aprendiendo '.repeat(n - 2)}hoy.`;
    const at75 = [sentence(25), sentence(25), sentence(25)].join(' ');
    const at76 = [sentence(26), sentence(25), sentence(25)].join(' ');
    expect(countWords(at75)).toBe(75);
    expect(countWords(at76)).toBe(76);

    await expect(generateDailyInsight(input, fakeClient(resolvingParse(at75)))).resolves.not.toBeNull();
    await expect(generateDailyInsight(input, fakeClient(resolvingParse(at76)))).resolves.toBeNull();
  });

  it('accepts 3 sentences as well as 4', async () => {
    const three = GOOD.split('. ').slice(0, 3).join('. ') + '.';
    expect(splitSentences(three)).toHaveLength(3);

    await expect(generateDailyInsight(input, fakeClient(resolvingParse(three)))).resolves.toEqual({
      content: three,
      modelUsed: 'claude-sonnet-5',
    });
  });

  it('trims it and folds line breaks into one paragraph', async () => {
    const withBreaks = `  ${GOOD.replace('real. ', 'real.\n\n')}\n`;

    const result = await generateDailyInsight(input, fakeClient(resolvingParse(withBreaks)));

    expect(result?.content).toBe(GOOD);
  });

  describe('the prompt', () => {
    it('asks for a soft second-person observation of about 45 words in short sentences, not orders or tasks', async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      const system: string = parse.mock.calls[0][0].system;
      expect(system).toContain('le habla de tú');
      expect(system).toContain('3 o 4 frases');
      expect(system).toContain('unas 45 palabras');
      expect(system).toContain('20 palabras como máximo');
      expect(system).toContain('Ejemplo del estilo y el largo');
      expect(system).toContain('suave');
      expect(system).toContain('Observa; no ordena');
      expect(system).toContain('ni le des tareas');
    });

    it('keeps the same safety rules as the tasks', async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      const system: string = parse.mock.calls[0][0].system;
      expect(system).toContain('gastar dinero');
      expect(system).toContain('riesgos físicos');
      expect(system).toContain('consejo médico');
      expect(system).toContain('No asume situaciones, personas ni hechos');
      expect(system).toContain('No afirma cambios, avances ni mejoras que no estén en sus datos o en sus tareas marcadas');
      expect(system).toContain('ignóralo');
    });

    it("includes the user's data, the checked tasks, the recent insights and today's message", async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      const user: string = parse.mock.calls[0][0].messages[0].content;
      expect(user).toContain('Nombre: Ana');
      expect(user).toContain('- Sanar mi relación con el dinero');
      expect(user).toContain(input.currentEnergySummary);
      expect(user).toContain(input.blockingPattern);
      expect(user).toContain(input.futureVision);
      expect(user).toContain('- Anota tres gastos de esta semana sin juzgarte.');
      expect(user).toContain('- Vas notando que la calma también se entrena.');
      expect(user).toContain(input.messageText);
    });

    it('says so when there are no goals, checked tasks or recent insights', async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(
        { ...input, goals: [], recentInsights: undefined, completedTasks: ['  '] },
        fakeClient(parse)
      );

      const user: string = parse.mock.calls[0][0].messages[0].content;
      expect(user).toContain('- (sin metas activas registradas)');
      expect(user).toContain('- (ninguna todavía)');
      expect(user).toContain('- (ninguno todavía)');
    });

    it("gives the day's angle and treats the checked tasks as optional support", async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      const system: string = parse.mock.calls[0][0].system;
      const user: string = parse.mock.calls[0][0].messages[0].content;
      expect(user).toContain(`Ángulo de hoy: ${pickAngle(input.insightDate, input.goals)}`);
      expect(system).toContain('Se centra en el ángulo de hoy');
      expect(system).toContain('apoyo opcional, no el tema central');
    });

    it('asks it to vary its expressions, such as "Puedes notar"', async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      expect(parse.mock.calls[0][0].system).toContain('no uses "Puedes notar" si ya aparece');
    });

    it("suggests the day's opening", async () => {
      const parse = resolvingParse(GOOD);

      await generateDailyInsight(input, fakeClient(parse));

      const user: string = parse.mock.calls[0][0].messages[0].content;
      expect(user).toContain(`Apertura sugerida para hoy: "${pickOpening(input.insightDate)}…"`);
    });
  });

  describe('returns null (and logs) instead of a bad insight', () => {
    it.each([
      ['2 sentences', 'Estás aprendiendo que tu calma también es trabajo real y valioso. Poco a poco lo vas viendo con más claridad.'],
      ['6 sentences', `${GOOD} Todo eso ya es parte de ti. Y se nota.`],
      ['too short', 'Aprendes. Creces. Sigues.'],
      ['too long', `Estás aprendiendo ${'mucho '.repeat(120)}hoy. Sigues. Creces.`],
      ['no final period', GOOD.slice(0, -1)],
      ['blank', '   '],
      ['leaked JSON', `{"insight": "${GOOD}"}`],
      ['leaked field names', `${GOOD.slice(0, -1)} según tu blockingPattern.`],
    ])('%s', async (_label, insight) => {
      await expect(generateDailyInsight(input, fakeClient(resolvingParse(insight)))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it.each([
      ['a number', 42],
      ['null', null],
      ['a list', [GOOD]],
    ])('when the insight field is %s', async (_label, insight) => {
      await expect(generateDailyInsight(input, fakeClient(resolvingParse(insight)))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('when there is no parsed output at all', async () => {
      const parse = vi.fn().mockResolvedValue({ parsed_output: null });

      await expect(generateDailyInsight(input, fakeClient(parse))).resolves.toBeNull();
    });

    it("when it copies a long phrase from the day's message", async () => {
      const copying =
        'Estás aprendiendo que cada paso pequeño hoy es una promesa cumplida. ' +
        'El trabajo que haces pesa incluso antes de que te responda. ' +
        'Puedes seguir sin necesitar la respuesta hoy.';

      await expect(generateDailyInsight(input, fakeClient(resolvingParse(copying)))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('when the API call fails', async () => {
      const parse = vi.fn().mockRejectedValue(new Anthropic.APIError(500, undefined, 'boom', undefined));

      await expect(generateDailyInsight(input, fakeClient(parse))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('when the date is invalid, without calling the API', async () => {
      const parse = resolvingParse(GOOD);

      await expect(
        generateDailyInsight({ ...input, insightDate: '2026-02-31' }, fakeClient(parse))
      ).resolves.toBeNull();
      expect(parse).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('returns null when the SDK reports a timeout', async () => {
      const parse = vi.fn().mockRejectedValue(new Anthropic.APIConnectionTimeoutError());

      await expect(generateDailyInsight(input, fakeClient(parse))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('gives up at exactly 15s even if the call never settles, and aborts the request', async () => {
      vi.useFakeTimers();
      const parse = vi.fn().mockReturnValue(new Promise(() => {}));
      let result: unknown = 'pending';
      const pending = generateDailyInsight(input, fakeClient(parse)).then((r) => {
        result = r;
      });

      await vi.advanceTimersByTimeAsync(14_999);
      expect(result).toBe('pending');

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBeNull();
      expect(parse.mock.calls[0][1].signal.aborted).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('does not leave the deadline timer running after a normal answer', async () => {
      vi.useFakeTimers();

      await generateDailyInsight(input, fakeClient(resolvingParse(GOOD)));

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('pickOpening', () => {
  it('rotates through every opening, one per day, and "Estás aprendiendo que" is one of them', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= INSIGHT_OPENINGS.length; day++) {
      seen.add(pickOpening(`2026-10-${String(day).padStart(2, '0')}`));
    }
    expect(seen.size).toBe(INSIGHT_OPENINGS.length);
    expect(INSIGHT_OPENINGS).toContain('Estás aprendiendo que');
  });

  it('never gives the same opening two days in a row, across a month and a year', () => {
    for (const [a, b] of [
      ['2026-09-30', '2026-10-01'],
      ['2026-12-31', '2027-01-01'],
    ]) {
      expect(pickOpening(a)).not.toBe(pickOpening(b));
    }
  });

  it('is the same for the same date', () => {
    expect(pickOpening('2026-09-23')).toBe(pickOpening('2026-09-23'));
  });

  it.each(['', '2026-02-31', '23/09/2026'])('throws on the invalid date %j', (bad) => {
    expect(() => pickOpening(bad)).toThrow();
  });
});

describe('pickAngle', () => {
  const goals = ['Meta A', 'Meta B'];
  const days = Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);

  it('rotates through the 5 angles, one per day', () => {
    const seen = new Set(days.slice(0, INSIGHT_ANGLES.length).map((d) => pickAngle(d, goals)));
    expect(seen.size).toBe(INSIGHT_ANGLES.length);
  });

  it('never gives the same angle two days in a row, across a month and a year', () => {
    for (const [a, b] of [
      ['2026-09-30', '2026-10-01'],
      ['2026-12-31', '2027-01-01'],
    ]) {
      expect(pickAngle(a, goals)).not.toBe(pickAngle(b, goals));
    }
  });

  it("names one of the user's goals on goal days, rotating between them", () => {
    const goalLines = days.map((d) => pickAngle(d, goals)).filter((line) => line.startsWith('Esta meta'));
    expect(goalLines.length).toBeGreaterThan(0);
    expect(goalLines.every((line) => line.includes('"Meta A"') || line.includes('"Meta B"'))).toBe(true);
  });

  it('falls back to the vision on goal days when there are no goals', () => {
    for (const d of days) {
      expect(pickAngle(d, ['  '])).not.toContain('Esta meta');
    }
  });

  it('is the same for the same date and goals', () => {
    expect(pickAngle('2026-09-23', goals)).toBe(pickAngle('2026-09-23', goals));
  });

  it.each(['', '2026-02-31'])('throws on the invalid date %j', (bad) => {
    expect(() => pickAngle(bad, goals)).toThrow();
  });
});

describe('countWords', () => {
  it('counts words separated by any whitespace', () => {
    expect(countWords('  Uno dos,\n tres.  ')).toBe(3);
    expect(countWords(GOOD)).toBe(42);
  });
});

describe('copiesLongPhrase', () => {
  const message = 'Ana, cada paso pequeño hoy es una promesa cumplida a la que serás.';

  it('is true for 6 or more words in a row from the message, ignoring case, accents and punctuation', () => {
    expect(copiesLongPhrase('Hoy: CADA paso pequeno, hoy es una promesa.', message)).toBe(true);
  });

  it('is false for 5 words in a row or fewer', () => {
    expect(copiesLongPhrase('Sabes que cada paso pequeño hoy cuenta.', message)).toBe(false);
  });

  it('is false for an unrelated text', () => {
    expect(copiesLongPhrase(GOOD, message)).toBe(false);
  });

  it('is false against an empty message', () => {
    expect(copiesLongPhrase(GOOD, '')).toBe(false);
  });
});

describe('splitSentences', () => {
  it('splits after . ! ? and …', () => {
    expect(splitSentences('Uno. ¿Dos? ¡Tres! Cuatro… Cinco.')).toEqual(['Uno.', '¿Dos?', '¡Tres!', 'Cuatro…', 'Cinco.']);
  });

  it('counts the style example as 4 sentences', () => {
    expect(splitSentences(GOOD)).toHaveLength(4);
  });
});
