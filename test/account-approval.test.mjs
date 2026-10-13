import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { correctionPayload, validRealName } from '../src/accountApproval.js';

test('account corrections contain only the requested personal fields', () => {
  const changes = correctionPayload({ required_fields: ['first_name','birth_date'] }, { first_name:' Anna ',last_name:'Not requested',birth_date:'1990-12-15',role:'HEAD_ADMIN',status:'APPROVED' });
  assert.deepEqual(changes,{first_name:'Anna',birth_date:'1990-12-15'});
  assert.throws(()=>correctionPayload({required_fields:['role']},{role:'HEAD_ADMIN'}));
});
test('names allow accents and hyphens but reject incomplete or numeric names', () => {
  for(const name of ['Anna-Maria',"O’Connor",'Müller']) assert.equal(validRealName(name),true);
  for(const name of ['A','Anna123','<script>','']) assert.equal(validRealName(name),false);
  assert.throws(()=>correctionPayload({required_fields:['last_name']},{last_name:''}));
  assert.throws(()=>correctionPayload({required_fields:['birth_date']},{birth_date:'2020-02-31'}));
});
test('new approvals cannot change login, suspension, roles or profile-verification state', async () => {
  const sql=await readFile(new URL('../supabase/account_approval_workflow.sql',import.meta.url),'utf8');
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.account_approvals from public, anon, authenticated/i);
  assert.match(sql,/auth\.uid\(\) is null or not public\.ec_is_head_admin\(\)/);
  assert.doesNotMatch(sql,/update\s+auth\.users/i);
  assert.doesNotMatch(sql,/update\s+public\.profiles\s+set\s+(?:account_status|role|is_verified)/i);
  assert.match(sql,/after insert on public\.profiles/);
  assert.match(sql,/after update of first_name,last_name,birth_date/);
});
