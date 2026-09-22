create or replace function public.ec_is_protected_admin_target(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_target
      and (
        upper(p.role::text) in ('HEAD_ADMIN','ADMIN','MUNICIPALITY')
        or exists (
          select 1
          from public.regional_admin_assignments ra
          where ra.user_id = p.id
            and ra.active = true
        )
      )
  );
$function$;
