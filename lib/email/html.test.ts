import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildEmailHtml, escapeHtml, messageParagraphs } from './html';
import { buildEmailText, siteUrl } from './body';

// 2026-10-01 15:00 UTC is Thursday Oct 1, 09:00 in Mexico City.
const NOW = new Date('2026-10-01T15:00:00Z');
const TZ = 'America/Mexico_City';
const MESSAGE =
  'Carlos, hoy quiero decirte algo distinto: deja de medir tu avance en picos.\n\nHoy no necesitas resolverlo todo. Solo da el paso que te toca.';
const TASKS = [
  'Haz una sola acción de trabajo ahora mismo, antes de pensarla de más.',
  'Elige algo que hayas estado posponiendo y dale 10 minutos sin distracciones.',
  'Anota tres avances concretos que ya conseguiste este mes.',
];

const html = (content = MESSAGE, tasks: string[] | null = TASKS, tz = TZ) => buildEmailHtml(content, tasks, NOW, tz) ?? '';
const count = (text: string, part: string) => text.split(part).length - 1;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildEmailHtml', () => {
  it('has the header with the day, the message, the signature, the 3 tasks and the button', () => {
    const out = html();

    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out).toContain('>Tu mensaje de hoy</h1>');
    expect(out).toContain('>jueves 1 de octubre</p>');
    expect(out).toContain('Carlos, hoy quiero decirte algo distinto: deja de medir tu avance en picos.');
    expect(out).toContain('— Tu yo futuro');
    for (const task of TASKS) expect(out).toContain(`>${task}</a>`);
    expect(out).toContain('>Ir a mi dashboard</a>');
    expect(out).toContain('Toca una tarea para marcarla en tu dashboard.');
  });

  it('sends the tasks and the button to the real dashboard, and the footer to the privacy notice', () => {
    const out = html();

    // 3 tasks x (box + text) + the button.
    expect(count(out, `href="${siteUrl()}/dashboard"`)).toBe(7);
    expect(out).toContain(`href="${siteUrl()}/privacidad"`);
  });

  it('uses SITE_URL for the links when it is set', () => {
    vi.stubEnv('SITE_URL', 'https://otra.ejemplo.com/');

    expect(html()).toContain('href="https://otra.ejemplo.com/dashboard"');
  });

  it('turns blank lines into paragraphs and single line breaks into line breaks', () => {
    const out = html('Primer párrafo.\n\nSegundo, línea uno.\nSegundo, línea dos.');

    expect(count(out, '<p class="message"')).toBe(2);
    expect(out).toContain('>Primer párrafo.</p>');
    expect(out).toContain('>Segundo, línea uno.<br>Segundo, línea dos.</p>');
  });

  it('escapes symbols so they never break the HTML', () => {
    const out = html('Ahorro & calma <script>alert("x")</script> 5 > 3', ['Revisa <b>todo</b> & anota "tres" cosas']);

    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<b>');
    expect(out).toContain('Ahorro &amp; calma &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 5 &gt; 3');
    expect(out).toContain('Revisa &lt;b&gt;todo&lt;/b&gt; &amp; anota &quot;tres&quot; cosas');
  });

  it.each([
    ['null', null],
    ['an empty list', []],
    ['only blank tasks', ['  ', '']],
  ])('with %s for tasks, the whole tasks block is gone (the button stays)', (_, tasks) => {
    const out = html(MESSAGE, tasks);

    expect(out).not.toContain('Tus tareas de hoy');
    expect(out).not.toContain('data-tasks');
    expect(out).not.toContain('Toca una tarea');
    expect(out).not.toContain('#dccbaa');
    expect(out).toContain('>Ir a mi dashboard</a>');
  });

  it('leaves the date out, without failing, when the time zone is invalid', () => {
    const out = html(MESSAGE, TASKS, 'Not/AZone');

    expect(out).toContain('>Tu mensaje de hoy</h1>');
    expect(out).not.toContain('octubre');
  });

  it('returns null (the email goes out as plain text) when there is no message', () => {
    expect(buildEmailHtml('   ', TASKS, NOW, TZ)).toBeNull();
  });

  it('starts the inbox preview line with the message', () => {
    expect(html()).toMatch(/<div style="display:none;[^"]*">Carlos, hoy quiero decirte algo distinto/);
  });
});

describe('the plain-text version stays exactly as it was', () => {
  it('same text as before, with and without tasks', () => {
    expect(buildEmailText(MESSAGE, TASKS)).toBe(
      `${MESSAGE}\n\n— Tu yo futuro\n\n· · ·\n\nTus tareas de hoy:\n\n1. ${TASKS[0]}\n2. ${TASKS[1]}\n3. ${TASKS[2]}\n\nMarca tus tareas en ${siteUrl()}/dashboard`
    );
    expect(buildEmailText(MESSAGE, null)).toBe(`${MESSAGE}\n\n— Tu yo futuro\n\nMarca tus tareas en ${siteUrl()}/dashboard`);
  });
});

describe('helpers', () => {
  it('escapeHtml escapes & < > " and \'', () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &#39; f');
  });

  it('messageParagraphs drops empty paragraphs and handles Windows line breaks', () => {
    expect(messageParagraphs('Uno.\r\n\r\n\r\nDos.\n\n   \n\nTres.')).toEqual(['Uno.', 'Dos.', 'Tres.']);
  });
});
