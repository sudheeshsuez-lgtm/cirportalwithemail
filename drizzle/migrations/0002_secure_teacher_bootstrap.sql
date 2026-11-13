-- Security hardening: never grant teacher privileges to the first self-registered account.
-- The initial teacher must be promoted manually by a Supabase project administrator.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wants_teacher boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'teacher';
begin
  if wants_teacher then
    insert into public.teacher_requests (user_id, email, full_name, status)
      values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'pending')
      on conflict (user_id) do nothing;
  else
    insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.request_teacher_access(_full_name text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  current_status text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select status into current_status from public.teacher_requests where user_id = uid;
  if current_status is not null then return current_status; end if;
  insert into public.teacher_requests (user_id, email, full_name, status)
    select uid, u.email, coalesce(_full_name, u.raw_user_meta_data->>'full_name'), 'pending'
    from auth.users u where u.id = uid
    on conflict (user_id) do nothing;
  return 'pending';
end;
$$;
revoke execute on function public.request_teacher_access(text) from public, anon;
grant execute on function public.request_teacher_access(text) to authenticated;
