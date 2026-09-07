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
  if(!supabase)return;
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
  const base=String(p?.role||'MEMBER').toUpperCase(),here=activeRegion(),assigned=assignmentsFor(p),regionalHere=Boolean(here&&assigned.some(a=>a.region_id===here.id));
  if(base==='HEAD_ADMIN')return{label:'Hauptadmin',theme:'admin',star:'/role-star-red.svg'};
  if(base==='ADMIN')return{label:'Community Admin',theme:'admin',star:'/role-star-red.svg'};
  if(regionalHere)return{label:`Regional Admin · ${here.name}`,theme:'admin',star:'/role-star-red.svg'};
  if(base==='SUPPORTER')return{label:'Supporter',theme:'supporter',star:'/supporter-star.svg'};
  if(p?.account_badge==='BUSINESS')return{label:'Unternehmenskonto',theme:'business',star:'/role-star-blue.svg'};
  return{label:'Mitglied',theme:'member',star:''};
}

function visible(p,field){if(!p)return false;if(cache.viewer?.id===p.id||isHead())return true;const setting=String(p?.privacy_settings?.[field]||'PUBLIC').toUpperCase();return setting==='PUBLIC'||(setting==='FRIENDS'&&cache.friends.has(p.id))}
function row(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return`<div class="ec-clean-profile-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}
function findMember(root){return cache.profiles.find(p=>p.id===root.dataset.profileId)||null}
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
  const preview=root.classList.contains('public-profile-preview'),role=roleInfo(member),actionsSource=extractActions(root);
  const canSee=field=>preview?String(member.privacy_settings?.[field]||'PUBLIC').toUpperCase()==='PUBLIC':visible(member,field);
  const signature=JSON.stringify([member,role,preview,actionsSource?.textContent,cache.friends.has(member.id)]);
  if(root.dataset.ecCleanProfile===signature)return;
  root.dataset.ecCleanProfile=signature;
  root.querySelector(':scope > .ec-clean-profile')?.remove();
  const avatar=extractAvatar(root),shell=document.createElement('section');shell.className='ec-clean-profile';
  const rows=[row('Nickname',member.nickname)];
  if(canSee('name'))rows.push(row('Vorname',member.first_name),row('Nachname',member.last_name));
  if(canSee('birth_date'))rows.push(row('Geburtsdatum',fmtDate(member.birth_date)),row('Alter',fmtAge(member.birth_date)));
  rows.push(row('Heimatregion',regionName(member.home_region_id)));
  const starMarkup=role.star?`<img src="${role.star}" alt="">`:'';
  shell.innerHTML='<div class="ec-clean-profile-left"><div class="ec-clean-profile-photo"></div><div class="ec-clean-profile-role role-'+role.theme+'"><span>FUNKTION</span><strong>'+starMarkup+esc(role.label)+'</strong><small>Heimatregion: '+esc(regionName(member.home_region_id))+'</small></div></div><div class="ec-clean-profile-main"><header><span>'+ (preview?'PROFILVORSCHAU':'MITGLIEDSPROFIL')+'</span><h1>'+esc(member.nickname||'Mitglied')+'</h1></header><div class="ec-clean-profile-data">'+rows.join('')+'</div>'+'</div><div class="ec-clean-profile-actions" aria-label="Profilaktionen"></div>';
  if(avatar)shell.querySelector('.ec-clean-profile-photo').appendChild(avatar.cloneNode(true));
  if(member.is_verified){const badge=document.createElement('span');badge.className='ec-profile-verified';badge.textContent='✓ Verifiziert';shell.querySelector('.ec-clean-profile-main header').appendChild(badge)}
  const actions=shell.querySelector('.ec-clean-profile-actions');
  if(!preview&&actionsSource){[...actionsSource.querySelectorAll('button,a')].forEach(original=>{const button=document.createElement('button');button.type='button';button.className='ec-clean-profile-action '+original.className;button.textContent=original.textContent;button.disabled=original.disabled;button.onclick=()=>original.click();actions.appendChild(button)})}
  if(!preview&&isHead()&&cache.viewer?.id!==member.id){const admin=document.createElement('button');admin.type='button';admin.className='ec-clean-profile-admin';admin.textContent='Admin Tools';admin.onclick=()=>openMemberAdmin(member);actions.appendChild(admin)}
  if(!actions.children.length)actions.remove();
  root.querySelectorAll(':scope > .member-profile-hero,:scope > .member-profile-actions,:scope > .profile-visible-details').forEach(el=>el.classList.add('ec-clean-profile-hidden'));
  const hero=root.querySelector(':scope > .member-profile-hero');
  if(hero)hero.before(shell);else root.prepend(shell);
}

function cleanEditor(){document.querySelectorAll('.profile-page-layout,.my-area-layout,.profile-form.profile-editor').forEach(el=>el.classList.add('ec-clean-editor'));document.querySelectorAll('img[src*="crown" i],img[src*="krone" i]').forEach(img=>img.remove())}
async function run(){await load();document.querySelectorAll('.member-profile-page').forEach(root=>{const member=findMember(root);if(member)buildProfile(root,member)});cleanEditor()}
let q=false;new MutationObserver(()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>{document.querySelectorAll('.member-profile-page').forEach(root=>{root.dataset.ecCleanProfile='';root.querySelector('.ec-clean-profile')?.remove();root.querySelectorAll('.ec-clean-profile-hidden').forEach(el=>el.classList.remove('ec-clean-profile-hidden'))});load(true).then(run)},50));window.addEventListener('keydown',e=>{if(e.key==='Escape')closeAdmin()});window.addEventListener('DOMContentLoaded',run);run();