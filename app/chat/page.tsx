import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { createChatStore } from '@/app/api/chat/store';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { chatDate, messagesLeft, type CountableMessage } from '@/lib/chat/rules';
import { ChatNotAvailable, type ChatBubble } from './ChatParts';
import { ChatScreen } from './ChatScreen';
import { ensureLastSummary } from './ensureSummary';

// Room for the summary of the last conversation, generated after the page is sent.
export const maxDuration = 60;

const LOAD_ERROR = 'No pude cargar la conversación de hoy. Puedes seguir escribiendo; si algo falla, recarga la página.';

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const enabled = isChatEnabledFor(user.id);

  let messages: (ChatBubble & CountableMessage)[] = [];
  let loadError: string | null = null;
  let today = '';
  let hasEarlierDays = false;
  if (enabled) {
    const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle();
    // Today in the person's time zone (a bad or missing one falls back, never fails).
    today = chatDate(new Date(), profile?.timezone);
    const userId = user.id;

    // After the page is sent (the person never waits for it): if the last conversation of a
    // previous day has no summary yet, write it. Written with the admin client, since the
    // person can only read chat_summaries. Any failure is only logged.
    const summaryDay = today;
    after(async () => {
      try {
        await ensureLastSummary({ userId, today: summaryDay, store: createChatStore(createAdminClient()) });
      } catch (err) {
        console.error(`[chat-resumen] sin resumen: ${err instanceof Error ? err.message : 'error desconocido'}`);
      }
    });

    // Today's conversation, and (at the same time) whether there is any before today, for the
    // "Ver días anteriores" button. A failed check just hides the button.
    const [{ data, error }, earlier] = await Promise.all([
      (async () =>
        await supabase
          .from('chat_messages')
          .select('role, content, is_crisis')
          .eq('user_id', userId)
          .eq('chat_date', today)
          .order('created_at', { ascending: true }))(),
      (async () =>
        await supabase.from('chat_messages').select('chat_date').eq('user_id', userId).lt('chat_date', today).limit(1))(),
    ]);
    if (earlier.error) {
      console.error('[chat] no se pudo revisar si hay días anteriores:', earlier.error.message);
    } else {
      hasEarlierDays = (earlier.data ?? []).length > 0;
    }
    if (error) {
      console.error('[chat] no se pudo leer la conversación de hoy:', error.message);
      loadError = LOAD_ERROR;
    } else {
      messages = (data as (ChatBubble & CountableMessage)[]) ?? [];
    }
  }

  if (enabled) {
    // The chat fills the window: ChatScreen pins its box above the bottom bar, keeps the end
    // of the page clear of the bar, and renders the bar itself (it hides it while typing).
    return (
      <main className="flex flex-1 justify-center px-6 pt-8">
        <div className="flex w-full max-w-xl flex-col">
          <p className="mb-4 font-mono text-xs tracking-[0.14em] text-brass">TU YO FUTURO</p>
          <ChatScreen
            initialMessages={messages.map(({ role, content }) => ({ role, content }))}
            initialMessagesLeft={messagesLeft(messages)}
            loadError={loadError}
            today={today}
            hasEarlierDays={hasEarlierDays}
          />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-1 justify-center px-6 pb-40 pt-8">
        <div className="w-full max-w-xl">
          <p className="mb-4 font-mono text-xs tracking-[0.14em] text-brass">TU YO FUTURO</p>
          <ChatNotAvailable />
        </div>
      </main>
      <BottomNav />
    </>
  );
}
