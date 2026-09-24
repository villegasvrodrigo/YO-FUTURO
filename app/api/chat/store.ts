import type { createAdminClient } from '@/lib/supabase/admin';
import type { ChatSummary, ChatTask } from '@/lib/chat/prompt';
import type { Profile } from '@/lib/types';

type AdminClient = ReturnType<typeof createAdminClient>;

/** A row of today's conversation, oldest first. */
export interface StoredChatMessage {
  role: 'user' | 'assistant';
  content: string;
  is_crisis: boolean;
}

/** One exchange to save: the person's message and the yo futuro's reply. */
export interface ChatExchange {
  userMessage: string;
  // When the message arrived and when the reply was ready, so they sort in that order.
  userAt: Date;
  reply: string;
  replyAt: Date;
  isCrisis: boolean;
  modelUsed: string;
}

/** Everything the chat reads and writes. Every method throws on a database error. */
export interface ChatStore {
  getProfile(userId: string): Promise<Profile | null>;
  getTodaysMessages(userId: string, chatDate: string): Promise<StoredChatMessage[]>;
  getActiveGoals(userId: string): Promise<string[]>;
  // The most recent daily email, whatever its day: the caller checks whether it is today's.
  getLatestDailyMessage(userId: string): Promise<{ content: string; generated_at: string } | null>;
  getTasks(userId: string, taskDate: string): Promise<ChatTask[]>;
  // The most recent summary of a day before `chatDate`.
  getLastSummary(userId: string, chatDate: string): Promise<ChatSummary | null>;
  saveExchange(userId: string, chatDate: string, exchange: ChatExchange): Promise<void>;
  // The last day before `chatDate` with any conversation, or null if there was none.
  getLastConversationDay(userId: string, chatDate: string): Promise<string | null>;
  hasSummary(userId: string, summaryDate: string): Promise<boolean>;
  // Saving a summary that already exists (another tab got there first) is not an error.
  saveSummary(userId: string, summaryDate: string, summary: NewChatSummary): Promise<void>;
}

/** A summary to save for one conversation day. */
export interface NewChatSummary {
  content: string;
  hadCrisis: boolean;
  modelUsed: string;
}

// Postgres' code for a unique constraint violation.
const UNIQUE_VIOLATION = '23505';

function fail(what: string, error: { message: string }): never {
  throw new Error(`No se pudo ${what}: ${error.message}`);
}

/** The ChatStore backed by Supabase, with the admin (service_role) client. */
export function createChatStore(supabase: AdminClient): ChatStore {
  return {
    async getProfile(userId) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) fail('leer el perfil', error);
      return (data as Profile | null) ?? null;
    },

    async getTodaysMessages(userId, chatDate) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('role, content, is_crisis')
        .eq('user_id', userId)
        .eq('chat_date', chatDate)
        .order('created_at', { ascending: true });
      if (error) fail('leer la conversación de hoy', error);
      return (data as StoredChatMessage[] | null) ?? [];
    },

    async getActiveGoals(userId) {
      const { data, error } = await supabase
        .from('goals')
        .select('description')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) fail('leer las metas', error);
      return ((data as { description: string }[] | null) ?? []).map((goal) => goal.description);
    },

    async getLatestDailyMessage(userId) {
      const { data, error } = await supabase
        .from('messages')
        .select('content, generated_at')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail('leer el mensaje del día', error);
      return (data as { content: string; generated_at: string } | null) ?? null;
    },

    async getTasks(userId, taskDate) {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('description, completed')
        .eq('user_id', userId)
        .eq('task_date', taskDate)
        .order('position', { ascending: true });
      if (error) fail('leer las tareas', error);
      return (data as ChatTask[] | null) ?? [];
    },

    async getLastSummary(userId, chatDate) {
      const { data, error } = await supabase
        .from('chat_summaries')
        .select('summary_date, content, had_crisis')
        .eq('user_id', userId)
        .lt('summary_date', chatDate)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail('leer el resumen', error);
      const row = data as { summary_date: string; content: string; had_crisis: boolean } | null;
      return row ? { date: row.summary_date, content: row.content, hadCrisis: row.had_crisis } : null;
    },

    async saveExchange(userId, chatDate, exchange) {
      const { error } = await supabase.from('chat_messages').insert([
        {
          user_id: userId,
          chat_date: chatDate,
          role: 'user',
          content: exchange.userMessage,
          is_crisis: exchange.isCrisis,
          created_at: exchange.userAt.toISOString(),
        },
        {
          user_id: userId,
          chat_date: chatDate,
          role: 'assistant',
          content: exchange.reply,
          is_crisis: exchange.isCrisis,
          model_used: exchange.modelUsed,
          created_at: exchange.replyAt.toISOString(),
        },
      ]);
      if (error) fail('guardar la conversación', error);
    },

    async getLastConversationDay(userId, chatDate) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('chat_date')
        .eq('user_id', userId)
        .lt('chat_date', chatDate)
        .order('chat_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail('leer el último día con conversación', error);
      return (data as { chat_date: string } | null)?.chat_date ?? null;
    },

    async hasSummary(userId, summaryDate) {
      const { data, error } = await supabase
        .from('chat_summaries')
        .select('id')
        .eq('user_id', userId)
        .eq('summary_date', summaryDate)
        .maybeSingle();
      if (error) fail('revisar el resumen', error);
      return data !== null;
    },

    async saveSummary(userId, summaryDate, summary) {
      const { error } = await supabase.from('chat_summaries').insert({
        user_id: userId,
        summary_date: summaryDate,
        content: summary.content,
        had_crisis: summary.hadCrisis,
        model_used: summary.modelUsed,
      });
      if (error && (error as { code?: string }).code !== UNIQUE_VIOLATION) fail('guardar el resumen', error);
    },
  };
}
