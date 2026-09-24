-- Chat con tu yo futuro: every message of the conversation, and one short summary per day.
-- chat_date and summary_date are the user's LOCAL calendar date (per profiles.timezone),
-- computed by the app, same as daily_tasks.task_date. A "day" ends at local midnight.
-- Both tables are written solely by the server (/api/chat) using the service_role key, which
-- bypasses RLS: users can only read their own rows, so the 20-message daily limit can't be
-- skipped by writing from the browser. Deleting the account (auth.users) deletes both.
-- ALREADY APPLIED BY HAND in Supabase (verified afterwards: RLS on in both tables, the two
-- select-own policies, authenticated select only, service_role all, anon nothing); this
-- file only records it in the repo.

-- One row per message: the person's (role 'user') and the yo futuro's reply ('assistant').
-- is_crisis marks messages handled as a crisis: they don't count toward the daily limit.
-- model_used is set on replies only.
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_date date not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(btrim(content)) > 0),
  is_crisis boolean not null default false,
  model_used text,
  created_at timestamptz not null default now(),
  check ((role = 'assistant') = (model_used is not null))
);

-- Serves "today's conversation", the daily-limit count and "the last day with a conversation".
create index chat_messages_user_day_idx on chat_messages (user_id, chat_date, created_at);

-- One summary per conversation day, generated the first time the chat is opened on a later
-- day. summary_date is the day summarized. had_crisis replaces any crisis details: the
-- summary never stores them, only this general note, so the yo futuro can gently ask how
-- the person is. The unique constraint makes generation idempotent: two tabs opening the
-- chat at once cannot insert a second summary for the same day. Its index also serves the
-- "most recent summary for this user" read.
create table chat_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,
  content text not null check (length(btrim(content)) > 0),
  had_crisis boolean not null default false,
  model_used text not null,
  created_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

alter table chat_messages enable row level security;
alter table chat_summaries enable row level security;

-- Users can only read their own rows: no insert, update or delete.
create policy "chat_messages_select_own" on chat_messages for select using (auth.uid() = user_id);
create policy "chat_summaries_select_own" on chat_summaries for select using (auth.uid() = user_id);

-- Table privileges (same as daily_insights in 0007). Start from nothing for the client
-- roles, then give authenticated read-only access, matching the policies above.
revoke all on public.chat_messages from anon, authenticated;
revoke all on public.chat_summaries from anon, authenticated;
grant select on public.chat_messages to authenticated;
grant select on public.chat_summaries to authenticated;
grant all on public.chat_messages to service_role;
grant all on public.chat_summaries to service_role;
