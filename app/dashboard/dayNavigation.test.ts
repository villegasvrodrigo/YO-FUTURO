import { describe, it, expect } from 'vitest';
import {
  canGoOlder,
  dayBrowserReducer,
  initialBrowserState,
  needsOlder,
  swipeDirection,
  type DayBrowserAction,
  type DayBrowserState,
} from './dayNavigation';

const TODAY = { date: '2026-10-12', content: 'Hoy' };
const D9 = { date: '2026-10-09', content: 'El 9' };
const D5 = { date: '2026-10-05', content: 'El 5' };

const run = (...actions: DayBrowserAction[]): DayBrowserState =>
  actions.reduce(dayBrowserReducer, initialBrowserState(TODAY));
const shown = (state: DayBrowserState) => state.entries[state.index].date;

describe('dayBrowserReducer', () => {
  it('starts on the entry Inicio shows; › is off there and the earlier day is read ahead', () => {
    const state = run();

    expect(shown(state)).toBe('2026-10-12');
    expect(needsOlder(state)).toBe(true);
    expect(canGoOlder(state)).toBe(true);
  });

  it('a read ahead does not move the card; ‹ then shows it at once', () => {
    let state = run({ type: 'loaded', entry: D9 });
    expect(shown(state)).toBe('2026-10-12');

    state = dayBrowserReducer(state, { type: 'older' });
    expect(shown(state)).toBe('2026-10-09');
    // And reads the next earlier one ahead.
    expect(needsOlder(state)).toBe(true);
  });

  it('‹ before the earlier day arrived: shows it as soon as it does', () => {
    let state = run({ type: 'older' });
    expect(shown(state)).toBe('2026-10-12');
    expect(state.wantOlder).toBe(true);

    state = dayBrowserReducer(state, { type: 'loaded', entry: D9 });
    expect(shown(state)).toBe('2026-10-09');
    expect(state.wantOlder).toBe(false);
  });

  it('› and "Volver a hoy" go back through the days already seen, never past the start', () => {
    let state = run({ type: 'loaded', entry: D9 }, { type: 'older' }, { type: 'loaded', entry: D5 }, { type: 'older' });
    expect(shown(state)).toBe('2026-10-05');

    state = dayBrowserReducer(state, { type: 'newer' });
    expect(shown(state)).toBe('2026-10-09');
    state = dayBrowserReducer(state, { type: 'latest' });
    expect(shown(state)).toBe('2026-10-12');
    expect(dayBrowserReducer(state, { type: 'newer' })).toBe(state);
  });

  it('‹ turns off once there is nothing earlier', () => {
    let state = run({ type: 'loaded', entry: D9 }, { type: 'older' }, { type: 'loaded', entry: null });

    expect(shown(state)).toBe('2026-10-09');
    expect(state.end).toBe(true);
    expect(canGoOlder(state)).toBe(false);
    expect(needsOlder(state)).toBe(false);
    expect(dayBrowserReducer(state, { type: 'older' })).toBe(state);

    // Back on a newer day, ‹ works again (that day is already read).
    state = dayBrowserReducer(state, { type: 'newer' });
    expect(canGoOlder(state)).toBe(true);
  });

  it('never adds a repeated or newer day', () => {
    const state = run({ type: 'loaded', entry: TODAY });

    expect(state.entries).toHaveLength(1);
    expect(state.end).toBe(true);
  });

  it('a failed read ahead is silent; asking again reads it again; a failed asked-for read shows the notice', () => {
    let state = run({ type: 'failed' });
    expect(state.notice).toBe(false);
    expect(needsOlder(state)).toBe(false);
    expect(canGoOlder(state)).toBe(true);

    state = dayBrowserReducer(state, { type: 'older' });
    expect(needsOlder(state)).toBe(true);

    state = dayBrowserReducer(state, { type: 'failed' });
    expect(state.notice).toBe(true);
    expect(shown(state)).toBe('2026-10-12');

    state = dayBrowserReducer(state, { type: 'older' });
    expect(state.notice).toBe(false);
  });
});

describe('swipeDirection', () => {
  it.each([
    [80, 5, 'older'],
    [-80, 5, 'newer'],
    // Short, a tap, or mostly vertical (scrolling): nothing.
    [30, 0, null],
    [0, 0, null],
    [80, 70, null],
    [-60, -200, null],
  ])('dx %i, dy %i → %s', (dx, dy, expected) => {
    expect(swipeDirection(dx, dy)).toBe(expected);
  });
});
