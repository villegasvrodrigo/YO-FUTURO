import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ChatScreen } from './ChatScreen';
import { LIMIT_GOODBYE } from './ChatParts';
import { BOTTOM_NAV_SPACE } from '@/app/_components/BottomNav';

const escaped = (text: string) => renderToString(<>{text}</>);
const conversation = [
  { role: 'user' as const, content: 'Hola' },
  { role: 'assistant' as const, content: 'Aquí estoy.' },
];

describe('ChatScreen (server render)', () => {
  it("shows today's conversation and an open box", () => {
    const html = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={19} loadError={null} />);

    expect(html).toContain('Aquí estoy.');
    expect(html).not.toContain(escaped(LIMIT_GOODBYE));
    expect(html).not.toContain('Te quedan');
    expect(html).not.toContain('Línea de la Vida');
  });

  it('invites to write when the day starts empty', () => {
    const html = renderToString(<ChatScreen initialMessages={[]} initialMessagesLeft={20} loadError={null} />);

    expect(html).toContain(escaped('Escríbele a tu yo futuro sobre tus metas'));
  });

  it('with 5 or fewer left, says how many remain', () => {
    const html = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={5} loadError={null} />);

    expect(html).toContain('Te quedan 5 mensajes hoy');
  });

  it('with none left, says goodbye, locks the box and shows the support line', () => {
    const html = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={0} loadError={null} />);

    expect(html).toContain(escaped(LIMIT_GOODBYE));
    expect(html).toMatch(/<textarea[^>]*\sdisabled=""/);
    expect(html).toContain(escaped('Línea de la Vida'));
    expect(html).not.toContain('Te quedan');
  });

  it('shows a kind notice when the conversation could not be loaded', () => {
    const html = renderToString(<ChatScreen initialMessages={[]} initialMessagesLeft={20} loadError="No pude cargar la conversación de hoy." />);

    expect(html).toContain('role="alert"');
    expect(html).toContain(escaped('No pude cargar la conversación de hoy.'));
  });

  it('pins the box in a solid strip just above the bottom bar, after the conversation', () => {
    const html = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={19} loadError={null} />);
    const composer = html.slice(html.indexOf('<div data-chat-composer'), html.indexOf('>', html.indexOf('<div data-chat-composer')) + 1);

    expect(composer).toContain('sticky');
    expect(composer).toContain('bg-ink');
    expect(composer).toContain(`bottom:${BOTTOM_NAV_SPACE}`);
    expect(html.indexOf('Aquí estoy.')).toBeLessThan(html.indexOf('data-chat-composer'));
    expect(html.indexOf('data-chat-composer')).toBeLessThan(html.indexOf('<textarea'));
  });

  it('keeps the end of the page clear of the bar, and shows the bar with Chat active', () => {
    const html = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={19} loadError={null} />);

    expect(html).toMatch(new RegExp(`data-chat-bar-space[^>]*height:${BOTTOM_NAV_SPACE.replace(/[()+]/g, '\\$&')}`));
    expect(html).toContain('href="/chat"');
    expect(html.match(/<nav/g)).toHaveLength(1);
  });

  it('keeps the error, the notice and the support line with the box, in the pinned strip', () => {
    const locked = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={0} loadError="Algo falló." />);
    const composerAt = locked.indexOf('data-chat-composer');

    expect(locked.indexOf('role="alert"')).toBeGreaterThan(composerAt);
    expect(locked.indexOf(escaped('Línea de la Vida'))).toBeGreaterThan(composerAt);
    expect(locked.indexOf(escaped(LIMIT_GOODBYE))).toBeLessThan(composerAt);

    const few = renderToString(<ChatScreen initialMessages={conversation} initialMessagesLeft={3} loadError={null} />);
    expect(few.indexOf('Te quedan 3 mensajes hoy')).toBeGreaterThan(few.indexOf('data-chat-composer'));
  });
});
