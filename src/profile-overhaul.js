import { supabase } from './supabaseClient';

let regionCache=[];
let sessionProfile=null;

async function loadRegions(){
  if(regionCache.length)return regionCache;
  const {data}=await supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order');
  regionCache=data||[];
  return regionCache;
}

async function loadSessionProfile(){
  if(sessionProfile)return sessionProfile;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data}=await supabase.from('profiles').select('id,nickname,role,home_region_id').eq('id',user.id).maybeSingle();
  sessionProfile=data||null;
  return sessionProfile;
}

async function resolveTarget(root){
  if(root.dataset.ecTargetId){
    const {data}=await supabase.from('profiles').select('*').eq('id',root.dataset.ecTargetId).maybeSingle();
    if(data)return data;
  }
  const nickname=(root.querySelector('.integrated-profile-title h1,.profile-name,h1')?.textContent||'').trim();
  if(!nickname)return null;
  const {data}=await supabase.from('profiles').select('*').eq('nickname',nickname).maybeSingle();
  if(data)root.dataset.ecTargetId=data.id;
  return data||null;
}

function textValue(v,fallback='Nicht freigegeben'){return v==null||String(v).trim()===''?fallback:String(v)}
function formatDate(v){if(!v)return'Nicht freigegeben';const d=new Date(v);return Number.isNaN(d.getTime())?'Nicht freigegeben':d.toLocaleDateString('de-AT')}

function makeRow(label,value){const row=document.createElement('div');row.className='ec-profile-data-row';row.innerHTML=`<span>${label}</span><strong>${textValue(value)}</strong>`;return row}

async function createQuickActions(root,target,mine){
  let bar=root.querySelector('.ec-profile-actionbar');
  if(bar)return;
  bar=document.createElement('div');bar.className='ec-profile-actionbar';
  const functionBox=root.querySelector('.ec-profile-functionbox');
  if(functionBox)functionBox.after(bar);
  if(mine){bar.innerHTML='<span class="ec-profile-own-note">Dein Profil</span>';return}

  const findAction=(words)=>[...root.querySelectorAll('button')].find(b=>words.some(w=>(b.textContent||'').toLowerCase().includes(w))&&!b.closest('.ec-profile-actionbar'));
  const message=findAction(['nachricht']);
  const friend=findAction(['freundschaft','freund']);
  if(message){message.classList.add('ec-profile-mini-action');bar.appendChild(message)}
  if(friend){friend.classList.add('ec-profile-mini-action');bar.appendChild(friend)}

  const block=document.createElement('button');block.type='button';block.className='ec-profile-mini-action';block.textContent='Blockieren';block.onclick=async()=>{
    if(!confirm(`${target.nickname||'Dieses Mitglied'} wirklich blockieren?`))return;
    const me=await loadSessionProfile();if(!me)return;
    const {error}=await supabase.from('blocked_users').upsert({blocker_id:me.id,blocked_id:target.id},{onConflict:'blocker_id,blocked_id'});
    alert(error?`Blockieren fehlgeschlagen: ${error.message}`:'Mitglied wurde blockiert.');
  };bar.appendChild(block);

  const report=document.createElement('button');report.type='button';report.className='ec-profile-mini-action';report.textContent='Melden';report.onclick=async()=>{
    const reason=prompt('Grund für die Meldung:');if(!reason?.trim())return;
    const me=await loadSessionProfile();
    const {error}=await supabase.from('reports').insert({reporter_id:me?.id||null,reported_user_id:target.id,reason:reason.trim()});
    alert(error?`Meldung fehlgeschlagen: ${error.message}`:'Meldung wurde übermittelt.');
  };bar.appendChild(report);
}

async function createAdminTools(root,target,mine){
  const me=await loadSessionProfile();
  if(!me||String(me.role).toUpperCase()!=='HEAD_ADMIN'||mine)return;
  const functionBox=root.querySelector('.ec-profile-functionbox');
  if(!functionBox||functionBox.querySelector('.ec-profile-admin-toggle'))return;

  const toggle=document.createElement('button');toggle.type='button';toggle.className='ec-profile-admin-toggle';toggle.textContent='Admin Tools';functionBox.appendChild(toggle);
  let panel=root.querySelector('.ec-profile-admin-panel');
  if(!panel){
    panel=document.createElement('section');panel.className='ec-profile-admin-panel';panel.hidden=true;
    const regions=await loadRegions();
    panel.innerHTML=`<div class="ec-profile-admin-head"><div><span>HAUPTADMIN</span><strong>Mitglied verwalten</strong></div><button type="button" class="ec-profile-admin-close">×</button></div><div class="ec-profile-admin-grid"><label>Heimatregion<select class="ec-admin-home-region">${regions.map(r=>`<option value="${r.slug}">${r.name}</option>`).join('')}</select></label><label>Regionaladmin<select class="ec-admin-region-admin"><option value="">Region wählen</option>${regions.map(r=>`<option value="${r.slug}">${r.name}</option>`).join('')}</select></label><button type="button" data-action="set-home">Heimatregion setzen</button><button type="button" data-action="grant-regional">Regionaladmin ernennen</button><button type="button" data-action="remove-regional">Regionaladmin entfernen</button><button type="button" data-action="grant-global">Global Admin ernennen</button><button type="button" data-action="remove-global">Global Admin entfernen</button></div>`;
    root.appendChild(panel);
    const current=regions.find(r=>r.id===target.home_region_id);if(current)panel.querySelector('.ec-admin-home-region').value=current.slug;
    panel.querySelector('.ec-profile-admin-close').onclick=()=>panel.hidden=true;
    panel.onclick=async e=>{
      const action=e.target?.dataset?.action;if(!action)return;
      const home=panel.querySelector('.ec-admin-home-region').value;
      const regional=panel.querySelector('.ec-admin-region-admin').value;
      let result;
      if(action==='set-home')result=await supabase.rpc('ec_head_set_home_region',{p_target:target.id,p_region_slug:home});
      if(action==='grant-regional'){if(!regional)return alert('Bitte Region wählen.');result=await supabase.rpc('ec_set_regional_admin',{p_target:target.id,p_region_slug:regional,p_enabled:true});}
      if(action==='remove-regional'){if(!regional)return alert('Bitte Region wählen.');result=await supabase.rpc('ec_set_regional_admin',{p_target:target.id,p_region_slug:regional,p_enabled:false});}
      if(action==='grant-global')result=await supabase.rpc('ec_set_global_admin',{p_target:target.id,p_enabled:true});
      if(action==='remove-global')result=await supabase.rpc('ec_set_global_admin',{p_target:target.id,p_enabled:false});
      alert(result?.error?result.error.message:'Änderung gespeichert.');
    };
  }
  toggle.onclick=()=>{panel.hidden=!panel.hidden};
}

async function roleLabel(target){
  const role=String(target.role||'MEMBER').toUpperCase();
  if(role==='HEAD_ADMIN')return'★ Hauptadmin';
  if(role==='ADMIN')return'★ Global Admin';
  const {data:assignments}=await supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',target.id).eq('active',true);
  if(assignments?.length){const regions=await loadRegions();const names=assignments.map(a=>regions.find(r=>r.id===a.region_id)?.name).filter(Boolean);return`★ Regional Admin ${names.join(', ')}`}
  if(role==='SUPPORTER')return'★ Supporter';
  return'Mitglied';
}

async function rebuild(root){
  if(root.dataset.ecProfileBuilt==='1')return;
  const target=await resolveTarget(root);if(!target)return;
  const me=await loadSessionProfile();const mine=me?.id===target.id;
  root.dataset.ecProfileBuilt='1';root.classList.add('ec-profile-v2');

  const hero=root.querySelector('.integrated-profile-hero');
  const avatar=root.querySelector('.integrated-avatar-wrap');
  const title=root.querySelector('.integrated-profile-title');
  const actions=root.querySelector('.integrated-profile-actions');
  if(!hero||!avatar||!title)return;

  const left=document.createElement('div');left.className='ec-profile-left';avatar.before(left);left.appendChild(avatar);
  const role=await roleLabel(target);
  const functionBox=document.createElement('div');functionBox.className='ec-profile-functionbox';functionBox.innerHTML=`<span>Funktion</span><strong>${role}</strong>`;left.appendChild(functionBox);

  const data=document.createElement('div');data.className='ec-profile-data';data.innerHTML='<div class="ec-profile-data-head"><span>PROFIL</span><strong>Mitgliedsdaten</strong></div>';
  data.appendChild(makeRow('Nickname',target.nickname));
  data.appendChild(makeRow('Vorname',target.first_name));
  data.appendChild(makeRow('Nachname',target.last_name));
  data.appendChild(makeRow('Geburtsdatum',formatDate(target.birth_date)));
  data.appendChild(makeRow('Wohnort',target.location));
  const region=(await loadRegions()).find(r=>r.id===target.home_region_id)?.name||'Nicht festgelegt';
  data.appendChild(makeRow('Heimatregion',region));
  hero.appendChild(data);

  title.classList.add('ec-profile-title-hidden');
  if(actions)actions.classList.add('ec-profile-actions-source');
  await createQuickActions(root,target,mine);
  await createAdminTools(root,target,mine);

  const details=root.querySelector('.integrated-profile-details');
  if(details){
    const about=document.createElement('section');about.className='ec-profile-about';about.innerHTML=`<div><span>ÜBER MICH</span><h2>Persönliches Profil</h2></div><p>${textValue(target.bio,'Noch keine Beschreibung hinterlegt.')}</p>`;details.before(about);
  }
}

let queued=false;
const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;document.querySelectorAll('.integrated-profile-view').forEach(rebuild)})});
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.integrated-profile-view').forEach(rebuild));
document.querySelectorAll('.integrated-profile-view').forEach(rebuild);
