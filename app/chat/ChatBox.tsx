'use client';

import { useLayoutEffect, useRef } from 'react';
import { shouldSendOnKey } from '@/app/onboarding/AnswerBox';
import { MAX_USER_MESSAGE_LENGTH } from '@/lib/chat/rules';

// From this length on, a small counter shows how close the message is to the limit.
export const COUNTER_FROM = 1800;

/** The "1,850 / 2,000" counter near the limit, or null while it is still far. */
export function messageCounter(length: number): string | null {
  if (length < COUNTER_FROM) return null;
  return `${length.toLocaleString('es-MX')} / ${MAX_USER_MESSAGE_LENGTH.toLocaleString('es-MX')}`;
}

/**
 * The box where the person writes to their yo futuro. Behaves like the onboarding's
 * AnswerBox: it grows with the text up to about six lines, stays editable while the reply is
 * on its way (disabling it would close the phone keyboard after every message; only sending
 * is blocked), and its text is 16px on phones so iPhone Safari doesn't zoom in. Once today's
 * messages are used up (`locked`) it is disabled until the next day. `onFocusChange` says
 * when the box gets or loses the focus (on a phone: when the keyboard opens or closes).
 */
export function ChatBox({
  value,
  onChange,
  onSend,
  sending,
  locked,
  onFocusChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  locked: boolean;
  onFocusChange?: (focused: boolean) => void;
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

  const counter = locked ? null : messageCounter(value.length);

  return (
    <div>
      <div className="flex items-end gap-2.5">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_USER_MESSAGE_LENGTH}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onKeyDown={(e) => {
            if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) {
              e.preventDefault();
              if (!sending && !locked) onSend();
            }
          }}
          enterKeyHint="send"
          placeholder={locked ? 'Seguimos mañana' : 'Escríbele a tu yo futuro...'}
          aria-label="Tu mensaje"
          className="max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-rule bg-dusk-2 px-3.5 py-2.5 text-base leading-6 text-parchment placeholder:text-mist focus:border-brass focus:outline-none focus:ring-1 focus:ring-brass disabled:opacity-50 sm:text-[15px]"
        />
        <button
          type="button"
          onClick={onSend}
          // Tapping "Enviar" must not take the focus from the box: that would close the phone
          // keyboard (and bring the bottom bar back) after every message.
          onMouseDown={(e) => e.preventDefault()}
          disabled={sending || locked}
          className="shrink-0 rounded-lg bg-brass px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brass/90 disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
      {!locked && (
        <div className="mt-1.5 flex justify-between gap-3 font-mono text-[11px] text-mist">
          <span className="hidden sm:inline">Enter para enviar · Shift + Enter para otra línea</span>
          {counter && (
            <span role="status" className="ml-auto">
              {counter}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
