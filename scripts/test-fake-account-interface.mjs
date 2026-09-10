import { createRequire } from 'node:module';
const require = createRequire(process.argv[2]);
const { JSDOM } = require('jsdom');
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const dom = new JSDOM('<main class="fake-account-page"></main>',{runScripts:'outside-only',url:'https://example.test'});
const w=dom.window;
let authChange, pending=[];
w.supabase={
 auth:{getUser:async()=>({data:{user:{id:'admin'}}}),onAuthStateChange:fn=>{authChange=fn;}},
 from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'HEAD_ADMIN',account_status:'ACTIVE'}})})})}),
 rpc:()=>new Promise(resolve=>pending.push(resolve))
};
const source=await fs.readFile(new URL('../src/fake-account-admin.js',import.meta.url),'utf8');
w.eval(source.replace('import { supabase } from "./supabaseClient";','') + '\nwindow.cleanup = () => { observer.disconnect(); clearTimeout(timer); };');
const wait=()=>new Promise(resolve=>setTimeout(resolve,300));
await wait();
let panel=w.document.querySelector('.ec-fake-admin'); pending.shift()?.({data:[]}); await wait();
assert.ok(panel); console.log('PASS: active head admin panel mounts');
panel.querySelector('.ec-fake-refresh').click();
panel.querySelector('.ec-fake-refresh').click();
const fixture={user_id:'test',nickname:'Newest',risk_score:50,signals:['Many contacts'],review_state:'REVIEW'};
pending[1]({data:[fixture]}); await wait();
pending[0]({data:[{...fixture,nickname:'Stale'}]}); await wait();
assert.match(panel.textContent,/Newest/); assert.doesNotMatch(panel.textContent,/Stale/);
console.log('PASS: stale search response cannot replace newer result');
panel.querySelector('.ec-fake-filter').value='all';
panel.querySelector('.ec-fake-filter').dispatchEvent(new w.Event('change'));
pending.at(-1)({data:[{...fixture,nickname:'<img src=x onerror=alert(1)>'}]}); await wait();
assert.equal(panel.querySelector('img'),null); console.log('PASS: member text is escaped');
w.document.querySelector('.fake-account-page').remove();
w.document.body.innerHTML='<main class="fake-account-page"></main>'; await wait(); await wait();
panel=w.document.querySelector('.ec-fake-admin');
assert.ok(panel); console.log('PASS: navigation back remounts panel');
panel.querySelector('.ec-fake-refresh').click();
authChange('SIGNED_OUT',null);
w.supabase.auth.getUser=async()=>({data:{user:null}});
pending.at(-1)({data:[fixture]}); await wait();
assert.equal(w.document.querySelector('.ec-fake-admin'),null);
console.log('PASS: signout clears private panel and ignores in-flight results');
w.cleanup();
dom.window.close();
