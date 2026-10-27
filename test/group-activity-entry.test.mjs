import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/community-growth-hub.css',import.meta.url),'utf8');
test('group discovery offers existing event planning navigation',()=>{
 assert.match(js,/ec-group-activity-action/);
 assert.match(js,/Gemeinsame Aktivität planen/);
 assert.match(js,/data-growth-nav="events"/);
 assert.match(js,/wire\(discover\)/);
 assert.match(css,/\.ec-group-activity-action/);
});
