import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
test('community requests include selected Alpine regions',()=>{
 assert.match(src,/community_requests'\)\.select\([^\n]+\.in\('region_id',discoveryRegionIds\)/);
 assert.match(src,/requestCard\(request,regionNames\.get\(request\.region_id\)/);
 assert.match(src,/Number\(b\.region_id===ctx\.region\.id\)-Number\(a\.region_id===ctx\.region\.id\)/);
});
