import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOperatorProfile, operatorStarSrc, OPERATOR_PROFILE_ID} from '../src/operator-identity.js';
const member=readFileSync(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const svg=readFileSync(new URL('../public/operator-star-gold.svg',import.meta.url),'utf8');
test('operator star affects only the designated operator',()=>{
 assert.match(member,/isOperatorCard \? "\/operator-star-gold.svg" : presentation.star/);
 assert.match(app,/import \{ isOperatorProfile, operatorStarSrc \} from '\.\/operator-identity\.js'/);
 assert.equal(operatorStarSrc,'/operator-star-gold.svg');
 assert.equal(isOperatorProfile({id:OPERATOR_PROFILE_ID}),true);
 assert.equal(isOperatorProfile({id:'primary',is_primary_head_admin:true}),true);
 assert.equal(isOperatorProfile({id:'other-head-admin',role:'HEAD_ADMIN'}),false);
 assert.equal(isOperatorProfile(null),false);
 assert.match(svg,/<svg/);
});
