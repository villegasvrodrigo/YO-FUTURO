import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendChatMessage, CHAT_ERRORS } from './sendMessage';
import type { ChatStore, StoredChatMessage } from './store';
import type { ChatReply, ChatReplyInput } from '@/lib/chat/reply';
import { CRISIS_FALLBACK_REPLY } from '@/lib/chat/crisis';
import type { Profile } from '@/lib/types';

const USER = 'user-1';
// 2026-09-25 03:00 UTC is still the evening of Sep 24 in Mexico City.
const NOW = new Date('2026-09-25T03:00:00Z');
const TODAY = '2026-09-24';

const profile: Profile = {
  id: USER,
  name: 'Ana',
  current_age: 34,
  future_self_age: 44,
  values: 'La paz',
  focus_area: 'finanzas',
  tone: 'tierno',
  delivery_hour_local: 8,
  timezone: 'America/Mexico_City',
  onboarding_completed: true,
  current_energy_summary: 'Ansiedad al revisar la cuenta.',
  blocking_pattern: 'Evitar hablar de dinero.',
  future_vision: 'Vivir con calma.',
  created_at: '',
  updated_at: '',
};

// n exchanges already in today's conversation.
function exchanges(n: number, isCrisis = false): StoredChatMessage[] {
  return Array.from({ length: n }, (_, i) => [
    { role: 'user' as const, content: `mensaje ${i + 1}`, is_crisis: isCrisis },
    { role: 'assistant' as const, content: `respuesta ${i + 1}`, is_crisis: isCrisis },
  ]).flat();
}

function fakeStore(overrides: Partial<Record<keyof ChatStore, unknown>> = {}) {
  const store = {
    getProfile: vi.fn().mockResolvedValue(profile),
    getTodaysMessages: vi.fn().mockResolvedValue(exchanges(2)),
    getActiveGoals: vi.fn().mockResolvedValue(['Ahorrar para un año sabático']),
    // Sent at 14:00 UTC on Sep 24 = 08:00 that day in Mexico City: today's email.
    getLatestDailyMessage: vi.fn().mockResolvedValue({ content: 'Ana, hoy da un paso.', generated_at: '2026-09-24T14:00:00Z' }),
    getTasks: vi.fn().mockResolvedValue([{ description: 'Anota tres gastos.', completed: true }]),
    getLastSummary: vi.fn().mockResolvedValue(null),
    saveExchange: vi.fn().mockResolvedValue(undefined),
  };
  for (const [key, value] of Object.entries(overrides)) {
    (store as Record<string, unknown>)[key] = value;
  }
  return store;
}

const reply: ChatReply = {
  reply: 'Un paso pequeño hoy basta.',
  isCrisis: false,
  modelUsed: 'claude-sonnet-5',
  usage: { inputTokens: 40, outputTokens: 60, cacheReadTokens: 2000, cacheWriteTokens: 250 },
};

function send(store: ReturnType<typeof fakeStore>, generate = vi.fn().mockResolvedValue(reply), message: unknown = 'Hoy me cuesta empezar.') {
  return sendChatMessage({ userId: USER, message, now: NOW, store: store as unknown as ChatStore, generate });
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

// Everything written to the logs during the test, as one string.
function allLogs(): string {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join('\n');
}

describe('sendChatMessage — a normal message', () => {
  it('answers, saves both messages on today\'s local date and says how many are left', async () => {
    const store = fakeStore();

    const result = await send(store);

    expect(result).toEqual({
      status: 200,
      body: { reply: 'Un paso pequeño hoy basta.', isCrisis: false, messagesLeft: 17 },
    });
    expect(store.getTodaysMessages).toHaveBeenCalledWith(USER, TODAY);
    expect(store.saveExchange).toHaveBeenCalledWith(USER, TODAY, {
      userMessage: 'Hoy me cuesta empezar.',
      userAt: NOW,
      reply: 'Un paso pequeño hoy basta.',
      replyAt: expect.any(Date),
      isCrisis: false,
      modelUsed: 'claude-sonnet-5',
    });
    const saved = store.saveExchange.mock.calls[0][2];
    expect(saved.replyAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("gives the AI the person's context, today's conversation and the new message", async () => {
    const generate = vi.fn().mockResolvedValue(reply);
    const store = fakeStore();

    await send(store, generate);

    const sent: ChatReplyInput = generate.mock.calls[0][0];
    expect(sent.userMessage).toBe('Hoy me cuesta empezar.');
    expect(sent.history).toEqual(exchanges(2).map(({ role, content }) => ({ role, content })));
    expect(sent.context).toContain('Datos de Ana');
    expect(sent.context).toContain('- Ahorrar para un año sabático');
    expect(sent.context).toContain('Su mensaje de hoy:\nAna, hoy da un paso.');
    expect(sent.context).toContain('- [hecha] Anota tres gastos.');
    expect(store.getTasks).toHaveBeenCalledWith(USER, TODAY);
    expect(store.getLastSummary).toHaveBeenCalledWith(USER, TODAY);
  });

  it('works without a summary of the last conversation (phase 5 not built yet)', async () => {
    const generate = vi.fn().mockResolvedValue(reply);

    const result = await send(fakeStore({ getLastSummary: vi.fn().mockResolvedValue(null) }), generate);

    expect(result.status).toBe(200);
    expect(generate.mock.calls[0][0].context).toContain('(es su primera conversación contigo)');
  });

  it("leaves out an email from another day: it isn't today's", async () => {
    const generate = vi.fn().mockResolvedValue(reply);
    const store = fakeStore({
      getLatestDailyMessage: vi.fn().mockResolvedValue({ content: 'El de ayer.', generated_at: '2026-09-23T14:00:00Z' }),
    });

    await send(store, generate);

    expect(generate.mock.calls[0][0].context).toContain('(todavía no le llega el mensaje de hoy)');
    expect(generate.mock.calls[0][0].context).not.toContain('El de ayer.');
  });

  it('still answers when goals, email, tasks or summary cannot be read', async () => {
    const broken = () => vi.fn().mockRejectedValue(new Error('timeout'));
    const store = fakeStore({
      getActiveGoals: broken(),
      getLatestDailyMessage: broken(),
      getTasks: broken(),
      getLastSummary: broken(),
    });

    const result = await send(store);

    expect(result.status).toBe(200);
    expect(store.saveExchange).toHaveBeenCalled();
  });

  it('uses the fallback time zone when the profile has an invalid one', async () => {
    const store = fakeStore({ getProfile: vi.fn().mockResolvedValue({ ...profile, timezone: 'Not/AZone' }) });

    const result = await send(store);

    expect(result.status).toBe(200);
    expect(store.getTodaysMessages).toHaveBeenCalledWith(USER, TODAY);
  });
});

describe('sendChatMessage — the daily limit', () => {
  it('blocks the 21st message without calling the AI or saving anything', async () => {
    const store = fakeStore({ getTodaysMessages: vi.fn().mockResolvedValue(exchanges(20)) });
    const generate = vi.fn();

    const result = await send(store, generate);

    expect(result).toEqual({
      status: 429,
      body: { error: CHAT_ERRORS.limit_reached, code: 'limit_reached', messagesLeft: 0 },
    });
    expect(generate).not.toHaveBeenCalled();
    expect(store.saveExchange).not.toHaveBeenCalled();
  });

  it('allows the 20th message and then reports 0 left', async () => {
    const store = fakeStore({ getTodaysMessages: vi.fn().mockResolvedValue(exchanges(19)) });

    const result = await send(store);

    expect(result).toMatchObject({ status: 200, body: { messagesLeft: 0 } });
  });

  it("doesn't count crisis messages", async () => {
    const store = fakeStore({ getTodaysMessages: vi.fn().mockResolvedValue([...exchanges(19), ...exchanges(5, true)]) });

    const result = await send(store);

    expect(result).toMatchObject({ status: 200, body: { messagesLeft: 0 } });
  });

  it('a crisis reply leaves the count where it was', async () => {
    const crisis = { ...reply, reply: CRISIS_FALLBACK_REPLY, isCrisis: true };

    const result = await send(fakeStore(), vi.fn().mockResolvedValue(crisis), 'ya no aguanto');

    expect(result).toEqual({ status: 200, body: { reply: CRISIS_FALLBACK_REPLY, isCrisis: true, messagesLeft: 18 } });
  });

  it('never blocks a message with a crisis phrase, even after the limit', async () => {
    const store = fakeStore({ getTodaysMessages: vi.fn().mockResolvedValue(exchanges(20)) });
    const crisis = { ...reply, reply: CRISIS_FALLBACK_REPLY, isCrisis: true };
    const generate = vi.fn().mockResolvedValue(crisis);

    const result = await send(store, generate, 'no quiero vivir');

    expect(result).toMatchObject({ status: 200, body: { isCrisis: true, messagesLeft: 0 } });
    expect(generate).toHaveBeenCalled();
  });
});

describe('sendChatMessage — errors', () => {
  it.each([['empty', '   '], ['not text', 42], ['missing', undefined], ['too long', 'a'.repeat(2001)]])(
    'rejects a %s message before reading anything',
    async (_, message) => {
      const store = fakeStore();

      // Called directly: send() would replace an undefined message with its default one.
      const result = await sendChatMessage({ userId: USER, message, now: NOW, store: store as unknown as ChatStore, generate: vi.fn() });

      expect(result).toMatchObject({ status: 400, body: { code: 'invalid_message' } });
      expect(store.getProfile).not.toHaveBeenCalled();
    }
  );

  it('asks to finish the onboarding when there is no complete profile', async () => {
    for (const found of [null, { ...profile, onboarding_completed: false }]) {
      const generate = vi.fn();
      const result = await send(fakeStore({ getProfile: vi.fn().mockResolvedValue(found) }), generate);

      expect(result).toMatchObject({ status: 403, body: { code: 'onboarding_incomplete' } });
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it("fails clearly when the profile or today's conversation can't be read", async () => {
    for (const overrides of [
      { getProfile: vi.fn().mockRejectedValue(new Error('db down')) },
      { getTodaysMessages: vi.fn().mockRejectedValue(new Error('db down')) },
    ]) {
      const generate = vi.fn();
      const result = await send(fakeStore(overrides), generate);

      expect(result).toMatchObject({ status: 500, body: { code: 'unavailable' } });
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it('saves nothing when the AI fails', async () => {
    const store = fakeStore();

    const result = await send(store, vi.fn().mockRejectedValue(new Error('overloaded')));

    expect(result).toMatchObject({ status: 502, body: { code: 'reply_failed', error: CHAT_ERRORS.reply_failed } });
    expect(store.saveExchange).not.toHaveBeenCalled();
  });

  it('fails clearly when the exchange cannot be saved', async () => {
    const store = fakeStore({ saveExchange: vi.fn().mockRejectedValue(new Error('insert failed')) });

    const result = await send(store);

    expect(result).toMatchObject({ status: 500, body: { code: 'unavailable' } });
  });
});

describe('sendChatMessage — logs', () => {
  it('logs the tokens of the call, cache included', async () => {
    await send(fakeStore());

    expect(logSpy).toHaveBeenCalledWith('[chat] tokens: entrada=40 salida=60 cache_lectura=2000 cache_escritura=250');
  });

  it('says so when no AI call was used', async () => {
    await send(fakeStore(), vi.fn().mockResolvedValue({ ...reply, usage: null }));

    expect(logSpy).toHaveBeenCalledWith('[chat] tokens: ninguno (respuesta fija, sin llamada a la IA)');
  });

  it("never logs the messages, the person's data or their id, even on errors", async () => {
    await send(fakeStore());
    await send(fakeStore({ getActiveGoals: vi.fn().mockRejectedValue(new Error('timeout')) }), vi.fn().mockRejectedValue(new Error('overloaded')));
    await send(fakeStore({ saveExchange: vi.fn().mockRejectedValue(new Error('insert failed')) }));

    const logs = allLogs();
    for (const privateText of ['Hoy me cuesta empezar', 'Un paso pequeño', 'mensaje 1', 'Ana', 'Ahorrar', 'Anota tres gastos', USER]) {
      expect(logs).not.toContain(privateText);
    }
  });
});
