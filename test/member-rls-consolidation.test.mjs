import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('overlapping member RLS policies are consolidated', async () => {
  const sql = await source('supabase/migrations/20260926182000_consolidate_overlapping_member_rls.sql');
  const statements = [
    'drop policy if exists "users send friend requests" on public.friendships;',
    'drop policy if exists "users read own friendships" on public.friendships;',
    'drop policy if exists "receiver updates friendship" on public.friendships;',
    'drop policy if exists users_can_send_messages on public.messages;',
    'drop policy if exists messages_select on public.messages;',
    'drop policy if exists users_can_read_own_messages on public.messages;',
    'drop policy if exists receivers_can_mark_messages_read on public.messages;',
    'drop policy if exists profile_activity_create on public.profile_activity;',
    'drop policy if exists profile_activity_read on public.profile_activity;',
    'drop policy if exists profile_visits_create on public.profile_visits;',
    'drop policy if exists "users read profile visits" on public.profile_visits;',
    'drop policy if exists "visit owner reads" on public.profile_visits;'
  ];
  for (const statement of statements) assert.ok(sql.includes(statement));
  assert.doesNotMatch(sql, /create policy/i);
});
