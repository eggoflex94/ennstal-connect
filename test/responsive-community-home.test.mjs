import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/community-growth-hub.css',import.meta.url),'utf8');
test('home overview adapts to desktop, tablet and phone and keeps touch targets',()=>{
 assert.match(css,/\.home-page \.ec-growth-hub \.ec-growth-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/min-height:48px/);
 assert.match(css,/:focus-visible/);
});
