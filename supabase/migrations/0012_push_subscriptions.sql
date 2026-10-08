-- Push notifications: one row per phone where the person turned them on (Perfil). Only the
-- server writes it (/api/push/suscripcion, and the cron deletes phones that no longer accept
-- notices); people can only read their own. Deleted with the account.
-- ALREADY APPLIED BY HAND in Supabase (verified afterwards: RLS on, one select-own policy,
-- authenticated select only, service_role all, anon nothing); this file only records it in the repo.

create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  endpoint         text not null unique,          -- the phone's push service address (identifies it)
  p256dh           text not null,                 -- the phone's public key to encrypt the notice
  auth             text not null,                 -- the phone's secret for the encryption
  user_agent       text not null default '',      -- to tell phones apart (iPhone, Android…)
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz                    -- last notice the push service accepted
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
