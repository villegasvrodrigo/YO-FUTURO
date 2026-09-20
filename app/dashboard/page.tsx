import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BottomNav } from './BottomNav';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  const { data: latestMessage } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const name = profile?.name?.trim();

  return (
    <>
      <main className="flex flex-1 justify-center px-6 pb-28 pt-16">
        <div className="w-full max-w-xl">
          <div className="mb-8 flex items-center justify-between gap-4">
            <h1 className="font-serif text-2xl text-parchment">{name ? `Hola, ${name}` : 'Hola'}</h1>
            {/* Estático en 0% por ahora — se conectará al sistema de tareas
                diarias cuando exista, para reflejar cuánto llevas del día. */}
            <CompletionRing percent={0} />
          </div>

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

          <section className="mt-10">
            <h2 className="mb-3 font-serif text-xl text-parchment">Tus tareas de hoy</h2>
            <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
              <p className="text-sm text-mist">Pronto verás aquí tus tareas del día.</p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 font-serif text-xl text-parchment">Daily insight</h2>
            <div className="rounded border-t-2 border-rule bg-dusk-2 px-7 py-6">
              <p className="text-sm text-mist">Pronto verás aquí tu daily insight.</p>
            </div>
          </section>

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
      <BottomNav />
    </>
  );
}

function CompletionRing({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div
      className="relative flex h-11 w-11 shrink-0 items-center justify-center"
      role="img"
      aria-label={`${percent}% del día completado`}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-rule" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-brass"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute font-mono text-[10px] text-parchment">{percent}%</span>
    </div>
  );
}
