import { supabase } from './supabaseClient';

let cache={viewer:null,profiles:[],regions:[],assignments:[],friends:new Set()};
let loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionName=id=>cache.regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const activeRegion=()=>{const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region');return cache.regions.find(r=>r.slug===slug)||cache.regions.find(r=>r.id===cache.viewer?.home_region_id)||cache.regions[0]||null};
const isHead=()=>String(cache.viewer?.role||'').toUpperCase()==='HEAD_ADMIN';
const fmtDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-AT')};
const fmtAge=v=>{if(!v)return'';const b=new Date(v),n=new Date();if(Number.isNaN(b.getTime()))return'';let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const assignmentsFor=p=>cache.assignments.filter(a=>a.user_id===p?.id&&a.active);

async function load(force=false){
  if(loading||(!force&&cache.viewer&&cache.profiles.length))return;loading=true;
  try{
    const [{data:{user}},{data:profiles},{data:regions},{data:assignments}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('*').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    cache.profiles=profiles||[];cache.regions=regions||[];cache.assignments=assignments||[];cache.viewer=cache.profiles.find(p=>p.id===user?.id)||null;cache.friends=new Set();
    if(user?.id){const {data:friends}=await supabase.from('friendships').select('requester_id,receiver_id,status').eq('status','ACCEPTED').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);for(const f of friends||[])cache.friends.add(f.requester_id===user.id?f.receiver_id:f.requester_id)}
  }finally{loading=false}
}

function roleInfo(p){
  const base=String(p?.role||'MEMBER').toUpperCase(),here=activeRegion(),assigned=assignmentsFor(p),regionalHere=Boolean(here&&p?.home_region_id===here.id&&assigned.some(a=>a.region_id===here.id));
  if(base==='HEAD_ADMIN')return{label:'Hauptadmin · Betreiber',theme:'admin',star:'/role-star-red.svg'};
  if(base==='ADMIN')return{label:'Global Admin',theme:'admin',star:'/role-star-red.svg'};
  if(regionalHere)return{label:`Regional Admin ${here.name}`,theme:'admin',star:'/role-star-red.svg'};
  if(assigned.length)return{label:`Regional Admin ${assigned.map(a=>regionName(a.region_id)).join(', ')}`,theme:'supporter',star:'/supporter-star.svg'};
  if(base==='SUPPORTER')return{label:'Supporter',theme:'supporter',star:'/supporter-star.svg'};
  if(p?.account_badge==='BUSINESS')return{label:'Unternehmenskonto',theme:'business',star:'/role-star-blue.svg'};
  return{label:'Mitglied',theme:'member',star:'/role-star-member.svg'};
}

function visible(p,field){if(!p)return false;if(cache.viewer?.id===p.id||isHead())return true;const setting=String(p?.privacy_settings?.[field]||'PUBLIC').toUpperCase();return setting==='PUBLIC'||(setting==='FRIENDS'&&cache.friends.has(p.id))}
function row(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return`<div class="ec-clean-profile-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function findMember(root){const candidates=[root.querySelector('.member-profile-hero h1')?.textContent,root.querySelector('.member-profile-hero .member-nickname')?.textContent,root.querySelector('h1')?.textContent].map(x=>String(x||'').trim()).filter(Boolean);for(const name of candidates){const hit=cache.profiles.find(p=>p.nickname===name)||cache.profiles.find(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')===name);if(hit)return hit}const text=(root.textContent||'').toLowerCase();return cache.profiles.find(p=>p.nickname&&text.includes(String(p.nickname).toLowerCase()))||null}
function extractAvatar(root){return root.querySelector('.member-profile-hero img,.member-profile-avatar,img.profile-avatar,.profile-photo img')}
function extractActions(root){return root.querySelector(':scope > .member-profile-actions,.member-profile-actions')}
function closeAdmin(){document.querySelector('.ec-clean-admin-modal')?.remove()}

async function saveAdmin(member,action,slug,status){
  let response;
  if(action==='home')response=await supabase.rpc('ec_head_set_home_region',{p_target:member.id,p_region_slug:slug});
  if(action==='regional-on'||action==='regional-off')response=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:slug,p_enabled:action==='regional-on'});
  if(action==='global-on'||action==='global-off')response=await supabase.rpc('ec_set_global_admin',{p_target:member.id,p_enabled:action==='global-on'});
  if(action==='demote')response=await supabase.rpc('ec_demote_global_to_regional_admin',{p_target:member.id,p_region_slug:slug});
  if(response?.error)throw response.error;status.textContent='Gespeichert.';status.className='ec-clean-admin-status success';await load(true);
}
function openMemberAdmin(member){
  if(!isHead()||!member||member.id===cache.viewer?.id)return;closeAdmin();const assigned=assignmentsFor(member),role=String(member.role||'MEMBER').toUpperCase(),modal=document.createElement('div');modal.className='ec-clean-admin-modal';
  modal.innerHTML=`<div class="ec-clean-admin-box"><header><div><span>HEAD ADMIN</span><h2>${esc(member.nickname||'Mitglied')} verwalten</h2><p>${esc(roleInfo(member).label)}</p></div><button type="button" class="close" aria-label="Schließen">×</button></header><div class="ec-clean-admin-summary"><div><small>Heimatregion</small><strong>${esc(regionName(member.home_region_id))}</strong></div><div><small>Regional Admin</small><strong>${assigned.length?assigned.map(a=>esc(regionName(a.region_id))).join(', '):'Keine Zuweisung'}</strong></div></div><label>Heimatregion<select class="home">${cache.regions.map(r=>`<option value="${r.slug}" ${r.id===member.home_region_id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button data-action="home">Heimatregion speichern</button><label>Regionale Adminrechte<select class="region"><option value="">Region wählen</option>${cache.regions.map(r=>`<option value="${r.slug}">${esc(r.name)}</option>`).join('')}</select></label><div class="ec-clean-admin-actions"><button data-action="regional-on">Regional Admin vergeben</button><button data-action="regional-off">Regional Admin entfernen</button></div>${role==='ADMIN'?'<button data-action="demote">Global Admin → Regional Admin</button><button data-action="global-off">Global Admin entfernen</button>':'<button data-action="global-on">Global Admin vergeben</button>'}<p class="ec-clean-admin-status"></p></div>`;
  document.body.appendChild(modal);modal.querySelector('.close').onclick=closeAdmin;modal.onclick=e=>{if(e.target===modal)closeAdmin()};const status=modal.querySelector('.ec-clean-admin-status');
  modal.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{const action=button.dataset.action,slug=(action==='home'?modal.querySelector('.home'):modal.querySelector('.region')).value;if(!['global-on','global-off'].includes(action)&&!slug){status.textContent='Bitte Region auswählen.';return}button.disabled=true;status.textContent='Wird gespeichert …';try{await saveAdmin(member,action,slug,status);setTimeout(()=>openMemberAdmin(cache.profiles.find(p=>p.id===member.id)||member),250)}catch(error){status.textContent=error.message||'Speichern fehlgeschlagen';status.className='ec-clean-admin-status error'}finally{button.disabled=false}})
}

function buildProfile(root,member){
  if(root.dataset.ecCleanProfile==='1')return;root.dataset.ecCleanProfile='1';const role=roleInfo(member),avatar=extractAvatar(root),actionsSource=extractActions(root),shell=document.createElement('section');shell.className='ec-clean-profile';const rows=[row('Nickname',member.nickname)];if(visible(member,'name'))rows.push(row('Vorname',member.first_name),row('Nachname',member.last_name));if(visible(member,'birth_date'))rows.push(row('Geburtsdatum',fmtDate(member.birth_date)),row('Alter',fmtAge(member.birth_date)));if(visible(member,'location'))rows.push(row('Wohnort',member.location));rows.push(row('Heimatregion',regionName(member.home_region_id)));
  shell.innerHTML=`<div class="ec-clean-profile-left"><div class="ec-clean-profile-photo"></div><div class="ec-clean-profile-role role-${role.theme}"><span>FUNKTION</span><strong><img src="${role.star}" alt="">${esc(role.label)}</strong><small>Heimatregion: ${esc(regionName(member.home_region_id))}</small></div><div class="ec-clean-profile-actions"></div></div><div class="ec-clean-profile-main"><header><span>MITGLIEDSPROFIL</span><h1>${esc(member.nickname||'Mitglied')}</h1></header><div class="ec-clean-profile-data">${rows.join('')}</div>${visible(member,'bio')&&member.bio?`<section class="ec-clean-profile-about"><span>ÜBER MICH</span><p>${esc(member.bio)}</p></section>`:''}</div>`;
  if(avatar)shell.querySelector('.ec-clean-profile-photo').appendChild(avatar);const actions=shell.querySelector('.ec-clean-profile-actions');if(actionsSource){[...actionsSource.querySelectorAll('button,a')].forEach(el=>{el.classList.add('ec-clean-profile-action');actions.appendChild(el)});actionsSource.hidden=true}if(isHead()&&cache.viewer?.id!==member.id){const admin=document.createElement('button');admin.type='button';admin.className='ec-clean-profile-admin';admin.textContent='Admin Tools';admin.onclick=()=>openMemberAdmin(member);actions.appendChild(admin)}[...root.children].forEach(child=>{if(child!==shell)child.classList.add('ec-clean-profile-hidden')});root.prepend(shell)
}

function cleanEditor(){document.querySelectorAll('.profile-page-layout,.my-area-layout,.profile-form.profile-editor').forEach(el=>el.classList.add('ec-clean-editor'));document.querySelectorAll('img[src*="crown" i],img[src*="krone" i]').forEach(img=>img.remove())}
async function run(){await load();document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(root=>{const member=findMember(root);if(member)buildProfile(root,member)});cleanEditor()}
let q=false;new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>{document.querySelectorAll('.member-profile-page').forEach(root=>{root.dataset.ecCleanProfile='';root.querySelector('.ec-clean-profile')?.remove();root.querySelectorAll('.ec-clean-profile-hidden').forEach(el=>el.classList.remove('ec-clean-profile-hidden'))});load(true).then(run)},50));window.addEventListener('keydown',e=>{if(e.key==='Escape')closeAdmin()});window.addEventListener('DOMContentLoaded',run);run();