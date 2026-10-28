create table public.operator_page_blocks (
 page_key text not null check(length(page_key) between 1 and 120),
 region_key text not null default 'global' check(length(region_key) between 1 and 120),
 block_key text not null check(length(block_key) between 1 and 180),
 content jsonb not null default '{}'::jsonb check(jsonb_typeof(content)='object' and octet_length(content::text)<=65536),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id),
 editor_profile jsonb not null default '{}'::jsonb,
 primary key(page_key,region_key,block_key)
);
alter table public.operator_page_blocks enable row level security;
grant select,insert,update,delete on public.operator_page_blocks to authenticated;
revoke all on public.operator_page_blocks from anon;
create policy page_blocks_read on public.operator_page_blocks for select to authenticated using (true);
create policy page_blocks_operator_write on public.operator_page_blocks for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_primary_head_admin=true and p.role::text='HEAD_ADMIN' and p.account_status='ACTIVE'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_primary_head_admin=true and p.role::text='HEAD_ADMIN' and p.account_status='ACTIVE'));
create function public.operator_page_block_stamp() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.updated_at=clock_timestamp(); new.updated_by=auth.uid();
 select jsonb_build_object('id',p.id,'nickname',p.nickname,'role',p.role,'is_primary_head_admin',p.is_primary_head_admin)
 into new.editor_profile from public.profiles p where p.id=auth.uid();
 return new;
end; $$;
revoke all on function public.operator_page_block_stamp() from public,anon;
create trigger operator_page_block_stamp before insert or update on public.operator_page_blocks for each row execute function public.operator_page_block_stamp();
notify pgrst,'reload schema';