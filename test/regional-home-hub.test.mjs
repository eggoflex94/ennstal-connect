import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('home uses compact regional hub hierarchy', async () => {
  const base = await source('src/home-multi-region-clarity-base.js');
  const css = await source('src/home-multi-region-clarity.css');

  assert.match(base, /DEINE REGION/);
  assert.match(base, /HEUTE IN DEINER REGION/);
  assert.match(base, /Heute &amp; demnächst/);
  assert.match(base, /Gesucht &amp; angeboten/);
  assert.match(base, /Menschen &amp; Gruppen/);
  assert.match(base, /Aus der Region/);
  assert.match(base, /REGIONAL DABEI/);

  assert.match(css, /Regional hub layout authority/);
  assert.match(css, /\.ec-region-hub-hero/);
  assert.match(css, /\.ec-region-hub-nav/);
  assert.match(css, /\.home-page \.engagement-grid/);
});
