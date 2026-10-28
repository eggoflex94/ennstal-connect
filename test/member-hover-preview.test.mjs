import test from 'node:test';
import assert from 'node:assert/strict';
import { bindHoverPreview, previewPosition, privatePreviewMember, resolvePreviewTarget } from '../src/memberHoverPreview.js';

function setup(load = async member => member) {
  const document = new EventTarget(), window = new EventTarget();
  const timers = new Map(); let count = 0;
  window.setTimeout = fn => { timers.set(++count, fn); return count; };
  window.clearTimeout = id => timers.delete(id);
  const element = id => ({ id, isConnected:true, attrs:{},
    getAttribute(key){return this.attrs[key] || null;},
    setAttribute(key,value){this.attrs[key]=value;},
    removeAttribute(key){delete this.attrs[key];},
    contains(node){return node===this;},
    getBoundingClientRect(){return {left:30,right:100,top:60};}
  });
  const a=element('a'), b=element('b'), shown=[];
  let hidden=0;
  const dispose=bindHoverPreview({document,window,resolve:target=>[a,b].includes(target)?{element:target,member:{id:target.id}}:null,load,show:member=>shown.push(member.id),hide:()=>hidden++});
  const dispatch=(type,target,extra={})=>{
    const event=new Event(type); Object.assign(event,{targetNode:target,...extra});
    Object.defineProperty(event,'target',{value:target}); document.dispatchEvent(event);
  };
  const run=async()=>{const pending=[...timers.values()];timers.clear();await Promise.all(pending.map(fn=>fn()));};
  return {document,window,a,b,shown,dispatch,run,dispose,get hidden(){return hidden;},timers};
}

test('hover loads the matching card and leaving removes it immediately',async()=>{
 const h=setup();h.a.attrs['aria-describedby']='existing-help';
 h.dispatch('pointerover',h.a);assert.deepEqual(h.shown,[]);
 await h.run();assert.deepEqual(h.shown,['a']);
 assert.equal(h.a.attrs['aria-describedby'],'existing-help ec-member-hover-preview');
 h.dispatch('pointerout',h.a,{relatedTarget:null});
 assert.equal(h.a.attrs['aria-describedby'],'existing-help');assert.ok(h.hidden>=2);
 h.dispose();
});

test('brief hover and touch gestures do not load or show a card',async()=>{
 let loads=0;const h=setup(async m=>{loads++;return m;});
 h.dispatch('pointerover',h.a);h.dispatch('pointerout',h.a,{relatedTarget:null});await h.run();
 h.dispatch('pointerover',h.a,{pointerType:'touch'});await h.run();
 assert.equal(loads,0);assert.deepEqual(h.shown,[]);h.dispose();
});

test('a slow response cannot reopen a dismissed preview or replace a newer nickname',async()=>{
 let finish;const h=setup(m=>m.id==='a'?new Promise(resolve=>{finish=()=>resolve(m);}):Promise.resolve(m));
 h.dispatch('pointerover',h.a);const pending=h.run();
 h.dispatch('pointerover',h.b);await h.run();finish();await pending;
 assert.deepEqual(h.shown,['b']);h.dispose();
});

test('scroll, escape, click and disposal invalidate pending loads',async()=>{
 for(const action of ['scroll','keydown','click','dispose']){
  let finish;const h=setup(m=>new Promise(resolve=>{finish=()=>resolve(m);}));
  h.dispatch('focusin',h.a);const pending=h.run();
  if(action==='dispose')h.dispose();else h.dispatch(action,h.a,{key:'Escape'});
  finish();await pending;assert.deepEqual(h.shown,[],action);h.dispose();
 }
});

test('load failure or a removed nickname never displays a stale card',async()=>{
 const h=setup(async()=>{throw new Error('offline');});
 h.dispatch('pointerover',h.a);await h.run();assert.deepEqual(h.shown,[]);h.dispose();
 const detached=setup();detached.dispatch('pointerover',detached.a);detached.a.isConnected=false;
 await detached.run();assert.deepEqual(detached.shown,[]);detached.dispose();
});

test('the preview flips to the left and stays within the viewport',()=>{
 assert.deepEqual(previewPosition({left:900,right:980,top:750},{width:1000,height:800}),{left:698,top:540});
 assert.deepEqual(previewPosition({left:5,right:25,top:0},{width:390,height:844}),{left:37,top:10});
});

test('preview respects private names, birthdays and admin-only last names',()=>{
 const member={id:'target',first_name:'Private',last_name:'Name',birth_date:'1990-01-01',privacy_settings:{name:'FRIENDS',birth_date:'PRIVATE',last_name:'ADMIN_ONLY'}};
 const viewer={id:'viewer',role:'MEMBER'};
 const noFriend=privatePreviewMember(member,viewer);assert.equal(noFriend.first_name,'');assert.equal(noFriend.last_name,'');assert.equal(noFriend.birth_date,null);
 const friendship=[{requester_id:'target',receiver_id:'viewer',status:'ACCEPTED'}];
 const friend=privatePreviewMember(member,viewer,friendship);assert.equal(friend.first_name,'Private');assert.equal(friend.last_name,'');assert.equal(friend.birth_date,null);
 assert.equal(privatePreviewMember(member,{id:'target'}).birth_date,'1990-01-01');
 assert.equal(member.last_name,'Name');
});

test('visitor nickname resolves using its profile id, not a potentially ambiguous name',()=>{
 const owner={dataset:{profileId:'target'}};
 const name={textContent:'Jasi [202]',closest(selector){return selector.includes('ec-member-hover-preview')?null:owner;}};
 const node={closest:()=>name};
 const known={id:'target',nickname:'Jasi'};
 assert.equal(resolvePreviewTarget(node,[known]).member,known);
 assert.equal(resolvePreviewTarget(node,[]).member.nickname,'Jasi');
 assert.equal(resolvePreviewTarget({closest:()=>null},[]),null);
});
