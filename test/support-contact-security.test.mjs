import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('support contacts require a signed-in user', async () => {
  const code = await source('src/community-support-verification.js');
  assert.match(code, /if \(currentUser\) \{[\s\S]*loadSupportContacts\(\)/);
  assert.match(code, /Persönliche Community-Ansprechpartner werden nach der Anmeldung angezeigt/);
});

test('moderation contact RPC is not anonymous', async () => {
  const sql = await source('supabase/migrations/20260926175000_restrict_moderation_contacts_to_authenticated.sql');
  assert.match(sql, /revoke execute on function public\.community_moderation_contacts\(\)/);
  assert.match(sql, /from public, anon/);
  assert.match(sql, /to authenticated/);
});
