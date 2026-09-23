'use client';

import { useLayoutEffect, useRef } from 'react';

// The server rejects any single message longer than this (TranscriptRequestSchema in
// lib/onboarding/extraction.ts). Past it the whole conversation used to get stuck, since
// every later request re-sent that message; the box now simply doesn't let it grow further.
export const MAX_ANSWER_LENGTH = 4000;
// From this length on, a small counter shows how close the answer is to the limit.
export const COUNTER_FROM = 3500;

/**
 * Whether a key press in the answer box sends the answer: Enter sends, Shift+Enter makes a
 * new line, and nothing is sent while a character is still being composed (accents or
 * other keyboards that build a letter in several key presses).
 */
export function shouldSendOnKey(event: { key: string; shiftKey: boolean; isComposing: boolean }): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing;
}

/** The "3,720 / 4,000" counter near the limit, or null while it is still far. */
export function answerCounter(length: number): string | null {
  if (length < COUNTER_FROM) return null;
  return `${length.toLocaleString('es-MX')} / ${MAX_ANSWER_LENGTH.toLocaleString('es-MX')}`;
}

/**
 * The box where the user writes their onboarding answers: it starts one line tall and grows
 * with the text up to about six lines, then scrolls inside. It stays editable while the
 * reply is on its way (disabling it would close the phone keyboard after every message);
 * only sending is blocked. The text is 16px on phones so iPhone Safari doesn't zoom in when
 * it gets focus.
 */
export function AnswerBox({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with the text: measure the content and set the height to it. The CSS max height
  // caps it; past that the box scrolls inside.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${box.scrollHeight}px`;
  }, [value]);

  const counter = answerCounter(value.length);

  return (
    <div>
      <div className="flex items-end gap-2.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_ANSWER_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) {
              e.preventDefault();
              if (!sending) onSend();
            }
          }}
          enterKeyHint="send"
          placeholder="Escribe tu respuesta..."
          aria-label="Tu respuesta"
          className="max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-base leading-6 text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass sm:text-[15px]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sending}
          className="shrink-0 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
      <div className="mt-1.5 flex justify-between gap-3 font-mono text-[11px] text-mist">
        <span className="hidden sm:inline">Enter para enviar · Shift + Enter para otra línea</span>
        {counter && (
          <span role="status" className="ml-auto">
            {counter}
          </span>
        )}
      </div>
    </div>
  );
}
