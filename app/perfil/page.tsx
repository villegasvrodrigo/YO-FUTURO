import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/app/_components/BottomNav';
import { isChatEnabledFor } from '@/lib/chat/access';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Both reads at the same time instead of one after another.
  const [{ data: profile }, { data: goals }] = await Promise.all([
    (async () => await supabase.from('profiles').select('*').eq('id', user.id).single())(),
    (async () => await supabase.from('goals').select('*').eq('user_id', user.id))(),
  ]);

  if (!profile) redirect('/onboarding');

  return (
    <>
      <PerfilForm profile={profile} goals={goals ?? []} />
      <BottomNav chatEnabled={isChatEnabledFor(user.id)} />
    </>
  );
}
