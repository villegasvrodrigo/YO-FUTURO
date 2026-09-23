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
      .select('delivery_hour_local, timezone, delivery_paused')
      .eq('id', user.id)
      .single();

    return (
      <main className="flex flex-1 justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <h1 className="mb-6 font-serif text-3xl text-parchment">Historial</h1>
          <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-8">
            <p className="font-serif text-lg italic leading-relaxed text-mist">
              {profile
                ? emptyStateCopy(profile.delivery_hour_local, profile.timezone, profile.delivery_paused === true)
                : 'Tu yo futuro todavía no te ha escrito.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <h1 className="mb-8 font-serif text-3xl text-parchment">Historial</h1>
        <ul className="flex flex-col gap-5">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded border-t-2 border-brass-dim bg-dusk-2 px-7 py-7"
            >
              <time className="mb-3 block font-mono text-xs uppercase tracking-[0.08em] text-mist">
                {new Date(m.generated_at).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
              <p className="whitespace-pre-line font-serif text-base italic leading-relaxed text-parchment">
                {m.content}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
