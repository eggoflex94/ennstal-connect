import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('new public functions are secure by default', async () => {
  const sql = await source('supabase/migrations/20260926174000_secure_default_function_privileges.sql');
  assert.match(sql, /alter default privileges for role postgres in schema public/);
  assert.match(sql, /revoke execute on functions from public/);
});

test('legacy nickname-to-email resolver is not exposed', async () => {
  const sql = await source('supabase/migrations/20260926174100_retire_legacy_login_email_resolver.sql');
  assert.match(sql, /revoke execute on function public\.resolve_login_email\(text\)/);
  assert.match(sql, /from public, anon, authenticated/);
});

test('current login posts email directly to Supabase Auth', async () => {
  const app = await source('src/App.jsx');
  assert.match(app, /signInWithPassword\(\{ email: f\.get\("email"\), password: f\.get\("password"\) \}\)/);
  assert.doesNotMatch(app, /resolve_login_email/);
});
