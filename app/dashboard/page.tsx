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
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-brass">
          Tu mensaje de hoy
        </p>
        {latestMessage && (
          <p className="mb-6 font-mono text-xs text-mist">
            {new Date(latestMessage.generated_at).toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'short',
            })}
          </p>
        )}

        {latestMessage ? (
          <div className="mt-6 rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-8">
            <p className="whitespace-pre-line font-serif text-lg italic leading-relaxed text-parchment">
              {latestMessage.content}
            </p>
            <span className="mt-5 block font-mono text-xs text-mist">
              {latestMessage.model_used} · generado hoy
            </span>
          </div>
        ) : (
          <div className="mt-6 rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
            <p className="font-serif text-lg italic leading-relaxed text-mist">
              Tu yo futuro todavía no te ha escrito.
            </p>
          </div>
        )}

        <nav className="mt-8 flex gap-5 font-mono text-xs">
          <a href="/historial" className="text-mist transition-colors hover:text-brass">
            Ver historial
          </a>
          <a href="/perfil" className="text-mist transition-colors hover:text-brass">
            Editar perfil
          </a>
        </nav>
      </div>
    </main>
  );
}
