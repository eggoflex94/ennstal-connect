import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('every selectable layout defines complete shell colors', async () => {
  const css = await source('src/topbar-theme-final.css');
  for (const theme of ['standard','red','blue','neon','alpine','teal','violet','copper','aurora']) {
    assert.match(css, new RegExp(`html\\[data-ec-theme="${theme}"\\]\\{`));
  }
  for (const token of ['--ec-topbar-bg-1','--ec-topbar-bg-2','--ec-topbar-line','--ec-topbar-ink','--ec-topbar-accent','--ec-topbar-accent-strong']) {
    assert.match(css, new RegExp(token));
  }
});

test('all color layouts keep the same Ennstal Connect brand lockup', async () => {
  const css = await source('src/topbar-theme-final.css');
  assert.match(css, /Brand lockup must remain identical across color layouts/);
  assert.match(css, /ec-brand-family-mark[sS]*#60656a[sS]*#111/);
  assert.match(css, /ec-brand-family-region{color:#f04c19/);
  assert.match(css, /ec-brand-family-connect{color:#ff7c0a/);
});

test('fixed regional shell stays opaque above scrolled content', async () => {
  const css = await source('src/topbar-theme-final.css');
  assert.match(css, /ec-brand-masthead,[sS]*ec-top-nav[sS]*opacity:1!important/);
  assert.match(css, /ec-brand-masthead[sS]*z-index:9001!important/);
  assert.match(css, /ec-top-nav[sS]*z-index:9000!important/);
});
