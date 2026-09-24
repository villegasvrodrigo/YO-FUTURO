import type { ChatStore } from '@/app/api/chat/store';
import { hasCrisisPhrase } from '@/lib/chat/crisis';
import {
  generateChatSummary,
  summarizableMessages,
  summaryMentionsCrisis,
  NEUTRAL_SUMMARY,
  NO_AI_SUMMARY_MODEL,
  SUMMARY_MODEL,
  type GeneratedSummary,
  type SummaryInput,
} from '@/lib/chat/summary';

// Logs never carry message text or personal data: only what failed and the error's own text.
function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : 'error desconocido';
}

export interface EnsureSummaryInput {
  userId: string;
  // Today in the person's time zone, "YYYY-MM-DD": the summary covers a day before it.
  today: string;
  store: ChatStore;
  summarize?: (input: SummaryInput) => Promise<GeneratedSummary>;
}

/**
 * Makes sure the person's last conversation (the last day before today with messages, even
 * if it wasn't yesterday) has its summary, generating and saving it if it doesn't. Crisis
 * messages never reach the AI: they only set had_crisis. Runs when the chat page is opened,
 * after the page is sent. Never throws: a failure is only logged, and the chat works as
 * always without a summary.
 */
export async function ensureLastSummary(input: EnsureSummaryInput): Promise<void> {
  const { userId, today, store } = input;
  const summarize = input.summarize ?? ((summaryInput: SummaryInput) => generateChatSummary(summaryInput));

  try {
    const lastDay = await store.getLastConversationDay(userId, today);
    if (!lastDay || (await store.hasSummary(userId, lastDay))) return;

    const [messages, profile] = await Promise.all([store.getTodaysMessages(userId, lastDay), store.getProfile(userId)]);
    const hadCrisis = messages.some((m) => m.is_crisis);
    const allowed = summarizableMessages(messages);

    let content = NEUTRAL_SUMMARY;
    let modelUsed = NO_AI_SUMMARY_MODEL;
    if (allowed.length > 0) {
      const summary = await summarize({ name: profile?.name?.trim() || 'La persona', date: lastDay, messages: allowed });
      const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = summary.usage;
      console.log(
        `[chat-resumen] tokens: entrada=${inputTokens} salida=${outputTokens} cache_lectura=${cacheReadTokens} cache_escritura=${cacheWriteTokens}`
      );
      modelUsed = SUMMARY_MODEL;
      // A summary that still names a crisis is never kept: the neutral one takes its place.
      if (hasCrisisPhrase(summary.content) || summaryMentionsCrisis(summary.content)) {
        console.error('[chat-resumen] el resumen mencionaba una crisis; se guarda el resumen neutro');
      } else {
        content = summary.content;
      }
    }

    await store.saveSummary(userId, lastDay, { content, hadCrisis, modelUsed });
  } catch (err) {
    console.error(`[chat-resumen] sin resumen: ${describeError(err)}`);
  }
}
