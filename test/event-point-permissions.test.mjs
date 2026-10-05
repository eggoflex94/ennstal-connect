import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("event-point permissions are centralized without removing the existing RPC", async () => {
  const sql = await source("supabase/migrations/20261005081500_centralize_event_point_permissions.sql");
  assert.match(sql, /create or replace function public\.ec_can_award_event_points/);
  assert.match(sql, /create or replace function public\.award_event_points/);
  assert.match(sql, /upper\(actor\.role::text\) in \('ADMIN','HEAD_ADMIN'\)/);
  assert.match(sql, /coalesce\(target\.is_primary_head_admin,false\) = false/);
  assert.match(sql, /upper\(target\.role::text\) <> 'HEAD_ADMIN'/);
  assert.match(sql, /or upper\(actor\.role::text\) = 'HEAD_ADMIN'/);
  assert.match(sql, /p_amount between 1 and 100/);
  assert.match(sql, /p_actor <> p_target/);
});

test("non-primary Head Admins remain selectable for event points", async () => {
  const app = await source("src/App.jsx");
  assert.match(app, /!member\.is_primary_head_admin/);
  assert.match(app, /recipient\?\.is_primary_head_admin/);
  assert.doesNotMatch(app, /String\(member\.role \|\| ""\)\.toUpperCase\(\) !== "HEAD_ADMIN"/);
});

test("only the primary Head Admin can change another Head Admin role", async () => {
  const roleSql = await source("supabase/migrations/20261004003500_head_admin_set_role.sql");
  assert.match(roleSql, /if not public\.ec_is_head_admin\(\) then/);
  assert.match(roleSql, /Nur der primäre Head Admin darf diese Rollenänderung durchführen/);
});
