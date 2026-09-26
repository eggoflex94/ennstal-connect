import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('regional color layouts are available in profile settings and runtime', async () => {
  const app = await source('src/App.jsx');
  const runtime = await source('src/standard-theme-runtime.js');
  const css = await source('src/standard-theme-variants.css');

  for (const layout of ['theme-alpine', 'theme-teal', 'theme-violet']) {
    assert.match(app, new RegExp(layout));
    assert.match(runtime, new RegExp(layout));
    assert.match(css, new RegExp('layout-' + layout));
  }

  assert.match(app, /Alpin Grün – Ruhig & Regional/);
  assert.match(app, /Bergsee Türkis – Frisch & Klar/);
  assert.match(app, /Enzian Violett – Modern & Edel/);
});

test('database layout guard accepts regional color layouts', async () => {
  const sql = await source('supabase/migrations/20260926183500_allow_regional_profile_color_layouts.sql');
  for (const layout of ['theme-alpine', 'theme-teal', 'theme-violet']) assert.match(sql, new RegExp(layout));
  assert.match(sql, /Connect Rot wird ab 30 Aktivitätspunkten/);
  assert.match(sql, /Connect Blau wird ab 150 Aktivitätspunkten/);
});
