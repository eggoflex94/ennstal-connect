import { supabase } from './supabaseClient';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let busy=false;

function targetProfileId(page){
  return page?.dataset?.profileId||page?.dataset?.targetId||page?.querySelector('[data-profile-id]')?.dataset?.profileId||null;
}

function classifyRequest(category,title,content){
  const text=`${category||''} ${title||''} ${content||''}`.toLowerCase();
  if(/mitfahr|fahrgemeinschaft|fahrt|carpool|ride/.test(text))return'ride';
  if(/wander|wandertour|wanderroute|route|tour|hike/.test(text))return'hike';
  return'other';
}

function groupCard(group){
  return `<button type="button" class="ec-profile-community-item ec-profile-group-item" data-group-id="${esc(group.id)}">
    <span class="ec-profile-community-thumb">${group.image_url?`<img src="${esc(group.image_url)}" alt="">`:'<span aria-hidden="true">👥</span>'}</span>
    <span class="ec-profile-community-copy"><strong>${esc(group.name||'Gruppe')}</strong>${group.description?`<small>${esc(group.description)}</small>`:''}</span>
    <span class="ec-profile-community-arrow" aria-hidden="true">›</span>
  </button>`;
}

function requestCard(request,kind){
  const icon=kind==='ride'?'🚗':'🥾';
  return `<article class="ec-profile-community-item ec-profile-request-item">
    <span class="ec-profile-community-thumb is-icon" aria-hidden="true">${icon}</span>
    <span class="ec-profile-community-copy"><strong>${esc(request.title|| (kind==='ride'?'Mitfahrgelegenheit':'Wanderroute'))}</strong>${request.content?`<small>${esc(request.content)}</small>`:''}${request.created_at?`<em>${new Date(request.created_at).toLocaleDateString('de-AT')}</em>`:''}</span>
  </article>`;
}

function section(label,title,body,empty){
  return `<section class="ec-profile-community-card"><span class="ec-profile-community-eyebrow">${esc(label)}</span><h2>${esc(title)}</h2><div class="ec-profile-community-list">${body||`<p class="ec-profile-community-empty">${esc(empty)}</p>`}</div></section>`;
}

async function renderFor(page){
  if(!supabase||!page)return;
  const profileId=targetProfileId(page);
  if(!profileId)return;
  const existing=page.querySelector(':scope > .ec-profile-community-modules');
  if(existing?.dataset.profileId===profileId)return;

  const [{data:groups},{data:requests}]=await Promise.all([
    supabase.from('community_groups').select('id,name,description,image_url,member_ids,region_id').order('name'),
    supabase.from('community_requests').select('id,author_id,category,title,content,created_at,region_id').eq('author_id',profileId).order('created_at',{ascending:false})
  ]);

  const joined=(groups||[]).filter(group=>Array.isArray(group.member_ids)&&group.member_ids.includes(profileId)).slice(0,6);
  const typed=(requests||[]).map(request=>({...request,_kind:classifyRequest(request.category,request.title,request.content)}));
  const rides=typed.filter(item=>item._kind==='ride').slice(0,5);
  const hikes=typed.filter(item=>item._kind==='hike').slice(0,5);

  const wrap=document.createElement('div');
  wrap.className='ec-profile-community-modules';
  wrap.dataset.profileId=profileId;
  wrap.innerHTML=[
    section('GRUPPEN','Gruppenzugehörigkeit',joined.map(groupCard).join(''),'Noch keiner Gruppe beigetreten.'),
    section('MITFAHRGELEGENHEIT','Mitfahrgesuche & Fahrten',rides.map(item=>requestCard(item,'ride')).join(''),'Noch keine Mitfahrgesuche oder Fahrten veröffentlicht.'),
    section('WANDERROUTEN','Wanderrouten',hikes.map(item=>requestCard(item,'hike')).join(''),'Noch keine Wanderrouten veröffentlicht.')
  ].join('');

  wrap.querySelectorAll('[data-group-id]').forEach(button=>button.addEventListener('click',()=>{
    window.dispatchEvent(new CustomEvent('ec:open-group',{detail:{groupId:button.dataset.groupId}}));
  }));

  existing?.remove();
  const photoFolder=[...page.querySelectorAll(':scope > section,:scope > div')].find(node=>/FOTOORDNER|Fotos aus deinem Profil|Fotos/i.test(node.textContent||'')&&node!==page.querySelector('.ec-clean-profile'));
  if(photoFolder)photoFolder.before(wrap);
  else page.appendChild(wrap);
}

async function run(){
  if(busy)return;busy=true;
  try{for(const page of document.querySelectorAll('.member-profile-page'))await renderFor(page)}catch(error){console.warn('Profil-Community-Bereiche konnten nicht geladen werden:',error)}finally{busy=false}
}

let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;void run()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void run(),{once:true});else void run();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>setTimeout(()=>void run(),80));
