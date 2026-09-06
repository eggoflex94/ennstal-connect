import { supabase } from './supabaseClient';

let currentUser=null,currentProfile=null,profileCache=new Map();
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const isMobile=()=>matchMedia('(max-width:900px)').matches;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function loadCurrent(){const {data:{user}}=await supabase.auth.getUser();if(!user)return;currentUser=user;const {data}=await supabase.from('profiles').select('id,nickname,role,forum_moderator,admin_responsibilities,head_admin_responsibilities,account_status').eq('id',user.id).maybeSingle();currentProfile=data||null;}

function makeAdminButton(key,label,source,svg){if(!source)return null;const b=document.createElement('button');b.type='button';b.className='ec-function-icon ec-mobile-parity-admin';b.dataset.key=key;b.title=label;b.setAttribute('aria-label',label);b.innerHTML=`<span class="ec-icon-visual">${svg}</span><span class="ec-icon-label">${label}</span>`;b.onclick=()=>source.click();return b;}

function ensureAdminSidebar(){if(!currentProfile||!['HEAD_ADMIN','ADMIN'].includes(currentProfile.role))return;const shell=$('.ec-sidebar-shell');if(!shell)return;let block=$('.ec-admin-block',shell);if(!block){block=document.createElement('section');block.className='ec-sidebar-block ec-admin-block';block.innerHTML='<div class="ec-sidebar-block-title">ADMIN BEREICH</div><div class="ec-admin-icon-grid"></div>';const anchor=$('.ec-community-activity-block',shell)||$('.ec-online-block',shell);anchor?.before(block)}let grid=$('.ec-admin-icon-grid',block);if(!grid){grid=document.createElement('div');grid.className='ec-admin-icon-grid';block.append(grid)}
 const adminCenter=$$('button,a').find(n=>!n.closest('.ec-sidebar-shell')&&/admin-zentrale/i.test(n.textContent||''));
 const adminTools=$('.ec-admin-workspace-entry');
 if(adminCenter&&!grid.querySelector('[data-key="admin-center"]'))grid.append(makeAdminButton('admin-center','Admin-Zentrale',adminCenter,'<svg viewBox="0 0 24 24"><path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z"/><path d="M9 12h6M12 9v6"/></svg>'));
 if(adminTools&&!grid.querySelector('[data-key="admin-tools"]'))grid.append(makeAdminButton('admin-tools','Admin Tools',adminTools,'<svg viewBox="0 0 24 24"><path d="m14 6 4-3 3 3-3 4M13 7 4 16l4 4 9-9M5 5l14 14"/></svg>'));
}

async function freshProfile(id){if(!id)return null;const cached=profileCache.get(id);if(cached&&Date.now()-cached.at<15000)return cached.data;const {data}=await supabase.from('profiles').select('id,nickname,role,forum_moderator,admin_responsibilities,head_admin_responsibilities,account_badge,nickname_color').eq('id',id).maybeSingle();profileCache.set(id,{data,at:Date.now()});return data}

async function syncVisibleResponsibilities(){const page=$('.member-profile-page');const hero=$('.member-profile-hero',page);if(!page||!hero)return;let id=new URLSearchParams(location.search).get('profile');if(!id){const name=$('h1',hero)?.textContent?.trim();if(name){const {data}=await supabase.from('profiles').select('id').eq('nickname',name).maybeSingle();id=data?.id}}
 const p=await freshProfile(id);if(!p)return;const text=hero.querySelector(':scope > div');if(!text)return;text.querySelector('.admin-responsibilities')?.remove();let list=[];if(p.role==='HEAD_ADMIN')list=[p.head_admin_responsibilities||'Gesamtverantwortung, Sicherheit & Regeln'];else{const saved=Array.isArray(p.admin_responsibilities)?p.admin_responsibilities.filter(Boolean):[];list=[...saved];if(p.forum_moderator&&!list.some(v=>/forum/i.test(String(v))))list.push('Forum-Moderation · Meldungen und respektvoller Austausch')}
 if(!list.length)return;const box=document.createElement('p');box.className='admin-responsibilities';box.textContent=`Zuständig für: ${list.join(' · ')}`;text.append(box)}

async function openExactActivity(detail){if(!detail?.id&&!detail?.title)return;for(let i=0;i<12;i++){await sleep(i?120:50);let candidates=[];if(detail.type==='GROUP')candidates=$$('.groups-page .group-card,.community-group-card,.group-list-card');else if(detail.type==='FORUM')candidates=$$('.forum-page .forum-post');else if(detail.type==='WANDERUNG'||detail.type==='MITFAHRT'||detail.type==='REQUEST')candidates=$$('.community-request-card,.request-card,.community-card');else if(detail.type==='EVENT')candidates=$$('.event-card,.community-event-card');let target=candidates.find(n=>detail.title&&n.textContent?.toLowerCase().includes(String(detail.title).toLowerCase()));if(!target)continue;target.classList.add('ec-activity-target');target.scrollIntoView({behavior:'smooth',block:'center'});if(detail.type==='GROUP'&&!target.closest('button,input,textarea,label'))target.click();setTimeout(()=>target.classList.remove('ec-activity-target'),2500);return}}
window.addEventListener('ec:open-community-activity',e=>void openExactActivity(e.detail));

function enforceMobileModeration(){if(!isMobile())return;$$('.member-admin-tools,.integrated-admin-tools,.forum-post-head,.content-card-actions,.group-card-actions,.group-admin-actions').forEach(n=>n.classList.add('ec-mobile-admin-visible'));}

let pending=false;async function sweep(){if(pending)return;pending=true;try{ensureAdminSidebar();enforceMobileModeration();await syncVisibleResponsibilities()}finally{pending=false}}

await loadCurrent();void sweep();
const obs=new MutationObserver(()=>{clearTimeout(window.__ecMobileParityDelay);window.__ecMobileParityDelay=setTimeout(sweep,100)});obs.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('resize',sweep);window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){profileCache.clear();void loadCurrent().then(sweep)}});window.addEventListener('pagehide',()=>obs.disconnect(),{once:true});