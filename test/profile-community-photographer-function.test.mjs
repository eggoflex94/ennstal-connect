import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("member profile function card shows Community Photographer status", async () => {
  const runtime = await source("src/member-profile-final.js");
  assert.match(runtime, /is_community_photographer/);
  assert.match(runtime, /Community-Fotograf/);
  assert.match(runtime, /community-photographer-camera\.svg/);
  assert.match(runtime, /community_photographer_global/);
  assert.match(runtime, /community_photographer_region_ids/);
  assert.match(runtime, /Alle Regionen/);
});

test("Community Photographer function row uses dedicated profile styling", async () => {
  const css = await source("src/member-profile-final.css");
  assert.match(css, /\.ec-mp-function-photographer/);
  assert.match(css, /\.ec-mp-function-camera/);
  assert.match(css, /\.ec-mp-function-copy/);
});


test("own-profile photographer banner stays compact", async () => {
  const css = await source("src/community-photographer.css");
  assert.match(css, /\.community-photographer-self-banner>img/);
  assert.match(css, /max-width:34px!important/);
  assert.match(css, /max-height:34px!important/);
  assert.match(css, /object-fit:contain!important/);
});


test("profile function card refreshes when photographer status changes", async () => {
  const runtime = await source("src/member-profile-final.js");
  assert.match(runtime, /hasPhotographerRow/);
  assert.match(runtime, /shouldHavePhotographerRow/);
  assert.match(runtime, /existingCard\.remove\(\)/);
  assert.match(runtime, /delete root\.dataset\.ecMemberProfileFinal/);
});
