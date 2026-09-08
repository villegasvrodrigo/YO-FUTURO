create extension if not exists pgcrypto;

create type focus_area as enum ('carrera', 'salud', 'relaciones', 'finanzas', 'personal');
create type tone as enum ('motivador', 'exigente', 'tierno', 'directo');
create type goal_status as enum ('active', 'achieved', 'paused');
create type send_status as enum ('pending', 'sent', 'failed');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  current_age int not null,
  future_self_age int not null,
  values text not null default '',
  focus_area focus_area not null,
  tone tone not null,
  delivery_hour_local int not null check (delivery_hour_local between 0 and 23),
  timezone text not null,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  status goal_status not null default 'active',
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  send_status send_status not null default 'pending',
  model_used text not null
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  provider_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create index goals_user_id_idx on goals(user_id);
create index messages_user_id_idx on messages(user_id);
create index messages_generated_at_idx on messages(generated_at desc);

alter table profiles enable row level security;
alter table goals enable row level security;
alter table messages enable row level security;
alter table email_log enable row level security;

create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

create policy "goals_select_own" on goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on goals for update using (auth.uid() = user_id);

create policy "messages_select_own" on messages for select using (auth.uid() = user_id);
