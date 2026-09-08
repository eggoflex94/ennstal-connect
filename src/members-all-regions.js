import { supabase } from './supabaseClient';

const DEFAULT_AVATAR='/community-default-avatar.png';
let loading=false;
let cache=null;
let mode='all';

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
      supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
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

function ensureScopeBar(data){
  const section=document.querySelector('.content-root .page-heading')?.parentElement;
  const nativeGrid=section?.querySelector('.member-grid:not(.ec-all-regions-member-grid)');
  if(!section||!nativeGrid)return null;
  let bar=section.querySelector('.ec-members-scope-bar');
  if(!bar){bar=document.createElement('div');bar.className='ec-members-scope-bar';nativeGrid.before(bar)}
  const active=data.regions.find(r=>r.slug===activeSlug());
  const signature=`${active?.id||''}:${mode}`;
  if(bar.dataset.signature!==signature){
    bar.dataset.signature=signature;
    bar.innerHTML=`<div class="ec-members-scope-copy"><strong>Mitglieder aus allen Regionen</strong><small>Zeige die gesamte Community oder beschränke die Ansicht auf ${esc(active?.name||'die aktuelle Region')}.</small></div><div class="ec-members-scope-tabs"><button type="button" data-scope="all">Alle Regionen</button><button type="button" data-scope="region">${esc(active?.name||'Aktuelle Region')}</button></div>`;
    bar.querySelectorAll('button').forEach(btn=>{btn.classList.toggle('is-active',btn.dataset.scope===mode);btn.onclick=()=>{mode=btn.dataset.scope;void render()}});
  }
  return {section,nativeGrid,active};
}

async function render(){
  if(!onMembersPage()){document.documentElement.classList.remove('ec-members-all-mode');return}
  const data=await load();if(!data)return;
  const scope=ensureScopeBar(data);if(!scope)return;
  const input=scope.section.querySelector('.search-input');
  const searching=Boolean(input?.value.trim());
  let generated=scope.section.querySelector('.ec-all-regions-member-grid');
  if(!generated){generated=document.createElement('div');generated.className='member-grid ec-all-regions-member-grid';scope.nativeGrid.insertAdjacentElement('afterend',generated)}
  const heading=scope.section.querySelector('.page-heading h1');const subtitle=scope.section.querySelector('.page-heading p');
  if(searching){
    document.documentElement.classList.remove('ec-members-all-mode');
    scope.nativeGrid.hidden=false;generated.hidden=true;
    if(subtitle?.textContent!=='Die Suche findet Mitglieder aus allen Regionen.')subtitle.textContent='Die Suche findet Mitglieder aus allen Regionen.';
    return;
  }
  if(mode==='region'){
    document.documentElement.classList.remove('ec-members-all-mode');
    scope.nativeGrid.hidden=false;generated.hidden=true;
    const title=`Mitglieder · ${scope.active?.name||'Region'}`;
    if(heading?.textContent!==title)heading.textContent=title;
    if(subtitle?.textContent!=='Angezeigt werden Mitglieder mit dieser Heimatregion.')subtitle.textContent='Angezeigt werden Mitglieder mit dieser Heimatregion.';
    scope.section.querySelector('.ec-region-context')?.removeAttribute('hidden');
    return;
  }
  document.documentElement.classList.add('ec-members-all-mode');
  scope.nativeGrid.hidden=true;generated.hidden=false;
  scope.section.querySelector('.ec-region-context')?.setAttribute('hidden','');
  if(heading?.textContent!=='Mitglieder · Alle Regionen')heading.textContent='Mitglieder · Alle Regionen';
  const subtitleText=`${data.profiles.length} aktive Mitglieder aus allen Regionen der Community.`;
  if(subtitle?.textContent!==subtitleText)subtitle.textContent=subtitleText;
  const regionById=new Map(data.regions.map(r=>[r.id,r]));
  const rank=p=>String(p.role||'MEMBER').toUpperCase()==='HEAD_ADMIN'?1:String(p.role||'').toUpperCase()==='ADMIN'?2:String(p.role||'').toUpperCase()==='SUPPORTER'?3:4;
  const profiles=[...data.profiles].sort((a,b)=>rank(a)-rank(b)||name(a).localeCompare(name(b),'de'));
  const signature=profiles.map(p=>`${p.id}:${p.avatar_url||''}:${p.role||''}:${p.home_region_id||''}:${p.is_online?'1':'0'}:${p.last_active_at||''}`).join('|');
  if(generated.dataset.signature!==signature){generated.dataset.signature=signature;generated.replaceChildren(...profiles.map(p=>buildCard(p,regionById,data.userId)))}
}

let timer;function schedule(){clearTimeout(timer);timer=setTimeout(()=>void render(),90)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>{cache=null;schedule()});
document.addEventListener('input',e=>{if(e.target?.classList?.contains('search-input'))schedule()},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
