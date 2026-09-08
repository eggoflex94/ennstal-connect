import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("production build stays source-native and avoids build-time source rewriting", async () => {
  const pkg = JSON.parse(await source("package.json"));
  assert.equal(pkg.scripts.build, "vite build");
});

test("all primary top navigation destinations have a React route target", async () => {
  const app = await source("src/App.jsx");
  const shell = await source("src/regional-shell.js");
  const routePairs = [
    ["home", "home"],
    ["members", "members"],
    ["forum", "forum"],
    ["groups", "groups"],
    ["events", "community"],
    ["news", "news"],
    ["community", "community"],
  ];
  for (const [requested, target] of routePairs) {
    assert.match(shell, new RegExp(`['\"]${escapeRe(requested)}['\"]`));
    assert.match(app, new RegExp(`${escapeRe(requested)}:\\s*[\"]${escapeRe(target)}[\"]`));
    assert.match(app, new RegExp(`page === \\\"${escapeRe(target)}\\\"|page === \"${escapeRe(target)}\"`));
  }
});

test("profile links from directory and side surfaces converge on the same profile event", async () => {
  const app = await source("src/App.jsx");
  const shell = await source("src/regional-shell.js");
  assert.match(app, /window\.addEventListener\("ec:open-profile"/);
  assert.match(app, /setPage\(member\.id === user\.id \? "profile" : "member-profile"\)/);
  assert.match(app, /<MemberGrid[\s\S]*onOpen=\{openMember\}/);
  assert.match(shell, /new CustomEvent\('ec:open-profile'/);
});

test("core community write handlers are present", async () => {
  const app = await source("src/App.jsx");
  const handlers = [
    "requestFriend", "respondToFriendRequest", "removeFriend", "sendMessage", "deleteMessage",
    "createNews", "editNews", "deleteNews", "createCommunityEvent", "editCommunityEvent",
    "cancelCommunityEvent", "deleteCommunityEvent", "createGroup", "joinGroup", "leaveGroup",
    "editGroup", "deleteGroup", "createForumPost", "editForumPost", "deleteForumPost",
    "createHomepageSection", "editHomepageSection", "deleteHomepageSection", "saveProfile",
  ];
  for (const name of handlers) assert.match(app, new RegExp(`(?:async\\s+)?function\\s+${name}\\b|const\\s+${name}\\s*=`));
});

test("regional content sources use the active region", async () => {
  const app = await source("src/App.jsx");
  assert.match(app, /const activeRegionId = activeRegion\?\.id \|\| profile\?\.home_region_id \|\| null/);
  for (const table of ["homepage_sections", "news", "community_events", "community_ads", "forum_posts", "community_requests"]) {
    assert.match(app, new RegExp(`from\\(\\"${table}\\"\\)[\\s\\S]{0,260}eq\\(\\"region_id\\", activeRegionId\\)`));
  }
});

test("React-owned home DOM is not rewritten by the removed regional event runtime", async () => {
  const main = await source("src/main.jsx");
  assert.doesNotMatch(main, /import\s+["']\.\/home-next-event-region-final\.js["']/);
  assert.match(main, /home-next-event-region-final\.css/);
});

test("the error boundary keeps a visible reload recovery path", async () => {
  const main = await source("src/main.jsx");
  assert.match(main, /class AppErrorBoundary/);
  assert.match(main, /window\.location\.reload\(\)/);
  assert.match(main, /Technischer Hinweis/);
});
