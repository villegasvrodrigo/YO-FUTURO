import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDueNow, isSameLocalDay } from '@/lib/messages/delivery';
import { generateMessage } from '@/lib/messages/generate';
import { sendDailyEmail } from '@/lib/email/send';
import type { Profile, Goal, MessageRecord } from '@/lib/types';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('onboarding_completed', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dueProfiles = (profiles as Profile[]).filter((p) =>
    isDueNow(p.delivery_hour_local, p.timezone, now)
  );

  const results = await Promise.allSettled(
    dueProfiles.map((profile) => processUser(supabase, profile, now))
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - succeeded;

  return NextResponse.json({ processed: results.length, succeeded, failed });
}

async function processUser(
  supabase: ReturnType<typeof createAdminClient>,
  profile: Profile,
  now: Date
) {
  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', profile.id)
    .order('generated_at', { ascending: false })
    .limit(2);

  const messages = (recentMessages as MessageRecord[]) ?? [];
  const lastMessage = messages[0];
  if (
    lastMessage &&
    isSameLocalDay(new Date(lastMessage.generated_at), now, profile.timezone)
  ) {
    // Already sent a message today (local calendar day) for this user —
    // skip to avoid duplicate sends from DST fall-back repeated hours or
    // an overlapping/retried cron invocation.
    return;
  }

  const { content, modelUsed } = await generateMessage(
    profile,
    (goals as Goal[]) ?? [],
    messages
  );

  const { data: inserted, error: insertError } = await supabase
    .from('messages')
    .insert({ user_id: profile.id, content, model_used: modelUsed, send_status: 'pending' })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo guardar el mensaje: ${insertError?.message}`);
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id);
  const email = authUser?.user?.email;
  if (!email) {
    throw new Error('Usuario sin email registrado');
  }

  const emailResult = await sendDailyEmail(email, content);

  await supabase
    .from('messages')
    .update({
      send_status: emailResult.status,
      sent_at: emailResult.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', inserted.id);

  await supabase.from('email_log').insert({
    message_id: inserted.id,
    provider_id: emailResult.providerId,
    status: emailResult.status,
    error: emailResult.error,
  });
}
