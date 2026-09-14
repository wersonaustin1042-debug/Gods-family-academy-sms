-- Requires schema-roles.sql to have already run (needs is_admin_like())
-- Per-student tuition discounts + admin-configurable default tuition fee.
-- NOTE: already applied directly to the live GFA Supabase project via the
-- Supabase MCP connector; kept here as a record, matching the other files
-- in this folder.
--
-- total_amount stays what every page (fees-owing, fees-overview, report
-- cards, parent portal, dashboard) already reads as "what this student
-- owes" — it's kept in sync with standard_amount - discount_amount by the
-- app whenever either is edited, so none of those consumers needed to
-- change.

alter table tuition_plans add column if not exists standard_amount numeric;
update tuition_plans set standard_amount = total_amount where standard_amount is null;
alter table tuition_plans alter column standard_amount set not null;
alter table tuition_plans add column if not exists discount_amount numeric not null default 0;

create table if not exists fee_settings (
  key text primary key,
  value numeric not null
);
insert into fee_settings (key, value) values ('default_tuition', 1200)
  on conflict (key) do nothing;

alter table fee_settings enable row level security;
create policy "admin-like manage fee_settings" on fee_settings for all using (is_admin_like());
create policy "anyone logged in can view fee_settings" on fee_settings for select using (auth.role() = 'authenticated');
