import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('signed-in community RPCs are not granted to anon', async () => {
  const sql = await source('supabase/migrations/20260926174500_restrict_signed_in_content_rpcs.sql');
  for (const fn of [
    'community_group_directory',
    'ec_get_community_announcements',
    'ec_get_global_community_announcement',
    'ec_region_featured_community_group',
    'ec_region_group_directory',
    'ec_region_weekly_poll_current',
    'featured_community_group',
    'weekly_poll_current'
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`));
  }
  assert.match(sql, /to authenticated/);
});

test('anon grants are removed when RLS has no matching anon policy', async () => {
  const sql = await source('supabase/migrations/20260926174600_remove_ineffective_anon_table_grants.sql');
  assert.match(sql, /c\.relrowsecurity/);
  assert.match(sql, /has_table_privilege\('anon'/);
  assert.match(sql, /revoke select on table/);
  assert.match(sql, /revoke insert on table/);
  assert.match(sql, /revoke update on table/);
  assert.match(sql, /revoke delete on table/);
});
