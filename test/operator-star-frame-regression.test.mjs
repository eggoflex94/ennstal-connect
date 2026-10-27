import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/member-card-exact-authority.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('operator border is not excessively thick',()=>assert.match(css,/border:4px solid #ffe06b!important/));
test('event gallery retains operator role asset',()=>assert.match(app,/const roleStarFor = \(member\) => member\?\.is_primary_head_admin === true \? '\/operator-star-gold.svg'/));
