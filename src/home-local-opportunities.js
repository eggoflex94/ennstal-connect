import { supabase } from './supabaseClient';

const PANEL_ID = 'ec-local-opportunities';
let activeRegion = null;
let refreshTimer = null;
let requestVersion = 0;
let lastRegionId = null;
let lastLoadedAt = 0;
const FRESH_FOR_MS = 30000;

const clean = (value) => String(value ?? '').trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function currentRegionSlug(){
  return clean(document.querySelector('.ec-region-picker select')?.value || localStorage.getItem('ec-active-region'));
}

async function resolveRegion(){
  if(activeRegion?.id) return activeRegion;
  const slug = currentRegionSlug();
  if(!slug || !supabase) return null;
  const { data } = await supabase.from('regions').select('id,name,slug').eq('slug',slug).maybeSingle();
  return data || null;
}

const listingLabel = (type) => {
  const key = clean(type).toUpperCase();
  if (key === 'JOB' || key === 'JOBS') return 'JOB';
  if (key === 'OFFER' || key === 'ANGEBOT') return 'ANGEBOT';
  if (key === 'SERVICE') return 'SERVICE';
  if (key === 'EVENT') return 'EVENT';
  return key || 'REGIONAL';
};

function openCommunity(){
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'community'}}));
}

function openProfile(member){
  window.dispatchEvent(new CustomEvent('ec:open-profile',{
    detail:{profileId:member.id,nickname:member.nickname || member.company_name || 'Unternehmen'},
    cancelable:true
  }));
}

function listingCard(listing){
  const card = document.createElement(listing.link_url ? 'a' : 'button');
  card.className = 'ec-local-opportunity-card';
  if(listing.link_url){
    card.href = listing.link_url;
    card.target = '_blank';
    card.rel = 'noreferrer';
  }else{
    card.type='button';
    card.addEventListener('click',openCommunity);
  }
  card.innerHTML =
    '<span class="ec-local-opportunity-type">' + esc(listingLabel(listing.listing_type)) + '</span>' +
    '<strong>' + esc(listing.title || 'Regionales Angebot') + '</strong>' +
    '<small>' + esc((listing.body || 'Mehr dazu in der Community.').slice(0,150)) + '</small>' +
    '<em>' + (listing.link_url ? 'Mehr erfahren ↗' : 'In der Community ansehen →') + '</em>';
  return card;
}

function businessCard(member){
  const button=document.createElement('button');
  button.type='button';
  button.className='ec-local-opportunity-card ec-local-business-card';
  button.addEventListener('click',()=>openProfile(member));
  const name = clean(member.company_name || member.nickname || 'Regionales Unternehmen');
  const category = clean(member.company_category || 'Regionales Unternehmen');
  button.innerHTML =
    '<span class="ec-local-opportunity-type">UNTERNEHMEN</span>' +
    '<strong>' + esc(name) + '</strong>' +
    '<small>' + esc(member.company_description || category) + '</small>' +
    '<em>Profil ansehen →</em>';
  return button;
}

function render(region, listings, businesses){
  document.getElementById(PANEL_ID)?.remove();
  const anchor = document.querySelector('#ec-member-suggestions')
    || document.querySelector('#ec-home-activation .ec-weekly-goals')
    || document.querySelector('#ec-home-activation .ec-weekly-region-recap');
  if(!anchor) return false;

  const panel=document.createElement('section');
  panel.id=PANEL_ID;
  panel.className='ec-local-opportunities';

  const hasListings=listings.length>0;
  const title = hasListings ? 'Aktuelles von Unternehmen' : 'Unternehmen aus deiner Region';
  const subtitle = hasListings
    ? 'Angebote, Jobs und regionale Möglichkeiten aus ' + esc(region.name) + '.'
    : 'Noch keine aktiven Inserate – entdecke regionale Unternehmen aus ' + esc(region.name) + '.';

  panel.innerHTML =
    '<div class="ec-local-opportunities-head">' +
      '<div><span class="eyebrow">LOKALE CHANCEN</span><h2>' + title + '</h2><p>' + subtitle + '</p></div>' +
      '<button type="button" data-ec-local-all>Community öffnen →</button>' +
    '</div>' +
    '<div class="ec-local-opportunities-grid"></div>';

  panel.querySelector('[data-ec-local-all]')?.addEventListener('click',openCommunity);
  const grid=panel.querySelector('.ec-local-opportunities-grid');
  (hasListings ? listings.slice(0,3).map(listingCard) : businesses.slice(0,3).map(businessCard))
    .forEach((node)=>grid.appendChild(node));

  if(!grid.children.length) return false;
  anchor.after(panel);
  return true;
}

async function refresh(force=false){
  if(!supabase || !document.querySelector('.home-page')) return;
  const region=await resolveRegion();
  if(!region?.id) return;
  if(!force && region.id===lastRegionId && Date.now()-lastLoadedAt<FRESH_FOR_MS && document.getElementById(PANEL_ID)) return;

  const version=++requestVersion;
  const results = await Promise.all([
    supabase.from('business_listings')
      .select('id,owner_id,region_id,listing_type,title,body,link_url,valid_until,is_active,created_at')
      .eq('region_id',region.id)
      .eq('is_active',true)
      .order('created_at',{ascending:false})
      .limit(8),
    supabase.rpc('community_member_directory')
  ]);
  const listings = results[0].data;
  const listError = results[0].error;
  const directory = results[1].data;
  const directoryError = results[1].error;

  if(version!==requestVersion || (activeRegion?.id && activeRegion.id!==region.id)) return;

  const now=Date.now();
  const validListings=(listError?[]:(listings||[])).filter((item)=>!item.valid_until || new Date(item.valid_until).getTime()>=now);
  const members=(directoryError?[]:(directory||[]))
    .map((row)=>{try{return typeof row==='string'?JSON.parse(row):row}catch{return null}})
    .filter(Boolean);
  const businesses=members.filter((member)=>
    member.home_region_id===region.id &&
    clean(member.account_badge).toUpperCase()==='BUSINESS'
  );

  lastRegionId=region.id;
  lastLoadedAt=Date.now();
  render(region,validListings,businesses);
}

function schedule(delay=180,force=false){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>void refresh(force),delay);
}

window.addEventListener('ec:region-change',(event)=>{
  activeRegion=event.detail||null;
  requestVersion+=1;
  lastLoadedAt=0;
  schedule(150,true);
});
window.addEventListener('ec:navigate',()=>schedule(220,false));
window.addEventListener('focus',()=>schedule(100,false));

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(350,true),{once:true});
else schedule(350,true);
