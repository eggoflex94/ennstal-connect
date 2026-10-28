import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isMemberOnline,ONLINE_WINDOW_MS} from '../src/memberPresence.js';
import {resolvePreviewTarget} from '../src/memberHoverPreview.js';
test('explicit offline overrides a recent activity timestamp',()=>{
 const now=Date.now(),recent=new Date(now-1000).toISOString();
 assert.equal(isMemberOnline({is_online:false,last_active_at:recent},now),false);
 assert.equal(isMemberOnline({is_online:true,last_active_at:recent},now),true);
 assert.equal(isMemberOnline({is_online:true,last_active_at:recent,hide_online_status:true},now),false);
 assert.equal(isMemberOnline({is_online:true,last_active_at:new Date(now-ONLINE_WINDOW_MS).toISOString()},now),false);
 assert.equal(isMemberOnline({is_online:true,last_active_at:new Date(now+1000).toISOString()},now),false);
});
test('the actual online-friend nickname and normalized fallback resolve to the same member',()=>{
 for(const selector of ['.ec-online-nickname','.ec-online-friend-name']){
  const owner={dataset:{profileId:'online-friend'}};
  const element={textContent:'egga [1333]',closest:query=>query.includes('ec-member-hover-preview')?null:owner};
  const node={closest:query=>{assert.ok(query.includes(selector));return element;}};
  assert.equal(resolvePreviewTarget(node,[]).member.id,'online-friend');
 }
 const source=readFileSync(new URL('../src/dashboard-top-polish.js',import.meta.url),'utf8');
 assert.match(source,/class="ec-online-nickname" data-member-preview-id=/);
});
test('background timers cannot renew presence without activity',()=>{
 const mobile=readFileSync(new URL('../src/mobile-presence-sync.js',import.meta.url),'utf8');
 assert.doesNotMatch(mobile,/setInterval\(.*touchPresence/);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/document\.addEventListener\("visibilitychange", visibilityPresence\)/);
 assert.match(app,/if \(document\.visibilityState !== "visible"\) return;/);
});
test('offline presence requests can finish while the page is closing',async()=>{
 const {createNetworkFetch}=await import('../src/networkFetch.js');
 const calls=[];const fetcher=createNetworkFetch(async(_url,init)=>{calls.push(init);return new Response('{}',{status:200});});
 await fetcher('https://example.test/rest/v1/rpc/record_presence',{method:'POST',body:JSON.stringify({p_online:false})});
 await fetcher('https://example.test/rest/v1/rpc/record_presence',{method:'POST',body:JSON.stringify({p_online:true})});
 assert.equal(calls[0].keepalive,true);assert.notEqual(calls[1].keepalive,true);assert.equal(calls.length,2);
});
