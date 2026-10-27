import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
test('region labels are supplied to Alpine discovery cards',()=>{
 assert.match(src,/const regionNames=new Map/);
 assert.match(src,/eventCard\(event,regionNames\.get\(event\.region_id\)/);
 assert.match(src,/discoverMember\(member,regionNames\.get\(member\.home_region_id\)/);
 assert.match(src,/discoverGroup\(group,groupCounts\.get\(group\.id\)\|\|0,regionNames\.get\(group\.region_id\)/);
});
