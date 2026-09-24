import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ChatScreen } from './ChatScreen';
import { LIMIT_GOODBYE } from './ChatParts';

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
});
