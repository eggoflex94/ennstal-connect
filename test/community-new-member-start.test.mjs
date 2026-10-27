import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/community-growth-hub.css',import.meta.url),'utf8');
test('new members see useful next steps only when relevant',()=>{
 assert.match(js,/ctx\.profile\?\.created_at/);
 assert.match(js,/30\*86400000/);
 assert.match(js,/!friendCount \|\| !hasJoinedGroup/);
 assert.match(js,/Kontakte knüpfen/);
 assert.match(js,/Gruppe entdecken/);
 assert.match(js,/Aktivität finden/);
 assert.match(js,/wire\(newcomer\)/);
 assert.match(css,/ec-new-member-steps/);
});
