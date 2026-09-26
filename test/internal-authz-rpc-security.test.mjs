import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('internal authorization helpers are not exposed as direct RPCs', async () => {
  const sql = await source('supabase/migrations/20260926175500_hide_internal_authorization_helpers.sql');
  for (const fn of [
    'ec_can_view_personal_data',
    'ec_has_admin_permission',
    'ec_is_admin',
    'ec_is_head_admin',
    'ec_is_primary_head_admin',
    'ec_is_regional_admin'
  ]) {
    assert.match(sql, new RegExp(fn));
  }
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
});

test('client-facing community group capability check remains signed-in only', async () => {
  const sql = await source('supabase/migrations/20260926175500_hide_internal_authorization_helpers.sql');
  assert.match(sql, /grant execute on function public\.ec_can_manage_community_groups\(uuid\) to authenticated/);
  assert.match(sql, /revoke execute on function public\.ec_can_manage_community_groups\(uuid\) from public, anon/);
});
