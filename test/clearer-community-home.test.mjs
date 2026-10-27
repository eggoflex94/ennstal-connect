import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
test('home avoids showing the featured next event twice',()=>{
 assert.match(js,/const otherEvents=nextEvent\?activeEvents\.slice\(1\):activeEvents/);
 assert.match(js,/otherEvents\.map\(event=>eventCard/);
});
test('business content remains accessible but secondary',()=>{
 assert.match(js,/<details class="ec-growth-more">/);
 assert.match(js,/<summary>Mehr aus der Region: Unternehmen, Jobs & Angebote<\/summary>/);
 assert.match(js,/section\('Regionale Unternehmen'/);
 assert.match(js,/section\('Gesucht & angeboten','community'/);
});
