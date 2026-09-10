import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("phones use a responsive device viewport", async () => {
  const html = await source("index.html");
  assert.match(html, /content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(html, /width=1280/);
});

test("touch phones keep the desktop navigation DOM", async () => {
  const code = await source("src/mobile-nav-runtime.js");
  assert.match(code, /const TOUCH_QUERY = '\(pointer: coarse\)'/);
  assert.match(code, /if \(window\.matchMedia\(TOUCH_QUERY\)\.matches\) \{\s*disableMobileNav\(nav\)/s);
});

test("final phone authority keeps navigation and dashboard responsive", async () => {
  const css = await source("src/mobile-native-final.css");
  assert.match(css, /@media \(max-width: 900px\), \(pointer: coarse\)/);
  assert.match(css, /\.ec-top-nav \{[\s\S]*display: flex !important[\s\S]*overflow-x: auto !important/);
  assert.match(css, /\.ec-dock-toggle \{[\s\S]*display: none !important/);
  assert.match(css, /body:not\(\.ec-dock-open\) \.ec-right-dock[\s\S]*visibility: visible !important/);
  assert.doesNotMatch(css, /min-width: 1180px !important/);
});

test("profile controls remain native and tappable on phones", async () => {
  const css = await source("src/mobile-native-final.css");
  const app = await source("src/App.jsx");
  const profileView = await source("src/ProfileView.jsx");
  assert.match(app, /onSubmit=\{saveProfile\}/);
  assert.match(profileView, /type="file"[\s\S]{0,260}onChange=\{chooseAvatar\}/);
  assert.match(profileView, /className="full-width"[\s\S]{0,260}Über mich[\s\S]{0,260}<textarea/);
  assert.match(css, /\.profile-form input[\s\S]*pointer-events: auto !important/);
  assert.match(css, /input\[type="file"\][\s\S]*visibility: visible !important/);
});
