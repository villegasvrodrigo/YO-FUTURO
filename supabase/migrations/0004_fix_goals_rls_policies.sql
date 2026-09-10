-- The goals table's RLS policies from 0001_init.sql are apparently missing or broken
-- on the live project (confirmed: a service-role insert succeeds, but the same insert
-- under RLS fails with "new row violates row-level security policy for table goals").
-- Re-create them idempotently.
drop policy if exists "goals_select_own" on goals;
drop policy if exists "goals_insert_own" on goals;
drop policy if exists "goals_update_own" on goals;

create policy "goals_select_own" on goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on goals for update using (auth.uid() = user_id);
