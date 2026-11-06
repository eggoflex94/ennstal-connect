import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../src/homepage-frame-manager.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/homepage-frame-manager.css',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261027_homepage_frame_layout.sql',import.meta.url),'utf8');
test('homepage editor has accessible desktop and mobile controls',()=>{assert.match(js,/dragstart/);assert.match(js,/drop/);assert.match(js,/up\.onclick/);assert.match(js,/down\.onclick/);assert.match(js,/is_visible/);assert.match(js,/width_percent/);assert.match(css,/@media\(max-width:800px\)/);});
test('regional changes require server-side region authority',()=>assert.match(sql,/ec_can_manage_homepage_region/));
test('missing database displays a clear diagnostic',()=>assert.match(js,/Datenbankmigration fehlt/));
