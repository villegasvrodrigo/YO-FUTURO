import type { DayEntry } from '@/lib/historial/day';

// Paging one of Inicio's cards (the message or the insight) through earlier days, each card
// on its own. It starts at the entry Inicio shows (the newest one, never after today), so
// every newer day is one already seen: going forward never needs a read, and it can never go
// past today. Earlier days are read one at a time, one step ahead of the person, so the
// arrow and the swipe answer at once.

export interface DayBrowserState {
  // Newest first; entries[0] is the one Inicio started with.
  entries: DayEntry[];
  // Which entry the card shows.
  index: number;
  // True once a read found nothing earlier than the last entry.
  end: boolean;
  // The last read of an earlier day failed (it is retried when the person asks again).
  failed: boolean;
  // The person asked for the earlier day before it arrived: show it as soon as it does.
  wantOlder: boolean;
  // The person asked for the earlier day and it couldn't be read: a short notice.
  notice: boolean;
}

export type DayBrowserAction =
  | { type: 'older' }
  | { type: 'newer' }
  | { type: 'latest' }
  | { type: 'loaded'; entry: DayEntry | null }
  | { type: 'failed' };

export function initialBrowserState(entry: DayEntry): DayBrowserState {
  return { entries: [entry], index: 0, end: false, failed: false, wantOlder: false, notice: false };
}

export function dayBrowserReducer(state: DayBrowserState, action: DayBrowserAction): DayBrowserState {
  switch (action.type) {
    case 'older':
      if (state.index < state.entries.length - 1) return { ...state, index: state.index + 1, notice: false };
      if (state.end) return state;
      // Not here yet: wait for it (and read it again if the last try failed).
      return { ...state, wantOlder: true, failed: false, notice: false };
    case 'newer':
      return state.index > 0 ? { ...state, index: state.index - 1, notice: false } : state;
    case 'latest':
      return { ...state, index: 0, notice: false };
    case 'loaded': {
      const last = state.entries[state.entries.length - 1];
      // Only an entry really earlier than the last one is added (never a repeat).
      const entry = action.entry && action.entry.date < last.date ? action.entry : null;
      if (!entry) return { ...state, end: true, failed: false, wantOlder: false };
      const entries = [...state.entries, entry];
      return {
        ...state,
        entries,
        index: state.wantOlder ? entries.length - 1 : state.index,
        failed: false,
        wantOlder: false,
      };
    }
    case 'failed':
      return { ...state, failed: true, notice: state.wantOlder, wantOlder: false };
  }
}

/** Whether the earlier day should be read now: the card is on the last entry read so far. */
export function needsOlder(state: DayBrowserState): boolean {
  return state.index === state.entries.length - 1 && !state.end && !state.failed;
}

/** Whether ‹ can go anywhere: an earlier entry already read, or maybe one still to read. */
export function canGoOlder(state: DayBrowserState): boolean {
  return state.index < state.entries.length - 1 || !state.end;
}

// A swipe is a mostly sideways move of at least this many pixels.
const SWIPE_MIN_PX = 50;

/**
 * Which way a finger's move over the card goes: to the right is the earlier day (like
 * turning back a page), to the left the next one. Null for a tap, a short move or a mostly
 * vertical one (scrolling the page).
 */
export function swipeDirection(dx: number, dy: number): 'older' | 'newer' | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'older' : 'newer';
}
