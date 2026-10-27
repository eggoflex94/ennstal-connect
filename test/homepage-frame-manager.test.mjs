import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/homepage-frame-manager.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/homepage-frame-manager.css',import.meta.url),'utf8');
test('homepage blocks are individually adjustable and removable from view',()=>{
 assert.match(js,/homepage_frame_layout/);assert.match(js,/manage_homepage/);
 assert.match(js,/is_visible/);assert.match(js,/width_percent/);assert.match(js,/sort_order/);
 assert.match(css,/>\[hidden\]\{display:none!important\}/);
});
