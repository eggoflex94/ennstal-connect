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
