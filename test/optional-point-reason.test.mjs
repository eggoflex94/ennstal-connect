import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/supabaseClient.js',import.meta.url),'utf8');
const start=source.indexOf('window.prompt = function');
const end=source.indexOf('async function currentPrivilegeRole()',start);
function prompts(head, answer) {
  let calls=0;
  const context={window:{},headAdminPromptBypass:head,HEAD_ADMIN_AUDIT_REASON:'audit',nativePrompt:()=>{calls++;return answer;}};
  vm.runInNewContext(source.slice(start,end),context);
  return {prompt:context.window.prompt,count:()=>calls};
}
test('head admin can enter an optional points reason',()=>{
  const ui=prompts(true,'Danke für die Hilfe');
  assert.equal(ui.prompt('Begründung für „Pluspunkte vergeben“ (optional):',''),'Danke für die Hilfe');
  assert.equal(ui.count(),1);
});
test('optional reason supports leaving blank and cancelling without inventing a reason',()=>{
  for(const answer of ['',null]) {
    const ui=prompts(true,answer);
    assert.equal(ui.prompt('Begründung für „Minuspunkte vergeben“ (optional):',''),answer);
    assert.equal(ui.count(),1);
  }
});
test('mandatory head-admin audit bypass and other admins required prompts remain intact',()=>{
  const head=prompts(true,'not used');
  assert.equal(head.prompt('Begründung für „Rolle ändern“ (verpflichtend):',''),'audit');
  assert.equal(head.count(),0);
  const admin=prompts(false,'Begründung des Admins');
  assert.equal(admin.prompt('Begründung für „Pluspunkte vergeben“ (verpflichtend):',''),'Begründung des Admins');
  assert.equal(admin.count(),1);
});
