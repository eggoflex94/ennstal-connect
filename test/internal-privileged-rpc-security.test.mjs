import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('internal privileged helpers are not exposed directly', async () => {
  const sql = await source('supabase/migrations/20260926180000_hide_internal_privileged_helpers.sql');
  for (const fn of [
    'ec_audit_insert',
    'ec_enforce_rate_limit',
    'ec_admin_can_moderate_target',
    'ec_effective_role_for',
    'ec_send_assignment_message',
    'ec_send_admin_forum_welcome'
  ]) {
    assert.match(sql, new RegExp(fn));
  }
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
});
