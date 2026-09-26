import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('profile bootstrap renders saved profile even when optional capability lookups fail', async () => {
  const app = await source('src/App.jsx');
  assert.match(app, /const p = await read\(supabase\.from\("profiles"\)\.select\("\*"\)/);
  assert.match(app, /const readOptional = async \(query, fallback, label\)/);
  assert.match(app, /readOptional\(supabase\.rpc\("ec_can_view_personal_data"\), false/);
  assert.match(app, /readOptional\(supabase\.rpc\("my_admin_permissions"\), \{\}/);
  assert.match(app, /if \(!p\) \{[\s\S]*throw new Error\("Dein Profil konnte nicht geladen werden/);
});

test('personal-data capability RPC remains signed-in only', async () => {
  const sql = await source('supabase/migrations/20260926182500_restore_client_personal_data_capability_rpc.sql');
  assert.match(sql, /grant execute on function public\.ec_can_view_personal_data\(\) to authenticated/);
  assert.match(sql, /revoke execute on function public\.ec_can_view_personal_data\(\) from public, anon/);
});

test('saved red and blue layouts are applied from loaded profile state', async () => {
  const app = await source('src/App.jsx');
  assert.match(app, /\["theme-red", "theme-blue"\]\.includes\(profile\?\.profile_layout\)/);
});
