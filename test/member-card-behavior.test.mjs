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
test('directory roles render framed stars without a verification badge',()=>{
 for(const [role,account_badge,asset] of [['ADMIN',null,'role-star-red.svg'],['SUPPORTER',null,'supporter-star.svg'],['MEMBER','BUSINESS','role-star-blue.svg']]){
  const html=renderToStaticMarkup(React.createElement(Card,{member:{id:'a',nickname:'Test',role,account_badge,is_verified:true},profile:{id:'b'},friendships:[],onOpen(){},onMessage(){}}));
  assert.ok(html.includes(asset));assert.ok(!html.includes('badge-verified.svg'));assert.ok(html.includes('Nachricht'));
 }
});
test('keyboard on message button does not also open member profile',()=>{
 let opened=0;const props={member:{id:'a',nickname:'Test'},profile:{id:'b'},onOpen(){opened++},onMessage(){}};
 const node=Card(props),card={},button={};
 node.props.onKeyDown({key:'Enter',target:button,currentTarget:card,preventDefault(){}});assert.equal(opened,0);
 node.props.onKeyDown({key:'Enter',target:card,currentTarget:card,preventDefault(){}});
 assert.equal(opened,0,'profile opening is async and should not fire synchronously');
});
test('private online status does not render last activity',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{member:{id:'a',nickname:'Test',hide_online_status:true,last_active_at:'2026-09-07T08:00:00Z'},profile:{id:'b'},friendships:[],onOpen(){},onMessage(){}}));
 assert.ok(!html.includes('zuletzt aktiv'));assert.ok(!html.includes('Offline'));
});
