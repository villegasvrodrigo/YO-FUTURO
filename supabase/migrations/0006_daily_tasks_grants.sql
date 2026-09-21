-- Table privileges for daily_tasks. 0005 created the table and its RLS policies but no
-- grants, so even the service_role key failed with "permission denied for table daily_tasks".
-- ALREADY APPLIED BY HAND in Supabase; this file only records it in the repo.
-- authenticated gets select/update only, matching the policies (tasks are created by the
-- cron with service_role).
grant select, update on public.daily_tasks to authenticated;
grant all on public.daily_tasks to service_role;
