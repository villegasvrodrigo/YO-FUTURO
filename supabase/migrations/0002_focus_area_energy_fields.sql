alter type focus_area add value if not exists 'paz';
alter type focus_area add value if not exists 'cuerpo';

alter table profiles add column if not exists current_energy_summary text;
alter table profiles add column if not exists blocking_pattern text;
alter table profiles add column if not exists future_vision text;
