import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile admin tools expose a dedicated member home region control", async () => {
  const runtime = await source("src/profile-admin-tools-runtime.js");
  assert.match(runtime, /'Mitgliedsregion'/);
  assert.match(runtime, /class="ec-home-region-select"/);
  assert.match(runtime, /'home-region'/);
  assert.match(runtime, /ec_head_set_home_region/);
  assert.match(runtime, /p_target:ctx\.target\.id/);
  assert.match(runtime, /p_region_slug:region\.slug/);
});

test("home region changes do not alter regional admin or moderator assignments", async () => {
  const runtime = await source("src/profile-admin-tools-runtime.js");
  const start = runtime.indexOf("if(action==='home-region'");
  assert.ok(start >= 0);
  const block = runtime.slice(start, runtime.indexOf("if(action==='photographer-global'", start));
  assert.doesNotMatch(block, /ec_set_regional_admin/);
  assert.doesNotMatch(block, /ec_set_regional_moderator/);
  assert.match(block, /Heimatregion wurde auf/);
});
