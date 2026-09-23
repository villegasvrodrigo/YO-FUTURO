import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnswerBox, answerCounter, COUNTER_FROM, MAX_ANSWER_LENGTH, shouldSendOnKey } from './AnswerBox';

const noop = () => {};

describe('shouldSendOnKey', () => {
  it('Enter sends', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
  });

  it('Shift+Enter makes a new line instead', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false);
  });

  it('does not send while a character is still being composed (accents, other keyboards)', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
  });

  it.each(['a', ' ', 'Tab', 'Backspace'])('other keys never send (%j)', (key) => {
    expect(shouldSendOnKey({ key, shiftKey: false, isComposing: false })).toBe(false);
  });
});

describe('answerCounter', () => {
  it('shows nothing while the answer is far from the limit', () => {
    expect(answerCounter(0)).toBeNull();
    expect(answerCounter(COUNTER_FROM - 1)).toBeNull();
  });

  it('shows "length / 4,000" near and at the limit', () => {
    expect(answerCounter(3720)).toBe('3,720 / 4,000');
    expect(answerCounter(MAX_ANSWER_LENGTH)).toBe('4,000 / 4,000');
  });

  it('keeps the limit in line with the server (4,000 characters per message)', () => {
    expect(MAX_ANSWER_LENGTH).toBe(4000);
  });
});

describe('AnswerBox (server render)', () => {
  const render = (value: string, sending = false) =>
    renderToString(<AnswerBox value={value} onChange={noop} onSend={noop} sending={sending} />);

  it('is a multi-line box that starts one line tall, capped at 4,000 characters', () => {
    const html = render('');

    expect(html).toContain('<textarea');
    expect(html).toContain('rows="1"');
    expect(html).toContain(`maxLength="${MAX_ANSWER_LENGTH}"`);
    expect(html).toContain('max-h-40');
    expect(html).toContain('enterKeyHint="send"');
  });

  it('uses 16px text on phones, so iPhone Safari does not zoom in', () => {
    expect(render('')).toContain('text-base');
  });

  it('stays editable while the reply is on its way; only the send button is blocked', () => {
    const html = render('Hola', true);

    expect(html).not.toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('shows the counter only near the limit', () => {
    expect(render('x'.repeat(100))).not.toContain('/ 4,000');
    expect(render('x'.repeat(3720))).toContain('3,720 / 4,000');
  });

  it('explains the keys on wider screens', () => {
    expect(render('')).toContain('Enter para enviar · Shift + Enter para otra línea');
  });
});
