-- Kaufpunkte are a spendable balance. Initial funding uses 2x existing normal points.
create table if not exists public.kaufpunkte_catalog (
 sku text primary key, title text not null, description text not null default '',
 price integer not null check(price>=0), kind text not null check(kind in ('LAYOUT','PROFILE_VISITS')),
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
 'owned',(select coalesce(jsonb_agg(k.sku),'[]'::jsonb) from public.kaufpunkte_purchases k where k.user_id=uid));
end $$;
create or replace function public.kaufpunkte_buy(p_sku text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); price_value integer; bal integer;
begin
 if uid is null then raise exception 'Login erforderlich'; end if;
 perform public.kaufpunkte_my_marketplace();
 select price into price_value from public.kaufpunkte_catalog where sku=p_sku and active for share;
 if not found then raise exception 'Artikel nicht verfügbar'; end if;
 select purchase_points into bal from public.profiles where id=uid for update;
 if exists(select 1 from public.kaufpunkte_purchases where user_id=uid and sku=p_sku) then raise exception 'Bereits gekauft'; end if;
 if bal < price_value then raise exception 'Nicht genug Kaufpunkte'; end if;
 update public.profiles set purchase_points=purchase_points-price_value where id=uid;
 insert into public.kaufpunkte_purchases(user_id,sku,price_paid) values(uid,p_sku,price_value);
 return jsonb_build_object('balance',bal-price_value,'sku',p_sku);
end $$;
revoke all on function public.kaufpunkte_buy(text) from public,anon;
revoke all on function public.kaufpunkte_my_marketplace() from public,anon;
grant execute on function public.kaufpunkte_buy(text),public.kaufpunkte_my_marketplace() to authenticated;
