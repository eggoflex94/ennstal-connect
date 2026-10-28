import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'esbuild';
import { publicImageVariant } from '../src/imageDelivery.js';
import * as operatorIdentity from '../src/operator-identity.js';
const source=await fs.readFile(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'jsx',format:'cjs',jsxFactory:'React.createElement'});
const context={
  module:{exports:{}},
  exports:{},
  React,
  require(name){
    if(name==='react') return React;
    if(name==='./operator-identity.js') return operatorIdentity;
    if(name.includes('imageDelivery')) return { publicImageVariant };
    if(name.includes('memberProfileLoader')) return {loadMemberProfile:async(member)=>member};
    throw new Error(`Unexpected require: ${name}`);
  }
};
vm.runInNewContext(code,context);
const Card=context.module.exports.default;

test('directory roles render approved stars and no legacy card actions',()=>{
 for(const [role,account_badge,asset] of [['ADMIN',null,'role-star-red.svg'],['MUNICIPALITY',null,'role-star-green.svg'],['SUPPORTER',null,'supporter-star.svg'],['MEMBER','BUSINESS','role-star-blue.svg']]){
  const html=renderToStaticMarkup(React.createElement(Card,{member:{id:'a',nickname:'Test',role,account_badge,is_verified:true},profile:{id:'b'},friendships:[],onOpen(){}}));
  assert.ok(html.includes(asset));
  assert.ok(!html.includes('badge-verified.svg'));
  assert.ok(!html.includes('Nachricht'));
 }
});

test('normal members render without a role star',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{member:{id:'a',nickname:'Test',role:'MEMBER',account_badge:null},profile:{id:'b'},friendships:[],onOpen(){}}));
 assert.ok(!html.includes('role-star-red.svg'));
 assert.ok(!html.includes('supporter-star.svg'));
 assert.ok(!html.includes('role-star-blue.svg'));
 assert.ok(!html.includes('role-star-green.svg'));
 assert.ok(html.includes('role-theme-member'));
});

test('only the designated operator renders a gold star among head admins',()=>{
 for(const [member,gold] of [[{id:operatorIdentity.OPERATOR_PROFILE_ID},true],[{id:'primary',is_primary_head_admin:true},true],[{id:'other-head-admin'},false]]){
  const html=renderToStaticMarkup(React.createElement(Card,{member:{...member,nickname:'Test',role:'HEAD_ADMIN'},profile:{id:'viewer'},friendships:[],onOpen(){}}));
  assert.equal(html.includes('operator-crown-gold.svg'),gold);
  assert.equal(html.includes('role-star-red.svg'),!gold);
 }
});

test('keyboard events from nested elements cannot open the profile card',()=>{
 assert.match(source,/if \(event\.target !== event\.currentTarget\) return;/);
 assert.match(source,/event\.key === "Enter" \|\| event\.key === " "/);
 assert.doesNotMatch(source,/onMessage\(member\)/);
});

test('private online status does not render last activity',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{member:{id:'a',nickname:'Test',hide_online_status:true,last_active_at:'2026-09-07T08:00:00Z'},profile:{id:'b'},friendships:[],onOpen(){}}));
 assert.ok(!html.includes('zuletzt aktiv'));assert.ok(!html.includes('Offline'));
});

test('read-only previews stay out of the keyboard tab order',()=>{
 const member={id:'preview',nickname:'Vorschau',role:'MEMBER'};
 const preview=renderToStaticMarkup(React.createElement(Card,{member,interactive:false}));
 assert.ok(!preview.includes('tabindex'));
 assert.ok(!preview.includes('aria-disabled'), 'a read-only card is content, not a disabled control');
 const card=renderToStaticMarkup(React.createElement(Card,{member,onOpen(){}}));
 assert.ok(card.includes('tabindex="0"'));
});

test('operator card keeps age and status but omits the responsibility line',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{member:{id:operatorIdentity.OPERATOR_PROFILE_ID,nickname:'egga',first_name:'Marco',last_name:'Egger',birth_date:'1994-01-01',role:'HEAD_ADMIN',directory_responsibility_label:'Hauptverantwortlicher · Community',is_online:true,last_active_at:new Date().toISOString()},profile:{id:'viewer'},friendships:[],onOpen(){}}));
 assert.ok(html.includes('operator-crown-gold.svg'));
 assert.ok(html.includes('BETREIBER'));
 assert.ok(html.includes('Marco Egger'));
 assert.ok(html.includes('Jahre'));
 assert.ok(html.includes('Online'));
 assert.ok(!html.includes('ec-member-responsibility'));
});
