import { supabase } from './supabaseClient';
import './community-growth-hub.css';

let timer=null;
let requestVersion=0;
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};
const nav=(page)=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));

async function context(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return null;
  const [{data:profile},{data:regions}]=await Promise.all([
    supabase.from('profiles').select('id,home_region_id,account_badge,company_name,company_description').eq('id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active',true)
  ]);
  const slug=document.documentElement.dataset.ecRegion||document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region')||'';
  const region=(regions||[]).find((item)=>item.slug===slug)||(regions||[]).find((item)=>item.id===profile?.home_region_id)||null;
  return {user,profile,region};
}

function eventCard(event){
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-nav="events"><span class="ec-growth-tag">TERMIN</span><strong>${esc(event.title)}</strong><span>${esc(fmt(event.event_at))}${event.location?` · ${esc(event.location)}`:''}</span></button>`;
}
function requestCard(request){
  const labels={MITFAHREN:'Mitfahrgelegenheit',WANDERPARTNER:'Wanderpartner',REGIONALER_TIPP:'Regionaler Tipp'};
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-nav="home"><span class="ec-growth-tag">${esc(labels[request.category]||'Community')}</span><strong>${esc(request.title)}</strong><span>${esc(String(request.content||'').slice(0,120))}</span></button>`;
}
function businessCard(member){
  const name=member.company_name||member.nickname||[member.first_name,member.last_name].filter(Boolean).join(' ')||'Unternehmen';
  const detail=member.company_description||'Regionales Unternehmenskonto';
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-profile="${esc(member.id)}"><span class="ec-growth-tag">UNTERNEHMEN</span><strong>${esc(name)}</strong><span>${esc(detail)}</span></button>`;
}

function section(title,action,page,items,empty){
  return `<article class="ec-growth-card"><div class="ec-growth-card-head"><h3>${esc(title)}</h3>${page?`<button type="button" data-growth-nav="${esc(page)}">Alle ansehen →</button>`:''}</div><div class="ec-growth-list">${items.length?items.join(''):`<p class="ec-growth-empty">${esc(empty)}</p>`}</div></article>`;
}

function wire(root){
  root.querySelectorAll('[data-growth-nav]').forEach((button)=>button.onclick=()=>nav(button.dataset.growthNav));
  root.querySelectorAll('[data-growth-profile]').forEach((button)=>button.onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:button.dataset.growthProfile}})));
}

async function renderHome(){
  const home=document.querySelector('.home-page');
  if(!home)return;
  const version=++requestVersion;
  const ctx=await context();
  if(!ctx?.region||version!==requestVersion)return;
  const now=new Date().toISOString();
  const [{data:events},{data:requests},{data:businesses}]=await Promise.all([
    supabase.from('community_events').select('id,title,event_at,location,status,region_id').eq('region_id',ctx.region.id).gte('event_at',now).order('event_at',{ascending:true}).limit(6),
    supabase.from('community_requests').select('id,title,content,category,region_id,status,created_at').eq('region_id',ctx.region.id).order('created_at',{ascending:false}).limit(6),
    supabase.from('profiles').select('id,nickname,first_name,last_name,company_name,company_description,account_badge,home_region_id').eq('account_badge','BUSINESS').limit(12)
  ]);
  if(version!==requestVersion)return;
  const activeEvents=(events||[]).filter((event)=>String(event.status||'').toUpperCase()!=='CANCELLED').slice(0,3);
  const activeRequests=(requests||[]).filter((request)=>!request.status||!['CLOSED','DONE','ARCHIVED'].includes(String(request.status).toUpperCase())).slice(0,3);
  const regionalBusinesses=(businesses||[]).filter((member)=>!member.home_region_id||member.home_region_id===ctx.region.id).slice(0,3);
  home.querySelector(':scope > .ec-growth-hub')?.remove();
  const hub=document.createElement('section');
  hub.className='ec-growth-hub';
  hub.innerHTML=`<div class="ec-growth-head"><div><small>DEINE REGION AUF EINEN BLICK</small><h2>Heute & demnächst in ${esc(ctx.region.name)}</h2></div><span class="ec-growth-region">${esc(ctx.region.name)}</span></div><div class="ec-growth-grid">${section('Heute & demnächst','', 'events',activeEvents.map(eventCard),'Derzeit keine kommenden Termine.')}${section('Gesucht & angeboten','', 'home',activeRequests.map(requestCard),'Noch keine offenen Community-Aufrufe.')}${section('Regionale Unternehmen','', 'community',regionalBusinesses.map(businessCard),'Noch keine Unternehmenskonten in dieser Region.')}</div>`;
  const heading=home.querySelector(':scope > .page-heading');
  if(heading)heading.insertAdjacentElement('afterend',hub);else home.prepend(hub);
  wire(hub);
}

function businessPanelMarkup(member){
  const title=member.company_name||member.nickname||'Unternehmenskonto';
  const desc=member.company_description||'Regionales Unternehmen oder Verein auf Ennstal Connect.';
  return `<header><div><span class="ec-business-kicker">REGIONALER PARTNER</span><h2>${esc(title)}</h2></div><span aria-label="Unternehmenskonto">★</span></header><p>${esc(desc)}</p><div class="ec-business-meta"><span>Verifiziertes Unternehmenskonto</span>${member.home_region_id?'<span>Regional sichtbar</span>':''}</div>`;
}

async function renderBusinessProfile(){
  const page=document.querySelector('.member-profile-page[data-profile-id]');
  if(!page||page.querySelector(':scope > .ec-business-profile-panel'))return;
  const id=page.dataset.profileId;
  if(!id)return;
  const {data:member}=await supabase.from('profiles').select('id,nickname,company_name,company_description,account_badge,home_region_id').eq('id',id).maybeSingle();
  if(!member||String(member.account_badge||'').toUpperCase()!=='BUSINESS')return;
  const panel=document.createElement('section');
  panel.className='ec-business-profile-panel';
  panel.innerHTML=businessPanelMarkup(member);
  const card=page.querySelector(':scope > .ec-mp-card');
  const hero=page.querySelector(':scope > .member-profile-hero');
  const anchor=card||hero;
  if(anchor)anchor.insertAdjacentElement('afterend',panel);else page.prepend(panel);
}

async function apply(){
  if(!supabase)return;
  await Promise.allSettled([renderHome(),renderBusinessProfile()]);
}
function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void apply(),delay)}
window.addEventListener('ec:navigate',()=>schedule(100));
window.addEventListener('ec:region-change',()=>schedule(120));
window.addEventListener('ec:business-account-changed',()=>schedule(60));
window.addEventListener('focus',()=>schedule(80));
new MutationObserver(()=>schedule(100)).observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});else schedule(20);
