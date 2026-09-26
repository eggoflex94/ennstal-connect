import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy presence RPCs are not directly exposed', async () => {
  const sql = await source('supabase/migrations/20260926180500_hide_legacy_presence_rpcs.sql');
  for (const fn of [
    'ec_touch_presence',
    'set_user_online',
    'set_user_offline',
    'update_online_status',
    'admin_online_status_watch',
    'admin_repair_stale_online_statuses'
  ]) {
    assert.match(sql, new RegExp(fn));
  }
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
});

test('current presence RPCs remain wired in active client sources', async () => {
  const app = await source('src/App.jsx');
  const mobile = await source('src/mobile-presence-sync.js');
  const rewards = await source('src/online-reward-tracker.js');
  assert.match(app, /record_presence/);
  assert.match(mobile, /record_presence/);
  assert.doesNotMatch(mobile, /ec_touch_presence/);
  assert.match(rewards, /record_online_time/);
});
