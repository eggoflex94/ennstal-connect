import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("member card avatar keeps its size and uses role border color", async () => {
  const css = await source("src/member-card-mockup-final.css");
  assert.match(css, /width:86px!important/);
  assert.match(css, /height:86px!important/);
  assert.match(css, /border:3px solid var\(--ec-card-border\)!important/);
  assert.match(css, /border-radius:50%!important/);
});

test("profile photo uses role-colored frame and square shape without changing size", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /width:190px!important/);
  assert.match(css, /height:190px!important/);
  assert.match(css, /border:5px solid var\(--ec-profile-role-color\)!important/);
  assert.match(css, /border-radius:22px!important/);
  assert.match(css, /data-role-theme="admin"/);
  assert.match(css, /data-role-theme="supporter"/);
  assert.match(css, /data-role-theme="business"/);
  assert.match(css, /data-role-theme="member"/);
});

test("profile renderer assigns a role theme to the photo panel", async () => {
  const runtime = await source("src/member-profile-final.js");
  assert.match(runtime, /const photoTheme=/);
  assert.match(runtime, /photo\.dataset\.roleTheme=photoTheme/);
});
