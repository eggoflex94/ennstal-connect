import { supabase } from './supabaseClient';

const DEFAULT_AVATAR='/community-default-avatar.png';
let loading=false;
let cache=null;
let mode='all';
let selectedRegion='all';
let onlineOnly=false;
let query='';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const age=date=>{if(!date)return null;const b=new Date(date);if(Number.isNaN(b.getTime()))return null;const n=new Date();let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return a>=0&&a<130?a:null};
const name=p=>p?.nickname||[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Mitglied';
const roleTheme=p=>{const r=String(p?.role||'MEMBER').toUpperCase();if(r==='HEAD_ADMIN'||r==='ADMIN')return'admin';if(r==='SUPPORTER')return'supporter';if(p?.account_badge==='BUSINESS')return'business';return'member'};
const starFor=theme=>theme==='admin'?'/role-star-red.svg':theme==='supporter'?'/supporter-star.svg':theme==='business'?'/role-star-blue.svg':'';
const online=p=>Boolean(p?.is_online&&p?.last_active_at&&Date.now()-new Date(p.last_active_at).getTime()<5*60*1000);
const activeSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const onMembersPage=()=>/^mitglieder\b/i.test(String(document.querySelector('.content-root .page-heading h1')?.textContent||''));

async function load(){
  if(cache||loading||!supabase)return cache;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return null;
    const [{data:regions},{data:profiles},{data:blocks}]=await Promise.all([
      supabase.from('regions').select('id,slug,name,short_name,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('profiles').select('id,nickname,first_name,last_name,birth_date,avatar_url,role,account_badge,home_region_id,is_online,last_active_at,hide_online_status,account_status,is_test_account').eq('account_status','ACTIVE'),
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id',user.id)
    ]);
    const blocked=new Set((blocks||[]).map(x=>x.blocked_id));
    cache={userId:user.id,regions:regions||[],profiles:(profiles||[]).filter(p=>!p.is_test_account&&!blocked.has(p.id))};
    return cache;
  }catch(error){console.warn('Regionsübergreifende Mitgliederliste konnte nicht geladen werden:',error);return null}
  finally{loading=false}
}

function buildCard(p,regionById,userId){
  const theme=roleTheme(p),star=starFor(theme),a=age(p.birth_date),isOnline=online(p),region=regionById.get(p.home_region_id)?.name||'Keine Region';
  const full=[p.first_name,p.last_name].filter(Boolean).join(' ').trim()||name(p);
  const card=document.createElement('article');
  card.className=`member-card role-theme-${theme} ec-all-region-generated`;
  card.dataset.memberId=p.id;card.dataset.homeRegionId=p.home_region_id||'';card.dataset.roleTheme=theme;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Profil von ${name(p)} öffnen`);
  card.innerHTML=`<span class="ec-role-surface ec-role-surface-${theme}" aria-hidden="true"></span><div class="ec-member-card-topline"><div class="ec-card-badge-rail">${star?`<span class="ec-card-badge-icon ec-card-badge-role ec-card-badge-role-${theme}"><img class="ec-card-badge-img ec-card-badge-role-img" src="${star}" alt=""></span>`:''}</div><strong class="member-nickname ec-native-nickname ${theme}">${esc(name(p))}</strong></div><img class="member-avatar ec-native-avatar ${theme}" src="${esc(p.avatar_url||DEFAULT_AVATAR)}" alt="Profilbild von ${esc(name(p))}" loading="lazy"><div class="member-meta ec-member-meta"><div class="member-name ec-native-member-name"><span class="ec-member-realname">${esc(full)}</span>${a!==null?`<small class="ec-member-age">(${a} Jahre)</small>`:''}</div>${!p.hide_online_status?`<div class="member-status ${isOnline?'online':'offline'}"><div class="ec-member-presence-line"><span class="ec-member-presence-dot"></span><span class="ec-member-presence-label">${isOnline?'Online':'Offline'}</span></div></div>`:''}<span class="ec-member-region-chip">⌖ ${esc(region)}</span></div>${p.id!==userId?'<button class="member-message ec-generated-profile-open" type="button">Profil öffnen</button>':''}`;
  const open=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:p.id,nickname:p.nickname||''}}));
  card.addEventListener('click',e=>{if(e.target.closest('button'))return;open()});
  card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
  card.querySelector('.ec-generated-profile-open')?.addEventListener('click',e=>{e.stopPropagation();open()});
  return card;
}

function ensureDirectoryShell(data){
  const section=document.querySelector('.content-root .page-heading')?.parentElement;
  const nativeGrid=section?.querySelector('.member-grid:not(.ec-all-regions-member-grid)');
  if(!section||!nativeGrid)return null;
  const nativeHeading=section.querySelector('.page-heading');
  const nativeInput=nativeHeading?.querySelector('.search-input');
  if(nativeInput){nativeInput.hidden=true;nativeInput.tabIndex=-1}
  let shell=section.querySelector('.ec-member-directory-shell');
  if(!shell){
    shell=document.createElement('section');
    shell.className='ec-member-directory-shell';
    nativeHeading?.insertAdjacentElement('afterend',shell);
  }
  const active=data.regions.find(r=>r.slug===activeSlug());
  const signature=`${active?.id||''}:${data.regions.map(r=>r.id).join(',')}`;
  if(shell.dataset.signature!==signature){
    shell.dataset.signature=signature;
    shell.innerHTML=`<div class="ec-member-directory-top"><div><span class="eyebrow">MITGLIEDER FINDEN</span><h2>Community durchsuchen</h2><p>Suche nach Namen oder zeige gezielt Mitglieder aus einer Region.</p></div><div class="ec-member-count-pill"><strong>${data.profiles.length}</strong><span>Mitglieder gesamt</span></div></div><div class="ec-member-search-row"><label class="ec-member-search-box"><span>⌕</span><input type="search" placeholder="Mitglied suchen …" autocomplete="off"></label><select class="ec-member-region-select" aria-label="Region auswählen"><option value="all">Alle Regionen</option>${data.regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label class="ec-member-online-toggle"><input type="checkbox"><span>Nur online</span></label></div><div class="ec-members-scope-tabs"><button type="button" data-scope="all">Alle Mitglieder</button><button type="button" data-scope="region">${esc(active?.name||'Aktuelle Region')}</button></div><div class="ec-member-results-meta" aria-live="polite"></div>`;
    const search=shell.querySelector('input[type=search]');search.value=query;search.addEventListener('input',()=>{query=search.value;schedule()});
    const regionSelect=shell.querySelector('.ec-member-region-select');regionSelect.value=selectedRegion;regionSelect.addEventListener('change',()=>{selectedRegion=regionSelect.value;mode='all';schedule()});
    const onlineToggle=shell.querySelector('.ec-member-online-toggle input');onlineToggle.checked=onlineOnly;onlineToggle.addEventListener('change',()=>{onlineOnly=onlineToggle.checked;schedule()});
    shell.querySelectorAll('[data-scope]').forEach(btn=>btn.onclick=()=>{mode=btn.dataset.scope;selectedRegion=btn.dataset.scope==='region'?(active?.id||'all'):'all';schedule()});
  }
  shell.querySelectorAll('[data-scope]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.scope===mode));
  const regionSelect=shell.querySelector('.ec-member-region-select');if(regionSelect&&regionSelect.value!==selectedRegion)regionSelect.value=selectedRegion;
  return {section,nativeGrid,active,shell};
}

async function render(){
  if(!onMembersPage()){document.documentElement.classList.remove('ec-members-all-mode');return}
  const data=await load();if(!data)return;
  const scope=ensureDirectoryShell(data);if(!scope)return;
  let generated=scope.section.querySelector('.ec-all-regions-member-grid');
  if(!generated){generated=document.createElement('div');generated.className='member-grid ec-all-regions-member-grid';scope.nativeGrid.insertAdjacentElement('afterend',generated)}
  scope.nativeGrid.hidden=true;generated.hidden=false;document.documentElement.classList.add('ec-members-all-mode');
  scope.section.querySelector('.ec-region-context')?.setAttribute('hidden','');
  const heading=scope.section.querySelector('.page-heading h1');const subtitle=scope.section.querySelector('.page-heading p');
  if(heading?.textContent!=='Mitglieder')heading.textContent='Mitglieder';
  if(subtitle?.textContent!=='Finde Menschen aus deiner Region oder aus der gesamten Ennstal Connect Community.')subtitle.textContent='Finde Menschen aus deiner Region oder aus der gesamten Ennstal Connect Community.';
  const regionById=new Map(data.regions.map(r=>[r.id,r]));
  const q=query.trim().toLowerCase();
  const effectiveRegion=mode==='region'?(scope.active?.id||selectedRegion):selectedRegion;
  let profiles=data.profiles.filter(p=>{
    const matchesRegion=effectiveRegion==='all'||p.home_region_id===effectiveRegion;
    const matchesOnline=!onlineOnly||online(p);
    const hay=[p.nickname,p.first_name,p.last_name,regionById.get(p.home_region_id)?.name].filter(Boolean).join(' ').toLowerCase();
    return matchesRegion&&matchesOnline&&(!q||hay.includes(q));
  });
  const rank=p=>String(p.role||'MEMBER').toUpperCase()==='HEAD_ADMIN'?1:String(p.role||'').toUpperCase()==='ADMIN'?2:String(p.role||'').toUpperCase()==='SUPPORTER'?3:4;
  profiles=[...profiles].sort((a,b)=>rank(a)-rank(b)||name(a).localeCompare(name(b),'de'));
  const meta=scope.shell.querySelector('.ec-member-results-meta');if(meta)meta.textContent=`${profiles.length} ${profiles.length===1?'Mitglied':'Mitglieder'} gefunden${effectiveRegion==='all'?' · alle Regionen':` · ${regionById.get(effectiveRegion)?.name||'Region'}`}${onlineOnly?' · nur online':''}`;
  const signature=profiles.map(p=>`${p.id}:${p.avatar_url||''}:${p.role||''}:${p.home_region_id||''}:${p.is_online?'1':'0'}:${p.last_active_at||''}`).join('|');
  if(generated.dataset.signature!==signature){generated.dataset.signature=signature;generated.replaceChildren(...profiles.map(p=>buildCard(p,regionById,data.userId)));if(!profiles.length){const empty=document.createElement('div');empty.className='ec-member-empty';empty.innerHTML='<strong>Keine Mitglieder gefunden</strong><span>Versuche einen anderen Namen oder ändere den Regionsfilter.</span>';generated.appendChild(empty)}}
}

let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>void render(),90)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>{cache=null;mode='all';selectedRegion='all';schedule()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
