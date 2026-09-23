-- Lets a user pause their daily emails from Perfil without deleting their account.
-- While true, the cron skips them entirely: no message, no tasks, no insight, no email.
-- Defaults to false, so every existing and new account keeps receiving its emails.
-- ALREADY APPLIED BY HAND in Supabase (verified afterwards: every account false); this
-- file only records it in the repo. No new grants needed: the existing profiles table
-- privileges cover the new column.
alter table public.profiles
  add column if not exists delivery_paused boolean not null default false;
