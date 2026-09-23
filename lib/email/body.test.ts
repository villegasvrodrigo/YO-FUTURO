import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildEmailText, dashboardLine, siteUrl } from './body';

const MESSAGE = 'Rodrigo, hoy te exijo algo concreto: revisa tus cuentas sin desviar la mirada.';
const TASKS = [
  'Escribe en tu calendario la hora exacta para revisar tu pipeline.',
  'Elige algo que hayas estado posponiendo y avanza hoy una parte pequeña.',
  'Anota tres logros concretos que ya conseguiste este año.',
];
const LINE = 'Marca tus tareas en https://yofuturo.rodrigovillegasvilla.com/dashboard';
const SIG = '— Tu yo futuro';

// Every test starts with SITE_URL unset (empty), so the default address is used unless a
// test sets it on purpose.
beforeEach(() => {
  vi.stubEnv('SITE_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildEmailText — with tasks', () => {
  it('signs the message, then adds the separator, the title, the 3 tasks numbered and the dashboard line', () => {
    expect(buildEmailText(MESSAGE, TASKS)).toBe(
      `${MESSAGE}\n\n${SIG}\n\n· · ·\n\nTus tareas de hoy:\n\n` +
        `1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}\n\n${LINE}`
    );
  });

  it('keeps the message first, the tasks in order and the dashboard line last', () => {
    const text = buildEmailText(MESSAGE, TASKS);

    expect(text.startsWith(MESSAGE)).toBe(true);
    expect(text.indexOf('1. ')).toBeLessThan(text.indexOf('2. '));
    expect(text.indexOf('2. ')).toBeLessThan(text.indexOf('3. '));
    expect(text.indexOf(`3. ${TASKS[2]}`)).toBeLessThan(text.indexOf(LINE));
    expect(text.endsWith(LINE)).toBe(true);
  });

  it('is plain text: no HTML or markdown markup around the tasks or the link', () => {
    const text = buildEmailText(MESSAGE, TASKS);

    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).not.toMatch(/[*_#`[\]()]/);
  });

  it('puts one blank line before the signature even if the message ends with line breaks', () => {
    expect(buildEmailText(`${MESSAGE}\n\n\n`, TASKS)).toContain(`${MESSAGE}\n\n${SIG}\n\n· · ·\n\nTus tareas de hoy:`);
  });

  it('signs right after the message and before the tasks, never with two dashes in a row', () => {
    const text = buildEmailText(MESSAGE, TASKS);

    expect(text.indexOf(SIG)).toBeGreaterThan(text.indexOf(MESSAGE));
    expect(text.indexOf(SIG)).toBeLessThan(text.indexOf('Tus tareas de hoy:'));
    expect(text.split(SIG).length - 1).toBe(1);
    expect(text).not.toMatch(/—\s*\n\s*—/);
  });

  it('with an empty message: no signature, just the tasks and the link', () => {
    expect(buildEmailText('', TASKS)).toBe(
      `· · ·\n\nTus tareas de hoy:\n\n1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}\n\n${LINE}`
    );
  });

  it('keeps a message with its own line breaks intact', () => {
    const multi = 'Primera línea.\n\nSegundo párrafo.\nTercera línea.';

    expect(buildEmailText(multi, TASKS).startsWith(`${multi}\n\n${SIG}`)).toBe(true);
  });

  it('folds line breaks inside a task into spaces, so each task stays on one line', () => {
    const text = buildEmailText(MESSAGE, ['Escribe\nuna nota\r\n  corta.', TASKS[1], TASKS[2]]);

    expect(text).toContain('1. Escribe una nota corta.\n2. ');
  });

  it('skips blank or non-text entries and numbers the rest from 1', () => {
    const text = buildEmailText(MESSAGE, [TASKS[0], '   ', 42 as unknown as string, null as unknown as string, TASKS[1]]);

    expect(text.endsWith(`1. ${TASKS[0]}\n2. ${TASKS[1]}\n\n${LINE}`)).toBe(true);
  });
});

describe('buildEmailText — without tasks it is the signed message plus the dashboard line', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
    ['a list of only blank entries', ['', '   ', '\n']],
    ['something that is not a list', 'Escribe algo.' as unknown as string[]],
  ])('with %s', (_label, tasks) => {
    expect(buildEmailText(MESSAGE, tasks)).toBe(`${MESSAGE}\n\n${SIG}\n\n${LINE}`);
  });

  it('has the signature but no separator and no task title', () => {
    const text = buildEmailText(MESSAGE, null);

    expect(text).toContain(SIG);
    expect(text).not.toContain('· · ·');
    expect(text).not.toContain('Tus tareas de hoy:');
  });

  it.each([
    ['plain text', MESSAGE],
    ['leading whitespace', `   ${MESSAGE}`],
    ['line breaks in the middle', 'Uno.\n\nDos.\r\nTres.'],
    ['emoji and accents', 'Ánimo 💪, ñandú — “sigue”.'],
    ['a message that already contains the separator and the title', 'Hola\n\n—\n\nTus tareas de hoy:\n\n1. algo'],
  ])('keeps the message character for character for a message with %s', (_label, message) => {
    for (const noTasks of [null, undefined, []] as const) {
      expect(buildEmailText(message, noTasks as string[] | null)).toBe(`${message}\n\n${SIG}\n\n${LINE}`);
    }
  });

  it('drops trailing whitespace of the message so there is exactly one blank line before the signature', () => {
    expect(buildEmailText(`${MESSAGE}\n\n  `, null)).toBe(`${MESSAGE}\n\n${SIG}\n\n${LINE}`);
  });

  it.each([
    ['an empty message', ''],
    ['only whitespace', ' \n\t '],
  ])('with %s it is only the dashboard line (no signature under nothing)', (_label, message) => {
    expect(buildEmailText(message, null)).toBe(LINE);
  });
});

describe('the dashboard line always goes out', () => {
  it.each([
    ['3 tasks', TASKS],
    ['1 task', [TASKS[0]]],
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
    ['only blank tasks', ['  ']],
  ])('with %s it is the last line, exactly once', (_label, tasks) => {
    const text = buildEmailText(MESSAGE, tasks);

    expect(text.split('\n').at(-1)).toBe(LINE);
    expect(text.split(LINE).length - 1).toBe(1);
  });
});

describe('siteUrl / dashboardLine', () => {
  it('uses the default address when SITE_URL is not set', () => {
    expect(siteUrl()).toBe('https://yofuturo.rodrigovillegasvilla.com');
    expect(dashboardLine()).toBe(LINE);
  });

  it('uses SITE_URL when it is set', () => {
    vi.stubEnv('SITE_URL', 'https://otro.ejemplo.com');

    expect(dashboardLine()).toBe('Marca tus tareas en https://otro.ejemplo.com/dashboard');
    expect(buildEmailText(MESSAGE, TASKS).endsWith('https://otro.ejemplo.com/dashboard')).toBe(true);
    expect(buildEmailText(MESSAGE, null).endsWith('https://otro.ejemplo.com/dashboard')).toBe(true);
  });

  it('ignores spaces and trailing slashes in SITE_URL', () => {
    vi.stubEnv('SITE_URL', '  https://otro.ejemplo.com//  ');

    expect(dashboardLine()).toBe('Marca tus tareas en https://otro.ejemplo.com/dashboard');
  });

  it.each(['   ', 'no es una url', 'otro.ejemplo.com', 'ftp://otro.ejemplo.com', 'javascript:alert(1)'])(
    'falls back to the default address when SITE_URL is %j',
    (bad) => {
      vi.stubEnv('SITE_URL', bad);

      expect(dashboardLine()).toBe(LINE);
    }
  );
});

describe('buildEmailText — never throws', () => {
  it('does not throw with strange tasks, and the dashboard line is still there', () => {
    const weird: unknown[] = [
      null,
      undefined,
      [],
      [null],
      [undefined, undefined, undefined],
      [{}, [], () => 'x'],
      [Symbol.iterator.toString()],
      ['\u0000', '  '],
      ['x'.repeat(100_000)],
      Object.create(null),
      'texto',
      42,
    ];

    for (const tasks of weird) {
      expect(() => buildEmailText(MESSAGE, tasks as string[] | null)).not.toThrow();
      expect(buildEmailText(MESSAGE, tasks as string[] | null).endsWith(LINE)).toBe(true);
    }
  });

  it('does not throw with strange messages, with or without tasks, and still ends with the line', () => {
    const weird: unknown[] = ['', null, undefined, 42, {}, [], '\n\n\n', '\u0000'];

    for (const message of weird) {
      expect(() => buildEmailText(message as string, TASKS)).not.toThrow();
      expect(() => buildEmailText(message as string, null)).not.toThrow();
      expect(buildEmailText(message as string, TASKS).endsWith(LINE)).toBe(true);
      expect(buildEmailText(message as string, null).endsWith(LINE)).toBe(true);
    }
  });

  it('returns the signed message plus the line if reading the tasks itself blows up', () => {
    const hostile = new Proxy([TASKS[0]], {
      get() {
        throw new Error('boom');
      },
    });

    expect(() => buildEmailText(MESSAGE, hostile)).not.toThrow();
    expect(buildEmailText(MESSAGE, hostile)).toBe(`${MESSAGE}\n\n${SIG}\n\n${LINE}`);
  });

  it('returns the signed message plus the line if a task throws when converted to text', () => {
    const hostileTask = {
      toString() {
        throw new Error('boom');
      },
    };

    expect(buildEmailText(MESSAGE, [hostileTask as unknown as string])).toBe(`${MESSAGE}\n\n${SIG}\n\n${LINE}`);
  });
});
