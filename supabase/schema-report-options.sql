-- GFA report card pick-lists for "Interest / hobby" and "Attitude / conduct".
-- Additive only: the text saved on each report card (term_remarks.interests / term_remarks.attitude)
-- is unchanged, so existing report cards keep working.

create table if not exists report_options (
  id serial primary key,
  kind text not null check (kind in ('interest', 'attitude')),
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, label)
);

insert into report_options (kind, label, sort_order) values
  ('interest', 'Reading', 1),
  ('interest', 'Science', 2),
  ('interest', 'Computers', 3),
  ('interest', 'Drama', 4),
  ('interest', 'Singing and Dancing', 5),
  ('interest', 'Playing Football', 6),
  ('interest', 'Athletics', 7),
  ('interest', 'Netball', 8),
  ('attitude', 'Calm and Respectful', 1),
  ('attitude', 'Obedient to all', 2),
  ('attitude', 'Dutiful and Hardworking', 3)
on conflict (kind, label) do nothing;

alter table report_options enable row level security;

drop policy if exists "signed-in users view report_options" on report_options;
drop policy if exists "admin-like manage report_options" on report_options;

create policy "signed-in users view report_options" on report_options for select using (auth.uid() is not null);
create policy "admin-like manage report_options" on report_options for all using (is_admin_like());
