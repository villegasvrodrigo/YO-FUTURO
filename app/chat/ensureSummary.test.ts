import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureLastSummary } from './ensureSummary';
import type { ChatStore, StoredChatMessage } from '@/app/api/chat/store';
import { NEUTRAL_SUMMARY, NO_AI_SUMMARY_MODEL, type GeneratedSummary } from '@/lib/chat/summary';

const USER = 'user-1';
const TODAY = '2026-09-24';
// The last conversation was two days ago, not yesterday.
const LAST_DAY = '2026-09-22';

const ordinary: StoredChatMessage[] = [
  { role: 'user', content: 'Hoy no pude revisar mi saldo.', is_crisis: false },
  { role: 'assistant', content: 'Míralo solo un minuto.', is_crisis: false },
];
const crisis: StoredChatMessage[] = [
  { role: 'user', content: 'Ya no quiero vivir.', is_crisis: true },
  { role: 'assistant', content: 'Gracias por contármelo. Línea de la Vida 800 911 2000.', is_crisis: true },
];

const SUMMARY_TEXT = 'Ana habló de su miedo a revisar el saldo y quedó en mirarlo un minuto.';
const generated: GeneratedSummary = {
  content: SUMMARY_TEXT,
  modelUsed: 'claude-sonnet-5',
  usage: { inputTokens: 900, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 },
};

function fakeStore(messages: StoredChatMessage[], overrides: Partial<Record<keyof ChatStore, unknown>> = {}) {
  const store = {
    getLastConversationDay: vi.fn().mockResolvedValue(LAST_DAY),
    hasSummary: vi.fn().mockResolvedValue(false),
    getTodaysMessages: vi.fn().mockResolvedValue(messages),
    getProfile: vi.fn().mockResolvedValue({ name: 'Ana' }),
    saveSummary: vi.fn().mockResolvedValue(undefined),
  };
  Object.assign(store, overrides);
  return store;
}

function run(store: ReturnType<typeof fakeStore>, summarize = vi.fn().mockResolvedValue(generated)) {
  return ensureLastSummary({ userId: USER, today: TODAY, store: store as unknown as ChatStore, summarize });
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureLastSummary', () => {
  it('summarizes the last conversation, even if it was not yesterday, and saves it', async () => {
    const store = fakeStore(ordinary);
    const summarize = vi.fn().mockResolvedValue(generated);

    await run(store, summarize);

    expect(store.getLastConversationDay).toHaveBeenCalledWith(USER, TODAY);
    expect(store.getTodaysMessages).toHaveBeenCalledWith(USER, LAST_DAY);
    expect(summarize).toHaveBeenCalledWith({ name: 'Ana', date: LAST_DAY, messages: ordinary });
    expect(store.saveSummary).toHaveBeenCalledWith(USER, LAST_DAY, {
      content: SUMMARY_TEXT,
      hadCrisis: false,
      modelUsed: 'claude-sonnet-5',
    });
  });

  it('does nothing when there was no earlier conversation', async () => {
    const store = fakeStore(ordinary, { getLastConversationDay: vi.fn().mockResolvedValue(null) });
    const summarize = vi.fn();

    await run(store, summarize);

    expect(summarize).not.toHaveBeenCalled();
    expect(store.saveSummary).not.toHaveBeenCalled();
  });

  it('does nothing when that conversation already has its summary', async () => {
    const store = fakeStore(ordinary, { hasSummary: vi.fn().mockResolvedValue(true) });
    const summarize = vi.fn();

    await run(store, summarize);

    expect(summarize).not.toHaveBeenCalled();
    expect(store.saveSummary).not.toHaveBeenCalled();
  });

  it('after a crisis: the AI never sees the crisis messages, and the summary is marked had_crisis', async () => {
    const store = fakeStore([...ordinary, ...crisis]);
    const summarize = vi.fn().mockResolvedValue(generated);

    await run(store, summarize);

    expect(summarize.mock.calls[0][0].messages).toEqual(ordinary);
    expect(store.saveSummary).toHaveBeenCalledWith(USER, LAST_DAY, expect.objectContaining({ hadCrisis: true }));
  });

  it('a conversation that was all crisis gets the neutral summary, without calling the AI', async () => {
    const store = fakeStore(crisis);
    const summarize = vi.fn();

    await run(store, summarize);

    expect(summarize).not.toHaveBeenCalled();
    expect(store.saveSummary).toHaveBeenCalledWith(USER, LAST_DAY, {
      content: NEUTRAL_SUMMARY,
      hadCrisis: true,
      modelUsed: NO_AI_SUMMARY_MODEL,
    });
  });

  it('never keeps a summary that names a crisis: the neutral one is saved instead', async () => {
    const store = fakeStore(ordinary);

    await run(store, vi.fn().mockResolvedValue({ ...generated, content: 'Ana dijo que no quiere vivir así.' }));

    expect(store.saveSummary).toHaveBeenCalledWith(USER, LAST_DAY, expect.objectContaining({ content: NEUTRAL_SUMMARY }));
  });

  it('when the AI fails: saves nothing and never throws', async () => {
    const store = fakeStore(ordinary);

    await expect(run(store, vi.fn().mockRejectedValue(new Error('overloaded')))).resolves.toBeUndefined();

    expect(store.saveSummary).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[chat-resumen] sin resumen: Error: overloaded');
  });

  it('never throws when the database fails', async () => {
    for (const overrides of [
      { getLastConversationDay: vi.fn().mockRejectedValue(new Error('db down')) },
      { saveSummary: vi.fn().mockRejectedValue(new Error('insert failed')) },
    ]) {
      await expect(run(fakeStore(ordinary, overrides))).resolves.toBeUndefined();
    }
  });

  it('logs the tokens, and never the conversation, the summary, the name or the id', async () => {
    await run(fakeStore(ordinary));
    await run(fakeStore([...ordinary, ...crisis]), vi.fn().mockRejectedValue(new Error('overloaded')));

    expect(logSpy).toHaveBeenCalledWith('[chat-resumen] tokens: entrada=900 salida=120 cache_lectura=0 cache_escritura=0');
    const logs = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
    for (const privateText of ['saldo', 'Míralo', 'no quiero vivir', 'Ana', USER]) {
      expect(logs).not.toContain(privateText);
    }
  });
});
