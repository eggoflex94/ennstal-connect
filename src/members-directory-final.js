import { supabase } from './supabaseClient';

let state={regions:[],profiles:[],query:'',region:'all',online:false};
let timer=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const isMembers=()=>/^Mitglieder\b/i.test(document.querySelector('.content-root .page-heading h1')?.textContent||'');
const displayName=p=>p.nickname||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Mitglied';
const isOnline=p=>Boolean(p.is_online&&p.last_active_at&&Date.now()-new Date(p.last_active_at).getTime()<5*60*1000);

async function load(){
  if(!supabase)return;
  const [{data:regions,error:re},{data:profiles,error:pe}]=await Promise.all([
    supabase.from('regions').select('id,slug,name,short_name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,role,account_badge,home_region_id,is_online,last_active_at,hide_online_status,account_status,is_test_account').eq('account_status','ACTIVE')
  ]);
  if(re||pe)throw re||pe;
  state.regions=regions||[];
  state.profiles=(profiles||[]).filter(p=>!p.is_test_account);
}

function theme(p){const r=String(p.role||'MEMBER').toUpperCase();if(r==='HEAD_ADMIN'||r==='ADMIN')return'admin';if(r==='SUPPORTER')return'supporter';if(p.account_badge==='BUSINESS')return'business';return'member'}

function card(p,regionMap){
  const article=document.createElement('article');
  article.className=`ec-member-final-card role-theme-${theme(p)}`;
  article.dataset.memberId=p.id;
  const n=displayName(p),region=regionMap.get(p.home_region_id)?.name||'Keine Region',online=!p.hide_online_status&&isOnline(p);
  article.innerHTML=`<div class="ec-member-final-head"><img src="${esc(p.avatar_url||'/community-default-avatar.png')}" alt="Profilbild von ${esc(n)}"><div><strong>${esc(n)}</strong><span class="ec-member-region-chip">⌖ ${esc(region)}</span><small class="${online?'is-online':''}">${p.hide_online_status?'Status verborgen':online?'● Online':'○ Offline'}</small></div></div><button type="button" class="ec-member-open">Profil öffnen</button>`;
  article.querySelector('.ec-member-open').onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:p.id,nickname:p.nickname||''}}));
  return article;
}

function ensureShell(){
  const heading=document.querySelector('.content-root .page-heading');
  const section=heading?.parentElement;
  const nativeGrid=section?.querySelector('.member-grid,.members-grid');
  if(!heading||!section||!nativeGrid)return null;
  heading.querySelector('.search-input')?.setAttribute('hidden','');
  heading.querySelector('h1').textContent='Mitglieder';
  const sub=heading.querySelector('p');if(sub)sub.textContent='Durchsuche die gesamte Ennstal Connect Community oder filtere gezielt nach Region.';
  document.querySelectorAll('.ec-member-directory-shell,.ec-region-context').forEach(el=>el.remove());
  nativeGrid.hidden=true;

  let shell=section.querySelector('.ec-member-final-search');
  if(!shell){
    shell=document.createElement('section');shell.className='ec-member-final-search panel';heading.insertAdjacentElement('afterend',shell);
    shell.innerHTML=`<div class="ec-member-final-search-head"><div><span class="eyebrow">MITGLIEDER FINDEN</span><h2>Community durchsuchen</h2><p>Name oder Nickname eingeben und optional eine Region auswählen.</p></div><span class="ec-member-total"></span></div><div class="ec-member-final-controls"><label class="ec-member-final-query"><span>⌕</span><input type="search" placeholder="Mitglied suchen …" autocomplete="off"></label><select class="ec-member-final-region" aria-label="Region auswählen"><option value="all">Alle Regionen</option></select><label class="ec-member-final-online"><input type="checkbox"> Nur online</label></div><div class="ec-member-final-quick"><button type="button" data-quick="all">Alle Regionen</button><button type="button" data-quick="active">Aktuelle Region</button></div><div class="ec-member-final-meta" aria-live="polite"></div>`;
    const q=shell.querySelector('input[type=search]');q.value=state.query;q.oninput=()=>{state.query=q.value;render()};
    const r=shell.querySelector('.ec-member-final-region');r.onchange=()=>{state.region=r.value;render()};
    const o=shell.querySelector('.ec-member-final-online input');o.checked=state.online;o.onchange=()=>{state.online=o.checked;render()};
    shell.querySelector('[data-quick="all"]').onclick=()=>{state.region='all';r.value='all';render()};
    shell.querySelector('[data-quick="active"]').onclick=()=>{const a=state.regions.find(x=>x.slug===activeSlug());state.region=a?.id||'all';r.value=state.region;render()};
  }
  const select=shell.querySelector('.ec-member-final-region'),sig=state.regions.map(r=>r.id).join('|');
  if(select.dataset.sig!==sig){select.dataset.sig=sig;select.innerHTML=`<option value="all">Alle Regionen</option>${state.regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}`;select.value=state.region}
  let grid=section.querySelector('.ec-member-final-grid');
  if(!grid){grid=document.createElement('div');grid.className='ec-member-final-grid';nativeGrid.insertAdjacentElement('afterend',grid)}
  return{shell,grid,nativeGrid};
}

function render(){
  if(!isMembers())return;
  const ui=ensureShell();if(!ui)return;
  const regionMap=new Map(state.regions.map(r=>[r.id,r])),q=state.query.trim().toLowerCase();
  const rows=state.profiles.filter(p=>{const hay=[p.nickname,p.first_name,p.last_name,regionMap.get(p.home_region_id)?.name].filter(Boolean).join(' ').toLowerCase();return(state.region==='all'||p.home_region_id===state.region)&&(!state.online||isOnline(p))&&(!q||hay.includes(q))}).sort((a,b)=>displayName(a).localeCompare(displayName(b),'de'));
  ui.shell.querySelector('.ec-member-total').textContent=`${state.profiles.length} Mitglieder gesamt`;
  ui.shell.querySelector('.ec-member-final-meta').textContent=`${rows.length} ${rows.length===1?'Mitglied':'Mitglieder'} gefunden · ${state.region==='all'?'alle Regionen':(regionMap.get(state.region)?.name||'Region')}${state.online?' · nur online':''}`;
  ui.grid.replaceChildren(...rows.map(p=>card(p,regionMap)));
  if(!rows.length){const e=document.createElement('div');e.className='ec-member-empty';e.innerHTML='<strong>Keine Mitglieder gefunden</strong><span>Ändere Suche oder Filter.</span>';ui.grid.appendChild(e)}
}

async function boot(){try{await load();render()}catch(e){console.warn('Mitgliedersuche konnte nicht geladen werden:',e)}}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(isMembers())render()},120)}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
