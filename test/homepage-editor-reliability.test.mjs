import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manager=readFileSync(new URL('../src/homepage-frame-manager.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261027_homepage_frame_layout.sql',import.meta.url),'utf8');
test('homepage editor explicitly reports an uninstalled schema',()=>{assert.match(manager,/Der Startseiten-Editor benötigt noch die Datenbankeinrichtung/);assert.match(manager,/if\(saving\)return/)});
test('region-scoped edits checked by database function',()=>assert.match(migration,/ec_can_manage_homepage_region/));
