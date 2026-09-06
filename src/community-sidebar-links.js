import { supabase } from './supabaseClient';

const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=v=>String(v||'').replace(/[★♛♥✓]/g,'').trim().toLowerCase();
const isVerified=p=>p?.is_verified===true||p?.verified===true||String(p?.verification_status||'').toUpperCase()==='VERIFIED'||String(p?.account_status||'').toUpperCase()==='VERIFIED';
let uid=null,role='',profiles=new Map(),names=new Map(),friends=new Set(),sweepQueued=false;

function profileFor(root){const id=root?.dataset?.profile||root?.dataset?.memberId||q('[data-member-id]',root)?.dataset?.memberId;if(id&&profiles.has(id))return profiles.get(id);return names.get(norm(q('.ec-pro-nickname,.member-nickname,.ec-rf-user-copy strong',root)?.textContent))||null;}
function openProfile(id){if(!id)return;const url=new URL(location.href);url.searchParams.set('profile',id);location.assign(url.toString());}
function addImage(className,src,title){const img=document.createElement('img');img.className=className;img.src=src;img.alt=title;img.title=title;return img;}

function syncIdentity(root,p,showFriend){
  const stack=q('.ec-pro-role-stack',root);
  if(stack){
    qa('.ec-pro-role-star',stack).slice(1).forEach(x=>x.remove());
    const existing=qa('.ec-pro-friend-badge',stack);
    if(showFriend&&friends.has(p.id)){if(!existing.length)stack.appendChild(addImage('ec-pro-friend-badge','/badge-friend.svg','Befreundet'));existing.slice(1).forEach(x=>x.remove());}
    else existing.forEach(x=>x.remove());
  }
  const badges=qa('.ec-pro-verified-badge,.ec-member-name-verified,img[src*="badge-verified"]',root);
  if(isVerified(p)){
    if(!badges.length){const target=q('.ec-pro-name-row,.member-name,.ec-rf-user-copy,.ec-rf-name',root);if(target)target.prepend(addImage('ec-pro-verified-badge','/badge-verified.svg','Verifiziert'));}
    badges.slice(1).forEach(x=>x.remove());
  }else badges.forEach(x=>x.remove());
}

function restoreAdminActivity(){
  if(!['ADMIN','HEAD_ADMIN'].includes(role))return;
  document.documentElement.classList.remove('ec-hide-last-active');
  document.documentElement.classList.add('ec-can-see-last-active');
  qa('.member-status small,.last-active,.last-active-at,[data-last-active],time[data-last-active],.ec-last-active-text').forEach(el=>{if(el.hidden)el.hidden=false;el.removeAttribute('aria-hidden');el.style.removeProperty('display');el.style.removeProperty('visibility');});
}

function sweep(){
  sweepQueued=false;
  const sidebar=q('.ec-sidebar-refactor');
  if(sidebar){
    qa('.modern-nav > *').forEach(node=>{if(node!==sidebar&&!node.classList.contains('ec-force-hide-legacy'))node.classList.add('ec-force-hide-legacy');});
    const self=q('.ec-rf-user',sidebar),me=profiles.get(uid);if(self&&me)syncIdentity(self,me,false);
    qa('[data-profile]',sidebar).forEach(row=>{const p=profiles.get(row.dataset.profile);if(p)syncIdentity(row,p,true);});
  }
  qa('.member-card').forEach(card=>{const p=profileFor(card);if(!p)return;if(card.dataset.memberId!==p.id)card.dataset.memberId=p.id;syncIdentity(card,p,true);});
  restoreAdminActivity();
}
function scheduleSweep(){if(sweepQueued)return;sweepQueued=true;requestAnimationFrame(sweep);}

document.addEventListener('click',event=>{const target=event.target.closest?.('.ec-sidebar-refactor [data-profile]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();openProfile(target.dataset.profile);},true);

async function load(){
  const {data:{user}}=await supabase.auth.getUser();uid=user?.id||null;if(!uid)return;
  const [{data:ps},{data:fs}]=await Promise.all([
    supabase.from('profiles').select('id,nickname,role,account_badge,is_verified,verified,verification_status,account_status').eq('account_status','ACTIVE'),
    supabase.from('friendships').select('requester_id,receiver_id,status').or(`requester_id.eq.${uid},receiver_id.eq.${uid}`).eq('status','ACCEPTED')
  ]);
  profiles=new Map((ps||[]).map(p=>[p.id,p]));names=new Map((ps||[]).map(p=>[norm(p.nickname),p]));
  role=String(profiles.get(uid)?.role||'').toUpperCase();
  friends=new Set((fs||[]).map(f=>f.requester_id===uid?f.receiver_id:f.requester_id));
}
async function init(){await load();scheduleSweep();}
const observer=new MutationObserver(scheduleSweep);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void init();observer.observe(document.body,{childList:true,subtree:true});},{once:true});else{void init();observer.observe(document.body,{childList:true,subtree:true});}
setInterval(()=>{if(!document.hidden)void load().then(scheduleSweep);},60000);
