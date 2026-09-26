-- Remove exact duplicate permissive RLS policies. Each removed policy has an
-- identical remaining policy for the same role, command, USING, and WITH CHECK,
-- so effective access is unchanged while policy evaluation is simplified.

drop policy if exists "groups insert own" on public.groups;

drop policy if exists "homepage sections insert" on public.homepage_sections;

drop policy if exists "news insert own" on public.news;
drop policy if exists "news delete own or admin" on public.news;
drop policy if exists "news readable authenticated" on public.news;
drop policy if exists news_select_authenticated on public.news;
drop policy if exists "news update own or admin" on public.news;

drop policy if exists "visitor inserts" on public.profile_visits;

drop policy if exists "profiles update own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;

drop policy if exists "own permissions read" on public.user_permissions;
