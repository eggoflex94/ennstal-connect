import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
test('next regional event card reuses filtered upcoming events and event navigation',()=>{
 assert.match(js,/const nextEvent=activeEvents\[0\]\|\|null/);
 assert.match(js,/if\(nextEvent\)/);
 assert.match(js,/NÄCHSTE AKTIVITÄT IM ALPENRAUM/);
 assert.match(js,/wire\(nextActivity\)/);
});
