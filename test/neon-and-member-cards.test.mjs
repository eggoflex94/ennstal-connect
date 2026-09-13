import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('neon theme stays available, persists immediately and survives React rerenders', async () => {
  const runtime = await source('src/standard-theme-runtime.js');
  const main = await source('src/main.jsx');
  const neonCss = await source('src/neon-green-theme.css');
  assert.match(runtime, /\['theme-neon'\s*,\s*'Neon Grün – Giftgrün & Dunkel'\s*,\s*true\]/);
  assert.match(runtime, /persistSavedLayout\(savedLayout\)/);
  assert.match(runtime, /update\(\{\s*profile_layout\s*:\s*layout\s*\}\)/);
  assert.match(runtime, /classList\.toggle\('layout-theme-neon'\s*,\s*savedLayout\s*===\s*'theme-neon'\)/);
  assert.match(runtime, /MutationObserver/);
  assert.match(neonCss, /html\[data-ec-theme='neon'\]/);
  assert.ok(main.indexOf('./neon-green-theme.css') < main.indexOf('./member-card-mockup-final.css'));
  assert.doesNotMatch(neonCss, /\.layout-theme-neon :is\([^)]*\.member-card/);
});

test('production member directory uses the approved member card component', async () => {
  const directory = await source('src/NativeMembersDirectory.jsx');
  const card = await source('src/MemberCardView.jsx');
  const css = await source('src/member-card-mockup-final.css');
  assert.match(directory, /import MemberCardView from "\.\/MemberCardView\.jsx"/);
  assert.match(directory, /<MemberCardView/);
  assert.match(card, /role-star-red\.svg/);
  assert.match(card, /supporter-star\.svg/);
  assert.match(card, /role-star-blue\.svg/);
  assert.match(card, /star: null/);
  assert.doesNotMatch(card, />\s*\{presentation\.label\}\s*</);
  assert.doesNotMatch(card, /Region nicht angegeben/);
  assert.match(css, /data-role-theme="admin"/);
  assert.match(css, /data-role-theme="supporter"/);
  assert.match(css, /data-role-theme="business"/);
  assert.match(css, /data-role-theme="member"/);
});
