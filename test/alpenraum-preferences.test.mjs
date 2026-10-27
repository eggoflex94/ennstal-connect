import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/member-onboarding.js',import.meta.url),'utf8');
test('Alpine preferences are persisted to account user metadata',()=>{
  assert.match(source,/supabase\.auth\.updateUser\(\{data:\{alpenraum_region_slugs:additionalRegions\}\}\)/);
  assert.match(source,/user\.user_metadata\?\.alpenraum_region_slugs/);
});
test('home region remains independent of additional regions',()=>{
  assert.match(source,/supabase\.rpc\('ec_change_home_region'/);
  assert.match(source,/filter\(slug=>slug!==selected\)/);
});
test('recommendations score home and additional Alpine regions',()=>{
  assert.match(source,/const regionBoost=/);
  assert.match(source,/regionBoost\(g\.region_id\)/);
  assert.match(source,/regionBoost\(e\.region_id\)/);
});

test('home discovery includes only selected regions and prioritizes home region',()=>{
  const source=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
  assert.match(source,/discoveryRegionIds=\[ctx\.region\.id,\.\.\.ctx\.additionalRegions\.map/);
  assert.match(source,/\.in\('region_id',discoveryRegionIds\)/);
  assert.match(source,/\.in\('home_region_id',discoveryRegionIds\)/);
  assert.match(source,/region_id\.in\.\(\$\{discoveryRegionIds\.join\(','\)\}\)/);
});

test('existing members can update Alpine regions and interests in profile',()=>{
  const editor=readFileSync(new URL('../src/alpenraum-preferences-editor.js',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(entry,/import "\.\/alpenraum-preferences-editor\.js"/);
  assert.match(editor,/supabase\.auth\.updateUser\(\{data:\{alpenraum_region_slugs:extra\}\}\)/);
  assert.match(editor,/\.update\(\{interests\}\)\.eq\('id',user\.id\)/);
  assert.match(editor,/r\.id===profile\.home_region_id/);
});
