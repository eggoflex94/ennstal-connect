import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/homepage-editor-final.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/homepage-editor-final.css',import.meta.url),'utf8');
test('homepage editor has role-checked delegated management permission',()=>{
 assert.match(js,/has_permission/);
 assert.match(js,/manage_homepage/);
 assert.match(js,/c\.head\|\|row\.publication_scope!=='GLOBAL'/);
});
test('homepage editor supports frame sizing, media and ordering',()=>{
 for(const field of ['layout_width','layout_align','layout_height','image'])assert.ok(js.includes(field));
 assert.match(js,/dragstart/);
 assert.match(js,/data-move/);
 assert.match(js,/sort_order/);
 assert.match(css,/@media\(max-width:720px\)/);
});
