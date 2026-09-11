import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("phones use the desktop viewport", async () => {
  const html = await source("index.html");
  assert.match(html, /content="width=1180"/);
  assert.doesNotMatch(html, /width=device-width/);
});

test("touch phones keep the desktop navigation DOM", async () => {
  const code = await source("src/mobile-nav-runtime.js");
  assert.match(code, /const TOUCH_QUERY = '\(pointer: coarse\)'/);
  assert.match(code, /if \(window\.matchMedia\(TOUCH_QUERY\)\.matches\) \{\s*disableMobileNav\(nav\)/s);
});

test("mobile layout override files stay disabled for desktop parity", async () => {
  const files = [
    "src/mobile-authority.css",
    "src/mobile-interaction-authority.css",
    "src/mobile-visibility-final.css",
    "src/community-mobile-final.css",
    "src/mobile-forum-news-admin-final.css",
    "src/dashboard-mobile-profile-final.css",
    "src/mobile-native-final.css",
  ];
  for (const file of files) {
    const css = await source(file);
    assert.match(css, /disabled/i, `${file} must remain disabled`);
    assert.doesNotMatch(css, /@media\s*\(max-width:/, `${file} must not reintroduce narrow mobile layout rules`);
  }
});

test("profile upload remains React-owned on desktop and phones", async () => {
  const app = await source("src/App.jsx");
  const legacyAvatar = await source("src/profile-image-upload-fix.js");
  const legacyGallery = await source("src/profile-photo-upload-fix.js");
  assert.match(app, /async function uploadProfileImage\(file\)/);
  assert.match(app, /profile-avatars/);
  assert.match(app, /onSubmit=\{saveProfile\}/);
  assert.doesNotMatch(legacyAvatar, /addEventListener\(['"]change['"]/);
  assert.doesNotMatch(legacyAvatar, /stopImmediatePropagation/);
  assert.doesNotMatch(legacyGallery, /addEventListener\(['"]change['"]/);
  assert.doesNotMatch(legacyGallery, /stopImmediatePropagation/);
});

test("legacy interaction blockers stay disabled", async () => {
  const blockers = [
    "src/navigation-stability.js",
    "src/sidebar-interaction-fix.js",
    "src/sidebar-final-stability.js",
  ];
  for (const file of blockers) {
    const code = await source(file);
    assert.doesNotMatch(code, /stopImmediatePropagation\s*\(/, `${file} must not stop React events`);
    assert.doesNotMatch(code, /addEventListener\(['"]click['"][^\n]*,\s*true\s*\)/, `${file} must not add capture click handlers`);
  }
});

test("legacy clean profile runtime cannot replace React profile controls", async () => {
  const code = await source("src/clean-profile-runtime.js");
  assert.doesNotMatch(code, /cloneNode\s*\(/);
  assert.doesNotMatch(code, /original\.click\s*\(/);
  assert.doesNotMatch(code, /ec-clean-profile-hidden/);
});

test("visible shell navigation uses one direct React bridge", async () => {
  const bridge = await source("src/react-navigation-bridge.js");
  assert.match(bridge, /button\.onclick\s*=\s*null/);
  assert.match(bridge, /new CustomEvent\(['"]ec:navigate['"]/);
  assert.doesNotMatch(bridge, /stopImmediatePropagation/);
  assert.doesNotMatch(bridge, /\.click\s*\(\s*\)/);
});

test("member profile keeps identical desktop structure on touch devices", async () => {
  const css = await source("src/member-profile-original-layout.css");
  assert.match(css, /grid-template-columns:320px minmax\(0,1fr\)/);
  assert.match(css, /@media \(pointer:coarse\)[\s\S]*grid-template-columns:320px minmax\(0,1fr\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:/);
});

test("profile role stars stay mapped to the correct functions", async () => {
  const code = await source("src/member-profile-original-layout.js");
  assert.match(code, /HEAD_ADMIN[^\n]*role-star-red\.svg/);
  assert.match(code, /regionalNames\.length[^\n]*role-star-red\.svg/);
  assert.match(code, /SUPPORTER[^\n]*supporter-star\.svg/);
  assert.doesNotMatch(code, /regionalNames\.length[^\n]*supporter-star\.svg/);
});

test("profile presence remains visually separated", async () => {
  const css = await source("src/member-profile-original-layout.css");
  assert.match(css, /\.ec-restored-profile-presence\s*\{[\s\S]*gap:12px/s);
  assert.match(css, /margin-top:18px/);
  assert.match(css, /padding-top:16px/);
});

test("point list and award controls are admin-only", async () => {
  const code = await source("src/points-system-ui.js");
  assert.match(code, /role === 'HEAD_ADMIN' \|\| role === 'ADMIN' \|\| Boolean\(profile\?\.isRegionalAdmin\)/);
  assert.match(code, /if \(!isAdminLike\(current\)\) return;/);
  assert.match(code, /if \(!admin \|\| !actions\) \{[\s\S]*listButton\?\.remove\(\);[\s\S]*awardButton\?\.remove\(\);/s);
  assert.doesNotMatch(code, /canSeePoints = own \|\| admin/);
});

test("point controls share the same action row on desktop and touch", async () => {
  const code = await source("src/points-system-ui.js");
  const css = await source("src/points-system-ui.css");
  assert.match(code, /page\.querySelector\('\.member-profile-actions, \.profile-original-actions'\)/);
  assert.match(code, /actions\.appendChild\(listButton\)/);
  assert.match(code, /actions\.appendChild\(awardButton\)/);
  assert.match(css, /\.member-profile-actions,\.profile-original-actions\{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:14px!important/);
  assert.match(css, /@media\s*\(pointer:coarse\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:/);
});
