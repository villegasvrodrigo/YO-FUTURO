'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatBox } from './ChatBox';
import { ChatMessages, CrisisLine, LimitGoodbye, RemainingNotice, type ChatBubble } from './ChatParts';
import { sendChatRequest } from './sendRequest';

/**
 * The conversation with the yo futuro: today's messages, the box to write, and the
 * goodbye once the day's messages are used up. A failed message goes back into the box
 * (nothing the person wrote is lost) with a kind notice next to it.
 */
export function ChatScreen({
  initialMessages,
  initialMessagesLeft,
  loadError,
}: {
  initialMessages: ChatBubble[];
  initialMessagesLeft: number;
  loadError: string | null;
}) {
  const [messages, setMessages] = useState<ChatBubble[]>(initialMessages);
  const [messagesLeft, setMessagesLeft] = useState(initialMessagesLeft);
  const [locked, setLocked] = useState(initialMessagesLeft <= 0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  // Bottom of the screen (just under the box).
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the latest message and the box in view, as in the onboarding conversation.
  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, sending, locked]);

  async function send() {
    const message = input.trim();
    if (!message || sending || locked) return;

    setError(null);
    setSending(true);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setInput('');

    const outcome = await sendChatRequest(message);

    if (outcome.kind === 'reply') {
      setMessages((current) => [...current, { role: 'assistant', content: outcome.reply }]);
      setMessagesLeft(outcome.messagesLeft);
      if (outcome.messagesLeft <= 0) setLocked(true);
    } else {
      // Not sent: take the message back out of the conversation and return it to the box,
      // ahead of anything typed while waiting.
      setMessages((current) => current.slice(0, -1));
      setInput((current) => (current.trim() ? `${message}\n${current}` : message));
      if (outcome.kind === 'limit') {
        setMessagesLeft(0);
        setLocked(true);
      } else {
        setError(outcome.message);
      }
    }
    setSending(false);
  }

  return (
    <>
      {messages.length === 0 && !locked && (
        <p className="mb-5 text-[15px] leading-relaxed text-mist">
          Escríbele a tu yo futuro sobre tus metas, tus tareas de hoy o lo que te esté frenando.
        </p>
      )}
      <ChatMessages messages={messages} sending={sending} />
      {locked && <LimitGoodbye />}
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {!locked && <RemainingNotice messagesLeft={messagesLeft} />}
      <ChatBox value={input} onChange={setInput} onSend={send} sending={sending} locked={locked} />
      {locked && <CrisisLine />}
      <div ref={endRef} />
    </>
  );
}
