import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('all sidebar ads are rendered rather than only a carousel index', () => {
  const js = read('src/sidebar-ads-stack.js');
  assert.match(js, /ads\.map\(card\)/);
  assert.match(js, /replaceChildren\(/);
  assert.match(js, /ec-legacy-ads-hidden/);
  assert.doesNotMatch(js, /setInterval\(/);
});

test('stacked ad replacement is loaded in production', () => {
  const entry = read('src/main.jsx');
  assert.match(entry, /import "\.\/sidebar-ads-stack\.js"/);
  assert.match(entry, /import "\.\/advertising-stacked-parity\.css"/);
});

test('ad images remain completely visible and cards do not overlay', () => {
  const css = read('src/advertising-stacked-parity.css');
  assert.match(css, /\.ec-stacked-ad-card img\s*\{/);
  assert.match(css, /object-fit:contain!important/);
  assert.match(css, /\.ec-legacy-ads-hidden\{display:none!important\}/);
  assert.match(css, /order:9999!important/);
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
