import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every selectable layout defines complete shell colors', async () => {
  const css = await source('src/topbar-theme-final.css');
  for (const theme of ['standard','red','blue','neon','alpine','teal','violet','copper','aurora']) {
    assert.ok(css.includes(`html[data-ec-theme="${theme}"]{`));
  }
  for (const token of ['--ec-topbar-bg-1','--ec-topbar-bg-2','--ec-topbar-line','--ec-topbar-ink','--ec-topbar-accent','--ec-topbar-accent-strong']) {
    assert.ok(css.includes(token));
  }
});

test('all color layouts keep the same Ennstal Connect brand lockup', async () => {
  const css = await source('src/topbar-theme-final.css');
  assert.ok(css.includes('Brand lockup must remain identical across color layouts'));
  assert.ok(css.includes('background:linear-gradient(145deg,#60656a,#111)!important'));
  assert.ok(css.includes('.ec-brand-family-region{color:#f04c19!important}'));
  assert.ok(css.includes('.ec-brand-family-connect{color:#ff7c0a!important}'));
});

test('fixed regional shell stays opaque above scrolled content', async () => {
  const css = await source('src/topbar-theme-final.css');
  assert.ok(css.includes('opacity:1!important'));
  assert.ok(css.includes('z-index:9001!important'));
  assert.ok(css.includes('z-index:9000!important'));
});
