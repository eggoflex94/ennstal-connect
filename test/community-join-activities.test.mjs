import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/community-growth-hub.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/community-growth-hub.css',import.meta.url),'utf8');
test('community start screen offers participation with existing navigation',()=>{
 assert.match(js,/Gemeinsam aktiv werden/);
 assert.match(js,/Wanderpartner finden/);
 assert.match(js,/Gemeinsam etwas erleben/);
 assert.match(js,/Hilfe suchen oder anbieten/);
 assert.match(js,/wire\(join\)/);
 assert.match(css,/@media\(max-width:720px\)/);
});
