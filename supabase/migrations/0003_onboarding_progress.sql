create table onboarding_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  transcript jsonb not null default '[]'::jsonb,
  extracted jsonb not null default '{}'::jsonb,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table onboarding_progress enable row level security;

create policy "onboarding_progress_select_own" on onboarding_progress for select using (auth.uid() = user_id);
create policy "onboarding_progress_insert_own" on onboarding_progress for insert with check (auth.uid() = user_id);
create policy "onboarding_progress_update_own" on onboarding_progress for update using (auth.uid() = user_id);
create policy "onboarding_progress_delete_own" on onboarding_progress for delete using (auth.uid() = user_id);
