import { supabase } from './supabaseClient';

let cache={viewer:null,profiles:[],regions:[],assignments:[],moderation:[],friends:new Set()};
let loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const regionName=id=>cache.regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const activeRegion=()=>{const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region');return cache.regions.find(r=>r.slug===slug)||cache.regions.find(r=>r.id===cache.viewer?.home_region_id)||cache.regions[0]||null};
const viewerRole=()=>String(cache.viewer?.role||'').toUpperCase();
const isHead=()=>viewerRole()==='HEAD_ADMIN';
const isGlobalAdmin=()=>['HEAD_ADMIN','ADMIN'].includes(viewerRole());
const viewerAssignments=()=>cache.assignments.filter(a=>a.user_id===cache.viewer?.id&&a.active);
const viewerModeration=()=>cache.moderation.filter(a=>a.user_id===cache.viewer?.id&&a.active);
const isRegionalAdmin=()=>viewerAssignments().length>0;
const fmtDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-AT')};
const fmtAge=v=>{if(!v)return'';const b=new Date(v),n=new Date();if(Number.isNaN(b.getTime()))return'';let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const fmtLastActive=v=>{if(!v)return'Unbekannt';const d=new Date(v);if(Number.isNaN(d.getTime()))return'Unbekannt';return d.toLocaleString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',',' ·');};
const assignmentsFor=p=>cache.assignments.filter(a=>a.user_id===p?.id&&a.active);
const presenceTime=p=>{const raw=p?.last_active_at||p?.last_seen_at;if(!raw)return 0;const time=new Date(raw).getTime();return Number.isFinite(time)?time:0};
const isActuallyOnline=p=>!p?.hide_online_status&&presenceTime(p)>0&&Date.now()-presenceTime(p)<=5*60*1000;

async function load(force=false){
  if(!supabase)return;
  if(loading||(!force&&cache.viewer&&cache.profiles.length))return;loading=true;
  try{
    const [{data:{user}},{data:profiles},{data:regions},{data:assignments},{data:moderation}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('*').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('active',true)
    ]);
    cache.profiles=profiles||[];cache.regions=regions||[];cache.assignments=assignments||[];cache.moderation=moderation||[];cache.viewer=cache.profiles.find(p=>p.id===user?.id)||null;cache.friends=new Set();
    if(user?.id){const {data:friends}=await supabase.from('friendships').select('requester_id,receiver_id,status').eq('status','ACCEPTED').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);for(const f of friends||[])cache.friends.add(f.requester_id===user.id?f.receiver_id:f.requester_id)}
  }finally{loading=false}
}

function roleInfo(p){
  const base=String(p?.role||'MEMBER').toUpperCase(),here=activeRegion(),assigned=assignmentsFor(p),regionalHere=Boolean(here&&assigned.some(a=>a.region_id===here.id));
  if(base==='HEAD_ADMIN'||base==='ADMIN')return{theme:'admin',star:'/role-star-red.svg',label:'Global Admin'};
  if(regionalHere)return{theme:'admin',star:'/role-star-red.svg',label:`Regional Admin · ${regionName(here.id)}`};
  if(assigned.length)return{theme:'admin',star:'/role-star-red.svg',label:`Regional Admin · ${assigned.map(a=>regionName(a.region_id)).join(' · ')}`};
  if(base==='SUPPORTER')return{theme:'supporter',star:'/supporter-star.svg',label:'Supporter'};
  if(p?.account_badge==='BUSINESS')return{theme:'business',star:'/role-star-blue.svg',label:'Unternehmenskonto'};
  return{theme:'member',star:'',label:'Mitglied'};
}

function visible(p,field){if(!p)return false;if(cache.viewer?.id===p.id||isHead())return true;const setting=String(p?.privacy_settings?.[field]||'PUBLIC').toUpperCase();return setting==='PUBLIC'||(setting==='FRIENDS'&&cache.friends.has(p.id))}
function row(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return`<div class="ec-clean-profile-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function findMember(root){return cache.profiles.find(p=>p.id===root.dataset.profileId)||null}
function extractAvatar(root){return root.querySelector('.member-profile-hero img,.member-profile-avatar,img.profile-avatar,.profile-photo img')}
function extractActions(root){return root.querySelector(':scope > .member-profile-actions,.member-profile-actions,.profile-actions,.member-action-bar,.profile-action-bar')}
function closeAdmin(){document.querySelector('.ec-clean-admin-modal')?.remove()}
function cleanActionClassName(node){return String(node?.className||'').split(/\s+/).filter(cls=>cls&&!['ec-profile-duplicate-action-button','ec-profile-duplicate-actions-hidden','ec-clean-profile-hidden'].includes(cls)).join(' ')}
function memberInViewerRegion(member){return viewerAssignments().some(a=>a.region_id===member?.home_region_id)}
function hasRegionalPermission(member,permission){return viewerModeration().some(m=>m.region_id===member?.home_region_id&&Array.isArray(m.permissions)&&m.permissions.includes(permission))}
function canUseProfileAdmin(member){if(!member||member.id===cache.viewer?.id)return false;if(isGlobalAdmin())return true;return isRegionalAdmin()&&memberInViewerRegion(member)}
function canManagePopupsFor(member){return isGlobalAdmin()||hasRegionalPermission(member,'ANNOUNCEMENTS')}
function openAdminSection(selector){closeAdmin();window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'admin'}}));let tries=0;const timer=setInterval(()=>{tries+=1;const node=document.querySelector(selector);if(node){clearInterval(timer);node.scrollIntoView({behavior:'smooth',block:'start'});node.classList.add('ec-popup-admin-manager-focus');setTimeout(()=>node.classList.remove('ec-popup-admin-manager-focus'),1500)}else if(tries>30)clearInterval(timer)},120)}

async function saveAdmin(member,action,slug,status){
  let response;
  if(action==='home')response=await supabase.rpc('ec_head_set_home_region',{p_target:member.id,p_region_slug:slug});
  if(action==='regional-on'||action==='regional-off')response=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:slug,p_enabled:action==='regional-on'});
  if(action==='global-on'||action==='global-off')response=await supabase.rpc('ec_set_global_admin',{p_target:member.id,p_enabled:action==='global-on'});
  if(action==='demote')response=await supabase.rpc('ec_demote_global_to_regional_admin',{p_target:member.id,p_region_slug:slug});
  if(response?.error)throw response.error;status.textContent='Gespeichert.';status.className='ec-clean-admin-status success';await load(true);
}
function openHeadMemberAdmin(member){
  if(!isHead()||!member||member.id===cache.viewer?.id)return;closeAdmin();const assigned=assignmentsFor(member),role=String(member.role||'MEMBER').toUpperCase(),modal=document.createElement('div');modal.className='ec-clean-admin-modal';
  modal.innerHTML=`<div class="ec-clean-admin-box"><header><div><span>HEAD ADMIN</span><h2>${esc(member.nickname||'Mitglied')} verwalten</h2></div><button type="button" class="close" aria-label="Schließen">×</button></header><div class="ec-clean-admin-summary"><div><small>Heimatregion</small><strong>${esc(regionName(member.home_region_id))}</strong></div><div><small>Regionale Rechte</small><strong>${assigned.length?assigned.map(a=>esc(regionName(a.region_id))).join(', '):'Keine Zuweisung'}</strong></div></div><label>Heimatregion<select class="home">${cache.regions.map(r=>`<option value="${r.slug}" ${r.id===member.home_region_id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button data-action="home">Heimatregion speichern</button><label>Regionale Adminrechte<select class="region"><option value="">Region wählen</option>${cache.regions.map(r=>`<option value="${r.slug}">${esc(r.name)}</option>`).join('')}</select></label><div class="ec-clean-admin-actions"><button data-action="regional-on">Regionalrecht vergeben</button><button data-action="regional-off">Regionalrecht entfernen</button></div>${role==='ADMIN'?'<button data-action="demote">Globalrecht → Regionalrecht</button><button data-action="global-off">Globalrecht entfernen</button>':'<button data-action="global-on">Globalrecht vergeben</button>'}<div class="ec-clean-admin-actions"><button type="button" data-shortcut="stats">Statistik öffnen</button><button type="button" data-shortcut="popups">Community-Popups</button></div><p class="ec-clean-admin-status"></p></div>`;
  document.body.appendChild(modal);modal.querySelector('.close').onclick=closeAdmin;modal.onclick=e=>{if(e.target===modal)closeAdmin()};modal.querySelector('[data-shortcut="stats"]').onclick=()=>openAdminSection('.ec-hours-statistics');modal.querySelector('[data-shortcut="popups"]').onclick=()=>openAdminSection('.ec-popup-admin-manager');const status=modal.querySelector('.ec-clean-admin-status');
  modal.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{const action=button.dataset.action,slug=(action==='home'?modal.querySelector('.home'):modal.querySelector('.region')).value;if(!['global-on','global-off'].includes(action)&&!slug){status.textContent='Bitte Region auswählen.';return}button.disabled=true;status.textContent='Wird gespeichert …';try{await saveAdmin(member,action,slug,status);setTimeout(()=>openHeadMemberAdmin(cache.profiles.find(p=>p.id===member.id)||member),250)}catch(error){status.textContent=error.message||'Speichern fehlgeschlagen';status.className='ec-clean-admin-status error'}finally{button.disabled=false}})
}
function openPermissionAdmin(member){
  if(!canUseProfileAdmin(member))return;closeAdmin();
  if(isHead()){openHeadMemberAdmin(member);return}
  const modal=document.createElement('div');modal.className='ec-clean-admin-modal';
  const regional=!isGlobalAdmin();const tools=[`<button type="button" data-tool="stats">Statistik</button>`];if(canManagePopupsFor(member))tools.push(`<button type="button" data-tool="popups">Community-Popups</button>`);
  const extra=regional?`<div class="ec-clean-admin-summary"><div><small>Bereich</small><strong>${esc(regionName(member.home_region_id))}</strong></div><div><small>Zugriff</small><strong>Nur freigeschaltete Regionsfunktionen</strong></div></div>`:`<div class="ec-clean-admin-summary"><div><small>Rolle</small><strong>Global Admin</strong></div><div><small>Zugriff</small><strong>Globale Verwaltungsfunktionen</strong></div></div>`;
  modal.innerHTML=`<div class="ec-clean-admin-box"><header><div><span>${regional?'REGIONAL ADMIN':'GLOBAL ADMIN'}</span><h2>${esc(member.nickname||'Mitglied')} · Admin Tools</h2></div><button type="button" class="close" aria-label="Schließen">×</button></header>${extra}<div class="ec-clean-admin-actions">${tools.join('')}</div><p class="ec-clean-admin-status">Es werden nur Funktionen angezeigt, für die dein Konto berechtigt ist.</p></div>`;
  document.body.appendChild(modal);modal.querySelector('.close').onclick=closeAdmin;modal.onclick=e=>{if(e.target===modal)closeAdmin()};modal.querySelector('[data-tool="stats"]')?.addEventListener('click',()=>openAdminSection('.ec-hours-statistics'));modal.querySelector('[data-tool="popups"]')?.addEventListener('click',()=>openAdminSection('.ec-popup-admin-manager'));
}

function buildProfile(root,member){
  const preview=root.classList.contains('public-profile-preview'),role=roleInfo(member),actionsSource=extractActions(root);
  const canSee=field=>preview?String(member.privacy_settings?.[field]||'PUBLIC').toUpperCase()==='PUBLIC':visible(member,field);
  const signature=JSON.stringify([member,role,preview,actionsSource?.textContent,cache.friends.has(member.id),isActuallyOnline(member),viewerRole(),viewerAssignments(),viewerModeration()]);
  if(root.dataset.ecCleanProfile===signature)return;
  root.dataset.ecCleanProfile=signature;
  root.querySelector(':scope > .ec-clean-profile')?.remove();
  const avatar=extractAvatar(root),shell=document.createElement('section');shell.className='ec-clean-profile';
  const rows=[row('Nickname',member.nickname)];
  if(canSee('name'))rows.push(row('Vorname',member.first_name),row('Nachname',member.last_name));
  if(canSee('birth_date'))rows.push(row('Geburtsdatum',fmtDate(member.birth_date)),row('Alter',fmtAge(member.birth_date)));
  rows.push(row('Heimatregion',regionName(member.home_region_id)));
  const starMarkup=role.star?`<img src="${role.star}" alt="" aria-hidden="true">`:'';
  const identityMarkup=`${starMarkup}<span>${esc(role.label)}</span>`;
  const online=isActuallyOnline(member);
  const lastActive=fmtLastActive(member.last_active_at||member.last_seen_at);
  const presenceMarkup=`<div class="ec-profile-presence"><span class="ec-profile-presence-status ${online?'is-online':'is-offline'}"><i aria-hidden="true"></i>${online?'Online':'Offline'}</span><span class="ec-profile-last-active">Zuletzt aktiv: ${esc(lastActive)}</span></div>`;
  shell.innerHTML='<div class="ec-clean-profile-left"><div class="ec-clean-profile-photo"></div><div class="ec-clean-profile-role role-'+role.theme+'"><span>FUNKTION</span><strong>'+identityMarkup+'</strong><small>Heimatregion: '+esc(regionName(member.home_region_id))+'</small>'+presenceMarkup+'</div></div><div class="ec-clean-profile-main"><header><span>'+ (preview?'PROFILVORSCHAU':'MITGLIEDSPROFIL')+'</span><h1>'+esc(member.nickname||'Mitglied')+'</h1></header><div class="ec-clean-profile-data">'+rows.join('')+'</div>'+'</div><div class="ec-clean-profile-actions" aria-label="Profilaktionen"></div>';
  if(avatar)shell.querySelector('.ec-clean-profile-photo').appendChild(avatar.cloneNode(true));
  if(member.is_verified){const badge=document.createElement('span');badge.className='ec-profile-verified';badge.textContent='✓ Verifiziert';shell.querySelector('.ec-clean-profile-main header').appendChild(badge)}
  const actions=shell.querySelector('.ec-clean-profile-actions');
  if(!preview&&actionsSource){
    [...actionsSource.querySelectorAll('button,a')].forEach(original=>{
      const button=document.createElement('button');button.type='button';const originalClasses=cleanActionClassName(original);button.className=`ec-clean-profile-action${originalClasses?` ${originalClasses}`:''}`;button.textContent=String(original.textContent||'').trim();button.disabled=original.disabled;button.onclick=()=>original.click();actions.appendChild(button)
    });
  }
  if(!preview&&canUseProfileAdmin(member)){const admin=document.createElement('button');admin.type='button';admin.className='ec-clean-profile-admin';admin.textContent='Admin Tools';admin.onclick=()=>openPermissionAdmin(member);actions.appendChild(admin)}
  if(!actions.children.length)actions.remove();
  root.querySelectorAll(':scope > .member-profile-hero,:scope > .member-profile-actions,:scope > .profile-visible-details').forEach(el=>el.classList.add('ec-clean-profile-hidden'));
  const hero=root.querySelector(':scope > .member-profile-hero');if(hero)hero.before(shell);else root.prepend(shell)
}

function cleanEditor(){document.querySelectorAll('.profile-page-layout,.my-area-layout,.profile-form.profile-editor').forEach(el=>el.classList.add('ec-clean-editor'));document.querySelectorAll('img[src*="crown" i],img[src*="krone" i]').forEach(img=>img.remove())}
async function run(){await load();document.querySelectorAll('.member-profile-page').forEach(root=>{const member=findMember(root);if(member)buildProfile(root,member)});cleanEditor()}
let q=false;new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>{document.querySelectorAll('.member-profile-page').forEach(root=>{root.dataset.ecCleanProfile='';root.querySelector('.ec-clean-profile')?.remove();root.querySelectorAll('.ec-clean-profile-hidden').forEach(el=>el.classList.remove('ec-clean-profile-hidden'))});load(true).then(run)},50));window.addEventListener('keydown',e=>{if(e.key==='Escape')closeAdmin()});window.addEventListener('DOMContentLoaded',run);run();