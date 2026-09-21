-- Up to 3 actionable tasks per user per day, generated before the daily email is sent.
-- task_date is the user's LOCAL calendar date (per profiles.timezone), computed by the app.
-- The unique constraint makes generation idempotent: a cron retry for the same
-- user and day cannot insert a second set of tasks.
create table daily_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null,
  position smallint not null check (position between 1 and 3),
  description text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, task_date, position)
);

alter table daily_tasks enable row level security;

-- Users can only view and update their own tasks: no insert, no delete.
-- Tasks are created solely by the cron using the service_role key, which bypasses RLS.
create policy "daily_tasks_select_own" on daily_tasks for select using (auth.uid() = user_id);
create policy "daily_tasks_update_own" on daily_tasks for update using (auth.uid() = user_id);
