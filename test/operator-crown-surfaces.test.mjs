import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {isOperatorProfile, operatorStarSrc, operatorCrownSrc, OPERATOR_PROFILE_ID} from '../src/operator-identity.js';
import {roleIdentity} from '../src/roleIdentity.js';

function selector(file, name, context={}) {
 const source=readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
 const ast=parse(source,{sourceType:'module',plugins:['jsx']});
 let found;
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='FunctionDeclaration'&&node.id?.name===name)found=node;
  if(node.type==='VariableDeclarator'&&node.id?.name===name)found=node.init;
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 }
 visit(ast.program);assert.ok(found,`${file}: ${name} exists`);
 return vm.runInNewContext(`(${source.slice(found.start,found.end)})`,{isOperatorProfile,operatorStarSrc,...context});
}

const surfaces=[
 ['chat-modern-final.js','starFor'],['dashboard-community-realtime.js','profileStar'],
 ['personal-dashboard-final-fix.js','personStar'],['regional-shell.js','roleStar'],
 ['home-member-suggestions.js','roleStar'],['role-region-polish.js','starFor'],
 ['global-role-identity-polish.js','starFor'],['profile-identity-summary.js','roleInfo'],
 ['profile-preview-parity.js','roleInfo'],['member-profile-final.js','functionInfo'],
 ['profile-role-action-fix.js','effectiveRole'],['stable-app.js','effectiveRole'],
 ['production-hotfix.js','effectiveRole'],['launch-stable.js','roleInfo'],
 ['community-reels.js','roleStar'],['admin-hours-statistics.js','roleStar'],
 ['NativeMembersDirectory.jsx','roleStarSrc'],['App.jsx','roleStarFor']
];
for(const [file,name] of surfaces)test(`operator crown: ${file}`,async()=>{
 const fn=selector(file,name);
 for(const profile of [{id:OPERATOR_PROFILE_ID,role:'HEAD_ADMIN'},{id:'primary',is_primary_head_admin:true,role:'HEAD_ADMIN'}]){
  const result=await fn(profile);assert.equal(typeof result==='string'?result:result.star,operatorCrownSrc);
 }
});

test('ordinary admins, delegated head admins and members retain their existing badges',()=>{
 assert.equal(roleIdentity({id:OPERATOR_PROFILE_ID,role:'HEAD_ADMIN'}).icon,operatorCrownSrc);
 assert.equal(roleIdentity({id:'another',role:'HEAD_ADMIN'}).icon,'/role-star-red.svg');
 assert.equal(roleIdentity({id:'admin',role:'ADMIN'}).icon,'/role-star-red.svg');
 assert.equal(roleIdentity({id:'supporter',role:'SUPPORTER'}).icon,'/supporter-star.svg');
 assert.equal(roleIdentity({id:'business',role:'MEMBER',account_badge:'BUSINESS'}).icon,'/role-star-blue.svg');
 assert.equal(roleIdentity({id:'member',role:'MEMBER'}).icon,null);
 assert.equal(isOperatorProfile({id:'another',nickname:'egga',role:'HEAD_ADMIN'}),false);
 assert.equal(operatorStarSrc,operatorCrownSrc);
});

test('point messages recognize the actual operator sender without crowning every head admin',()=>{
 const fn=selector('points-rewards-runtime.js','starForRoleLabel');
 assert.equal(fn('Hauptadmin',{id:OPERATOR_PROFILE_ID}),operatorCrownSrc);
 assert.equal(fn('Hauptadmin',{id:'delegated'}),'/role-star-red.svg');
 assert.equal(fn('Betreiber'),operatorCrownSrc);
});

test('crown asset is a scalable SVG and its legacy URL uses the same artwork',()=>{
 const svg=readFileSync(new URL('../public/operator-crown-gold.svg',import.meta.url),'utf8');
 assert.match(svg,/viewBox="0 0 64 64"/);
 assert.doesNotMatch(svg,/<image|<script|https?:\/\/(?!www.w3.org)/);
 assert.equal(svg,readFileSync(new URL('../public/operator-star-gold.svg',import.meta.url),'utf8'));
});
