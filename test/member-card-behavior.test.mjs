import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'esbuild';
const source=await fs.readFile(new URL('../src/MemberCardView.jsx',import.meta.url),'utf8');
const {code}=await transform(source,{loader:'jsx',format:'cjs',jsxFactory:'React.createElement'});
const context={
  module:{exports:{}},
  exports:{},
  React,
  require(name){
    if(name==='react') return React;
    if(name.includes('memberProfileLoader')) return {loadMemberProfile:async(member)=>member};
    throw new Error(`Unexpected require: ${name}`);
  }
};
vm.runInNewContext(code,context);
const Card=context.module.exports.default;

test('directory roles render approved stars and no legacy card actions',()=>{
 for(const [role,account_badge,asset] of [['ADMIN',null,'role-star-red.svg'],['SUPPORTER',null,'supporter-star.svg'],['MEMBER','BUSINESS','role-star-blue.svg']]){
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
 assert.ok(html.includes('role-theme-member'));
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
