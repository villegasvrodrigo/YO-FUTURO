import { describe, it, expect } from 'vitest';
import { buildEmailText } from './body';

const MESSAGE = 'Rodrigo, hoy te exijo algo concreto: revisa tus cuentas sin desviar la mirada.';
const TASKS = [
  'Escribe en tu calendario la hora exacta para revisar tu pipeline.',
  'Elige algo que hayas estado posponiendo y avanza hoy una parte pequeña.',
  'Anota tres logros concretos que ya conseguiste este año.',
];

describe('buildEmailText — with tasks', () => {
  it('adds the separator, the title and the 3 tasks numbered, in plain text', () => {
    expect(buildEmailText(MESSAGE, TASKS)).toBe(
      `${MESSAGE}\n\n—\n\nTus tareas de hoy:\n\n` +
        `1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}`
    );
  });

  it('keeps the message first and the tasks in order', () => {
    const text = buildEmailText(MESSAGE, TASKS);

    expect(text.startsWith(MESSAGE)).toBe(true);
    expect(text.indexOf('1. ')).toBeLessThan(text.indexOf('2. '));
    expect(text.indexOf('2. ')).toBeLessThan(text.indexOf('3. '));
  });

  it('is plain text: no HTML or markdown markup around the tasks', () => {
    const text = buildEmailText(MESSAGE, TASKS);

    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toMatch(/[*_#`]/);
  });

  it('puts one blank line before the separator even if the message ends with line breaks', () => {
    expect(buildEmailText(`${MESSAGE}\n\n\n`, TASKS)).toContain(`${MESSAGE}\n\n—\n\nTus tareas de hoy:`);
  });

  it('keeps a message with its own line breaks intact', () => {
    const multi = 'Primera línea.\n\nSegundo párrafo.\nTercera línea.';

    expect(buildEmailText(multi, TASKS).startsWith(`${multi}\n\n—`)).toBe(true);
  });

  it('folds line breaks inside a task into spaces, so each task stays on one line', () => {
    const text = buildEmailText(MESSAGE, ['Escribe\nuna nota\r\n  corta.', TASKS[1], TASKS[2]]);

    expect(text).toContain('1. Escribe una nota corta.\n2. ');
  });

  it('skips blank or non-text entries and numbers the rest from 1', () => {
    const text = buildEmailText(MESSAGE, [TASKS[0], '   ', 42 as unknown as string, null as unknown as string, TASKS[1]]);

    expect(text.endsWith(`1. ${TASKS[0]}\n2. ${TASKS[1]}`)).toBe(true);
  });
});

describe('buildEmailText — without tasks it returns the message unchanged', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
    ['a list of only blank entries', ['', '   ', '\n']],
    ['something that is not a list', 'Escribe algo.' as unknown as string[]],
  ])('with %s', (_label, tasks) => {
    expect(buildEmailText(MESSAGE, tasks)).toBe(MESSAGE);
  });

  it.each([
    ['plain text', MESSAGE],
    ['trailing line breaks and spaces', `${MESSAGE}\n\n  `],
    ['leading whitespace', `   ${MESSAGE}`],
    ['line breaks in the middle', 'Uno.\n\nDos.\r\nTres.'],
    ['an empty message', ''],
    ['only whitespace', ' \n\t '],
    ['emoji and accents', 'Ánimo 💪, ñandú — “sigue”.'],
    ['a message that already contains the separator and the title', 'Hola\n\n—\n\nTus tareas de hoy:\n\n1. algo'],
  ])('is character-for-character identical for a message with %s', (_label, message) => {
    for (const noTasks of [null, undefined, []] as const) {
      const result = buildEmailText(message, noTasks as string[] | null);

      expect(result).toBe(message);
      expect(result.length).toBe(message.length);
    }
  });
});

describe('buildEmailText — never throws', () => {
  it('does not throw with strange tasks', () => {
    const weird: unknown[] = [
      null,
      undefined,
      [],
      [null],
      [undefined, undefined, undefined],
      [{}, [], () => 'x'],
      [Symbol.iterator.toString()],
      ['\u0000', '  '],
      ['x'.repeat(100_000)],
      Object.create(null),
      'texto',
      42,
    ];

    for (const tasks of weird) {
      expect(() => buildEmailText(MESSAGE, tasks as string[] | null)).not.toThrow();
    }
  });

  it('does not throw with strange messages, with or without tasks', () => {
    const weird: unknown[] = ['', null, undefined, 42, {}, [], '\n\n\n', '\u0000'];

    for (const message of weird) {
      expect(() => buildEmailText(message as string, TASKS)).not.toThrow();
      expect(() => buildEmailText(message as string, null)).not.toThrow();
    }
  });

  it('returns the message unchanged if reading the tasks itself blows up', () => {
    const hostile = new Proxy([TASKS[0]], {
      get() {
        throw new Error('boom');
      },
    });

    expect(() => buildEmailText(MESSAGE, hostile)).not.toThrow();
    expect(buildEmailText(MESSAGE, hostile)).toBe(MESSAGE);
  });

  it('returns the message unchanged if a task throws when converted to text', () => {
    const hostileTask = {
      toString() {
        throw new Error('boom');
      },
    };

    expect(buildEmailText(MESSAGE, [hostileTask as unknown as string])).toBe(MESSAGE);
  });
});
