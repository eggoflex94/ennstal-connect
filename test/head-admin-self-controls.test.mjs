import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Head Admin self controls are wired into own profile", async () => {
  const app = await source("src/App.jsx");
  const controls = await source("src/HeadAdminSelfControls.jsx");

  assert.match(app, /import HeadAdminSelfControls/);
  assert.match(app, /<HeadAdminSelfControls/);
  assert.match(controls, /profile\?\.role/);
  assert.match(controls, /HEAD_ADMIN/);
  assert.match(controls, /profile\?\.id !== user\.id/);
});

test("Head Admin can assign own Community Photographer scope", async () => {
  const controls = await source("src/HeadAdminSelfControls.jsx");
  assert.match(controls, /set_community_photographer_assignment/);
  assert.match(controls, /p_target_user: user\.id/);
  assert.match(controls, /p_scope: "GLOBAL"/);
  assert.match(controls, /p_scope: "REGIONAL"/);
});

test("Head Admin own points use dedicated audited RPC", async () => {
  const controls = await source("src/HeadAdminSelfControls.jsx");
  const migration = await source("supabase/migrations/20260919174500_head_admin_self_points.sql");

  assert.match(controls, /head_admin_adjust_own_points/);
  assert.doesNotMatch(controls, /Math\.abs\(delta\) > 100/);
  assert.doesNotMatch(controls, /reason\.length < 10/);

  assert.match(migration, /upper\(role::text\)='HEAD_ADMIN'/);
  assert.doesNotMatch(migration, /abs\(p_delta\)>100/);
  assert.doesNotMatch(migration, /char_length\(v_reason\)<10/);
  assert.match(migration, /point_transactions/);
  assert.match(migration, /point_history/);
  assert.match(migration, /admin_logs/);
  assert.match(migration, /HEAD_ADMIN_SELF/);
  assert.match(migration, /revoke all on function public\.head_admin_adjust_own_points\(integer,text\) from public, anon/);
});

test("Head Admin self controls remain touch friendly", async () => {
  const css = await source("src/community-photographer.css");
  assert.match(css, /\.head-admin-self-controls/);
  assert.match(css, /@media\(pointer:coarse\)/);
  assert.match(css, /min-height:48px!important/);
});
