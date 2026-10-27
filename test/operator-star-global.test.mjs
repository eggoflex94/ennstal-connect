import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const member=readFileSync(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const svg=readFileSync(new URL('../public/operator-star-gold.svg',import.meta.url),'utf8');
test('operator star affects only primary head admin',()=>{assert.match(member,/isOperatorCard \? "\/operator-star-gold.svg" : presentation.star/);assert.match(app,/operator-star-gold\\.svg/);assert.match(svg,/<svg/);});
