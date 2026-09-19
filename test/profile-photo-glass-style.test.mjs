import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("profile photo panel matches covered profile info glass style", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /\.ec-member-profile-final \.ec-mp-card\.has-profile-cover \.ec-mp-photo\{/);
  assert.match(css, /background:rgba\(9,26,38,\.66\)!important/);
  assert.match(css, /border:1px solid rgba\(255,255,255,\.18\)!important/);
  assert.match(css, /backdrop-filter:blur\(10px\)!important/);
});
