-- "Claiming" a message's email before sending it: the cron sets email_claimed_at in a single
-- "update … where send_status = 'pending' and (email_claimed_at is null or older than 15
-- minutes) returning" operation, so when two runs get there at the same time only one of them
-- sends the email. Messages whose email had already been tried were marked with when it was
-- sent (or, if never, when they were created).
-- ALREADY APPLIED BY HAND in Supabase (verified afterwards: the column exists, no sent/failed
-- message left unmarked, no pending message); this file only records it in the repo.

alter table public.messages add column if not exists email_claimed_at timestamptz;

update public.messages
set email_claimed_at = coalesce(sent_at, generated_at)
where send_status in ('sent', 'failed') and email_claimed_at is null;
