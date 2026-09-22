import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/app/_components/BottomNav';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const { data: goals } = await supabase.from('goals').select('*').eq('user_id', user.id);

  if (!profile) redirect('/onboarding');

  return (
    <>
      <PerfilForm profile={profile} goals={goals ?? []} />
      <BottomNav />
    </>
  );
}
