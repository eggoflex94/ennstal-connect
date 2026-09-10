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
