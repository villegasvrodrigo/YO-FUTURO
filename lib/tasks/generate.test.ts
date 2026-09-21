import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  generateDailyTasks,
  pickDailyPlan,
  FIXED_PENDING_TASKS,
  type DailyTasksInput,
} from './generate';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

function resolvingParse(tasks: unknown) {
  return vi.fn().mockResolvedValue({ parsed_output: { tasks } });
}

const input: DailyTasksInput = {
  name: 'Ana',
  focusArea: 'finanzas',
  tone: 'tierno',
  values: 'Valoro la paz y la libertad',
  goals: ['Sanar mi relación con el dinero', 'Ahorrar para un año sabático'],
  currentEnergySummary: 'Hoy sientes ansiedad cada vez que revisas tu cuenta.',
  blockingPattern: 'Evitas hablar de dinero cuando te sientes vulnerable.',
  futureVision: 'Quieres ser alguien tranquila y segura con el dinero.',
  messageText: 'Ana, cada paso pequeño hoy es una promesa cumplida a la que serás.',
  taskDate: '2026-09-21',
};

// What Claude returns: task 1 and task 3. Task 2 is a fixed phrase added by the code.
const goodTasks = [
  'Anota tres gastos de esta semana sin juzgarte.',
  'Graba una nota de voz sobre cómo se ve tu yo futuro.',
];

// What generateDailyTasks returns for `input` when Claude answers with goodTasks.
const expectedTasks = [
  goodTasks[0],
  pickDailyPlan(input.taskDate, input.goals).pendingTask,
  goodTasks[1],
];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('generateDailyTasks', () => {
  it('returns 3 tasks: Claude\'s two around the fixed one, in that order', async () => {
    const parse = resolvingParse(goodTasks);

    const result = await generateDailyTasks(input, fakeClient(parse));

    expect(result).toEqual(expectedTasks);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("asks Claude for exactly 2 tasks and puts the day's fixed task in the middle", async () => {
    const parse = resolvingParse(goodTasks);

    const result = await generateDailyTasks(input, fakeClient(parse));

    expect(result).toHaveLength(3);
    expect(result![0]).toBe(goodTasks[0]);
    expect(FIXED_PENDING_TASKS).toContain(result![1]);
    expect(result![2]).toBe(goodTasks[1]);
    expect(parse.mock.calls[0][0].system).toContain('exactamente 2 textos');
    expect(parse.mock.calls[0][0].messages[0].content).toContain('genera exactamente 2 tareas');
  });

  it('trims whitespace around each task', async () => {
    const parse = resolvingParse(goodTasks.map((t) => `  ${t}\n`));

    expect(await generateDailyTasks(input, fakeClient(parse))).toEqual(expectedTasks);
  });

  it('uses Sonnet with thinking disabled, structured output, a 15s budget and no SDK retries', async () => {
    const parse = resolvingParse(goodTasks);

    await generateDailyTasks(input, fakeClient(parse));

    expect(parse.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        output_config: expect.objectContaining({ format: expect.anything() }),
      })
    );
    expect(parse.mock.calls[0][1]).toEqual(
      expect.objectContaining({ timeout: 15_000, maxRetries: 0 })
    );
  });

  it('sends the user data and the day message to Claude', async () => {
    const parse = resolvingParse(goodTasks);

    await generateDailyTasks(input, fakeClient(parse));

    const prompt: string = parse.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Ana');
    expect(prompt).toContain('finanzas');
    expect(prompt).toContain('tierno');
    expect(prompt).toContain('Valoro la paz y la libertad');
    expect(prompt).toContain('- Sanar mi relación con el dinero');
    expect(prompt).toContain('- Ahorrar para un año sabático');
    expect(prompt).toContain(input.currentEnergySummary!);
    expect(prompt).toContain(input.blockingPattern!);
    expect(prompt).toContain(input.futureVision!);
    expect(prompt).toContain(input.messageText);
  });

  it('still builds a prompt when there are no goals and no radiography', async () => {
    const parse = resolvingParse(goodTasks);

    const result = await generateDailyTasks(
      {
        ...input,
        goals: [],
        currentEnergySummary: null,
        blockingPattern: null,
        futureVision: null,
      },
      fakeClient(parse)
    );

    expect(result).toEqual(expectedTasks);
    expect(parse.mock.calls[0][0].messages[0].content).toContain('(sin metas activas registradas)');
  });

  describe('recent tasks', () => {
    const recentTasks = [
      'Graba una nota de voz sobre cómo se ve tu yo futuro.',
      'Anota un logro que ya conseguiste este mes.',
      'Llama a alguien de tu lista de pendientes.',
    ];

    it('lists the recent tasks in the prompt so Claude can avoid repeating them', async () => {
      const parse = resolvingParse(goodTasks);

      const result = await generateDailyTasks({ ...input, recentTasks }, fakeClient(parse));

      expect(result).toEqual(expectedTasks);
      const prompt: string = parse.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Tareas de los últimos días');
      recentTasks.forEach((task) => expect(prompt).toContain(`- ${task}`));
      expect(prompt).not.toContain('(ninguna todavía)');
    });

    it.each([
      ['omitted', undefined],
      ['empty', []],
      ['only blank strings', ['', '   ']],
    ])('says there are none yet when recentTasks is %s', async (_label, value) => {
      const parse = resolvingParse(goodTasks);

      const result = await generateDailyTasks({ ...input, recentTasks: value }, fakeClient(parse));

      expect(result).toEqual(expectedTasks);
      expect(parse.mock.calls[0][0].messages[0].content).toContain('(ninguna todavía)');
    });

    it('trims recent tasks and skips blank ones', async () => {
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks(
        { ...input, recentTasks: ['  Escribe una nota.  ', '', 'Camina un rato.'] },
        fakeClient(parse)
      );

      const prompt: string = parse.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('- Escribe una nota.\n- Camina un rato.');
    });

    it('instructs Claude not to repeat them', async () => {
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks({ ...input, recentTasks }, fakeClient(parse));

      expect(parse.mock.calls[0][0].system).toContain('No repitas ninguna');
    });
  });

  describe('daily rotation', () => {
    const goals = ['Meta A', 'Meta B', 'Meta C', 'Meta D', 'Meta E'];

    describe('pickDailyPlan', () => {
      it('is anchored at 1970-01-01: first goal, voice note', () => {
        expect(pickDailyPlan('1970-01-01', goals)).toEqual({
          goal: 'Meta A',
          thirdTask: 'voice_note',
          pendingTask: FIXED_PENDING_TASKS[0],
        });
        expect(pickDailyPlan('1970-01-02', goals)).toEqual({
          goal: 'Meta B',
          thirdTask: 'achievements',
          pendingTask: FIXED_PENDING_TASKS[1],
        });
      });

      it('is deterministic: the same date and goals always give the same plan', () => {
        expect(pickDailyPlan('2026-09-21', goals)).toEqual(pickDailyPlan('2026-09-21', goals));
      });

      it('alternates the third task every day between voice note and achievements', () => {
        const dates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
        const types = dates.map((d) => pickDailyPlan(d, goals).thirdTask);

        expect(types[1]).not.toBe(types[0]);
        expect(types).toEqual([types[0], types[1], types[0], types[1], types[0]]);
        expect(new Set(types)).toEqual(new Set(['voice_note', 'achievements']));
      });

      it('visits every active goal once per cycle, one different goal per day', () => {
        const picked = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map(
          (d) => pickDailyPlan(d, goals).goal
        );

        expect(new Set(picked).size).toBe(goals.length);
        expect([...picked].sort()).toEqual([...goals].sort());
        // Then it starts over with the same goal as 5 days earlier.
        expect(pickDailyPlan('2026-09-26', goals).goal).toBe(picked[0]);
      });

      it('keeps rotating across month and year boundaries', () => {
        const dates = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
        const plans = dates.map((d) => pickDailyPlan(d, goals));
        const index = plans.map((p) => goals.indexOf(p.goal!));

        expect(index[1]).toBe((index[0] + 1) % goals.length);
        expect(index[2]).toBe((index[1] + 1) % goals.length);
        expect(index[3]).toBe((index[2] + 1) % goals.length);
        expect(plans[1].thirdTask).not.toBe(plans[0].thirdTask);
        expect(plans[2].thirdTask).not.toBe(plans[1].thirdTask);
      });

      it('handles a leap day', () => {
        const a = pickDailyPlan('2028-02-28', goals);
        const b = pickDailyPlan('2028-02-29', goals);
        const c = pickDailyPlan('2028-03-01', goals);

        expect(goals.indexOf(b.goal!)).toBe((goals.indexOf(a.goal!) + 1) % goals.length);
        expect(goals.indexOf(c.goal!)).toBe((goals.indexOf(b.goal!) + 1) % goals.length);
      });

      it('uses the only goal every day when there is just one', () => {
        expect(pickDailyPlan('2026-09-21', ['Única']).goal).toBe('Única');
        expect(pickDailyPlan('2026-09-22', ['Única']).goal).toBe('Única');
      });

      it('returns no goal when there are no active goals (or only blank ones)', () => {
        expect(pickDailyPlan('2026-09-21', []).goal).toBeNull();
        expect(pickDailyPlan('2026-09-21', ['', '   ']).goal).toBeNull();
        expect(pickDailyPlan('2026-09-21', []).thirdTask).toMatch(/voice_note|achievements/);
      });

      it.each(['', '21/09/2026', '2026-9-21', '2026-13-01', '2026-02-31', 'hoy'])(
        'throws on the invalid date %j',
        (bad) => {
          expect(() => pickDailyPlan(bad, goals)).toThrow('taskDate inválida');
        }
      );
    });

    it("puts the day's goal and task-3 type in the prompt", async () => {
      const parse = resolvingParse(goodTasks);
      const plan = pickDailyPlan('2026-09-21', input.goals);

      await generateDailyTasks({ ...input, taskDate: '2026-09-21' }, fakeClient(parse));

      const prompt: string = parse.mock.calls[0][0].messages[0].content;
      expect(prompt).toContain('Plan de hoy');
      expect(prompt).toContain(`Acercarla a esta meta: "${plan.goal}"`);
      expect(prompt).toContain(
        plan.thirdTask === 'voice_note' ? 'Nota de voz: que se grabe' : 'Logros: que nombre o anote'
      );
      expect(prompt).toContain(`"${plan.pendingTask}"`);
      expect(prompt).toContain('ya está escrita: no la escribas ni la repitas');
    });

    it('sends a different goal and the other task-3 type on the next day', async () => {
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks({ ...input, taskDate: '2026-09-21' }, fakeClient(parse));
      await generateDailyTasks({ ...input, taskDate: '2026-09-22' }, fakeClient(parse));

      const day1: string = parse.mock.calls[0][0].messages[0].content;
      const day2: string = parse.mock.calls[1][0].messages[0].content;
      const goalLine = (prompt: string) => prompt.split('\n').find((l) => l.startsWith('1. '));
      expect(goalLine(day1)).not.toBe(goalLine(day2));
      expect(day1.includes('Nota de voz: que se grabe')).not.toBe(day2.includes('Nota de voz: que se grabe'));
    });

    it('falls back to the focus area when the user has no active goals', async () => {
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks({ ...input, goals: [] }, fakeClient(parse));

      expect(parse.mock.calls[0][0].messages[0].content).toContain(
        'No tiene metas activas registradas: acércala a su área de enfoque (finanzas)'
      );
    });

    it('tells Claude what each task must be, with no invented details', async () => {
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks(input, fakeClient(parse));

      const system: string = parse.mock.calls[0][0].system;
      expect(system).toContain('Tarea 1');
      expect(system).toContain('ya viene escrita por el sistema');
      expect(system).not.toContain('ELIJA');
      expect(system).toContain('nota de voz');
      expect(system).toContain('logros concretos que ya obtuvo');
      expect(system).toContain('No afirmes cuáles son ni cuándo los logró');
      // Existing rules are still there.
      expect(system).toContain('no supongas que tiene un cliente, un jefe o una pareja');
      expect(system).toContain('Impliquen gastar dinero');
      expect(system).toContain('decisiones de dinero impulsivas o sin revisar información');
      expect(system).toContain('decide sin revisar tu saldo');
    });

    it('returns null without calling Claude when taskDate is invalid', async () => {
      const parse = resolvingParse(goodTasks);

      await expect(
        generateDailyTasks({ ...input, taskDate: '2026-02-31' }, fakeClient(parse))
      ).resolves.toBeNull();
      expect(parse).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('fixed task 2', () => {
    const dayAfter = (date: string, n: number) =>
      new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

    it('has 7 distinct phrases', () => {
      expect(FIXED_PENDING_TASKS).toHaveLength(7);
      expect(new Set(FIXED_PENDING_TASKS).size).toBe(7);
    });

    it.each([...FIXED_PENDING_TASKS])('phrase %j is a short "pick something you have been putting off" ask', (phrase) => {
      expect(phrase.startsWith('Elige algo que hayas estado posponiendo y ')).toBe(true);
      expect(phrase.endsWith('.')).toBe(true);
      expect(phrase.split(/\s+/).length).toBeLessThanOrEqual(20);
      // Never states that the person avoided something, or why.
      expect(phrase).not.toMatch(/evit|llevas|porque|por miedo|por qué/i);
      // A single sentence.
      expect(phrase.slice(0, -1)).not.toMatch(/[.!?]/);
    });

    it('is anchored at 1970-01-01 (first phrase) and advances one phrase per day', () => {
      FIXED_PENDING_TASKS.forEach((phrase, i) => {
        expect(pickDailyPlan(dayAfter('1970-01-01', i), []).pendingTask).toBe(phrase);
      });
    });

    it('uses all 7 phrases over 7 consecutive days, and a different one each day', () => {
      const days = Array.from({ length: 7 }, (_, i) => dayAfter('2026-09-21', i));
      const picked = days.map((d) => pickDailyPlan(d, input.goals).pendingTask);

      expect(new Set(picked).size).toBe(7);
      picked.slice(1).forEach((phrase, i) => expect(phrase).not.toBe(picked[i]));
    });

    it('comes back after exactly 7 days, across month and year boundaries too', () => {
      for (const start of ['2026-09-21', '2026-12-28', '2028-02-25']) {
        for (let i = 0; i < 7; i++) {
          const day = dayAfter(start, i);
          expect(pickDailyPlan(dayAfter(day, 7), []).pendingTask).toBe(pickDailyPlan(day, []).pendingTask);
        }
      }
    });

    it('does not depend on the goals', () => {
      expect(pickDailyPlan('2026-09-21', []).pendingTask).toBe(
        pickDailyPlan('2026-09-21', ['Meta A', 'Meta B']).pendingTask
      );
    });

    it("differs between the two consecutive days of a two-day run", async () => {
      const parse = resolvingParse(goodTasks);

      const day1 = await generateDailyTasks({ ...input, taskDate: '2026-09-21' }, fakeClient(parse));
      const day2 = await generateDailyTasks({ ...input, taskDate: '2026-09-22' }, fakeClient(parse));

      expect(day1![1]).not.toBe(day2![1]);
    });

    it('is not something the model can change: the fixed phrase survives whatever Claude writes', async () => {
      const parse = resolvingParse(['Llama a alguien.', 'Elige algo que hayas evitado por miedo.']);

      const result = await generateDailyTasks(input, fakeClient(parse));

      expect(result![1]).toBe(pickDailyPlan(input.taskDate, input.goals).pendingTask);
    });
  });

  describe('invalid format', () => {
    it('returns null when Claude returns no parsed output', async () => {
      const parse = vi.fn().mockResolvedValue({ parsed_output: null });

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns null when "tasks" is not an array', async () => {
      const parse = resolvingParse('Escribe algo. Llama a alguien. Camina.');

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns null when a task is blank', async () => {
      const parse = resolvingParse([goodTasks[0], '   ']);

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
    });

    it('returns null when a task is not a string', async () => {
      const parse = resolvingParse([goodTasks[0], 42]);

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
    });

    it('returns null when a task leaks raw JSON syntax', async () => {
      const parse = resolvingParse([goodTasks[0], '{"tasks": ["Escribe"]}']);

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
    });

    it('returns null when a task is far longer than one sentence', async () => {
      const parse = resolvingParse([goodTasks[0], 'Escribe ' + 'mucho '.repeat(60)]);

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
    });
  });

  describe('wrong number of tasks', () => {
    it.each([
      ['none', []],
      ['one', goodTasks.slice(0, 1)],
      ['three (it wrote the fixed task too)', [...goodTasks, 'Ordena tu escritorio durante diez minutos.']],
      ['four', [...goodTasks, 'Ordena tu escritorio.', 'Camina diez minutos.']],
    ])('returns null when Claude returns %s', async (_label, tasks) => {
      const parse = resolvingParse(tasks);

      expect(await generateDailyTasks(input, fakeClient(parse))).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('AI error', () => {
    it('returns null instead of throwing when the API call fails', async () => {
      const parse = vi.fn().mockRejectedValue(new Error('500 internal server error'));

      await expect(generateDailyTasks(input, fakeClient(parse))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns null when the SDK cannot parse the structured output', async () => {
      const parse = vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));

      await expect(generateDailyTasks(input, fakeClient(parse))).resolves.toBeNull();
    });

    it('returns null when the call throws synchronously', async () => {
      const parse = vi.fn(() => {
        throw new Error('boom');
      });

      await expect(generateDailyTasks(input, fakeClient(parse))).resolves.toBeNull();
    });
  });

  describe('timeout', () => {
    it('returns null when the SDK reports a timeout', async () => {
      const parse = vi.fn().mockRejectedValue(new Anthropic.APIConnectionTimeoutError());

      await expect(generateDailyTasks(input, fakeClient(parse))).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('gives up at exactly 15s even if the call never settles, and aborts the request', async () => {
      vi.useFakeTimers();
      const parse = vi.fn().mockReturnValue(new Promise(() => {}));
      let result: string[] | null | undefined;
      const pending = generateDailyTasks(input, fakeClient(parse)).then((r) => {
        result = r;
      });

      await vi.advanceTimersByTimeAsync(14_999);
      expect(result).toBeUndefined();

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBeNull();
      expect(parse.mock.calls[0][1].signal.aborted).toBe(true);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('does not leave the deadline timer running after a normal answer', async () => {
      vi.useFakeTimers();
      const parse = resolvingParse(goodTasks);

      await generateDailyTasks(input, fakeClient(parse));

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
