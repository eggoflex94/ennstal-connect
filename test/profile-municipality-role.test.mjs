import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile admin tools expose the municipality role to head admins", async () => {
  const runtime = await source("src/profile-admin-tools-runtime.js");

  assert.match(runtime, /MUNICIPALITY:'Gemeinde'/);
  assert.match(runtime, /Zum Gemeindekonto machen/);
  assert.match(runtime, /role:MUNICIPALITY/);
  assert.match(
    runtime,
    /admin_set_role'.*target_user:ctx\.target\.id,new_role:next/s
  );
});

test("database migration allows municipality through admin_set_role", async () => {
  const migration = await source("supabase/migrations/20260922123000_municipality_account_role.sql");

  assert.match(migration, /new_role not in \('MEMBER','SUPPORTER','ADMIN','MUNICIPALITY'\)/);
  assert.match(migration, /when 'MUNICIPALITY' then 'die Rolle Gemeinde'/);
});
