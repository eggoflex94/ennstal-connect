import { supabase } from './supabaseClient';

let viewer=null;
let profiles=[];
let regions=[];
let regionalAdmins=[];
let booting=false;
let observer=null;

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=(v)=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-AT')};
const age=(v)=>{if(!v)return'';const b=new Date(v);if(Number.isNaN(b.getTime()))return'';const n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};
const regionName=(id)=>regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const isHead=()=>String(viewer?.role||'').toUpperCase()==='HEAD_ADMIN';

async function loadContext(force=false){
  if(!force&&viewer&&profiles.length&&regions.length)return;
  const [{data:{user}},{data:ps},{data:rs},{data:ra}]=await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('*').eq('account_status','ACTIVE'),
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
  ]);
  profiles=ps||[];regions=rs||[];regionalAdmins=ra||[];viewer=profiles.find(p=>p.id===user?.id)||null;
}

function activeRegion(){
  const select=document.querySelector('.ec-region-picker select');
  const slug=select?.value||localStorage.getItem('ec-active-region');
  return regions.find(r=>r.slug===slug)||regions.find(r=>r.id===viewer?.home_region_id)||regions[0]||null;
}

function memberFromProfilePage(root){
  const title=(root.querySelector('.member-profile-hero h1,.ec-stable-name')?.textContent||'').trim();
  if(!title)return null;
  return profiles.find(p=>p.nickname===title)||profiles.find(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')===title)||null;
}

function privacyAllows(member,field,isFriend){
  if(viewer?.id===member.id||['HEAD_ADMIN','ADMIN'].includes(String(viewer?.role||'').toUpperCase()))return true;
  const setting=String(member?.privacy_settings?.[field]||'PUBLIC').toUpperCase();
  return setting==='PUBLIC'||(setting==='FRIENDS'&&isFriend);
}

async function areFriends(member){
  if(!viewer?.id||viewer.id===member.id)return false;
  const {data}=await supabase.from('friendships').select('id').eq('status','ACCEPTED').or(`and(requester_id.eq.${viewer.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${viewer.id})`).limit(1);
  return Boolean(data?.length);
}

function memberFunction(member){
  const role=String(member.role||'MEMBER').toUpperCase();
  const assigned=regionalAdmins.filter(a=>a.user_id===member.id&&a.active).map(a=>regionName(a.region_id));
  if(role==='HEAD_ADMIN')return '★ Hauptadmin';
  if(role==='ADMIN')return '★ Global Admin';
  if(assigned.length)return `★ Regional Admin ${assigned.join(', ')}`;
  if(role==='SUPPORTER')return '★ Supporter';
  return 'Mitglied';
}

function row(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return `<div class="ec-stable-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}

async function addHeadAdminControls(root,member,host){
  if(!isHead()||viewer.id===member.id)return;
  const box=document.createElement('div');
  box.className='ec-stable-admin-controls';
  box.innerHTML=`<button type="button" class="ec-stable-admin-toggle">Admin Tools</button><div class="ec-stable-admin-body" hidden><label>Heimatregion<select class="ec-stable-home-region">${regions.map(r=>`<option value="${esc(r.slug)}" ${r.id===member.home_region_id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button type="button" data-admin-action="save-home">Heimatregion speichern</button><hr><label>Regional Admin<select class="ec-stable-admin-region"><option value="">Region wählen</option>${regions.map(r=>`<option value="${esc(r.slug)}">${esc(r.name)}</option>`).join('')}</select></label><button type="button" data-admin-action="grant-regional">Regional Admin ernennen</button><button type="button" data-admin-action="remove-regional">Regional Admin entfernen</button></div>`;
  host.appendChild(box);
  const toggle=box.querySelector('.ec-stable-admin-toggle');const body=box.querySelector('.ec-stable-admin-body');
  toggle.onclick=()=>{body.hidden=!body.hidden;toggle.classList.toggle('active',!body.hidden)};
  box.onclick=async(e)=>{
    const action=e.target?.dataset?.adminAction;if(!action)return;
    e.target.disabled=true;
    try{
      if(action==='save-home'){
        const slug=box.querySelector('.ec-stable-home-region').value;
        const {error}=await supabase.rpc('ec_head_set_home_region',{p_target:member.id,p_region_slug:slug});if(error)throw error;
        member.home_region_id=regions.find(r=>r.slug===slug)?.id||member.home_region_id;
        alert(`Heimatregion auf ${regionName(member.home_region_id)} geändert.`);
      }
      if(action==='grant-regional'||action==='remove-regional'){
        const slug=box.querySelector('.ec-stable-admin-region').value;if(!slug)throw new Error('Bitte zuerst eine Region auswählen.');
        const {error}=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:slug,p_enabled:action==='grant-regional'});if(error)throw error;
        alert(action==='grant-regional'?'Regional Admin wurde vergeben.':'Regional Admin wurde entfernt.');
      }
      await loadContext(true);root.dataset.ecStableProfile='';enhanceMemberProfile(root);filterMemberDirectory();
    }catch(err){alert(err.message||'Änderung konnte nicht gespeichert werden.')}finally{e.target.disabled=false}
  };
}

async function enhanceMemberProfile(root){
  if(root.dataset.ecStableProfile==='1')return;
  const hero=root.querySelector(':scope > .member-profile-hero');
  if(!hero)return;
  const member=memberFromProfilePage(root);if(!member)return;
  root.dataset.ecStableProfile='1';root.classList.add('ec-stable-profile-page');
  const friend=await areFriends(member);
  const avatar=hero.querySelector('img');
  const sourceActions=root.querySelector(':scope > .member-profile-actions');
  const sourceAdmin=root.querySelector(':scope > .member-admin-tools');

  const layout=document.createElement('section');layout.className='ec-stable-profile-card';
  const left=document.createElement('div');left.className='ec-stable-profile-left';
  const photo=document.createElement('div');photo.className='ec-stable-photo';if(avatar)photo.appendChild(avatar);left.appendChild(photo);
  const role=document.createElement('div');role.className='ec-stable-role';role.innerHTML=`<span>Funktion</span><strong>${esc(memberFunction(member))}</strong><small>Heimatregion: ${esc(regionName(member.home_region_id))}</small>`;left.appendChild(role);

  const actions=document.createElement('div');actions.className='ec-stable-actions';
  if(sourceActions){[...sourceActions.querySelectorAll('button')].forEach(btn=>{btn.classList.add('ec-stable-action');btn.textContent=(btn.textContent||'').replace(/[💬🤝♥✓⏳🚫🚩]/g,'').replace(/\s+/g,' ').trim();actions.appendChild(btn)});sourceActions.hidden=true}
  left.appendChild(actions);
  await addHeadAdminControls(root,member,left);

  const data=document.createElement('div');data.className='ec-stable-profile-data';
  const rows=[];
  rows.push(row('Nickname',member.nickname));
  if(privacyAllows(member,'name',friend)){rows.push(row('Vorname',member.first_name));rows.push(row('Nachname',member.last_name));}
  if(privacyAllows(member,'birth_date',friend)){rows.push(row('Geburtsdatum',fmtDate(member.birth_date)));rows.push(row('Alter',age(member.birth_date)));}
  if(privacyAllows(member,'location',friend))rows.push(row('Wohnort',member.location));
  rows.push(row('Heimatregion',regionName(member.home_region_id)));
  data.innerHTML=`<div class="ec-stable-data-head"><div><span>MITGLIEDSPROFIL</span><h1 class="ec-stable-name">${esc(member.nickname||[member.first_name,member.last_name].filter(Boolean).join(' ')||'Mitglied')}</h1></div>${member.is_verified?'<b title="Verifiziert">✓</b>':''}</div><div class="ec-stable-data-grid">${rows.join('')}</div>`;
  layout.append(left,data);
  root.insertBefore(layout,hero);hero.hidden=true;

  if(sourceAdmin){sourceAdmin.classList.add('ec-stable-old-admin');sourceAdmin.hidden=true}
  const more=document.createElement('div');more.className='ec-stable-more';
  if(member.bio&&privacyAllows(member,'bio',friend)){const about=document.createElement('section');about.className='ec-stable-section';about.innerHTML=`<span>ÜBER MICH</span><h2>Über ${esc(member.nickname||'dieses Mitglied')}</h2><p>${esc(member.bio)}</p>`;more.appendChild(about)}
  const details=[];if(privacyAllows(member,'interests',friend)&&member.interests)details.push(row('Interessen',Array.isArray(member.interests)?member.interests.join(', '):member.interests));if(privacyAllows(member,'website',friend)&&member.website)details.push(row('Webseite',member.website));
  if(details.length){const info=document.createElement('section');info.className='ec-stable-section';info.innerHTML=`<span>WEITERE ANGABEN</span><h2>Profilinformationen</h2><div class="ec-stable-data-grid one">${details.join('')}</div>`;more.appendChild(info)}
  if(more.children.length)layout.after(more);
}

function filterMemberDirectory(){
  const region=activeRegion();if(!region)return;
  const allMode=Boolean(document.querySelector('.ec-all-regions-toggle')?.textContent?.includes(`Nur ${region.name}`));
  document.querySelectorAll('.member-grid .member-card').forEach(card=>{
    const name=(card.querySelector('.member-nickname')?.textContent||card.querySelector('strong')?.textContent||'').trim();
    const p=profiles.find(x=>x.nickname===name)||profiles.find(x=>[x.first_name,x.last_name].filter(Boolean).join(' ')===name);
    if(!p)return;
    card.dataset.memberId=p.id;card.dataset.homeRegionId=p.home_region_id||'';card.hidden=allMode?false:p.home_region_id!==region.id;
  });
}

function ensureAdminDock(){
  const dock=document.querySelector('.ec-right-dock');if(!dock||!isHead())return;
  let box=dock.querySelector('.ec-stable-admin-dock');if(box)return;
  box=document.createElement('div');box.className='ec-stable-admin-dock';
  box.innerHTML='<div class="ec-dock-divider"></div><div class="ec-dock-section-label">ADMINISTRATION</div><button type="button" data-stable-admin="center"><b>♛</b><span>Admin-Zentrale</span></button><button type="button" data-stable-admin="members"><b>⌖</b><span>Mitglieder & Regionen</span></button><button type="button" data-stable-admin="legal"><b>⚖</b><span>Beweissicherung</span></button>';
  const logout=dock.querySelector('.ec-logout');dock.insertBefore(box,logout?.previousElementSibling||logout||null);
  const clickNative=(text)=>{const el=[...document.querySelectorAll('button,a')].find(x=>(x.textContent||'').includes(text)&&!x.closest('.ec-right-dock'));if(el){el.click();return true}return false};
  box.querySelector('[data-stable-admin="center"]').onclick=()=>clickNative('Admin-Zentrale');
  box.querySelector('[data-stable-admin="members"]').onclick=()=>{if(clickNative('Admin-Zentrale'))setTimeout(()=>document.querySelector('.admin-member-cards')?.scrollIntoView({behavior:'smooth'}),300)};
  box.querySelector('[data-stable-admin="legal"]').onclick=()=>clickNative('Rechtliche Beweissicherung');
}

async function run(){
  if(booting)return;booting=true;
  try{
    await loadContext();
    document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(enhanceMemberProfile);
    ensureAdminDock();filterMemberDirectory();
  }finally{booting=false}
}

observer=new MutationObserver(()=>requestAnimationFrame(run));observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>setTimeout(filterMemberDirectory,30));
window.addEventListener('DOMContentLoaded',run);run();
