import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { looksLikeLeakedInternalData } from '@/lib/onboarding/extraction';
import { applyCrisisProtocol, hasCrisisPhrase, CRISIS_FALLBACK_REPLY } from './crisis';
import { CHAT_INSTRUCTIONS } from './prompt';

// Same model as the daily email, so the voice is the same.
export const CHAT_MODEL = 'claude-sonnet-5';

// Stored as model_used when the reply is CRISIS_FALLBACK_REPLY because the model failed:
// a person in crisis never gets an error instead of the numbers.
export const FIXED_CRISIS_REPLY_MODEL = 'respuesta-fija-crisis';

const MAX_TOKENS = 1024;

// Replies are asked to be short (crisis ones up to ~100 words); far beyond this the model
// ignored the format.
const MAX_REPLY_LENGTH = 1500;

// The person is waiting for the answer on screen: one retry at most.
const CHAT_TIMEOUT_MS = 25_000;
const CHAT_MAX_RETRIES = 1;

const ChatReplySchema = z.object({
  respuesta: z.string(),
  crisis: z.boolean(),
});

/** A message already in today's conversation, oldest first. */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatReplyInput {
  // buildChatContext() for this person and day.
  context: string;
  // Today's conversation so far, oldest first.
  history: ChatTurn[];
  // The new message, already cleaned (cleanUserMessage).
  userMessage: string;
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ChatReply {
  reply: string;
  isCrisis: boolean;
  modelUsed: string;
  // Null when no model answer was used (the fixed crisis reply after a failure).
  usage: ChatUsage | null;
}

/**
 * The conversation as the API needs it: turns alternate, starting with the person. Consecutive
 * turns of the same side are joined (a lost reply must not break the request) and replies
 * before the person's first message are dropped. The new message goes last.
 */
export function buildChatMessages(history: ChatTurn[], userMessage: string): Anthropic.MessageParam[] {
  const turns: ChatTurn[] = [];
  for (const turn of [...history, { role: 'user' as const, content: userMessage }]) {
    const content = turn.content.trim();
    if (content === '') continue;
    if (turns.length === 0 && turn.role === 'assistant') continue;
    const last = turns[turns.length - 1];
    if (last && last.role === turn.role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      turns.push({ role: turn.role, content });
    }
  }
  return turns.map((turn) => ({ role: turn.role, content: turn.content }));
}

/**
 * The yo futuro's reply to the person's new message, with the crisis protocol applied by
 * the server (see applyCrisisProtocol). Throws when there is no usable reply, except when the
 * message has a crisis phrase: then it returns the fixed crisis reply instead of failing.
 */
export async function generateChatReply(input: ChatReplyInput, client?: Anthropic): Promise<ChatReply> {
  try {
    // Built inside the try: constructing the default client can itself throw.
    return await requestReply(input, client ?? new Anthropic());
  } catch (err) {
    if (!hasCrisisPhrase(input.userMessage)) throw err;
    console.error('[chat] falló la respuesta en un mensaje de crisis; se usa la respuesta fija:', err);
    return { reply: CRISIS_FALLBACK_REPLY, isCrisis: true, modelUsed: FIXED_CRISIS_REPLY_MODEL, usage: null };
  }
}

async function requestReply(input: ChatReplyInput, client: Anthropic): Promise<ChatReply> {
  const response = await client.messages.parse(
    {
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      // Short conversational replies don't need thinking, and it would slow them down.
      thinking: { type: 'disabled' },
      system: [
        { type: 'text', text: CHAT_INSTRUCTIONS },
        // The person's data changes at most a few times a day: cached, so each message only
        // pays full price for the new part of the conversation.
        { type: 'text', text: input.context, cache_control: { type: 'ephemeral' } },
      ],
      // Also caches the conversation so far, moving forward as it grows.
      cache_control: { type: 'ephemeral' },
      messages: buildChatMessages(input.history, input.userMessage),
      output_config: { format: zodOutputFormat(ChatReplySchema) },
    },
    { timeout: CHAT_TIMEOUT_MS, maxRetries: CHAT_MAX_RETRIES }
  );

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error('Claude no devolvió una respuesta estructurada válida');
  }

  const usage: ChatUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };

  const reply = parsed.respuesta.trim();
  if (reply === '' || reply.length > MAX_REPLY_LENGTH || looksLikeLeakedInternalData(reply)) {
    // The model saw a crisis but its text is unusable: the fixed reply, never an error.
    if (parsed.crisis) {
      return { reply: CRISIS_FALLBACK_REPLY, isCrisis: true, modelUsed: CHAT_MODEL, usage };
    }
    throw new Error('La respuesta del chat está vacía, es demasiado larga o tiene formato inválido');
  }

  const decision = applyCrisisProtocol(input.userMessage, reply, parsed.crisis);
  return { reply: decision.reply, isCrisis: decision.isCrisis, modelUsed: CHAT_MODEL, usage };
}
