import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('native sidebar ad component renders every active ad without carousel state', () => {
  const js = read('src/sidebar-ads-modern.js');
  assert.match(js, /currentAds\.map\(bannerMarkup\)\.join\(""(?:)\)/);
  assert.match(js, /\.ec-sidebar-ad-list/);
  assert.doesNotMatch(js, /bannerIndex|rotationTimer|restartRotation|setInterval\(/);
});

test('canonical ad rendering is wired without the duplicate stack', () => {
  const entry = read('src/main.jsx');
  assert.match(entry, /sidebar-ads-modern\.js/);
  assert.doesNotMatch(entry, /^import "\.\/sidebar-ads-stack\.js";/m);
});

test('advertising images have natural size and readable captions', () => {
  const css = read('src/sidebar-ads-modern.css');
  assert.match(css, /\.ec-sidebar-ad-banner img\{[^}]*height:auto/);
  assert.match(css, /\.ec-sidebar-ad-banner img\{[^}]*object-fit:contain/);
  assert.match(css, /\.ec-sidebar-ad-caption\{position:relative/);
  assert.doesNotMatch(css, /\.ec-sidebar-ad-banner img\{[^}]*object-fit:cover/);
});

test('mobile navigation retains desktop destinations with readable labels', () => {
  const css = read('src/mobile-desktop-parity-2026.css');
  assert.match(css, /Full-function mobile navigation/);
  assert.match(css, /overflow-x:auto!important/);
  assert.match(css, /white-space:normal!important/);
});

test('mobile and desktop use the same event photo gallery', () => {
  const app = read('src/App.jsx');
  assert.match(app, /aria-label="Eventfotogalerie"/);
  assert.match(app, /canUploadGalleryPhoto/);
  assert.match(app, /create_event_photo/);
});
