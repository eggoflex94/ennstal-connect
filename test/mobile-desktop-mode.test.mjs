import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("phones use a stable desktop-width viewport instead of responsive device width", async () => {
  const html = await source("index.html");
  assert.match(html, /content="width=1280, user-scalable=yes, viewport-fit=cover"/);
  assert.doesNotMatch(html, /width=device-width/);
  assert.doesNotMatch(html, /initial-scale=0\.25/);
});

test("touch phones keep the desktop navigation DOM", async () => {
  const code = await source("src/mobile-nav-runtime.js");
  assert.match(code, /const TOUCH_QUERY = '\(pointer: coarse\)'/);
  assert.match(code, /if \(window\.matchMedia\(TOUCH_QUERY\)\.matches\) \{\s*disableMobileNav\(nav\)/s);
});

test("final phone authority keeps desktop nav and personal dashboard visible", async () => {
  const css = await source("src/mobile-native-final.css");
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-width: 1180px !important/);
  assert.match(css, /\.ec-top-nav \{[\s\S]*display: flex !important[\s\S]*min-width: 1180px !important/);
  assert.match(css, /\.ec-dock-toggle \{[\s\S]*display: none !important/);
  assert.match(css, /body:not\(\.ec-dock-open\) \.ec-right-dock[\s\S]*visibility: visible !important/);
  assert.doesNotMatch(css, /body:not\(\.ec-dock-open\) \.ec-right-dock\s*\{[^}]*visibility:\s*hidden/is);
  assert.doesNotMatch(css, /body:not\(\.ec-dock-open\) \.ec-right-dock\s*\{[^}]*pointer-events:\s*none/is);
});

test("profile design controls remain native and tappable in desktop phone mode", async () => {
  const css = await source("src/mobile-native-final.css");
  const app = await source("src/App.jsx");
  assert.match(app, /className="panel profile-form profile-editor"/);
  assert.match(app, /type="file"[\s\S]{0,260}uploadProfileImage\(e\.target\.files\[0\]\)/);
  assert.match(app, /type="file"[\s\S]{0,260}uploadProfileBioImage\(e\.target\.files\[0\]\)/);
  assert.match(app, /onSubmit=\{saveProfile\}/);
  assert.match(css, /\.profile-form input[\s\S]*pointer-events: auto !important/);
  assert.match(css, /input\[type="file"\][\s\S]*visibility: visible !important/);
  assert.match(css, /\.profile-form select[\s\S]*-webkit-appearance: menulist !important/);
});
