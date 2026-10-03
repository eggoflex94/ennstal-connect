create or replace function public.head_admin_set_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der primäre Head Admin darf diese Rollenänderung durchführen.';
  end if;

  if target_user is null or target_user = auth.uid() then
    raise exception 'Die eigene Rolle kann nicht verändert werden.';
  end if;

  perform public.admin_set_role(target_user, new_role);
end;
$$;

revoke all on function public.head_admin_set_role(uuid,text) from public, anon;
grant execute on function public.head_admin_set_role(uuid,text) to authenticated;
