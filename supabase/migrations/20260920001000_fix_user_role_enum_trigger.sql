-- Fix enum/text comparison in the AI-label role-change trigger.
-- user_role is an enum, so coalesce(enum, '') attempts to cast '' to user_role
-- and raises: invalid input value for enum user_role: "".

create or replace function public.ec_clear_ai_labels_for_admin()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if upper(coalesce(new.role::text,'')) in ('ADMIN','HEAD_ADMIN')
     and upper(coalesce(old.role::text,'')) not in ('ADMIN','HEAD_ADMIN') then
    update public.forum_posts
      set is_ai_generated=false
      where author_id=new.id and is_ai_generated;

    update public.profile_sections
      set is_ai_generated=false
      where owner_id=new.id and is_ai_generated;

    update public.community_events
      set is_ai_generated=false
      where created_by=new.id and is_ai_generated;

    update public.business_listings
      set is_ai_generated=false
      where owner_id=new.id and is_ai_generated;
  end if;

  return new;
end;
$$;

notify pgrst,'reload schema';
