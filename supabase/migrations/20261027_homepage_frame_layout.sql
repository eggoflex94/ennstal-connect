-- Managed homepage frames. Defaults are supplied by the existing home modules.
create table if not exists public.homepage_frame_layout (
 scope_key text not null,
 block_key text not null,
 sort_order integer not null default 100,
 width_percent integer not null default 100 check(width_percent in (50,75,100)),
 is_visible boolean not null default true,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(scope_key,block_key),
 constraint valid_home_block check(block_key in ('next-activity','community','join','welcome','discover')),
 constraint valid_home_scope check(scope_key='GLOBAL' or scope_key like 'REGION:%')
);
alter table public.homepage_frame_layout enable row level security;
create policy homepage_frame_layout_read on public.homepage_frame_layout for select to authenticated using(true);
create policy homepage_frame_layout_insert on public.homepage_frame_layout for insert to authenticated
 with check(public.ec_is_head_admin() or (scope_key like 'REGION:%' and public.has_permission('manage_homepage')));
create policy homepage_frame_layout_update on public.homepage_frame_layout for update to authenticated
 using(public.ec_is_head_admin() or (scope_key like 'REGION:%' and public.has_permission('manage_homepage')))
 with check(public.ec_is_head_admin() or (scope_key like 'REGION:%' and public.has_permission('manage_homepage')));
grant select,insert,update on public.homepage_frame_layout to authenticated;
