import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isOperatorProfile, operatorStarSrc, OPERATOR_PROFILE_ID} from '../src/operator-identity.js';
const css=readFileSync(new URL('../src/member-card-exact-authority.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
test('operator border is not excessively thick',()=>assert.match(css,/border:3px solid #edc650!important/));
test('event gallery retains operator role asset',()=>{
 const declaration=app.match(/const roleStarFor = \(member\) =>[^\n]+;/)?.[0];
 assert.ok(declaration,'event gallery role-star selector exists');
 const roleStarFor=vm.runInNewContext(`${declaration}\nroleStarFor`,{isOperatorProfile,operatorStarSrc});
 assert.equal(roleStarFor({id:OPERATOR_PROFILE_ID,role:'HEAD_ADMIN'}),'/operator-star-gold.svg');
 assert.equal(roleStarFor({id:'other-head-admin',role:'HEAD_ADMIN'}),'/role-star-red.svg');
 assert.equal(roleStarFor({role:'MUNICIPALITY',role_star_url:'/custom-town.svg'}),'/custom-town.svg');
});
