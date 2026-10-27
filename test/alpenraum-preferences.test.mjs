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
