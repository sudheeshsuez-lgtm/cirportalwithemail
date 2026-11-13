create or replace function public.request_teacher_access(_full_name text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  has_teacher boolean;
  current_status text;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select status into current_status from public.teacher_requests where user_id = uid;
  if current_status is not null then return current_status; end if;
  select exists(select 1 from public.user_roles where role = 'teacher') into has_teacher;
  insert into public.teacher_requests (user_id, email, full_name, status, reviewed_at)
    select uid, u.email, coalesce(_full_name, u.raw_user_meta_data->>'full_name'),
           case when has_teacher then 'pending' else 'approved' end,
           case when has_teacher then null else now() end
    from auth.users u where u.id = uid;
  if not has_teacher then
    insert into public.user_roles (user_id, role) values (uid, 'teacher') on conflict do nothing;
    return 'approved';
  end if;
  return 'pending';
end;
$$;
revoke execute on function public.request_teacher_access(text) from public, anon;
grant execute on function public.request_teacher_access(text) to authenticated;