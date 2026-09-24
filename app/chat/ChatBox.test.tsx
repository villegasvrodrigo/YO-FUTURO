import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ChatBox, messageCounter } from './ChatBox';

const noop = () => {};
const render = (props: { sending?: boolean; locked?: boolean; value?: string } = {}) =>
  renderToString(
    <ChatBox value={props.value ?? ''} onChange={noop} onSend={noop} sending={props.sending ?? false} locked={props.locked ?? false} />
  );

const textareaTag = (html: string) => html.slice(html.indexOf('<textarea'), html.indexOf('>', html.indexOf('<textarea')) + 1);
const buttonTag = (html: string) => html.slice(html.indexOf('<button'), html.indexOf('>', html.indexOf('<button')) + 1);

describe('ChatBox', () => {
  it('starts one line tall, allows 2,000 characters and uses 16px text on phones (no iPhone zoom)', () => {
    const textarea = textareaTag(render());

    expect(textarea).toContain('rows="1"');
    expect(textarea).toContain('maxLength="2000"');
    expect(textarea).toContain('text-base');
  });

  it('while a reply is on its way, only the button is disabled: the box stays usable (keyboard stays open)', () => {
    const html = render({ sending: true });

    expect(textareaTag(html)).not.toContain('disabled=""');
    expect(buttonTag(html)).toContain('disabled=""');
  });

  it('once the day is over, the box and the button are locked', () => {
    const html = render({ locked: true });

    expect(textareaTag(html)).toContain('disabled=""');
    expect(textareaTag(html)).toContain(renderToString(<>{'Seguimos mañana'}</>));
    expect(buttonTag(html)).toContain('disabled=""');
  });

  it('shows the counter only near the limit', () => {
    expect(messageCounter(1799)).toBeNull();
    expect(messageCounter(1850)).toBe(`${(1850).toLocaleString('es-MX')} / ${(2000).toLocaleString('es-MX')}`);
  });
});
