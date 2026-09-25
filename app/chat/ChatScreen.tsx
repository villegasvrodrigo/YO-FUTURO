'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BottomNav, BOTTOM_NAV_SPACE } from '@/app/_components/BottomNav';
import { ChatBox } from './ChatBox';
import {
  ChatMessages,
  CrisisLine,
  DaySeparator,
  LimitGoodbye,
  RemainingNotice,
  dayLabel,
  type ChatBubble,
} from './ChatParts';
import { sendChatRequest } from './sendRequest';
import { fetchEarlierDays } from './historyRequest';
import type { HistoryDay } from '@/app/api/chat/history/readHistory';

/** Whether the device is a phone or tablet (touch screen), where focusing the box opens a keyboard. */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}

/**
 * The conversation with the yo futuro: today's messages, the box to write, and the
 * goodbye once the day's messages are used up. A failed message goes back into the box
 * (nothing the person wrote is lost) with a kind notice next to it.
 *
 * Layout: the screen fills at least the whole window, the conversation takes the free space,
 * and the box sits in a solid strip pinned just above the bottom bar (sticky), so it is always
 * visible and the last message is never under it. Below the strip, a spacer as tall as the bar
 * keeps the end of the page clear of it. On a phone, the bar hides while the box has the focus
 * (the keyboard is open) and comes back when it loses it.
 *
 * Earlier days: when there are any, a "Ver días anteriores" button above today's conversation
 * loads the 7 days with a conversation before the oldest one on screen. They are only shown
 * (the box is always for today) and appear above without moving what is being read: the
 * page is shifted by exactly the height they add. Each day gets its date as a separator.
 */
export function ChatScreen({
  initialMessages,
  initialMessagesLeft,
  loadError,
  today = '',
  hasEarlierDays = false,
}: {
  initialMessages: ChatBubble[];
  initialMessagesLeft: number;
  loadError: string | null;
  // Today in the person's time zone, "YYYY-MM-DD": earlier days are the ones before it.
  today?: string;
  // Whether there is any conversation before today (the button shows only then).
  hasEarlierDays?: boolean;
}) {
  const [messages, setMessages] = useState<ChatBubble[]>(initialMessages);
  const [messagesLeft, setMessagesLeft] = useState(initialMessagesLeft);
  const [locked, setLocked] = useState(initialMessagesLeft <= 0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(loadError);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [earlierDays, setEarlierDays] = useState<HistoryDay[]>([]);
  const [hasMoreDays, setHasMoreDays] = useState(hasEarlierDays);
  const [loadingDays, setLoadingDays] = useState(false);
  const [daysError, setDaysError] = useState<string | null>(null);
  // The page height just before earlier days are added above, to shift the page by exactly
  // what they add (so the message being read stays where it is).
  const heightBeforeDays = useRef<number | null>(null);

  const barSpace = keyboardOpen ? '0px' : BOTTOM_NAV_SPACE;

  // Go down to the real end of the page, so the newest message sits right above the box: when
  // the screen opens, when a message is sent or answered, and when the keyboard opens or closes.
  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [messages.length, sending, locked, keyboardOpen]);

  // Runs right after the earlier days are on the page, before it is painted.
  useLayoutEffect(() => {
    if (heightBeforeDays.current === null) return;
    const added = document.documentElement.scrollHeight - heightBeforeDays.current;
    heightBeforeDays.current = null;
    if (added > 0) window.scrollBy(0, added);
  }, [earlierDays]);

  async function loadEarlierDays() {
    if (loadingDays) return;
    setDaysError(null);
    setLoadingDays(true);
    const before = earlierDays[0]?.date ?? today;
    const outcome = await fetchEarlierDays(before);
    if (outcome.kind === 'ok') {
      heightBeforeDays.current = document.documentElement.scrollHeight;
      setEarlierDays((current) => [...outcome.days, ...current]);
      setHasMoreDays(outcome.hasMore);
    } else {
      setDaysError(outcome.message);
    }
    setLoadingDays(false);
  }

  function handleFocusChange(focused: boolean) {
    setKeyboardOpen(focused && isTouchDevice());
  }

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
    // overflow-anchor: none, so the browser's own scroll anchoring (Chrome) doesn't also shift
    // the page when earlier days are added: the shift is done once, by hand (see above).
    <div className="flex flex-1 flex-col [overflow-anchor:none]">
      <div className="flex-1">
        {hasMoreDays && (
          <div className="mb-4 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={loadEarlierDays}
              disabled={loadingDays}
              className="font-mono text-xs text-mist underline underline-offset-4 transition-colors hover:text-brass disabled:opacity-50"
            >
              {loadingDays ? 'Cargando…' : 'Ver días anteriores'}
            </button>
            {daysError && (
              <p role="alert" className="text-xs text-danger">
                {daysError}
              </p>
            )}
          </div>
        )}
        {earlierDays.map((day) => (
          <section key={day.date} aria-label={dayLabel(day.date, today)}>
            <DaySeparator label={dayLabel(day.date, today)} />
            <ChatMessages messages={day.messages} sending={false} />
          </section>
        ))}
        {(earlierDays.length > 0 || hasEarlierDays || messages.length > 0) && <DaySeparator label="Hoy" />}
        {messages.length === 0 && !locked && (
          <p className="mb-5 text-[15px] leading-relaxed text-mist">
            Escríbele a tu yo futuro sobre tus metas, tus tareas de hoy o lo que te esté frenando.
          </p>
        )}
        <ChatMessages messages={messages} sending={sending} />
        {locked && <LimitGoodbye />}
      </div>

      <div data-chat-composer className="sticky z-20 -mx-6 bg-ink px-6 pb-3 pt-3" style={{ bottom: barSpace }}>
        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        {!locked && <RemainingNotice messagesLeft={messagesLeft} />}
        <ChatBox
          value={input}
          onChange={setInput}
          onSend={send}
          sending={sending}
          locked={locked}
          onFocusChange={handleFocusChange}
        />
        {locked && <CrisisLine />}
      </div>
      {/* Keeps the end of the page clear of the bottom bar. */}
      <div data-chat-bar-space aria-hidden="true" style={{ height: barSpace }} />

      <BottomNav chatEnabled hidden={keyboardOpen} />
    </div>
  );
}
