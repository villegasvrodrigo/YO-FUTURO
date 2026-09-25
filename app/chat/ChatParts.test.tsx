import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  ChatMessages,
  ChatNotAvailable,
  CrisisLine,
  DaySeparator,
  dayLabel,
  LimitGoodbye,
  RemainingNotice,
  remainingNotice,
  LIMIT_GOODBYE,
} from './ChatParts';

// renderToString escapes accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);

describe('remainingNotice', () => {
  it('stays hidden while more than 5 messages are left', () => {
    expect(remainingNotice(20)).toBeNull();
    expect(remainingNotice(6)).toBeNull();
  });

  it('shows from 5 down to 1', () => {
    expect(remainingNotice(5)).toBe('Te quedan 5 mensajes hoy');
    expect(remainingNotice(2)).toBe('Te quedan 2 mensajes hoy');
    expect(remainingNotice(1)).toBe('Te queda 1 mensaje hoy');
  });

  it('stays hidden at 0 (the goodbye takes over)', () => {
    expect(remainingNotice(0)).toBeNull();
  });

  it('renders only when there is something to say', () => {
    expect(renderToString(<RemainingNotice messagesLeft={3} />)).toContain('Te quedan 3 mensajes hoy');
    expect(renderToString(<RemainingNotice messagesLeft={12} />)).toBe('');
  });
});

describe('ChatMessages', () => {
  const messages = [
    { role: 'user' as const, content: 'Hoy me cuesta empezar.' },
    { role: 'assistant' as const, content: 'Un paso pequeño basta.' },
  ];

  it("tells the person's messages and the yo futuro's apart", () => {
    const html = renderToString(<ChatMessages messages={messages} sending={false} />);

    expect(html).toMatch(/ml-8[^>]*bg-brass\/10[^>]*><span class="sr-only">Tú: <\/span>Hoy me cuesta empezar\./);
    expect(html).toMatch(/bg-dusk-2[^>]*>Un paso pequeño basta\./);
  });

  it('labels each of the yo futuro\'s messages, above the bubble, in small gold letters; the person\'s have no label', () => {
    const html = renderToString(<ChatMessages messages={[...messages, messages[1]]} sending={false} />);

    expect(html.match(/>Tu yo futuro<\/p>/g)).toHaveLength(2);
    expect(html).toMatch(/<p class="[^"]*font-mono[^"]*text-\[10px\][^"]*uppercase[^"]*text-brass[^"]*">Tu yo futuro<\/p><div[^>]*>Un paso pequeño basta\./);
    expect(html.indexOf('Tu yo futuro</p>')).toBeGreaterThan(html.indexOf('Hoy me cuesta empezar.'));
  });

  it('keeps the line breaks of a reply', () => {
    const html = renderToString(<ChatMessages messages={messages} sending={false} />);

    expect(html).toContain('whitespace-pre-line');
  });

  it('shows the yo futuro writing while a reply is on its way', () => {
    expect(renderToString(<ChatMessages messages={messages} sending />)).toContain(escaped('Tu yo futuro está escribiendo…'));
    expect(renderToString(<ChatMessages messages={messages} sending={false} />)).not.toContain('escribiendo');
  });
});

describe('the end of the day', () => {
  it('says goodbye warmly', () => {
    expect(renderToString(<LimitGoodbye />)).toContain(escaped(LIMIT_GOODBYE));
    expect(LIMIT_GOODBYE).toContain('Seguimos mañana');
  });

  it('shows the support line with both numbers, callable from the phone', () => {
    const html = renderToString(<CrisisLine />);
    const text = html.replace(/<[^>]+>/g, '').replace(/<!-- -->/g, '');

    expect(text).toBe(renderToString(<>{'Si estás pasando por un momento difícil: Línea de la Vida 800 911 2000 o 911'}</>));
    expect(html).toContain('href="tel:8009112000"');
    expect(html).toContain('href="tel:911"');
  });
});

describe('ChatNotAvailable', () => {
  it('kindly says the chat is not available yet and leads back home', () => {
    const html = renderToString(<ChatNotAvailable />);

    expect(html).toContain(escaped('El chat con tu yo futuro todavía no está disponible.'));
    expect(html).toContain('href="/dashboard"');
  });
});

describe('dayLabel', () => {
  const today = '2026-09-25';

  it('names today and yesterday', () => {
    expect(dayLabel('2026-09-25', today)).toBe('Hoy');
    expect(dayLabel('2026-09-24', today)).toBe('Ayer');
  });

  it('names older days by weekday and date', () => {
    expect(dayLabel('2026-09-23', today)).toBe('miércoles 23 de septiembre');
    expect(dayLabel('2026-08-31', today)).toBe('lunes 31 de agosto');
  });

  it('adds the year for a day of another year', () => {
    expect(dayLabel('2025-12-31', '2026-01-02')).toBe('miércoles 31 de diciembre de 2025');
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Ayer');
  });

  it('renders as a labelled separator', () => {
    const html = renderToString(<DaySeparator label="Ayer" />);

    expect(html).toContain('role="separator"');
    expect(html).toContain('>Ayer<');
  });
});

