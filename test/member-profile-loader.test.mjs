import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('member cards load a fresh profile before opening', async () => {
  const directory = await source('src/NativeMembersDirectory.jsx');
  const card = await source('src/MemberCardView.jsx');
  assert.match(directory, /loadMemberProfile\(member\)/);
  assert.match(directory, /Profil wird geladen/);
  assert.match(card, /loadMemberProfile\(member\)/);
});

test('fresh profile loader uses the dedicated authenticated RPC', async () => {
  const loader = await source('src/memberProfileLoader.js');
  const migration = await source('supabase/add_member_profile_loader_rpc.sql');
  assert.match(loader, /community_member_profile/);
  assert.match(loader, /inFlight\.has\(id\)/);
  assert.match(loader, /PROFILE_TTL_MS/);
  assert.match(migration, /grant execute on function public\.community_member_profile\(uuid\) to authenticated/);
  assert.match(migration, /revoke all on function public\.community_member_profile\(uuid\) from anon/);
});
