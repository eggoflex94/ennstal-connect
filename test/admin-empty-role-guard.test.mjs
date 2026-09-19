import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin role fallback never writes blank enum values", async () => {
  const client = await source("src/supabaseClient.js");
  assert.match(client, /const nextRole = String\(args\?\.new_role \|\| ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(client, /\["MEMBER", "SUPPORTER", "ADMIN"\]\.includes\(nextRole\)/);
  assert.match(client, /Member detail editing must never touch enum-backed role\/status fields/);
  assert.doesNotMatch(client, /role: args\?\.p_role, account_status: args\?\.p_account_status/);
});

test("admin UI validates role choices before RPC", async () => {
  const app = await source("src/App.jsx");
  const manager = await source("src/admin-role-manager.js");
  assert.match(app, /normalizedRole = String\(newRole \|\| ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(app, /\["MEMBER", "SUPPORTER", "ADMIN"\]\.includes\(normalizedRole\)/);
  assert.match(manager, /nextRole=String\(role\|\|''\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(manager, /\['MEMBER','SUPPORTER','ADMIN'\]\.includes\(nextRole\)/);
});
