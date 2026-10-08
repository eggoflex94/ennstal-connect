-- Kaufpunkte are a spendable balance. Initial funding uses 2x existing normal points.
create table if not exists public.kaufpunkte_catalog (
 sku text primary key, title text not null, description text not null default '',
 price integer not null check(price>=0), kind text not null check(kind in ('LAYOUT','PROFILE_VISITS','SUPPORTER','HIGHLIGHT','DECORATION')),
 active boolean not null default true
);
create table if not exists public.kaufpunkte_purchases (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 sku text not null references public.kaufpunkte_catalog(sku), price_paid integer not null check(price_paid>=0),
 purchased_at timestamptz not null default now(), unique(user_id,sku)
);
insert into public.kaufpunkte_catalog(sku,title,description,price,kind) values
 ('theme-red','Rot','Rotes Profil-Design',10,'LAYOUT'),('theme-blue','Blau','Blaues Profil-Design',20,'LAYOUT'),
 ('theme-neon','Neon','Leuchtendes Profil-Design',35,'LAYOUT'),('theme-neon-pink','Neon Pink','Pinkes Neon-Design',50,'LAYOUT'),
 ('theme-alpine','Alpin','Alpines Profil-Design',65,'LAYOUT'),('theme-teal','Türkis','Türkises Profil-Design',80,'LAYOUT'),
 ('theme-violet','Violett','Violettes Profil-Design',95,'LAYOUT'),('theme-copper','Kupfer','Warmes Kupfer-Design',110,'LAYOUT'),
 ('theme-aurora','Aurora','Aurora Profil-Design',125,'LAYOUT'),('profile-visits','Profilbesuche','Sieh, wer dein Profil besucht hat',100,'PROFILE_VISITS')
 ,('supporter-3m','Supporter-Stern · 3 Monate','Supporter-Stern für drei Monate',700,'SUPPORTER'),
 ('highlight-1d','Mitglied hervorheben · 1 Tag','Dezente Hervorhebung für 24 Stunden, immer unter offiziellen Rollen.',30,'HIGHLIGHT'),
 ('highlight-3d','Mitglied hervorheben · 3 Tage','Dezente Hervorhebung für drei Tage, immer unter offiziellen Rollen.',90,'HIGHLIGHT'),
 ('highlight-7d','Mitglied hervorheben · 7 Tage','Dezente Hervorhebung für sieben Tage, immer unter offiziellen Rollen.',200,'HIGHLIGHT'),
 ('highlight-14d','Mitglied hervorheben · 14 Tage','Dezente Hervorhebung für zwei Wochen, immer unter offiziellen Rollen.',450,'HIGHLIGHT'),
 ('highlight-30d','Mitglied hervorheben · 30 Tage','Dezente Hervorhebung für einen Monat, immer unter offiziellen Rollen.',1100,'HIGHLIGHT'),
 ('frame-alpine','Alpen-Profilrahmen','Dekorativer Profilrahmen',25,'DECORATION'),
 ('frame-glow','Neon-Profilrahmen','Leuchtender Profilrahmen',75,'DECORATION'),
 ('banner-alpine','Alpen-Profilbanner','Regionales Profilbanner',40,'DECORATION'),
 ('nickname-gradient','Nickname-Farbverlauf','Dezenter Namens-Farbverlauf ohne Rollenprivilegien',120,'DECORATION'),
 ('season-badge','Saison-Abzeichen','Dekoratives Sammler-Abzeichen',300,'DECORATION')
on conflict(sku) do nothing;
alter table public.kaufpunkte_catalog enable row level security;
alter table public.kaufpunkte_purchases enable row level security;
grant select on public.kaufpunkte_catalog to authenticated;
grant select on public.kaufpunkte_purchases to authenticated;
create policy "catalog visible" on public.kaufpunkte_catalog for select to authenticated using(true);
create policy "own purchases visible" on public.kaufpunkte_purchases for select to authenticated using(user_id=(select auth.uid()));
-- Initialize each user's balance once; does not overwrite legacy purchase_points.
create table if not exists public.kaufpunkte_initializations(user_id uuid primary key references public.profiles(id) on delete cascade);
create or replace function public.kaufpunkte_my_marketplace()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); p public.profiles%rowtype;
begin
 if uid is null then raise exception 'Login erforderlich'; end if;
 select * into p from public.profiles where id=uid for update;
 if not found then raise exception 'Profil nicht gefunden'; end if;
 if not exists(select 1 from public.kaufpunkte_initializations where user_id=uid) then
   update public.profiles set purchase_points=greatest(coalesce(purchase_points,0),greatest(coalesce(points,0),0)*2) where id=uid;
   insert into public.kaufpunkte_initializations(user_id) values(uid);
 end if;
 return jsonb_build_object('balance',(select purchase_points from public.profiles where id=uid),
 'normal_points',p.points,'catalog',(select coalesce(jsonb_agg(to_jsonb(c) order by c.price), '[]'::jsonb) from public.kaufpunkte_catalog c where active),
 'owned',(select coalesce(jsonb_agg(k.sku),'[]'::jsonb) from public.kaufpunkte_purchases k where k.user_id=uid),
 'highlight_until',(select active_until from public.kaufpunkte_highlights where user_id=uid),
 'wishlist',(select coalesce(jsonb_agg(w.sku),'[]'::jsonb) from public.kaufpunkte_wishlist w where w.user_id=uid),
 'purchase_history',(select coalesce(jsonb_agg(jsonb_build_object('sku',k.sku,'price',k.spent,'date',k.created_at) order by k.created_at desc),'[]'::jsonb) from public.kaufpunkte_spend_history k where k.user_id=uid));
end $$;
-- Audit every point deduction including renewable supporter and highlights.
create table if not exists public.kaufpunkte_spend_history(
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 sku text not null references public.kaufpunkte_catalog(sku),
 spent integer not null check(spent>=0),
 created_at timestamptz not null default now()
);
alter table public.kaufpunkte_spend_history enable row level security;
grant select on public.kaufpunkte_spend_history to authenticated;
create policy "own spend history" on public.kaufpunkte_spend_history
 for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.kaufpunkte_buy(p_sku text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); price_value integer; bal integer;
begin
 if uid is null then raise exception 'Login erforderlich'; end if;
 perform public.kaufpunkte_my_marketplace();
 select price into price_value from public.kaufpunkte_catalog where sku=p_sku and active for share;
 if not found then raise exception 'Artikel nicht verfügbar'; end if;
 select purchase_points into bal from public.profiles where id=uid for update;
 if p_sku not in ('supporter-3m','highlight-1d','highlight-3d','highlight-7d','highlight-14d','highlight-30d') and exists(select 1 from public.kaufpunkte_purchases where user_id=uid and sku=p_sku) then raise exception 'Bereits gekauft'; end if;
 if bal < price_value then raise exception 'Nicht genug Kaufpunkte'; end if;
 update public.profiles set purchase_points=purchase_points-price_value where id=uid;
 if p_sku in ('highlight-1d','highlight-3d','highlight-7d','highlight-14d','highlight-30d') then
   insert into public.kaufpunkte_highlights(user_id,active_until)
    values(uid,now() + (substring(p_sku from 'highlight-([0-9]+)d')::integer * interval '1 day'))
   on conflict(user_id) do update set active_until =
    greatest(public.kaufpunkte_highlights.active_until,now()) +
    (substring(p_sku from 'highlight-([0-9]+)d')::integer * interval '1 day');
 elsif p_sku='supporter-3m' then
   update public.profiles set supporter_until=greatest(coalesce(supporter_until,now()),now())+interval '3 months' where id=uid;
 else
   insert into public.kaufpunkte_purchases(user_id,sku,price_paid) values(uid,p_sku,price_value);
 end if;
 insert into public.kaufpunkte_spend_history(user_id,sku,spent) values(uid,p_sku,price_value);
 return jsonb_build_object('balance',bal-price_value,'sku',p_sku);
end $$;
revoke all on function public.kaufpunkte_buy(text) from public,anon;
revoke all on function public.kaufpunkte_my_marketplace() from public,anon;
grant execute on function public.kaufpunkte_buy(text),public.kaufpunkte_my_marketplace() to authenticated;


-- A personal wishlist is independent of purchases; only the owner may change it.
create table if not exists public.kaufpunkte_wishlist (
 user_id uuid not null references public.profiles(id) on delete cascade,
 sku text not null references public.kaufpunkte_catalog(sku) on delete cascade,
 added_at timestamptz not null default now(),
 primary key(user_id,sku)
);
alter table public.kaufpunkte_wishlist enable row level security;
grant select,insert,delete on public.kaufpunkte_wishlist to authenticated;
create policy "own wishlist read" on public.kaufpunkte_wishlist for select to authenticated using(user_id=(select auth.uid()));
create policy "own wishlist add" on public.kaufpunkte_wishlist for insert to authenticated with check(user_id=(select auth.uid()));
create policy "own wishlist remove" on public.kaufpunkte_wishlist for delete to authenticated using(user_id=(select auth.uid()));
-- Only real entitlements may be sold. Cosmetic SKUs remain hidden until usable.
update public.kaufpunkte_catalog set active=false where kind in ('DECORATION','PROFILE_VISITS');

-- Paid visibility is only a decoration; official staff roles always retain ranking priority.
create table if not exists public.kaufpunkte_highlights (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 active_until timestamptz not null
);
alter table public.kaufpunkte_highlights enable row level security;
grant select on public.kaufpunkte_highlights to authenticated;
create policy "members see highlight status" on public.kaufpunkte_highlights for select to authenticated using (true);

-- Award two spendable Kaufpunkte for every newly earned normal point; spending never modifies normal points.
create or replace function public.kaufpunkte_earned_trigger()
returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.kaufpunkte_initializations where user_id=new.id) then
   new.purchase_points:=greatest(0,coalesce(new.purchase_points,0)+greatest(0,coalesce(new.points,0)-coalesce(old.points,0))*2);
 end if;
 return new;
end $$;
create trigger kaufpunkte_points_accrual before update of points on public.profiles
for each row execute function public.kaufpunkte_earned_trigger();
create or replace function public.kaufpunkte_set_price(p_sku text,p_price integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_primary_head_admin=true and account_status='ACTIVE') then
  raise exception 'Nur der Betreiber darf Preise ändern';
 end if;
 if p_price is null or p_price<0 then raise exception 'Ungültiger Preis'; end if;
 update public.kaufpunkte_catalog set price=p_price where sku=p_sku;
 if not found then raise exception 'Artikel nicht gefunden'; end if;
end $$;
revoke all on function public.kaufpunkte_set_price(text,integer) from public,anon;
grant execute on function public.kaufpunkte_set_price(text,integer) to authenticated;
-- Previously earned online-time layouts remain valid; a purchased layout is an additional route.
create or replace function public.enforce_profile_layout_unlock()
returns trigger language plpgsql set search_path=public as $$
declare v_required_hours integer;
begin
 if new.profile_layout is not distinct from old.profile_layout then return new; end if;
 if new.profile_layout='standard' then return new; end if;
 if new.role::text in ('HEAD_ADMIN','ADMIN','SUPPORTER') or new.account_badge='BUSINESS' then return new; end if;
 if exists(select 1 from public.kaufpunkte_purchases where user_id=new.id and sku=new.profile_layout) then return new; end if;
 v_required_hours := case new.profile_layout
 when 'alpine' then 5 when 'aurora' then 20 when 'ocean' then 35 when 'slate' then 50
 when 'ember' then 70 when 'redwood' then 90 when 'lavender' then 110
 when 'midnight' then 130 when 'sunrise' then 150 when 'neon' then 180
 else 2147483647 end;
 if coalesce(new.total_online_seconds,0)::bigint >= v_required_hours::bigint * 3600 then return new; end if;
 raise exception 'Layout erst durch Onlinezeit oder Kaufpunkte-Kauf freischalten.';
end $$;
revoke all on function public.enforce_profile_layout_unlock() from public,anon,authenticated;
