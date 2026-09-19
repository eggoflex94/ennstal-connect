import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("online friends use one interactive row without nested profile anchors", async () => {
  const dashboard = await source("src/dashboard-top-polish.js");
  const links = await source("src/people-links-polish.js");

  assert.match(dashboard, /<button type="button" class="ec-online-friend"/);
  const normalize = links.match(/function normalizeOnlineFriends\(\)\{([\s\S]*?)\n\}\n\nfunction linkResponsibilityPeople/)?.[1] || "";
  assert.doesNotMatch(normalize, /makeVisualLink\(/);
  assert.match(normalize, /nestedLink/);
  assert.match(normalize, /replaceWith\(strong\)/);
  assert.match(normalize, /touchAction='manipulation'/);
});

test("online friend clicks still route through the canonical profile event", async () => {
  const dashboard = await source("src/dashboard-top-polish.js");
  const links = await source("src/people-links-polish.js");

  assert.match(dashboard, /ec:open-profile/);
  assert.match(links, /ec:open-profile/);
  assert.match(links, /\.ec-online-friend\[data-profile-id\]/);
});
