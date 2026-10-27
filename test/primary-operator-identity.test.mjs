import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const role=readFileSync(new URL('../src/roleIdentity.js',import.meta.url),'utf8');
const card=readFileSync(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const support=readFileSync(new URL('../src/support-contacts-modern.js',import.meta.url),'utf8');
test('HEAD_ADMIN alone does not grant operator star',()=>{
 assert.match(role,/profile\.is_primary_head_admin === true \?/);
 assert.match(role,/icon:"\/role-star-red.svg"/);
 assert.doesNotMatch(card,/\|\| \(String\(member\?\.role/);
 assert.match(app,/member\?\.is_primary_head_admin===true\?'/);
});
test('support role badges load actual primary operator flag',()=>{
 assert.match(support,/select\('id,is_primary_head_admin'\)/);
 assert.match(support,/primaryIds\.has\(profile\.user_id\)/);
});
