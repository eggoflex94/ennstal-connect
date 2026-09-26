import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('prestige layouts keep the same light Ennstal surface system', async () => {
  const css = await source('src/standard-theme-variants.css');
  for (const theme of ['alpine','teal','violet','copper','aurora']) {
    assert.ok(css.includes(`.app.layout-theme-${theme}`));
  }
  assert.ok(css.includes('Same Ennstal Connect structure and light surface system'));
  assert.ok(css.includes('background:linear-gradient(145deg,#fff 0%,var(--ec-theme-wash) 100%)!important'));
  assert.ok(css.includes('color:#24364d!important'));
});

test('copper and aurora no longer turn the profile editor into a dark theme', async () => {
  const css = await source('src/standard-theme-variants.css');
  assert.doesNotMatch(css, /layout-theme-copper[\s\S]*#0f2f33/);
  assert.doesNotMatch(css, /layout-theme-aurora[\s\S]*#08172b/);
  assert.ok(css.includes('--ec-theme-primary:#c77842'));
  assert.ok(css.includes('--ec-theme-primary:#4f8fd8'));
});

test('theme accent remains visible on controls without changing layout geometry', async () => {
  const css = await source('src/standard-theme-variants.css');
  assert.ok(css.includes(':is(input,select,textarea):focus'));
  assert.ok(css.includes('border-color:var(--ec-theme-primary)!important'));
  assert.ok(css.includes('.ec-activity-progress-bar>i'));
});


test('masthead logo stays neutral while navigation follows the selected theme', async () => {
  const css = await source('src/topbar-theme-final.css');
  assert.ok(css.includes('Coherent shell authority'));
  assert.ok(css.includes('html[data-ec-theme] .ec-regional-shell .ec-brand-masthead'));
  assert.ok(css.includes('background:#ffffff!important'));
  assert.ok(css.includes('html[data-ec-theme] .ec-regional-shell .ec-top-nav'));
  assert.ok(css.includes('border-bottom:2px solid var(--ec-topbar-accent)!important'));
  assert.ok(css.includes('html[data-ec-theme] .ec-right-dock'));
});
