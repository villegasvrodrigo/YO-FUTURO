import { chatDate, cleanUserMessage, hasReachedLimit, messagesLeft, MAX_USER_MESSAGE_LENGTH } from '@/lib/chat/rules';
import { hasCrisisPhrase } from '@/lib/chat/crisis';
import { buildChatContext, type ChatSummary, type ChatTask } from '@/lib/chat/prompt';
import { generateChatReply, type ChatReply, type ChatReplyInput } from '@/lib/chat/reply';
import type { ChatStore, StoredChatMessage } from './store';

export type ChatErrorCode =
  | 'invalid_message'
  | 'onboarding_incomplete'
  | 'limit_reached'
  | 'reply_failed'
  | 'unavailable';

export type SendResult =
  | { status: 200; body: { reply: string; isCrisis: boolean; messagesLeft: number } }
  | { status: 400 | 403 | 429 | 500 | 502; body: { error: string; code: ChatErrorCode; messagesLeft?: number } };

export const CHAT_ERRORS: Record<ChatErrorCode, string> = {
  invalid_message: `Escribe un mensaje de hasta ${MAX_USER_MESSAGE_LENGTH} caracteres.`,
  onboarding_incomplete: 'Termina tu onboarding para usar el chat.',
  limit_reached: 'Por hoy ya conversamos lo suficiente. Seguimos mañana.',
  reply_failed: 'No pude responderte ahora. Intenta de nuevo en un momento.',
  unavailable: 'Algo falló de nuestro lado. Intenta de nuevo en un momento.',
};

function failure(status: 400 | 403 | 429 | 500 | 502, code: ChatErrorCode, messagesLeft?: number): SendResult {
  return { status, body: { error: CHAT_ERRORS[code], code, ...(messagesLeft === undefined ? {} : { messagesLeft }) } };
}

// Logs never carry message text or personal data: only what failed and the error's own text.
function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : 'error desconocido';
}

/** A context read that must not stop the chat: on failure it is logged and left out. */
async function optional<T>(what: string, read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch (err) {
    console.error(`[chat] sin ${what}: ${describeError(err)}`);
    return fallback;
  }
}

export interface SendChatMessageInput {
  userId: string;
  // The request body's "message", unchecked.
  message: unknown;
  now: Date;
  store: ChatStore;
  generate?: (input: ChatReplyInput) => Promise<ChatReply>;
}

/**
 * Handles one message to the chat for a person already signed in and allowed to use it:
 * checks the message and today's limit (crises don't count, and a message with a crisis
 * phrase is never blocked), gathers the person's context, gets the reply and saves both.
 * Nothing is saved unless there is a reply to save.
 */
export async function sendChatMessage(input: SendChatMessageInput): Promise<SendResult> {
  const { userId, now, store } = input;
  const generate = input.generate ?? ((replyInput: ChatReplyInput) => generateChatReply(replyInput));

  const userMessage = cleanUserMessage(input.message);
  if (!userMessage) return failure(400, 'invalid_message');

  // Reads that don't depend on each other run at the same time. Goals and the latest email
  // start right away, with the profile; today's conversation, tasks and summary need the
  // person's local "today" (the profile's time zone), so they start together as soon as the
  // profile arrives. Goals, email, tasks and summary are optional: each one catches its own
  // failure (see optional), so starting them early never leaves an unhandled error.
  const goalsRead = optional('metas', store.getActiveGoals(userId), [] as string[]);
  const emailRead = optional('mensaje del día', store.getLatestDailyMessage(userId), null);

  let profile;
  let todaysMessages: StoredChatMessage[];
  let today: string;
  let tasksRead: Promise<ChatTask[]>;
  let summaryRead: Promise<ChatSummary | null>;
  try {
    profile = await store.getProfile(userId);
    if (!profile || !profile.onboarding_completed) return failure(403, 'onboarding_incomplete');
    today = chatDate(now, profile.timezone);
    tasksRead = optional('tareas', store.getTasks(userId, today), [] as ChatTask[]);
    summaryRead = optional('resumen', store.getLastSummary(userId, today), null as ChatSummary | null);
    todaysMessages = await store.getTodaysMessages(userId, today);
  } catch (err) {
    console.error(`[chat] no se pudo preparar la conversación: ${describeError(err)}`);
    return failure(500, 'unavailable');
  }

  if (hasReachedLimit(todaysMessages) && !hasCrisisPhrase(userMessage)) {
    return failure(429, 'limit_reached', 0);
  }

  const [goals, latestEmail, todayTasks, lastSummary] = await Promise.all([goalsRead, emailRead, tasksRead, summaryRead]);

  const todayMessage =
    latestEmail && chatDate(new Date(latestEmail.generated_at), profile.timezone) === today ? latestEmail.content : null;

  const context = buildChatContext({
    name: profile.name,
    currentAge: profile.current_age,
    futureSelfAge: profile.future_self_age,
    tone: profile.tone,
    values: profile.values,
    focusArea: profile.focus_area,
    goals,
    currentEnergySummary: profile.current_energy_summary,
    blockingPattern: profile.blocking_pattern,
    futureVision: profile.future_vision,
    todayMessage,
    todayTasks,
    lastSummary,
  });

  let result: ChatReply;
  try {
    result = await generate({
      context,
      history: todaysMessages.map((m) => ({ role: m.role, content: m.content })),
      userMessage,
    });
  } catch (err) {
    console.error(`[chat] no se pudo responder: ${describeError(err)}`);
    return failure(502, 'reply_failed');
  }

  if (result.usage) {
    const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = result.usage;
    console.log(
      `[chat] tokens: entrada=${inputTokens} salida=${outputTokens} cache_lectura=${cacheReadTokens} cache_escritura=${cacheWriteTokens}`
    );
  } else {
    console.log('[chat] tokens: ninguno (respuesta fija, sin llamada a la IA)');
  }

  try {
    await store.saveExchange(userId, today, {
      userMessage,
      userAt: now,
      reply: result.reply,
      replyAt: new Date(Math.max(Date.now(), now.getTime() + 1)),
      isCrisis: result.isCrisis,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error(`[chat] no se pudo guardar: ${describeError(err)}`);
    return failure(500, 'unavailable');
  }

  const newRows: StoredChatMessage[] = [
    { role: 'user', content: userMessage, is_crisis: result.isCrisis },
    { role: 'assistant', content: result.reply, is_crisis: result.isCrisis },
  ];
  return {
    status: 200,
    body: { reply: result.reply, isCrisis: result.isCrisis, messagesLeft: messagesLeft([...todaysMessages, ...newRows]) },
  };
}
