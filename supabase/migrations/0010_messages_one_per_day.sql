-- One daily message per person per day. message_date is the person's LOCAL calendar day (per
-- profiles.timezone), set by the app; the unique index makes it impossible to save a second
-- message for the same person and day, even if two cron triggers (GitHub and Supabase) or the
-- app and the cron get there at the same time. The column stays nullable so code without it
-- kept working while it was rolled out; old rows were filled from generated_at.
-- ALREADY APPLIED BY HAND in Supabase (verified afterwards: no previous duplicates, the column
-- and the index exist, no message without a day); this file only records it in the repo.

alter table public.messages add column if not exists message_date date;

update public.messages m
set message_date = (m.generated_at at time zone p.timezone)::date
from public.profiles p
where p.id = m.user_id and m.message_date is null;

create unique index if not exists messages_one_per_day on public.messages (user_id, message_date);
