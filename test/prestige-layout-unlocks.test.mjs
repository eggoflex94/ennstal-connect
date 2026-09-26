import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('prestige layouts are gated by community score', async () => {
  const runtime = await source('src/standard-theme-runtime.js');
  for (const pair of [
    ['theme-red', 30],
    ['theme-alpine', 75],
    ['theme-blue', 150],
    ['theme-teal', 300],
    ['theme-violet', 450],
    ['theme-copper', 650],
    ['theme-aurora', 900],
    ['theme-neon', 1200]
  ]) {
    assert.match(runtime, new RegExp(pair[0]));
    assert.match(runtime, new RegExp(String(pair[1])));
  }
  assert.match(runtime, /HEAD_ADMIN/);
  assert.match(runtime, /SUPPORTER/);
});

test('municipality role keeps its own styling and no prestige bypass', async () => {
  const municipality = await source('src/municipality-role.css');
  const sql = await source('supabase/migrations/20260926184000_gate_prestige_color_layouts_by_points.sql');
  assert.match(municipality, /municipality/);
  assert.match(sql, /HEAD_ADMIN','ADMIN','SUPPORTER/);
  assert.doesNotMatch(sql, /HEAD_ADMIN','ADMIN','SUPPORTER','MUNICIPALITY/);
});

test('rare layouts include copper night and aurora palettes', async () => {
  const css = await source('src/standard-theme-variants.css');
  assert.match(css, /layout-theme-copper/);
  assert.match(css, /layout-theme-aurora/);
  assert.match(css, /Kupfer/);
  assert.match(css, /Polarlicht|aurora/i);
});
