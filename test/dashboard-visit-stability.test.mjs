import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=(await readFile(new URL('../src/dashboard-community-realtime.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function setup(){
 let observer,scheduled=0,authBindings=0,writes=0,value='4';
 const count={hidden:false,get textContent(){return value;},set textContent(next){value=next;writes++;}};
 let panel={},dock={querySelector:()=>panel};
 const context=vm.createContext({
  supabase:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){authBindings++;}}},
  document:{documentElement:{},querySelector:selector=>selector==='.ec-right-dock'?dock:count,addEventListener(){}},
  window:{addEventListener(){},setTimeout(){scheduled++;return scheduled;}},
  setTimeout(){scheduled++;return scheduled;},clearTimeout(){},
  MutationObserver:class{constructor(callback){observer=callback;}observe(){}}
 });
 vm.runInContext(code+'\nglobalThis.setCountForTest=setCount;',context);
 return {notify:()=>observer(),replacePanel:()=>{panel={};},setCount:context.setCountForTest,get scheduled(){return scheduled;},get writes(){return writes;},get authBindings(){return authBindings;}};
}

test('unrelated page and visitor-row mutations do not schedule another dashboard fetch',()=>{
 const h=setup();h.notify();assert.equal(h.scheduled,1);
 for(let i=0;i<20;i++)h.notify();assert.equal(h.scheduled,1);
 h.replacePanel();h.notify();assert.equal(h.scheduled,2);
});

test('unchanged visitor counters do not create new DOM mutations',()=>{
 const h=setup();for(let i=0;i<20;i++)h.setCount('.count',4);
 assert.equal(h.writes,0);h.setCount('.count',5);assert.equal(h.writes,1);
 assert.equal(h.authBindings,1);
});


function realtimeSetup(){
 let releaseSession,authCallback;
 const sessionGate=new Promise(resolve=>releaseSession=resolve);
 const created=[],timers=[],warnings=[];
 const channels=new Map();
 const session={user:{id:'viewer'},access_token:'test-token'};
 const context=vm.createContext({
  Date:class extends Date{static now(){return 42;}},
  supabase:{auth:{getSession:()=>sessionGate,onAuthStateChange(fn){authCallback=fn;}},realtime:{setAuth:async()=>{}},
   channel(name){if(channels.has(name))return channels.get(name);const row={name,bindings:0,subscribed:false,on(){if(this.subscribed)throw Error('on after subscribe');this.bindings++;return this;},subscribe(fn){this.subscribed=true;this.status=fn;return this;}};channels.set(name,row);created.push(row);return row;},
   removeChannel:async row=>{channels.delete(row.name);}},
  document:{hidden:false,documentElement:{},querySelector:()=>null,addEventListener(){}},
  window:{addEventListener(){},setTimeout(fn){timers.push(fn);return timers.length;}},clearTimeout(){},setTimeout(){},
  console:{warn:(...args)=>warnings.push(args)},MutationObserver:class{observe(){}}
 });
 vm.runInContext(code+'\nglobalThis.startForTest=start;',context);
 return {context,created,timers,warnings,release:()=>releaseSession({data:{session}}),signOut:()=>authCallback('SIGNED_OUT',null)};
}

test('simultaneous dashboard starts register one channel before subscribing',async()=>{
 const h=realtimeSetup();const a=h.context.startForTest(),b=h.context.startForTest();
 assert.equal(a,b);h.release();await Promise.all([a,b]);
 assert.equal(h.created.length,1);assert.equal(h.created[0].bindings,1);assert.equal(h.created[0].subscribed,true);assert.deepEqual(h.warnings,[]);
 h.created[0].status('TIMED_OUT');h.timers.at(-1)();await h.context.startForTest();
 assert.equal(h.created.length,2);assert.notEqual(h.created[0].name,h.created[1].name);assert.deepEqual(h.warnings,[]);
});

test('sign-out cancels a dashboard start that is still awaiting its session',async()=>{
 const h=realtimeSetup();const pending=h.context.startForTest();h.signOut();h.release();await pending;
 assert.equal(h.created.length,0);assert.deepEqual(h.warnings,[]);
});
