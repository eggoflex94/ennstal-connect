import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('unused admin RPCs are hidden from direct client execution', async () => {
  const sql = await source('supabase/migrations/20260926181000_hide_unused_admin_rpcs.sql');
  for (const fn of [
    'admin_account_review_queue',
    'admin_attention_summary',
    'admin_delete_homepage_frame',
    'admin_profile_reports',
    'admin_queue_existing_registration',
    'admin_registration_approval_queue',
    'admin_reload_watch',
    'admin_remove_reported_member_photo',
    'admin_set_business_jobs_enabled',
    'admin_set_temporary_supporter',
    'admin_system_watch_summary',
    'admin_update_homepage_frame'
  ]) {
    assert.match(sql, new RegExp(fn));
  }
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
});
