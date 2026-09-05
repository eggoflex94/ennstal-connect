-- Ennstal Connect: registration + forum edit repair
-- Run this file ONCE by itself in the Supabase SQL Editor.
-- It replaces only app-created signup triggers and makes no changes to auth users.

-- A profile must be created at signup with every required base value. Older
-- project versions inserted only id/nickname, which causes Auth to surface the
-- misleading message "Database error saving new user".
create or replace function public.ec_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_birth_date date;
  v_first_admin boolean;
begin
  v_nickname := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), '');
  if v_nickname is null then
    v_nickname := split_part(coalesce(new.email, ''), '@', 1);
  end if;
  if char_length(v_nickname) < 3 then
    raise exception 'Nickname muss mindestens drei Zeichen haben.';
  end if;

  -- Prevent a race between the availability check and Auth signup without
  -- relying on a possibly missing legacy unique index.
  perform pg_advisory_xact_lock(hashtext('ennstal-nickname:' || lower(v_nickname)));
  if exists (
    select 1 from public.profiles
    where lower(btrim(coalesce(nickname, ''))) = lower(v_nickname)
  ) then
    raise exception 'Dieser Nickname ist bereits vergeben.';
  end if;

  v_birth_date := case
    when coalesce(new.raw_user_meta_data ->> 'birth_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (new.raw_user_meta_data ->> 'birth_date')::date
    else date '2000-01-01'
  end;

  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  select not exists (
    select 1 from public.profiles where role in ('ADMIN', 'HEAD_ADMIN')
  ) into v_first_admin;

  insert into public.profiles (
    id, nickname, first_name, last_name, birth_date, gender, role, account_status
  ) values (
    new.id,
    v_nickname,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    v_birth_date,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'gender', '')), ''),
    case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,
    'ACTIVE'
  ) on conflict (id) do nothing;

  return new;
end;
$$;

-- There must be exactly one application signup trigger. Supabase's internal
-- triggers are retained; only non-internal project triggers are replaced.
do $$
declare trigger_row record;
begin
  for trigger_row in
    select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_row.tgname);
  end loop;
end;
$$;

create trigger ennstal_connect_profile_on_signup
after insert on auth.users
for each row execute procedure public.ec_handle_new_user();

revoke all on function public.ec_handle_new_user() from public;

-- A protected server-side edit route. Authors can edit their own posts;
-- Admins can edit both forums; appointed Supporters can edit Community posts.
alter table public.profiles add column if not exists forum_moderator boolean not null default false;
alter table public.forum_posts add column if not exists edited_at timestamptz;
alter table public.forum_posts add column if not exists edited_by uuid references public.profiles(id) on delete set null;
alter table public.forum_posts add column if not exists edit_reason text;

create or replace function public.forum_update_post(
  p_post_id uuid,
  p_title text,
  p_content text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_scope text;
  v_role text;
  v_forum_moderator boolean;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Nicht eingeloggt.';
  end if;
  select author_id, scope into v_author_id, v_scope
  from public.forum_posts where id = p_post_id;
  if v_author_id is null then
    raise exception 'Beitrag nicht gefunden.';
  end if;
  select role, coalesce(forum_moderator, false)
  into v_role, v_forum_moderator
  from public.profiles where id = auth.uid();
  v_is_owner := v_author_id = auth.uid();
  if not v_is_owner
     and coalesce(v_role, 'MEMBER') not in ('ADMIN', 'HEAD_ADMIN')
     and not (v_scope = 'COMMUNITY' and coalesce(v_forum_moderator, false)) then
    raise exception 'Keine Berechtigung zum Bearbeiten dieses Beitrags.';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3
     or char_length(btrim(coalesce(p_content, ''))) < 3 then
    raise exception 'Überschrift und Beitrag müssen mindestens drei Zeichen enthalten.';
  end if;
  if not v_is_owner and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Bitte einen Bearbeitungsgrund angeben.';
  end if;

  update public.forum_posts
  set title = btrim(p_title),
      content = btrim(p_content),
      edited_at = now(),
      edited_by = auth.uid(),
      edit_reason = case
        when v_is_owner then 'Vom Autor bearbeitet'
        else btrim(p_reason)
      end
  where id = p_post_id;
end;
$$;

revoke all on function public.forum_update_post(uuid, text, text, text) from public;
grant execute on function public.forum_update_post(uuid, text, text, text) to authenticated;
notify pgrst, 'reload schema';
