-- Roles
create type public.app_role as enum ('teacher', 'student');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));

-- Teacher access requests
create table public.teacher_requests (
  user_id uuid primary key,
  email text not null,
  full_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.teacher_requests to authenticated;
grant all on public.teacher_requests to service_role;
alter table public.teacher_requests enable row level security;
create policy "Own or teacher can read requests" on public.teacher_requests for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'teacher'));
create policy "Teachers update requests" on public.teacher_requests for update to authenticated
  using (public.has_role(auth.uid(), 'teacher')) with check (public.has_role(auth.uid(), 'teacher'));

-- Signup trigger: teacher signups create a request; the very first teacher is approved automatically
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wants_teacher boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'teacher';
  has_teacher boolean;
begin
  if wants_teacher then
    select exists(select 1 from public.user_roles where role = 'teacher') into has_teacher;
    insert into public.teacher_requests (user_id, email, full_name, status, reviewed_at)
      values (new.id, new.email, new.raw_user_meta_data->>'full_name',
              case when has_teacher then 'pending' else 'approved' end,
              case when has_teacher then null else now() end)
      on conflict (user_id) do nothing;
    if not has_teacher then
      insert into public.user_roles (user_id, role) values (new.id, 'teacher') on conflict do nothing;
    end if;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Approving a teacher request grants the role
create or replace function public.apply_teacher_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.user_roles (user_id, role) values (new.user_id, 'teacher') on conflict do nothing;
  elsif new.status <> 'approved' and old.status = 'approved' then
    delete from public.user_roles where user_id = new.user_id and role = 'teacher';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;
create trigger on_teacher_request_update before update on public.teacher_requests
  for each row execute function public.apply_teacher_request();

-- Portal settings (single row)
create table public.portal_settings (
  id int primary key default 1 check (id = 1),
  form_url text,
  sheet_url text,
  updated_at timestamptz not null default now()
);
insert into public.portal_settings (id) values (1);
grant select on public.portal_settings to anon, authenticated;
grant update on public.portal_settings to authenticated;
grant all on public.portal_settings to service_role;
alter table public.portal_settings enable row level security;
create policy "Anyone reads settings" on public.portal_settings for select to anon, authenticated using (true);
create policy "Teachers update settings" on public.portal_settings for update to authenticated
  using (public.has_role(auth.uid(), 'teacher')) with check (public.has_role(auth.uid(), 'teacher'));

-- Assistant chat threads
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.chat_threads to authenticated;
grant all on public.chat_threads to service_role;
alter table public.chat_threads enable row level security;
create policy "Own threads" on public.chat_threads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index chat_threads_user_idx on public.chat_threads (user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;
create policy "Own messages read" on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy "Own messages insert" on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = auth.uid()));
create policy "Own messages delete" on public.chat_messages for delete to authenticated using (user_id = auth.uid());
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);