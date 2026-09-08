import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: latestMessage } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main>
      <h1>Tu mensaje de hoy</h1>
      {latestMessage ? (
        <p>{latestMessage.content}</p>
      ) : (
        <p>Tu yo futuro todavía no te ha escrito.</p>
      )}
      <nav>
        <a href="/historial">Ver historial</a>
        <a href="/perfil">Editar perfil</a>
      </nav>
    </main>
  );
}
