import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const code=(await readFile(new URL('../src/legal-evidence-admin.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/, '');
function setup(profile) {
  const alerts=[];
  const context=vm.createContext({
    supabase:{auth:{getUser:async()=>({data:{user:{id:'viewer'}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile})})})})},
    window:{alert:message=>alerts.push(message),addEventListener(){}},
    document:{readyState:'loading',documentElement:{},addEventListener(){}},
    MutationObserver:class{observe(){} disconnect(){}}
  });
  vm.runInContext(code+'\n globalThis.entry={mount,ensurePrimaryHead};',context);
  return {...context.entry,alerts};
}

test('background legal-entry checks never interrupt ordinary navigation with alerts',async()=>{
  for(const profile of [null,{role:'MEMBER',account_status:'ACTIVE'},{role:'ADMIN',account_status:'ACTIVE'},{role:'HEAD_ADMIN',account_status:'ACTIVE',is_primary_head_admin:false}]){
    const h=setup(profile);
    for(let step=0;step<5;step++) await h.mount();
    assert.deepEqual(h.alerts,[]);
    assert.equal(await h.ensurePrimaryHead({silent:true}),false);
  }
});

test('an explicit unauthorized attempt still denies access with the warning',async()=>{
  const h=setup({role:'ADMIN',account_status:'ACTIVE'});
  assert.equal(await h.ensurePrimaryHead(),false);
  assert.equal(h.alerts.length,1);
  assert.match(h.alerts[0],/ausschließlich dem primären Head Admin/);
});

test('legal access still requires an active primary Head Admin',async()=>{
  const allowed=setup({role:'HEAD_ADMIN',account_status:'ACTIVE',is_primary_head_admin:true});
  assert.equal(await allowed.ensurePrimaryHead(),true);
  assert.deepEqual(allowed.alerts,[]);
  for(const profile of [
    {role:'HEAD_ADMIN',account_status:'SUSPENDED',is_primary_head_admin:true},
    {role:'ADMIN',account_status:'ACTIVE',is_primary_head_admin:true}
  ]) assert.equal(await setup(profile).ensurePrimaryHead({silent:true}),false);
});
