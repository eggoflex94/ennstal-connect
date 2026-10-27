import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component=readFileSync(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/member-card-mockup-final.css',import.meta.url),'utf8');
test('only primary operator gets styling, not every admin',()=>{
 assert.match(component,/is_primary_head_admin === true/);
 assert.match(component,/isOperatorCard \? "ec-operator-card"/);
 assert.match(css,/\.ec-operator-card\[data-role-theme="admin"\]/);
 assert.match(css,/\.ec-operator-card\[data-role-theme="admin"\].*#ffdf62/);
});
