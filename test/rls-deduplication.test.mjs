import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('exact duplicate RLS policies are removed without broadening access', async () => {
  const sql = await source('supabase/migrations/20260926181500_dedupe_exact_rls_policies.sql');
  const statements = [
    'drop policy if exists "groups insert own" on public.groups;',
    'drop policy if exists "homepage sections insert" on public.homepage_sections;',
    'drop policy if exists "news insert own" on public.news;',
    'drop policy if exists "news delete own or admin" on public.news;',
    'drop policy if exists "news readable authenticated" on public.news;',
    'drop policy if exists news_select_authenticated on public.news;',
    'drop policy if exists "news update own or admin" on public.news;',
    'drop policy if exists "visitor inserts" on public.profile_visits;',
    'drop policy if exists "profiles update own profile" on public.profiles;',
    'drop policy if exists "users update own profile" on public.profiles;',
    'drop policy if exists "own permissions read" on public.user_permissions;'
  ];
  for (const statement of statements) assert.ok(sql.includes(statement));
  assert.doesNotMatch(sql, /create policy/i);
});
