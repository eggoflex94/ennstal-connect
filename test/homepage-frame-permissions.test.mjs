import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manager=readFileSync(new URL('../src/homepage-frame-manager.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261027_homepage_frame_layout.sql',import.meta.url),'utf8');
test('homepage manager reports missing layout table instead of hiding controls silently',()=>{assert.match(manager,/Die Startseiten-Verwaltung ist noch nicht eingerichtet/);assert.match(manager,/regional_admin_assignments/)});
test('homepage layout writes require server-side region authorization',()=>{assert.match(sql,/ec_can_manage_homepage_region/);assert.match(sql,/substring\(scope_key from 8\)::uuid/);assert.match(sql,/ec_is_head_admin/)});
