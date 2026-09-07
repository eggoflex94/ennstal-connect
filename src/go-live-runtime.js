import { supabase } from './supabaseClient';

let regions=[];
let active=null;
let busy=false;

const norm=v=>String(v||'').trim().toLowerCase();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadRegions(){
  if(!supabase)return;
  const {data}=await supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order');
  regions=data||[];
  const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region')||'ennstal';
  active=regions.find(r=>r.slug===slug)||regions[0]||null;
}

function enforceSupporterGold(){
  document.querySelectorAll('.member-card[data-role-theme="supporter"],.member-card.role-theme-supporter,.member-card.supporter').forEach(card=>{
    card.style.setProperty('background','linear-gradient(145deg,#ffe537 0%,#d6aa00 25%,#8e6900 45%,#493700 62%,#211900 76%,#050505 100%)','important');
    card.style.setProperty('border-color','#ffd400','important');
    const nickname=card.querySelector('.member-nickname');
    if(nickname){nickname.style.setProperty('color','#050505','important');nickname.style.setProperty('-webkit-text-fill-color','#050505','important');nickname.style.setProperty('text-shadow','none','important')}
  });
}

function addRegionContext(){
  if(!active)return;
  const roots=document.querySelectorAll('.home-page,.news-page,.groups-page,.forum-page,.community-page,.events-page,.ads-page');
  roots.forEach(root=>{
    let bar=root.querySelector(':scope > .ec-page-region-banner');
    if(!bar){bar=document.createElement('div');bar.className='ec-page-region-banner';root.prepend(bar)}
    bar.innerHTML=`<span>AKTIVE REGION</span><strong>${esc(active.name)}</strong><small>Regionale Inhalte, Zuständigkeiten und Verwaltung</small>`;
  });
}

async function regionalSets(){
  if(!supabase||!active)return null;
  const [news,groups,events,posts,ads]=await Promise.all([
    supabase.from('news').select('title').eq('region_id',active.id),
    supabase.from('community_groups').select('name').eq('region_id',active.id),
    supabase.from('community_events').select('title').eq('region_id',active.id),
    supabase.from('forum_posts').select('title').eq('region_id',active.id).eq('scope','COMMUNITY'),
    supabase.from('community_ads').select('title').eq('region_id',active.id).eq('is_active',true)
  ]);
  return {
    news:new Set((news.data||[]).map(x=>norm(x.title))),
    groups:new Set((groups.data||[]).map(x=>norm(x.name))),
    events:new Set((events.data||[]).map(x=>norm(x.title))),
    posts:new Set((posts.data||[]).map(x=>norm(x.title))),
    ads:new Set((ads.data||[]).map(x=>norm(x.title)))
  };
}

function filterCards(selector,titleSelector,allowed){
  document.querySelectorAll(selector).forEach(card=>{
    const title=norm(card.querySelector(titleSelector)?.textContent);
    if(!title)return;
    card.hidden=!allowed.has(title);
    card.classList.toggle('ec-region-hidden',!allowed.has(title));
  });
}

async function applyRegionalContent(){
  if(busy)return;busy=true;
  try{
    await loadRegions();
    addRegionContext();
    const sets=await regionalSets();
    if(!sets)return;
    filterCards('.news-grid .news-card','h2',sets.news);
    filterCards('.group-grid .group-card','h2',sets.groups);
    filterCards('.forum-post','h2',sets.posts);
    filterCards('.community-hub-grid .hub-row','strong',sets.events);
    filterCards('.community-ad-list .community-ad-card:not(.community-ad-placeholder-card)','strong,.community-ad-title,h3',sets.ads);
  }catch(error){console.warn('Regionale Darstellung konnte nicht vollständig aktualisiert werden:',error)}finally{busy=false}
}

function sweep(){
  enforceSupporterGold();
  addRegionContext();
}

let queued=false;
new MutationObserver(()=>{
  if(queued)return;queued=true;
  requestAnimationFrame(()=>{queued=false;sweep()});
}).observe(document.documentElement,{subtree:true,childList:true});

window.addEventListener('ec:region-change',()=>setTimeout(()=>void applyRegionalContent(),40));
window.addEventListener('focus',()=>void applyRegionalContent());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void applyRegionalContent(),{once:true});
else void applyRegionalContent();
sweep();
