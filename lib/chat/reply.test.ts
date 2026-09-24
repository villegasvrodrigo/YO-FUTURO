import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildChatMessages,
  generateChatReply,
  CHAT_MODEL,
  FIXED_CRISIS_REPLY_MODEL,
  type ChatReplyInput,
} from './reply';
import { CRISIS_FALLBACK_REPLY, CRISIS_RESOURCES_TEXT } from './crisis';
import { CHAT_INSTRUCTIONS } from './prompt';

function fakeClient(parse: ReturnType<typeof vi.fn>) {
  return { messages: { parse } } as unknown as Anthropic;
}

const usage = {
  input_tokens: 40,
  output_tokens: 60,
  cache_read_input_tokens: 2000,
  cache_creation_input_tokens: 250,
};

function answering(respuesta: string, crisis = false) {
  return vi.fn().mockResolvedValue({ parsed_output: { respuesta, crisis }, usage });
}

const input: ChatReplyInput = {
  context: 'Datos de Ana\nHoy tiene 34 años; tú le hablas desde los 44.',
  history: [
    { role: 'user', content: 'Hola, hoy me cuesta empezar.' },
    { role: 'assistant', content: 'Te entiendo. ¿Cuál es la tarea más pequeña de hoy?' },
  ],
  userMessage: 'La nota de voz, pero me da pena.',
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildChatMessages', () => {
  it("puts the new message after today's conversation", () => {
    expect(buildChatMessages(input.history, input.userMessage)).toEqual([
      { role: 'user', content: 'Hola, hoy me cuesta empezar.' },
      { role: 'assistant', content: 'Te entiendo. ¿Cuál es la tarea más pequeña de hoy?' },
      { role: 'user', content: 'La nota de voz, pero me da pena.' },
    ]);
  });

  it('starts a new day with just the new message', () => {
    expect(buildChatMessages([], 'Hola')).toEqual([{ role: 'user', content: 'Hola' }]);
  });

  it('joins two messages in a row from the same side, so turns always alternate', () => {
    const history = [
      { role: 'user' as const, content: 'Primero esto.' },
      { role: 'user' as const, content: 'Y luego esto.' },
    ];

    expect(buildChatMessages(history, 'Y esto también.')).toEqual([
      { role: 'user', content: 'Primero esto.\n\nY luego esto.\n\nY esto también.' },
    ]);
  });

  it("drops replies before the person's first message and empty turns", () => {
    const history = [
      { role: 'assistant' as const, content: 'Respuesta suelta' },
      { role: 'user' as const, content: '   ' },
    ];

    expect(buildChatMessages(history, 'Hola')).toEqual([{ role: 'user', content: 'Hola' }]);
  });
});

describe('generateChatReply', () => {
  it('returns the reply with the model and the token usage', async () => {
    const parse = answering('  Esa pena es normal. Grábala solo para ti, un minuto.  ');

    const result = await generateChatReply(input, fakeClient(parse));

    expect(result).toEqual({
      reply: 'Esa pena es normal. Grábala solo para ti, un minuto.',
      isCrisis: false,
      modelUsed: CHAT_MODEL,
      usage: { inputTokens: 40, outputTokens: 60, cacheReadTokens: 2000, cacheWriteTokens: 250 },
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sends the instructions, then the cached context, and caches the conversation too', async () => {
    const parse = answering('Vamos paso a paso.');

    await generateChatReply(input, fakeClient(parse));

    const request = parse.mock.calls[0][0];
    expect(request.model).toBe('claude-sonnet-5');
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.system).toEqual([
      { type: 'text', text: CHAT_INSTRUCTIONS },
      { type: 'text', text: input.context, cache_control: { type: 'ephemeral' } },
    ]);
    expect(request.cache_control).toEqual({ type: 'ephemeral' });
    expect(request.messages).toEqual(buildChatMessages(input.history, input.userMessage));
    expect(parse.mock.calls[0][1]).toMatchObject({ maxRetries: 1 });
  });

  it('a crisis flagged by the model always carries both numbers', async () => {
    const parse = answering('Gracias por contármelo. No estás a solas.', true);

    const result = await generateChatReply({ ...input, userMessage: 'ya no puedo más' }, fakeClient(parse));

    expect(result.isCrisis).toBe(true);
    expect(result.reply).toBe(`Gracias por contármelo. No estás a solas.\n\n${CRISIS_RESOURCES_TEXT}`);
  });

  it('a crisis phrase the model missed gets the fixed crisis reply', async () => {
    const parse = answering('¡Vamos con la tarea de hoy!', false);

    const result = await generateChatReply({ ...input, userMessage: 'no quiero vivir' }, fakeClient(parse));

    expect(result).toMatchObject({ reply: CRISIS_FALLBACK_REPLY, isCrisis: true, modelUsed: CHAT_MODEL });
  });

  it.each([
    ['empty', '   '],
    ['leaked JSON', '{"respuesta": "hola"}'],
    ['too long', 'palabra '.repeat(300)],
  ])('throws on an unusable (%s) reply', async (_, respuesta) => {
    await expect(generateChatReply(input, fakeClient(answering(respuesta)))).rejects.toThrow('formato inválido');
  });

  it('throws when there is no structured answer', async () => {
    const parse = vi.fn().mockResolvedValue({ parsed_output: null, usage });

    await expect(generateChatReply(input, fakeClient(parse))).rejects.toThrow('respuesta estructurada');
  });

  it('throws when the API fails on an ordinary message', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('overloaded'));

    await expect(generateChatReply(input, fakeClient(parse))).rejects.toThrow('overloaded');
  });

  it('never fails a crisis message: the API failing gives the fixed crisis reply', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('overloaded'));

    const result = await generateChatReply({ ...input, userMessage: 'pienso en quitarme la vida' }, fakeClient(parse));

    expect(result).toEqual({
      reply: CRISIS_FALLBACK_REPLY,
      isCrisis: true,
      modelUsed: FIXED_CRISIS_REPLY_MODEL,
      usage: null,
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a crisis the model saw but wrote unusable text for gives the fixed crisis reply', async () => {
    const result = await generateChatReply(input, fakeClient(answering('', true)));

    expect(result).toMatchObject({ reply: CRISIS_FALLBACK_REPLY, isCrisis: true, modelUsed: CHAT_MODEL });
  });
});
