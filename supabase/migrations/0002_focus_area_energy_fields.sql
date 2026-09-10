-- ALTER TYPE ... ADD VALUE is safe inside this migration's implicit transaction
-- only because the new values are not referenced elsewhere in this same file.
-- If a future migration needs to add a focus_area value AND use it in the same
-- migration (e.g. a backfill), split that into two separate migration files.
alter type focus_area add value if not exists 'paz';
alter type focus_area add value if not exists 'cuerpo';

alter table profiles add column if not exists current_energy_summary text;
alter table profiles add column if not exists blocking_pattern text;
alter table profiles add column if not exists future_vision text;
