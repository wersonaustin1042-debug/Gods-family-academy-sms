-- Requires schema-roles.sql to have already run (needs is_admin_like())
-- Notice board + browser push notification subscriptions.
-- NOTE: already applied directly to the live GFA Supabase project via the
-- Supabase MCP connector; kept here as a record, matching the other files
-- in this folder.

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table notices enable row level security;

create policy "admin-like manage notices" on notices for all using (is_admin_like());
create policy "anyone logged in can view notices" on notices for select using (auth.role() = 'authenticated');

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "users manage own push subscriptions" on push_subscriptions for all using (auth.uid() = user_id);
create policy "admin-like read all push subscriptions" on push_subscriptions for select using (is_admin_like());
