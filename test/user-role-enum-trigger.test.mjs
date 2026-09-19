import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI role trigger compares user_role enum as text", async () => {
  const migration = await source("supabase/migrations/20260920001000_fix_user_role_enum_trigger.sql");
  assert.match(migration, /coalesce\(new\.role::text,''\)/);
  assert.match(migration, /coalesce\(old\.role::text,''\)/);
  assert.doesNotMatch(migration, /coalesce\(new\.role,''\)/);
  assert.doesNotMatch(migration, /coalesce\(old\.role,''\)/);
});
