import { supabase } from './supabaseClient';

const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const norm=v=>String(v||'').replace(/[★♛♥✓]/g,'').trim().toLowerCase();
let uid=null,role='',profiles=new Map(),names=new Map(),friends=new Set();

function cardProfile(card){const id=card?.dataset?.memberId||q('[data-member-id]',card)?.dataset?.memberId;if(id&&profiles.has(id))return profiles.get(id);return names.get(norm(q('.ec-pro-nickname,.member-nickname',card)?.textContent))||null;}
function showMain(){if(matchMedia('(max-width:900px)').matches)requestAnimationFrame(()=>q('.modern-main')?.scrollIntoView({behavior:'smooth',block:'start'}));}
function openProfile(profileId){if(!profileId)return;const url=new URL(window.location.href);url.searchParams.set('profile',profileId);window.location.assign(url.toString());}
function oneStar(stack){qa('.ec-pro-role-star',stack).slice(1).forEach(x=>x.remove());}
function syncBadges(){qa('.member-card').forEach(card=>{const p=cardProfile(card);if(!p)return;card.dataset.memberId=p.id;qa('.ec-pro-role-stack',card).forEach(stack=>{oneStar(stack);qa('.ec-pro-friend-badge',stack).forEach(x=>x.remove());if(friends.has(p.id)){const badge=document.createElement('img');badge.src='/badge-friend.svg';badge.alt='Befreundet';badge.title='Befreundet';badge.className='ec-pro-friend-badge';stack.appendChild(badge);}});qa('.ec-pro-verified-badge,.ec-member-name-verified,img[src*="badge-verified"]',card).slice(1).forEach(x=>x.remove());});qa('.ec-pro-role-stack').forEach(oneStar);}
function restoreAdminActivity(){if(!['ADMIN','HEAD_ADMIN'].includes(role))return;document.documentElement.classList.remove('ec-hide-last-active');document.documentElement.classList.add('ec-can-see-last-active');qa('.member-status small,.last-active,.last-active-at,[data-last-active],time[data-last-active],.ec-last-active-text').forEach(el=>{el.hidden=false;el.removeAttribute('aria-hidden');el.style.removeProperty('display');el.style.removeProperty('visibility');});}
function sweep(){const sidebar=q('.ec-sidebar-refactor');if(sidebar)qa('.modern-nav > *').forEach(node=>{if(node!==sidebar)node.classList.add('ec-force-hide-legacy');});syncBadges();restoreAdminActivity();}
document.addEventListener('click',event=>{const target=event.target.closest?.('.ec-sidebar-refactor [data-profile]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();openProfile(target.dataset.profile);},true);
async function load(){const {data:{user}}=await supabase.auth.getUser();uid=user?.id||null;if(!uid)return;const [{data:ps},{data:fs}]=await Promise.all([supabase.from('profiles').select('id,nickname,role,account_status').eq('account_status','ACTIVE'),supabase.from('friendships').select('requester_id,receiver_id,status').or(`requester_id.eq.${uid},receiver_id.eq.${uid}`).eq('status','ACCEPTED')]);profiles=new Map((ps||[]).map(p=>[p.id,p]));names=new Map((ps||[]).map(p=>[norm(p.nickname),p]));role=String(profiles.get(uid)?.role||'').toUpperCase();friends=new Set((fs||[]).map(f=>f.requester_id===uid?f.receiver_id:f.requester_id));}
async function init(){await load();sweep();}
const observer=new MutationObserver(()=>requestAnimationFrame(sweep));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void init();observer.observe(document.body,{childList:true,subtree:true});},{once:true});else{void init();observer.observe(document.body,{childList:true,subtree:true});}
setInterval(()=>{if(!document.hidden)void load().then(sweep);},30000);
