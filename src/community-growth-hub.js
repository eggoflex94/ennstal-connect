import { supabase } from './supabaseClient';
import './community-growth-hub.css';

let timer=null;
let requestVersion=0;
const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('de-AT',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};
const nav=(page)=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
const REQUEST_LABELS={MITFAHREN:'Mitfahrgelegenheit',WANDERPARTNER:'Wanderpartner',REGIONALER_TIPP:'Regionaler Tipp',HILFE:'Hilfe gesucht',SUCHE:'Suche',BIETE:'Biete',EMPFEHLUNG:'Empfehlung'};
const LISTING_LABELS={OFFER:'Angebot',JOB:'Job',APPRENTICESHIP:'Lehrstelle',EVENT:'Unternehmens-Event'};

async function context(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return null;
  const [{data:profile},{data:regions}]=await Promise.all([
    supabase.from('profiles').select('id,home_region_id,account_badge,company_name,company_description,company_website,company_opening_hours,business_jobs_enabled').eq('id',user.id).maybeSingle(),
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
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-nav="home"><span class="ec-growth-tag">${esc(REQUEST_LABELS[request.category]||'Community')}</span><strong>${esc(request.title)}</strong><span>${esc(String(request.content||'').slice(0,120))}</span></button>`;
}
function businessCard(member){
  const name=member.company_name||member.nickname||[member.first_name,member.last_name].filter(Boolean).join(' ')||'Unternehmen';
  const detail=member.company_description||'Regionales Unternehmenskonto';
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-profile="${esc(member.id)}"><span class="ec-growth-tag">UNTERNEHMEN</span><strong>${esc(name)}</strong><span>${esc(detail)}</span></button>`;
}
function listingCard(listing){
  return `<button type="button" class="ec-growth-item ec-clickable" data-growth-profile="${esc(listing.owner_id)}"><span class="ec-growth-tag">${esc(LISTING_LABELS[listing.listing_type]||'Angebot')}</span><strong>${esc(listing.title)}</strong><span>${esc(String(listing.body||'').slice(0,120))}</span></button>`;
}
function discoverMember(member){
  const name=member.nickname||[member.first_name,member.last_name].filter(Boolean).join(' ')||'Mitglied';
  return `<button type="button" class="ec-discover-item" data-growth-profile="${esc(member.id)}"><img class="ec-discover-avatar" src="${esc(member.avatar_url||'/community-default-avatar.png')}" alt=""><span class="ec-discover-copy"><strong>${esc(name)}</strong><span>Neu in deiner Region</span></span></button>`;
}
function discoverGroup(group,count){
  return `<button type="button" class="ec-discover-item" data-growth-nav="community"><span class="ec-discover-copy"><strong>${esc(group.name)}</strong><span>${esc(group.description||'Community-Gruppe')}</span><span class="ec-discover-badge">${count} Mitglied${count===1?'':'er'}</span></span></button>`;
}
function section(title,page,items,empty){
  return `<article class="ec-growth-card"><div class="ec-growth-card-head"><h3>${esc(title)}</h3>${page?`<button type="button" data-growth-nav="${esc(page)}">Alle ansehen →</button>`:''}</div><div class="ec-growth-list">${items.length?items.join(''):`<p class="ec-growth-empty">${esc(empty)}</p>`}</div></article>`;
}

function wire(root){
  root.querySelectorAll('[data-growth-nav]').forEach((button)=>button.onclick=()=>nav(button.dataset.growthNav));
  root.querySelectorAll('[data-growth-profile]').forEach((button)=>button.onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:button.dataset.growthProfile}})));
}

function enhanceRequestForm(){
  const select=document.querySelector('.community-request-board select[name="category"]');
  if(!select)return;
  const extras=[['HILFE','🆘 Hilfe gesucht'],['SUCHE','🔎 Suche'],['BIETE','🤲 Biete'],['EMPFEHLUNG','💡 Empfehlung']];
  for(const [value,label] of extras){
    if(select.querySelector(`option[value="${value}"]`))continue;
    const option=document.createElement('option');
    option.value=value;
    option.textContent=label;
    select.appendChild(option);
  }
  const title=select.closest('.community-request-board')?.querySelector('h2');
  if(title)title.textContent='Hilfe, Suche, Biete & regionale Tipps';
}

async function renderHome(){
  const home=document.querySelector('.home-page');
  if(!home)return;
  const version=++requestVersion;
  const ctx=await context();
  if(!ctx?.region||version!==requestVersion)return;
  const now=new Date().toISOString();
  const [{data:events},{data:requests},{data:businesses},{data:listings},{data:newMembers},{data:groups},{data:memberships},{data:friendships}]=await Promise.all([
    supabase.from('community_events').select('id,title,event_at,location,status,region_id').eq('region_id',ctx.region.id).gte('event_at',now).order('event_at',{ascending:true}).limit(6),
    supabase.from('community_requests').select('id,title,content,category,region_id,status,created_at').eq('region_id',ctx.region.id).order('created_at',{ascending:false}).limit(8),
    supabase.from('profiles').select('id,nickname,first_name,last_name,company_name,company_description,account_badge,home_region_id').eq('account_badge','BUSINESS').limit(16),
    supabase.from('business_listings').select('id,owner_id,region_id,listing_type,title,body,link_url,valid_until,is_active,created_at').eq('is_active',true).or(`region_id.eq.${ctx.region.id},region_id.is.null`).order('created_at',{ascending:false}).limit(10),
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,created_at,home_region_id,account_status,is_test_account').eq('home_region_id',ctx.region.id).eq('account_status','ACTIVE').eq('is_test_account',false).neq('id',ctx.user.id).order('created_at',{ascending:false}).limit(4),
    supabase.from('community_groups').select('id,name,description,region_id,created_at,is_featured').or(`region_id.eq.${ctx.region.id},region_id.is.null`).order('is_featured',{ascending:false}).order('created_at',{ascending:false}).limit(5),
    supabase.from('community_group_members').select('group_id,user_id'),
    supabase.from('friendships').select('requester_id,receiver_id,status').eq('status','ACCEPTED')
  ]);
  if(version!==requestVersion)return;
  const activeEvents=(events||[]).filter((event)=>String(event.status||'').toUpperCase()!=='CANCELLED').slice(0,3);
  const activeRequests=(requests||[]).filter((request)=>!request.status||!['CLOSED','DONE','ARCHIVED'].includes(String(request.status).toUpperCase())).slice(0,3);
  const regionalBusinesses=(businesses||[]).filter((member)=>!member.home_region_id||member.home_region_id===ctx.region.id).slice(0,3);
  const currentListings=(listings||[]).filter((item)=>!item.valid_until||new Date(item.valid_until).getTime()>=Date.now()).slice(0,3);
  const groupCounts=new Map();
  (memberships||[]).forEach((row)=>groupCounts.set(row.group_id,(groupCounts.get(row.group_id)||0)+1));
  const friendCount=(friendships||[]).filter((row)=>row.requester_id===ctx.user.id||row.receiver_id===ctx.user.id).length;

  home.querySelector(':scope > .ec-growth-hub')?.remove();
  home.querySelector(':scope > .ec-discover')?.remove();

  const hub=document.createElement('section');
  hub.className='ec-growth-hub';
  hub.innerHTML=`<div class="ec-growth-head"><div><small>DEINE REGION AUF EINEN BLICK</small><h2>Heute & demnächst in ${esc(ctx.region.name)}</h2></div><span class="ec-growth-region">${esc(ctx.region.name)}</span></div><div class="ec-growth-grid">${section('Heute & demnächst','events',activeEvents.map(eventCard),'Derzeit keine kommenden Termine.')}${section('Gesucht & angeboten','home',activeRequests.map(requestCard),'Noch keine offenen Community-Aufrufe.')}${section('Regionale Unternehmen','community',regionalBusinesses.map(businessCard),'Noch keine Unternehmenskonten in dieser Region.')}${section('Angebote, Jobs & Lehrstellen','community',currentListings.map(listingCard),'Noch keine Unternehmensangebote veröffentlicht.')}</div>`;

  const discover=document.createElement('section');
  discover.className='ec-discover';
  discover.innerHTML=`<div class="ec-discover-head"><div><small>ENTDECKEN</small><h2>Mehr aus ${esc(ctx.region.name)}</h2></div><button type="button" data-growth-nav="community">Community entdecken →</button></div><div class="ec-discover-grid"><article class="ec-discover-card"><h3>Neu in deiner Region</h3><div class="ec-discover-list">${(newMembers||[]).length?(newMembers||[]).map(discoverMember).join(''):'<p class="ec-discover-empty">Gerade keine neuen Mitglieder.</p>'}</div></article><article class="ec-discover-card"><h3>Gruppen entdecken</h3><div class="ec-discover-list">${(groups||[]).length?(groups||[]).slice(0,3).map((group)=>discoverGroup(group,groupCounts.get(group.id)||0)).join(''):'<p class="ec-discover-empty">Noch keine Gruppen in dieser Region.</p>'}</div></article><article class="ec-discover-card"><h3>Deine Community</h3><div class="ec-discover-stat-grid"><div class="ec-discover-stat"><strong>${friendCount}</strong><span>Freunde</span></div><div class="ec-discover-stat"><strong>${(groups||[]).length}</strong><span>Gruppen</span></div><div class="ec-discover-stat"><strong>${(newMembers||[]).length}</strong><span>Neue Mitglieder</span></div></div></article></div>`;

  const heading=home.querySelector(':scope > .page-heading');
  if(heading){heading.insertAdjacentElement('afterend',hub);hub.insertAdjacentElement('afterend',discover);}else{home.prepend(discover);home.prepend(hub);}
  wire(hub);
  wire(discover);
  enhanceRequestForm();
}

function businessPanelMarkup(member,listings=[]){
  const title=member.company_name||member.nickname||'Unternehmenskonto';
  const desc=member.company_description||'Regionales Unternehmen oder Verein auf Ennstal Connect.';
  const website=String(member.company_website||'').trim();
  const hours=String(member.company_opening_hours||'').trim();
  const meta=[hours?`<span>Öffnungszeiten: ${esc(hours)}</span>`:'',website?`<a href="${esc(website)}" target="_blank" rel="noreferrer">Webseite öffnen ↗</a>`:'','<span>Verifiziertes Unternehmenskonto</span>',member.home_region_id?'<span>Regional sichtbar</span>':''].filter(Boolean).join('');
  const items=listings.length?`<div class="ec-business-listings"><h3>Aktuelle Angebote & Stellen</h3>${listings.map((item)=>`<article><span>${esc(LISTING_LABELS[item.listing_type]||'Angebot')}</span><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p>${item.link_url?`<a href="${esc(item.link_url)}" target="_blank" rel="noreferrer">Mehr erfahren ↗</a>`:''}</article>`).join('')}</div>`:'';
  return `<header><div><span class="ec-business-kicker">REGIONALER PARTNER</span><h2>${esc(title)}</h2></div><span aria-label="Unternehmenskonto">★</span></header><p>${esc(desc)}</p><div class="ec-business-meta">${meta}</div>${items}`;
}

async function renderBusinessProfile(){
  const page=document.querySelector('.member-profile-page[data-profile-id]');
  if(!page||page.querySelector(':scope > .ec-business-profile-panel'))return;
  const id=page.dataset.profileId;
  if(!id)return;
  const [{data:member},{data:listings}]=await Promise.all([
    supabase.from('profiles').select('id,nickname,company_name,company_description,company_website,company_opening_hours,account_badge,home_region_id').eq('id',id).maybeSingle(),
    supabase.from('business_listings').select('id,owner_id,listing_type,title,body,link_url,valid_until,is_active,created_at').eq('owner_id',id).eq('is_active',true).order('created_at',{ascending:false})
  ]);
  if(!member||String(member.account_badge||'').toUpperCase()!=='BUSINESS')return;
  const active=(listings||[]).filter((item)=>!item.valid_until||new Date(item.valid_until).getTime()>=Date.now());
  const panel=document.createElement('section');
  panel.className='ec-business-profile-panel';
  panel.innerHTML=businessPanelMarkup(member,active);
  const card=page.querySelector(':scope > .ec-mp-card');
  const hero=page.querySelector(':scope > .member-profile-hero');
  const anchor=card||hero;
  if(anchor)anchor.insertAdjacentElement('afterend',panel);else page.prepend(panel);
}

function notice(text){
  const old=document.querySelector('.ec-business-growth-toast');
  old?.remove();
  const node=document.createElement('div');
  node.className='ec-business-growth-toast';
  node.textContent=text;
  document.body.appendChild(node);
  setTimeout(()=>node.remove(),3500);
}

async function renderOwnBusinessTools(){
  const own=document.querySelector('.my-profile-card');
  if(!own||document.querySelector('.ec-own-business-tools'))return;
  const ctx=await context();
  if(!ctx?.profile||String(ctx.profile.account_badge||'').toUpperCase()!=='BUSINESS')return;
  const [{data:listings},{data:ownEvents}]=await Promise.all([
    supabase.from('business_listings').select('*').eq('owner_id',ctx.user.id).order('created_at',{ascending:false}),
    supabase.from('community_events').select('id,title,event_at,location,status,region_id,created_by').eq('created_by',ctx.user.id).order('event_at',{ascending:false}).limit(12)
  ]);
  const shell=document.createElement('section');
  shell.className='panel ec-own-business-tools';
  const jobsEnabled=ctx.profile.business_jobs_enabled===true;
  const jobStatus=jobsEnabled?'<p class="ec-business-job-status is-enabled">Stellenanzeigen sind für dein Unternehmenskonto freigeschaltet.</p>':'<p class="ec-business-job-status is-locked">Jobs und Lehrstellen müssen zuerst vom Ennstal-Connect-Team freigeschaltet werden. Angebote und Unternehmens-Events kannst du weiterhin veröffentlichen.</p>';
  shell.innerHTML=`<span class="eyebrow">UNTERNEHMENSKONTO</span><h2>Unternehmensprofil & Veröffentlichungen</h2><p>Pflege Öffnungszeiten und Webseite und veröffentliche regionale Inhalte.</p>${jobStatus}<form class="ec-business-profile-form"><label>Beschreibung<textarea name="description" rows="4">${esc(ctx.profile.company_description||'')}</textarea></label><label>Webseite<input name="website" type="url" placeholder="https://…" value="${esc(ctx.profile.company_website||'')}"></label><label>Öffnungszeiten<input name="opening_hours" placeholder="z. B. Mo–Fr 08:00–17:00" value="${esc(ctx.profile.company_opening_hours||'')}"></label><button class="primary-button">Unternehmensprofil speichern</button></form><hr><form class="ec-business-event-form"><h3>Veranstaltung erstellen</h3><p>Deine Veranstaltung wird in deiner Heimatregion im Community-Kalender veröffentlicht.</p><input name="title" placeholder="Titel der Veranstaltung" required minlength="3"><input name="event_at" type="datetime-local" required><input name="location" placeholder="Ort (optional)"><textarea name="description" placeholder="Beschreibung"></textarea><button class="primary-button">Veranstaltung veröffentlichen</button></form><div class="ec-own-business-events"><h3>Deine Veranstaltungen</h3>${(ownEvents||[]).length?(ownEvents||[]).map((item)=>`<article><span>${esc(fmt(item.event_at))}</span><strong>${esc(item.title)}</strong><p>${esc(item.location||'')}</p></article>`).join(''):'<p>Noch keine Veranstaltungen veröffentlicht.</p>'}</div><hr><form class="ec-business-listing-form"><h3>Neuen Eintrag veröffentlichen</h3><select name="listing_type"><option value="OFFER">Angebot</option><option value="JOB" ${jobsEnabled?'':'disabled'}>Job${jobsEnabled?'':' – Freischaltung erforderlich'}</option><option value="APPRENTICESHIP" ${jobsEnabled?'':'disabled'}>Lehrstelle${jobsEnabled?'':' – Freischaltung erforderlich'}</option><option value="EVENT">Unternehmens-Event</option></select><input name="title" placeholder="Titel" required minlength="3"><textarea name="body" placeholder="Beschreibung" required minlength="3"></textarea><input name="link_url" type="url" placeholder="Link (optional)"><input name="valid_until" type="datetime-local"><button class="primary-button">Veröffentlichen</button></form><div class="ec-own-business-listings"><h3>Deine Einträge</h3>${(listings||[]).length?(listings||[]).map((item)=>`<article><span>${esc(LISTING_LABELS[item.listing_type]||item.listing_type)}</span><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><button type="button" data-delete-business-listing="${esc(item.id)}">Löschen</button></article>`).join(''):'<p>Noch keine Einträge veröffentlicht.</p>'}</div>`;
  const layout=document.querySelector('.my-area-layout');
  if(layout)layout.insertAdjacentElement('afterend',shell);else own.insertAdjacentElement('afterend',shell);

  shell.querySelector('.ec-business-profile-form').onsubmit=async(event)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const {error}=await supabase.rpc('update_my_business_profile',{p_description:String(form.get('description')||''),p_website:String(form.get('website')||''),p_opening_hours:String(form.get('opening_hours')||'')});
    if(error)return notice(error.message);
    notice('Unternehmensprofil gespeichert.');
    shell.remove();
    schedule(20);
  };
  shell.querySelector('.ec-business-event-form').onsubmit=async(event)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const title=String(form.get('title')||'').trim();
    const eventAt=String(form.get('event_at')||'');
    const location=String(form.get('location')||'').trim()||null;
    const description=String(form.get('description')||'').trim();
    const when=new Date(eventAt);
    if(title.length<3||Number.isNaN(when.getTime()))return notice('Bitte Titel sowie Datum und Uhrzeit prüfen.');
    if(when.getTime()<=Date.now())return notice('Die Veranstaltung muss in der Zukunft liegen.');
    const regionId=ctx.profile.home_region_id||ctx.region?.id||null;
    if(!regionId)return notice('Für dein Unternehmenskonto ist keine Heimatregion hinterlegt.');
    const {error}=await supabase.from('community_events').insert({
      title,
      description,
      event_at:when.toISOString(),
      location,
      created_by:ctx.user.id,
      region_id:regionId,
      status:'ACTIVE'
    });
    if(error)return notice(error.message);
    notice('Veranstaltung veröffentlicht.');
    shell.remove();
    schedule(20);
  };

  shell.querySelector('.ec-business-listing-form').onsubmit=async(event)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const valid=String(form.get('valid_until')||'');
    const listingType=String(form.get('listing_type')||'OFFER');
    if(['JOB','APPRENTICESHIP'].includes(listingType)&&ctx.profile.business_jobs_enabled!==true)return notice('Dein Unternehmenskonto ist für Stellenanzeigen noch nicht freigeschaltet.');
    const payload={owner_id:ctx.user.id,region_id:ctx.region?.id||ctx.profile.home_region_id||null,listing_type:listingType,title:String(form.get('title')||'').trim(),body:String(form.get('body')||'').trim(),link_url:String(form.get('link_url')||'').trim()||null,valid_until:valid?new Date(valid).toISOString():null,is_active:true};
    const {error}=await supabase.from('business_listings').insert(payload);
    if(error)return notice(error.message);
    notice('Eintrag veröffentlicht.');
    shell.remove();
    schedule(20);
  };
  shell.querySelectorAll('[data-delete-business-listing]').forEach((button)=>button.onclick=async()=>{
    if(!confirm('Diesen Eintrag wirklich löschen?'))return;
    const {error}=await supabase.from('business_listings').delete().eq('id',button.dataset.deleteBusinessListing).eq('owner_id',ctx.user.id);
    if(error)return notice(error.message);
    button.closest('article')?.remove();
    notice('Eintrag gelöscht.');
  });
}

async function apply(){
  if(!supabase)return;
  enhanceRequestForm();
  await Promise.allSettled([renderHome(),renderBusinessProfile(),renderOwnBusinessTools()]);
}
function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void apply(),delay)}
window.addEventListener('ec:navigate',()=>schedule(100));
window.addEventListener('ec:region-change',()=>schedule(120));
window.addEventListener('ec:business-account-changed',()=>schedule(60));
window.addEventListener('ec:business-jobs-changed',()=>schedule(60));
window.addEventListener('focus',()=>schedule(80));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(80)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});else schedule(20);
