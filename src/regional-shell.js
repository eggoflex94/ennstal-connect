import { supabase } from './supabaseClient';

const TOP_LINKS=[['⌂','Startseite','home'],['♟','Mitglieder','members'],['▤','Forum','forum'],['●','Gruppen','groups'],['▣','Events','events'],['▥','Community','community']];
const DOCK_LINKS=[
  ['Mein Profil','profile'],
  ['Nachrichten','messages'],
  ['Freunde','friends'],
  ['Anfragen','requests'],
  ['Blockiert','blocked'],
  ['Einstellungen','profile'],
  ['Hilfe','help']
];
const DOCK_ICONS={
  'Benachrichtigungen':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 6.5-3 7-3 9h18c0-2-3-2.5-3-9Z"/><path d="M10 20h4"/></svg>',
  'Mein Profil':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.4-6 8-6s7.2 1.8 8 6"/></svg>',
  'Nachrichten':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>',
  'Freunde':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.7-3.6 2.8-5 6-5 3.3 0 5.4 1.4 6 5M14.5 15.5c3.4-.8 5.7.6 6.5 4.5"/></svg>',
  'Anfragen':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-3.6 2.8-5 6-5 2.1 0 3.8.6 4.8 1.9M18 8v6M15 11h6"/></svg>',
  'Blockiert':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/></svg>',
  'Einstellungen':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
  'Hilfe':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.2 1.4-2.2 3M12 17h.01"/></svg>',
  'Heimatregion ändern':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>'
};
const FALLBACK_REGIONS=[{slug:'ennstal',name:'Ennstal'},{slug:'leoben-bruck-muerzzuschlag',name:'Leoben – Bruck – Mürzzuschlag'},{slug:'ueberregional',name:'Überregional'}];
let regions=FALLBACK_REGIONS,activeRegion=null,regionalAssignments=[],currentProfile=null,profiles=[],showAllMembers=false;

const pageNames={home:['Startseite'],members:['Mitglieder'],forum:['Forum'],groups:['Gruppen'],events:['Events','Veranstaltungen'],photos:['Fotos','Eventfotos'],news:['Neuigkeiten'],community:['Community'],ads:['Community'],profile:['Mein Profil','Profil gestalten'],messages:['Nachrichten'],friends:['Freunde'],requests:['Anfragen'],blocked:['Blockiert'],help:['Hilfe'],admin:['Admin-Zentrale','Admin Zentrale'],adminTools:['Admin Tools'],legal:['Rechtliche Beweissicherung']};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionName=id=>regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const assignmentsFor=p=>regionalAssignments.filter(a=>a.user_id===p?.id&&a.active);
function roleLabel(p,context=true){const base=String(p?.role||'MEMBER').toUpperCase(),assigned=assignmentsFor(p),here=activeRegion&&p?.home_region_id===activeRegion.id&&assigned.some(a=>a.region_id===activeRegion.id);if(base==='HEAD_ADMIN')return'Hauptadmin · Betreiber';if(base==='ADMIN')return'Global Admin';if(context&&here)return`Regional Admin ${activeRegion.name}`;if(assigned.length)return`Regional Admin ${assigned.map(a=>regionName(a.region_id)).join(', ')}`;if(base==='MUNICIPALITY')return'Gemeinde';if(base==='SUPPORTER')return'Supporter';if(p?.account_badge==='BUSINESS')return'Unternehmenskonto';return'Mitglied'}
function clickPage(page){
  const special=page==='adminTools'?document.querySelector('.ec-admin-workspace-entry'):page==='legal'?document.querySelector('.ec-legal-entry'):null;
  if(special){special.click();return true}
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page,source:'regional-shell'}}));
  return true;
}

function syncRegionUI(){document.querySelectorAll('.ec-active-region-name').forEach(el=>el.textContent=activeRegion?.name||'Region');document.querySelector('.ec-region-status')?.classList.toggle('is-home',activeRegion?.id===currentProfile?.home_region_id);const home=document.querySelector('.ec-dock-home-region');if(home)home.textContent=regionName(currentProfile?.home_region_id)}
function profileForCard(card){const id=card.dataset.memberId;if(id){const hit=profiles.find(p=>p.id===id);if(hit)return hit}const name=(card.querySelector('.member-nickname')?.textContent||'').trim();return profiles.find(p=>p.nickname===name)||null}
function themeFor(p){const base=String(p?.role||'MEMBER').toUpperCase(),assigned=assignmentsFor(p),here=activeRegion&&p?.home_region_id===activeRegion.id&&assigned.some(a=>a.region_id===activeRegion.id);if(base==='HEAD_ADMIN'||base==='ADMIN'||here)return'admin';if(base==='MUNICIPALITY')return'municipality';if(base==='SUPPORTER'||assigned.length)return'supporter';if(p?.account_badge==='BUSINESS')return'business';return'member'}
function applyRegionalDirectory(){if(!activeRegion||!profiles.length)return;document.documentElement.dataset.ecRegion=activeRegion.slug;const searching=Boolean(document.querySelector('.search-input')?.value.trim());document.querySelectorAll('.member-card').forEach(card=>{const p=profileForCard(card);if(!p)return;const theme=themeFor(p),label=roleLabel(p);card.dataset.memberId=p.id;card.dataset.homeRegionId=p.home_region_id||'';card.dataset.roleTheme=theme;card.dataset.effectiveRole=label;card.classList.remove('role-theme-admin','role-theme-municipality','role-theme-supporter','role-theme-business','role-theme-member');card.classList.add(`role-theme-${theme}`);if(card.closest('.native-members-directory'))card.hidden=false;const badge=card.querySelector('.ec-card-badge-role');if(badge){badge.title=label;badge.setAttribute('aria-label',label)}const star=card.querySelector('.ec-card-badge-role-img');if(star)star.src=theme==='admin'?'/role-star-red.svg':theme==='municipality'?'/role-star-green.svg':theme==='supporter'?'/supporter-star.svg':theme==='business'?'/role-star-blue.svg':'/role-star-member.svg'});const grid=document.querySelector('.native-members-directory .member-grid,.native-members-directory .members-grid');if(grid){const bar=grid.previousElementSibling;if(bar?.classList.contains('ec-region-context'))bar.remove()}}

async function safe(query){try{const {data}=await query;return data||[]}catch{return[]}}
async function safeCount(query){try{const {count}=await query;return Number(count||0)}catch{return 0}}

const DOCK_COUNTS_TTL=15_000;
const DOCK_DETAIL_TTL=30_000;
let dockCountsCache={userId:'',at:0,data:null};
let dockCountsInFlight=null;
const dockDetailCache=new Map();
const dockDetailInFlight=new Map();

function dockDetailKey(type){return `${currentProfile?.id||''}:${type}:${type==='news'?(activeRegion?.id||''):''}`}
function invalidateDockDetails(type=''){if(type){for(const key of dockDetailCache.keys())if(key.includes(`:${type}:`))dockDetailCache.delete(key);return}dockDetailCache.clear()}

async function loadDockCounts(){
  if(!currentProfile?.id)return{notifications:0,visits:0,updates:0,actions:0};
  const [notifications,visits,updates,actions]=await Promise.all([
    safeCount(supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',currentProfile.id).is('read_at',null)),
    safeCount(supabase.from('profile_visits').select('id',{count:'exact',head:true}).eq('profile_id',currentProfile.id)),
    safeCount(supabase.from('public_profile_updates').select('id',{count:'exact',head:true})),
    safeCount(supabase.from('profile_activity').select('id',{count:'exact',head:true}))
  ]);
  return{notifications,visits,updates,actions};
}

function renderDockCounts(d){const set=(sel,n)=>{const el=document.querySelector(sel);if(el){el.textContent=String(n||0);el.hidden=false}};set('.ec-dock-notification-badge',d.notifications);set('.ec-dock-visits-count',d.visits);set('.ec-dock-updates-count',d.updates);set('.ec-dock-actions-count',d.actions)}

async function syncDockCounts({force=false}={}){
  if(!currentProfile?.id)return;
  const now=Date.now();
  if(!force&&dockCountsCache.userId===currentProfile.id&&dockCountsCache.data&&now-dockCountsCache.at<DOCK_COUNTS_TTL){renderDockCounts(dockCountsCache.data);return dockCountsCache.data}
  if(dockCountsInFlight)return dockCountsInFlight;
  dockCountsInFlight=loadDockCounts().then(data=>{dockCountsCache={userId:currentProfile.id,at:Date.now(),data};renderDockCounts(data);return data}).finally(()=>{dockCountsInFlight=null});
  return dockCountsInFlight;
}

async function loadDockDetail(type){
  if(!currentProfile?.id)return[];
  if(type==='visits')return safe(supabase.from('profile_visits').select('*').eq('profile_id',currentProfile.id).order('visited_at',{ascending:false}).limit(10));
  if(type==='updates')return safe(supabase.from('public_profile_updates').select('*').order('created_at',{ascending:false}).limit(10));
  if(type==='actions')return safe(supabase.from('profile_activity').select('*').order('created_at',{ascending:false}).limit(10));
  if(type==='news'&&activeRegion?.id)return safe(supabase.from('news').select('*').eq('region_id',activeRegion.id).order('created_at',{ascending:false}).limit(8));
  return[];
}

function personName(row){const id=row?.visitor_id||row?.actor_id||row?.user_id||row?.profile_id;return profiles.find(p=>p.id===id)?.nickname||row?.nickname||row?.title||row?.action||'Community'}
function roleStar(person){const theme=themeFor(person||{});return theme==='admin'?'/role-star-red.svg':theme==='municipality'?'/role-star-green.svg':theme==='supporter'?'/supporter-star.svg':theme==='business'?'/role-star-blue.svg':'/role-star-member.svg'}
function renderDetail(rows,type){if(!rows.length)return'<div class="ec-dock-empty">Noch keine Einträge.</div>';return rows.map(row=>{const profileId=row?.visitor_id||row?.actor_id||row?.profile_id||row?.user_id||'',person=profiles.find(p=>p.id===profileId),title=type==='news'?(row.title||'Neuigkeit'):personName(row),description=type==='updates'||type==='actions'?row.activity_type||row.action||'Aktualisierung':type==='visits'?'hat dein Profil besucht':'',date=row.visited_at||row.created_at,stamp=date?new Date(date).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit'}):'',avatar=person?.avatar_url||row.avatar_url||'/community-default-avatar-fast.svg';return`<button type="button" class="ec-dock-detail-row" data-detail-target="${type}" data-profile-id="${esc(profileId)}"><img src="${esc(avatar)}" alt=""><span><strong><img class="ec-inline-role-star" src="${roleStar(person||row)}" alt="${esc(roleLabel(person||row))}">${esc(title)}</strong>${description?`<small>${esc(description)}</small>`:''}</span><time>${esc(stamp)}</time></button>`}).join('')}
function bindDockDetailRows(panel){panel.querySelectorAll('.ec-dock-detail-row').forEach(row=>row.onclick=()=>{const profileId=row.dataset.profileId;if(profileId&&profileId!==currentProfile.id)window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId}}));else clickPage(row.dataset.detailTarget==='visits'?'profile':'news');document.body.classList.remove('ec-dock-open')})}

async function syncDockDetail(type,{force=false}={}){
  const panel=document.querySelector(`.ec-dock-detail[data-panel="${type}"]`);
  if(!panel||!currentProfile?.id)return;
  const key=dockDetailKey(type),cached=dockDetailCache.get(key),now=Date.now();
  if(!force&&cached&&now-cached.at<DOCK_DETAIL_TTL){panel.innerHTML=renderDetail(cached.rows,type);bindDockDetailRows(panel);return cached.rows}
  if(dockDetailInFlight.has(key))return dockDetailInFlight.get(key);
  panel.innerHTML='<div class="ec-dock-empty">Einträge werden geladen …</div>';
  const pending=loadDockDetail(type).then(rows=>{dockDetailCache.set(key,{at:Date.now(),rows});panel.innerHTML=renderDetail(rows,type);bindDockDetailRows(panel);return rows}).catch(()=>{panel.innerHTML='<div class="ec-dock-empty">Konnte gerade nicht geladen werden.</div>';return[]}).finally(()=>dockDetailInFlight.delete(key));
  dockDetailInFlight.set(key,pending);
  return pending;
}

function toggleDockDetail(key){
  const button=document.querySelector(`[data-ec-detail="${key}"]`);
  const panel=document.querySelector(`.ec-dock-detail[data-panel="${key}"]`);
  if(!button||!panel)return;
  const opening=panel.hidden;
  document.querySelectorAll('.ec-dock-detail').forEach(item=>item.hidden=true);
  document.querySelectorAll('.ec-regional-shell [data-ec-detail]').forEach(item=>item.setAttribute('aria-expanded','false'));
  panel.hidden=!opening;
  button.setAttribute('aria-expanded',opening?'true':'false');
  if(opening)void syncDockDetail(key);
}

async function changeHomeRegion(){if(!currentProfile)return;const currentSlug=regions.find(r=>r.id===currentProfile.home_region_id)?.slug||regions[0]?.slug;const options=regions.map(r=>`${r.slug} = ${r.name}`).join('\n');const slug=prompt(`Heimatregion ändern\nAktuell: ${regionName(currentProfile.home_region_id)}\n\nRegionscode eingeben:\n${options}`,currentSlug);if(!slug)return;const next=regions.find(r=>r.slug===slug.trim());if(!next){alert('Region nicht gefunden.');return}if(!confirm(`Heimatregion auf ${next.name} ändern? Danach wirst du standardmäßig dort in der Mitgliederliste angezeigt.`))return;const {data,error}=await supabase.rpc('ec_change_home_region',{p_region_slug:next.slug});if(error){alert(`Region konnte nicht geändert werden: ${error.message}`);return}currentProfile.home_region_id=data||next.id;activeRegion=next;localStorage.setItem('ec-active-region',next.slug);invalidateDockDetails('news');renderRegionOptions();syncRegionUI();applyRegionalDirectory();window.dispatchEvent(new CustomEvent('ec:region-change',{detail:next}))}

async function loadRegionalContext(){if(!supabase)return;try{const {data:{session}}=await supabase.auth.getSession();const user=session?.user;if(!user)return;const [{data:rs},{data:assignments},{data:ps}]=await Promise.all([supabase.from('regions').select('id,slug,name,short_name,sort_order').eq('is_active',true).order('sort_order'),supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),supabase.from('profiles').select('id,nickname,role,home_region_id,account_badge,avatar_url').eq('account_status','ACTIVE')]);if(rs?.length)regions=rs;regionalAssignments=assignments||[];profiles=ps||[];currentProfile=profiles.find(p=>p.id===user.id)||null;const saved=localStorage.getItem('ec-active-region');activeRegion=regions.find(r=>r.slug===saved)||regions.find(r=>r.id===currentProfile?.home_region_id)||regions[0];if(activeRegion){localStorage.setItem('ec-active-region',activeRegion.slug);window.dispatchEvent(new CustomEvent('ec:region-change',{detail:activeRegion}))}renderRegionOptions();renderIdentity();syncRegionUI();renderAdminDock();applyRegionalDirectory();void syncDockCounts()}catch(error){console.warn('Regionen konnten nicht vollständig geladen werden:',error)}}
function renderRegionOptions(){const picker=document.querySelector('.ec-region-picker select');if(!picker)return;picker.innerHTML=regions.map(r=>`<option value="${r.slug}">${esc(r.name)}</option>`).join('');picker.value=activeRegion?.slug||regions[0]?.slug||'ennstal'}
function renderIdentity(){const box=document.querySelector('.ec-dock-identity');if(!box||!currentProfile)return;const heading=document.querySelector('.ec-dock-head strong');if(heading){heading.textContent=roleLabel(currentProfile,false)+' · '+(currentProfile.nickname||'Mitglied');let home=heading.parentElement.querySelector('.ec-dock-home');if(!home){home=document.createElement('small');home.className='ec-dock-home';heading.after(home)}home.textContent='Heimatregion: '+regionName(currentProfile.home_region_id)}box.innerHTML=`<span class="ec-dock-role-star">★</span><div><strong>${esc(currentProfile.nickname||'Mitglied')}</strong><small>${esc(roleLabel(currentProfile,false))}</small><em>Heimatregion: <b class="ec-dock-home-region">${esc(regionName(currentProfile.home_region_id))}</b></em></div>`}
function renderAdminDock(){const slot=document.querySelector('.ec-dock-admin-slot');if(!slot)return;const role=String(currentProfile?.role||'').toUpperCase();if(role==='HEAD_ADMIN')slot.innerHTML=`<div class="ec-dock-divider"></div><div class="ec-dock-section-label">ADMINISTRATION</div><button type="button" data-ec-page="admin"><b>⚙</b><span>Admin-Zentrale</span></button><button type="button" data-ec-page="adminTools"><b>⌘</b><span>Admin Tools</span></button><button type="button" data-ec-page="legal"><b>⚖</b><span>Beweissicherung</span></button>`;else if(role==='ADMIN')slot.innerHTML=`<div class="ec-dock-divider"></div><div class="ec-dock-section-label">ADMINISTRATION</div><button type="button" data-ec-page="admin"><b>⚙</b><span>Admin-Zentrale</span></button>`;else slot.innerHTML='';slot.querySelectorAll('[data-ec-page]').forEach(bindDockButton)}
function bindDockButton(button){button.onclick=()=>{if(button.dataset.ecDetail){toggleDockDetail(button.dataset.ecDetail);return}if(button.dataset.ecHomeRegion){changeHomeRegion();return}if(button.dataset.ecPage==='notifications'){window.dispatchEvent(new CustomEvent('ec:open-notifications'));return}clickPage(button.dataset.ecPage);document.body.classList.remove('ec-dock-open');requestAnimationFrame(applyRegionalDirectory)}}
async function logout(){const button=document.querySelector('.ec-logout');if(button)button.disabled=true;try{const {error}=await supabase.auth.signOut();if(error)throw error;localStorage.removeItem('ec-active-region');sessionStorage.clear();location.replace('/')}catch(error){if(button)button.disabled=false;alert(`Abmelden fehlgeschlagen: ${error.message||error}`)}}

function ensureShell(){if(!document.querySelector('.modern-main')){document.querySelector('.ec-regional-shell')?.remove();document.body.classList.remove('ec-regional-ui','ec-dock-open');return;}if(document.querySelector('.ec-regional-shell')){applyRegionalDirectory();return}const shell=document.createElement('div');shell.className='ec-regional-shell';shell.innerHTML=`<header class="ec-brand-masthead"><div class="ec-brand-logo" aria-label="Ennstal Connect"><img class="ec-brand-image" src="/ennstal-connect-wordmark.svg" width="370" height="70" alt="Ennstal Connect – Regional. Echt. Gemeinsam."/></div><div class="ec-brand-claim">Unsere Region.<br><b>Unsere Menschen.</b></div><div class="ec-region-status"><span>Du bist in</span><strong class="ec-active-region-name">Region</strong></div></header><nav class="ec-top-nav" aria-label="Hauptnavigation">${TOP_LINKS.map(([i,l,p])=>`<button type="button" data-ec-page="${p}" aria-label="${l}" title="${l}"><b aria-hidden="true">${i}</b><span>${l}</span></button>`).join('')}<label class="ec-region-picker"><b>⌖</b><select aria-label="Region"></select></label><button class="ec-dock-toggle" type="button" aria-label="Menü öffnen">☰</button></nav><aside class="ec-right-dock ec-compact-personal-dock" aria-label="Persönliche Funktionen"><div class="ec-dock-head"><span>MEIN BEREICH</span><strong>Profil wird geladen …</strong></div><div class="ec-dock-identity"></div><button class="ec-dock-close" type="button" aria-label="Menü schließen">×</button><div class="ec-compact-menu-grid" aria-label="Persönliche Funktionen"><button type="button" class="ec-compact-menu-item" data-ec-page="notifications" data-ec-compact-label="Benachrichtigungen" title="Benachrichtigungen" aria-label="Benachrichtigungen"><span class="ec-compact-menu-icon">${DOCK_ICONS['Benachrichtigungen']}</span><span class="ec-compact-menu-label">Benachrichtigungen</span><em class="ec-dock-notification-badge">0</em></button>${DOCK_LINKS.map(([label,page])=>`<button type="button" class="ec-compact-menu-item" data-ec-page="${page}" data-ec-compact-label="${label}" title="${label}" aria-label="${label}"><span class="ec-compact-menu-icon">${DOCK_ICONS[label]}</span><span class="ec-compact-menu-label">${label}</span></button>`).join('')}<button type="button" class="ec-compact-menu-item" data-ec-home-region="1" data-ec-compact-label="Heimatregion ändern" title="Heimatregion ändern" aria-label="Heimatregion ändern"><span class="ec-compact-menu-icon">${DOCK_ICONS['Heimatregion ändern']}</span><span class="ec-compact-menu-label">Heimatregion ändern</span></button></div><div class="ec-dock-divider"></div><div class="ec-dock-section-label">COMMUNITY</div><button type="button" data-ec-detail="visits" aria-expanded="false" aria-controls="ec-detail-visits"><b>◉</b><span>Profilbesuche</span><em class="ec-dock-visits-count">0</em></button><div class="ec-dock-detail" data-panel="visits" id="ec-detail-visits" role="region" aria-live="polite" hidden><div class="ec-dock-empty">Beim Öffnen laden …</div></div><button type="button" data-ec-detail="updates" aria-expanded="false" aria-controls="ec-detail-updates"><b>▦</b><span>Profil-Aktualisierungen</span><em class="ec-dock-updates-count">0</em></button><div class="ec-dock-detail" data-panel="updates" id="ec-detail-updates" role="region" aria-live="polite" hidden><div class="ec-dock-empty">Beim Öffnen laden …</div></div><button type="button" data-ec-detail="actions" aria-expanded="false" aria-controls="ec-detail-actions"><b>↗</b><span>Community-Aktionen</span><em class="ec-dock-actions-count">0</em></button><div class="ec-dock-detail" data-panel="actions" id="ec-detail-actions" role="region" aria-live="polite" hidden><div class="ec-dock-empty">Beim Öffnen laden …</div></div><button type="button" data-ec-detail="news" aria-expanded="false" aria-controls="ec-detail-news"><b>▤</b><span>Community Neuigkeiten</span></button><div class="ec-dock-detail" data-panel="news" id="ec-detail-news" role="region" aria-live="polite" hidden><div class="ec-dock-empty">Beim Öffnen laden …</div></div><div class="ec-dock-admin-slot"></div><button type="button" class="ec-logout"><b>↪</b><span>Abmelden</span></button></aside>`;document.body.appendChild(shell);shell.querySelectorAll('[data-ec-page],[data-ec-detail],[data-ec-home-region]').forEach(bindDockButton);shell.querySelector('.ec-dock-toggle').onclick=()=>{document.body.classList.add('ec-dock-open');void syncDockCounts()};shell.querySelector('.ec-dock-close').onclick=()=>document.body.classList.remove('ec-dock-open');shell.querySelector('.ec-logout').onclick=logout;shell.querySelector('select').onchange=e=>{const next=regions.find(r=>r.slug===e.target.value);if(!next)return;activeRegion=next;showAllMembers=false;localStorage.setItem('ec-active-region',next.slug);invalidateDockDetails('news');window.dispatchEvent(new CustomEvent('ec:region-change',{detail:next}));syncRegionUI();applyRegionalDirectory()};document.body.classList.add('ec-regional-ui');renderRegionOptions();renderIdentity();syncRegionUI();renderAdminDock();applyRegionalDirectory()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;ensureShell()})}).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('DOMContentLoaded',()=>{ensureShell();loadRegionalContext()});ensureShell();loadRegionalContext();