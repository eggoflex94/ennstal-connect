import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth helper stays lightweight and does not inject promotional UI after React render', async () => {
  const code = await source('src/auth-community-intro.js');
  assert.match(code, /syncRegistrationRegions/);
  assert.doesNotMatch(code, /mountCurrentNews|mountRewardNews|ec-auth-intro-grid/);
  assert.doesNotMatch(code, /window\.addEventListener\(['"]focus['"]/);
  assert.doesNotMatch(code, /\.innerHTML\s*=/);
});

test('professional auth theme remains the final auth styling layer', async () => {
  const helper = await source('src/auth-community-intro.js');
  const css = await source('src/auth-professional-final.css');
  assert.match(helper, /import ['"]\.\/auth-professional-final\.css['"]/);
  assert.match(css, /\.auth-page \.ec-auth-welcome/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.18fr\) minmax\(360px, \.82fr\)/);
  assert.match(css, /@media \(max-width: 880px\)/);
});

test('member directory payload keeps privacy settings required by profile rendering', async () => {
  const sql = await source('supabase/fix_member_profile_visibility_payload.sql');
  assert.match(sql, /to_jsonb\(p\)/);
  assert.doesNotMatch(sql, /-\s*'privacy_settings'/);
  assert.match(sql, /p\.privacy_settings\s*->>\s*'last_name'/);
});

test('profile sections reset stale content when navigating between members', async () => {
  const code = await source('src/ProfileSections.jsx');
  assert.match(code, /setItems\(\[\]\)/);
  assert.match(code, /setExtrasLoading\(true\)/);
  assert.match(code, /\[member\?\.id\]/);
  assert.match(code, /if \(cancelled\) return/);
});

test('member profile hides only duplicate top-level groups and photo folders', async () => {
  const css = await source('src/profile-final-stability.css');
  assert.match(css, /\.content-root:has\(> \.member-profile-page\) > \.member-groups/);
  assert.match(css, /\.content-root:has\(> \.member-profile-page\) > \.public-photo-folder/);
  assert.match(css, /\.member-profile-page \.member-profile-hero/);
});
