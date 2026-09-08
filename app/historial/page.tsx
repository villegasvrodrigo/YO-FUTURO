import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { emptyStateCopy } from '@/lib/historial/emptyStateCopy';

export default async function HistorialPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false });

  if (!messages || messages.length === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('delivery_hour_local, timezone')
      .eq('id', user.id)
      .single();

    return (
      <main>
        <h1>Historial</h1>
        <p>
          {profile
            ? emptyStateCopy(profile.delivery_hour_local, profile.timezone)
            : 'Tu yo futuro todavía no te ha escrito.'}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Historial</h1>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <time>{new Date(m.generated_at).toLocaleDateString('es-MX')}</time>
            <p>{m.content}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
