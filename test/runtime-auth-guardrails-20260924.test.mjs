import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('runtime modules gate protected Supabase calls behind a session', async () => {
  const status = await source('src/profile-status-stories.js');
  const online = await source('src/online-status-sync.js');
  const regional = await source('src/regional-shell.js');
  const adminPolish = await source('src/admin-rights-region-polish.js');
  const automated = await source('src/automated-message-modern.js');

  assert.ok(status.indexOf('const user=await getViewer();if(!user)return;') < status.indexOf("cleanupExpired()"));
  assert.match(online, /getSession\(\)[\s\S]*if \(!session\?\.user\) return;[\s\S]*community_member_directory/);
  assert.match(regional, /getSession\(\)[\s\S]*if\(!user\)return;[\s\S]*from\('profiles'\)/);
  assert.match(adminPolish, /getSession\(\)[\s\S]*if\(!session\?\.user\)return;[\s\S]*from\('profiles'\)/);
  assert.match(automated, /getSession\(\)[\s\S]*if\(!user\)[\s\S]*from\("profiles"\)/);
});

test('admin dashboard uses protected summary RPC instead of direct private table counts', async () => {
  const code = await source('src/dashboard-top-polish.js');
  assert.match(code, /rpc\('admin_attention_summary'\)/);
  assert.doesNotMatch(code, /count\('account_deletion_requests'/);
  assert.doesNotMatch(code, /count\('community_group_owner_change_requests'/);
});

test('support identity no longer requests the removed group_moderator profile column', async () => {
  const code = await source('src/community-support-verification.js');
  assert.doesNotMatch(code, /select\([^\n]*group_moderator/);
  assert.match(code, /user_permissions/);
  assert.match(code, /manage_groups/);
});
