-- =========================================================
-- ENNSTAL CONNECT
-- KOMPLETTE DATENBANK
-- =========================================================


-- =========================================================
-- 1. ERWEITERUNG FÜR UUID
-- =========================================================

create extension if not exists "uuid-ossp";


-- =========================================================
-- 2. PROFILES TABELLE
-- =========================================================

create table if not exists public.profiles (

    id uuid primary key references auth.users(id) on delete cascade,

    first_name text not null default '',
    last_name text not null default '',

    nickname text unique not null,

    birth_date date,

    avatar_url text,

    bio text default '',

    location text default '',

    website text default '',

    interests text default '',

    role text not null default 'MEMBER',

    status text not null default 'PENDING_ADMIN',

    community_points integer not null default 0,

    nickname_color_owned boolean not null default false,

    is_online boolean not null default false,

    last_seen timestamptz default now(),

    total_online_seconds bigint not null default 0,

    last_reward_claim timestamptz,

    created_at timestamptz default now(),

    updated_at timestamptz default now()

);


-- =========================================================
-- 3. FRIENDSHIPS TABELLE
-- =========================================================

create table if not exists public.friendships (

    id uuid primary key default uuid_generate_v4(),

    requester_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    receiver_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    status text
        not null
        default 'PENDING',

    created_at timestamptz
        default now(),

    updated_at timestamptz
        default now(),

    constraint different_users_check
        check (
            requester_id <> receiver_id
        )

);


-- =========================================================
-- 4. VERHINDERT DOPPELTE FREUNDSCHAFTEN
-- =========================================================

create unique index if not exists
friendships_unique_relationship

on public.friendships (

    least(
        requester_id,
        receiver_id
    ),

    greatest(
        requester_id,
        receiver_id
    )

);


-- =========================================================
-- 5. PUNKTEVERLAUF
-- =========================================================

create table if not exists public.point_history (

    id uuid primary key
        default uuid_generate_v4(),

    user_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    amount integer
        not null,

    reason text
        not null,

    created_by uuid
        references public.profiles(id),

    created_at timestamptz
        default now()

);


-- =========================================================
-- 6. PROFILBESUCHE
-- =========================================================

create table if not exists public.profile_visits (

    id uuid primary key
        default uuid_generate_v4(),

    visitor_id uuid
        references public.profiles(id)
        on delete cascade,

    profile_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    visited_at timestamptz
        default now()

);


-- =========================================================
-- 7. NACHRICHTEN
-- =========================================================

create table if not exists public.messages (

    id uuid primary key
        default uuid_generate_v4(),

    sender_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    receiver_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    content text
        not null,

    is_read boolean
        not null
        default false,

    created_at timestamptz
        default now()

);


-- =========================================================
-- 8. ADMIN LOGS
-- =========================================================

create table if not exists public.admin_logs (

    id uuid primary key
        default uuid_generate_v4(),

    admin_id uuid
        references public.profiles(id),

    action text not null,

    target_user_id uuid
        references public.profiles(id),

    details text,

    created_at timestamptz
        default now()

);


-- =========================================================
-- 9. MARKETPLACE KÄUFE
-- =========================================================

create table if not exists public.marketplace_purchases (

    id uuid primary key
        default uuid_generate_v4(),

    user_id uuid
        not null
        references public.profiles(id)
        on delete cascade,

    item text
        not null,

    price integer
        not null,

    created_at timestamptz
        default now()

);


-- =========================================================
-- 10. AKTUALISIERUNG updated_at
-- =========================================================

create or replace function
public.update_updated_at_column()

returns trigger
language plpgsql
security definer
as $$
begin

    new.updated_at = now();

    return new;

end;

$$;


drop trigger if exists
profiles_updated_at
on public.profiles;

create trigger
profiles_updated_at

before update
on public.profiles

for each row

execute function
public.update_updated_at_column();


drop trigger if exists
friendships_updated_at
on public.friendships;

create trigger
friendships_updated_at

before update
on public.friendships

for each row

execute function
public.update_updated_at_column();


-- =========================================================
-- 11. PROFIL AUTOMATISCH NACH REGISTRIERUNG ERSTELLEN
-- =========================================================

create or replace function
public.handle_new_user()

returns trigger
language plpgsql
security definer
set search_path = public
as $$

declare
    admin_email text :=
        'eggermarco@gmx.net';

begin

    insert into public.profiles (

        id,

        first_name,

        last_name,

        birth_date,

        nickname,

        role,

        status,

        community_points

    )

    values (

        new.id,

        coalesce(
            new.raw_user_meta_data
            ->> 'first_name',
            ''
        ),

        coalesce(
            new.raw_user_meta_data
            ->> 'last_name',
            ''
        ),

        nullif(
            new.raw_user_meta_data
            ->> 'birth_date',
            ''
        )::date,

        coalesce(
            new.raw_user_meta_data
            ->> 'nickname',
            'Mitglied'
        ),

        case

            when lower(new.email) =
                lower(admin_email)

            then 'HEAD_ADMIN'

            else 'MEMBER'

        end,

        case

            when lower(new.email) =
                lower(admin_email)

            then 'APPROVED'

            else 'PENDING_ADMIN'

        end,

        0

    );

    return new;

end;

$$;


drop trigger if exists
on_auth_user_created
on auth.users;


create trigger
on_auth_user_created

after insert
on auth.users

for each row

execute function
public.handle_new_user();


-- =========================================================
-- 12. POINTS ÄNDERN
-- =========================================================

create or replace function
public.change_member_points(

    target_user uuid,

    point_amount integer,

    point_reason text

)

returns void
language plpgsql
security definer
set search_path = public
as $$

declare

    current_user_role text;

    new_points integer;

begin

    select role
    into current_user_role

    from public.profiles

    where id = auth.uid();


    if current_user_role not in (
        'ADMIN',
        'HEAD_ADMIN'
    ) then

        raise exception
        'Keine Berechtigung';

    end if;


    update public.profiles

    set
        community_points =
            greatest(
                0,
                community_points +
                point_amount
            )

    where id = target_user

    returning community_points
    into new_points;


    insert into public.point_history (

        user_id,

        amount,

        reason,

        created_by

    )

    values (

        target_user,

        point_amount,

        point_reason,

        auth.uid()

    );


    insert into public.admin_logs (

        admin_id,

        action,

        target_user_id,

        details

    )

    values (

        auth.uid(),

        'POINTS_CHANGED',

        target_user,

        'Punkte geändert: ' ||
        point_amount ||
        ' | Grund: ' ||
        point_reason

    );

end;

$$;


-- =========================================================
-- 13. NICKNAME FARBE KAUFEN
-- GRAU = STANDARD
-- SCHWARZ = GEKAUFT
-- ROT = ADMIN
-- =========================================================

create or replace function
public.buy_nickname_color()

returns void
language plpgsql
security definer
set search_path = public
as $$

declare

    price integer := 100;

    current_points integer;

    current_role text;

begin

    select
        community_points,
        role

    into
        current_points,
        current_role

    from public.profiles

    where id = auth.uid();


    if current_role in (
        'ADMIN',
        'HEAD_ADMIN'
    ) then

        update public.profiles

        set
            nickname_color_owned = true

        where id = auth.uid();

        return;

    end if;


    if current_points < price then

        raise exception
        'Nicht genügend Punkte';

    end if;


    update public.profiles

    set

        community_points =
            community_points - price,

        nickname_color_owned = true

    where id = auth.uid();


    insert into
    public.marketplace_purchases (

        user_id,

        item,

        price

    )

    values (

        auth.uid(),

        'NICKNAME_COLOR_BLACK',

        price

    );


    insert into
    public.point_history (

        user_id,

        amount,

        reason,

        created_by

    )

    values (

        auth.uid(),

        -price,

        'Nickname-Farbe gekauft',

        auth.uid()

    );

end;

$$;


-- =========================================================
-- 14. ONLINE STATUS AKTUALISIEREN
-- =========================================================

create or replace function
public.set_user_online()

returns void
language plpgsql
security definer
set search_path = public
as $$

begin

    update public.profiles

    set

        is_online = true,

        last_seen = now()

    where id = auth.uid();

end;

$$;


create or replace function
public.set_user_offline()

returns void
language plpgsql
security definer
set search_path = public
as $$

begin

    update public.profiles

    set

        is_online = false,

        last_seen = now()

    where id = auth.uid();

end;

$$;


-- =========================================================
-- 15. ONLINE PUNKTE BELOHNUNG
-- 10 Punkte nach 5 Stunden
-- 20 Punkte nach 10 Stunden
-- =========================================================

create or replace function
public.claim_online_reward()

returns json
language plpgsql
security definer
set search_path = public
as $$

declare

    last_claim timestamptz;

    seconds_since_claim numeric;

    reward integer := 0;

begin

    select
        last_reward_claim

    into last_claim

    from public.profiles

    where id = auth.uid();


    if last_claim is null then

        update public.profiles

        set
            last_reward_claim = now()

        where id = auth.uid();


        return json_build_object(
            'reward',
            0,
            'message',
            'Noch keine Belohnung verfügbar'
        );

    end if;


    seconds_since_claim :=
        extract(
            epoch from
            now() - last_claim
        );


    if seconds_since_claim >= 36000 then

        reward := 20;

    elsif seconds_since_claim >= 18000 then

        reward := 10;

    else

        return json_build_object(

            'reward',
            0,

            'message',
            'Noch keine Belohnung verfügbar'

        );

    end if;


    update public.profiles

    set

        community_points =
            community_points + reward,

        last_reward_claim = now()

    where id = auth.uid();


    insert into
    public.point_history (

        user_id,

        amount,

        reason,

        created_by

    )

    values (

        auth.uid(),

        reward,

        'Onlinezeit-Belohnung',

        auth.uid()

    );


    return json_build_object(

        'reward',
        reward,

        'message',
        reward || ' Punkte erhalten'

    );

end;

$$;


-- =========================================================
-- 16. ROW LEVEL SECURITY
-- =========================================================

alter table public.profiles
enable row level security;

alter table public.friendships
enable row level security;

alter table public.point_history
enable row level security;

alter table public.profile_visits
enable row level security;

alter table public.messages
enable row level security;

alter table public.admin_logs
enable row level security;

alter table public.marketplace_purchases
enable row level security;


-- =========================================================
-- 17. PROFILE LESEN
-- =========================================================

create policy
"profiles public readable"

on public.profiles

for select

using (
    status = 'APPROVED'
    or
    id = auth.uid()
);


-- =========================================================
-- 18. EIGENES PROFIL ÄNDERN
-- =========================================================

create policy
"users update own profile"

on public.profiles

for update

using (
    id = auth.uid()
)

with check (
    id = auth.uid()
);


-- =========================================================
-- 19. FRIENDSHIPS LESEN
-- =========================================================

create policy
"users read own friendships"

on public.friendships

for select

using (

    requester_id = auth.uid()

    or

    receiver_id = auth.uid()

);


-- =========================================================
-- 20. FRIEND REQUEST SENDEN
-- =========================================================

create policy
"users send friend requests"

on public.friendships

for insert

with check (

    requester_id = auth.uid()

    and

    requester_id <> receiver_id

);


-- =========================================================
-- 21. FREUNDSCHAFT AKTUALISIEREN
-- =========================================================

create policy
"receiver updates friendship"

on public.friendships

for update

using (

    receiver_id = auth.uid()

);


-- =========================================================
-- 22. FREUNDSCHAFT LÖSCHEN
-- =========================================================

create policy
"users delete own friendships"

on public.friendships

for delete

using (

    requester_id = auth.uid()

    or

    receiver_id = auth.uid()

);


-- =========================================================
-- 23. PUNKTEVERLAUF
-- =========================================================

create policy
"users read own point history"

on public.point_history

for select

using (

    user_id = auth.uid()

);


-- =========================================================
-- 24. PROFILBESUCHE
-- =========================================================

create policy
"users insert profile visits"

on public.profile_visits

for insert

with check (

    visitor_id = auth.uid()

);


create policy
"users read profile visits"

on public.profile_visits

for select

using (

    profile_id = auth.uid()

);


-- =========================================================
-- 25. NACHRICHTEN
-- =========================================================

create policy
"users read own messages"

on public.messages

for select

using (

    sender_id = auth.uid()

    or

    receiver_id = auth.uid()

);


create policy
"users send messages"

on public.messages

for insert

with check (

    sender_id = auth.uid()

);


create policy
"receivers update messages"

on public.messages

for update

using (

    receiver_id = auth.uid()

);


-- =========================================================
-- 26. MARKETPLACE
-- =========================================================

create policy
"users read own purchases"

on public.marketplace_purchases

for select

using (

    user_id = auth.uid()

);


-- =========================================================
-- 27. REALTIME
-- =========================================================

alter publication supabase_realtime
add table public.profiles;

alter publication supabase_realtime
add table public.friendships;

alter publication supabase_realtime
add table public.messages;
