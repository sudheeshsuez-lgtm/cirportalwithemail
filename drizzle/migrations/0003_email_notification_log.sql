-- Tracks decision emails to avoid sending duplicate notifications after refreshes/repeated clicks.
create table if not exists public.email_notification_log (
  id uuid primary key default gen_random_uuid(),
  sheet_id text not null,
  row_number integer not null check (row_number >= 2),
  decision text not null check (decision in ('Approved', 'Rejected')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, row_number, decision)
);

alter table public.email_notification_log enable row level security;

drop policy if exists "Approved teachers can view email notification log" on public.email_notification_log;
create policy "Approved teachers can view email notification log"
  on public.email_notification_log for select to authenticated
  using (public.has_role(auth.uid(), 'teacher'));

-- Inserts/updates are performed only by the server with the Supabase service-role key.
revoke all on public.email_notification_log from anon, authenticated;
grant select on public.email_notification_log to authenticated;
grant all on public.email_notification_log to service_role;
