import { supabase } from './supabaseClient';

let state={viewer:null,profiles:[],regions:[],assignments:[]};
let running=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionName=id=>state.regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const activeRegion=()=>{const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region');return state.regions.find(r=>r.slug===slug)||state.regions.find(r=>r.id===state.viewer?.home_region_id)||state.regions[0]||null};
const isHead=()=>String(state.viewer?.role||'').toUpperCase()==='HEAD_ADMIN';
const profileByCard=card=>{const id=card.dataset.memberId;if(id)return state.profiles.find(p=>p.id===id)||null;const name=(card.querySelector('.member-nickname')?.textContent||'').trim();return state.profiles.find(p=>p.nickname===name)||null};

async function load(force=false){
  if(running||(!force&&state.viewer&&state.regions.length&&state.profiles.length))return;running=true;
  try{
    const [{data:{user}},{data:profiles},{data:regions},{data:assignments}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('*').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    state.profiles=profiles||[];state.regions=regions||[];state.assignments=assignments||[];state.viewer=state.profiles.find(p=>p.id===user?.id)||null;
  }finally{running=false}
}

function roleInfo(member){
  const base=String(member?.role||'MEMBER').toUpperCase();
  const current=activeRegion();
  const assigned=state.assignments.filter(a=>a.user_id===member?.id&&a.active);
  const assignedHere=Boolean(current&&assigned.some(a=>a.region_id===current.id));
  if(base==='HEAD_ADMIN')return{theme:'admin',star:'/role-star-red.svg',card:'Hauptadmin',profile:'★ Hauptadmin'};
  if(base==='ADMIN')return{theme:'admin',star:'/role-star-red.svg',card:'Global Admin',profile:'★ Global Admin'};
  if(assignedHere)return{theme:'admin',star:'/role-star-red.svg',card:`Regional Admin ${current.name}`,profile:`★ Regional Admin ${current.name}`};
  if(assigned.length)return{theme:'supporter',star:'/supporter-star.svg',card:'Supporter',profile:`★ Regional Admin ${assigned.map(a=>regionName(a.region_id)).join(', ')}`};
  if(base==='SUPPORTER')return{theme:'supporter',star:'/supporter-star.svg',card:'Supporter',profile:'★ Supporter'};
  if(member?.account_badge==='BUSINESS')return{theme:'business',star:'/role-star-blue.svg',card:'Unternehmenskonto',profile:'Unternehmenskonto'};
  return{theme:'member',star:'/role-star-member.svg',card:'Mitglied',profile:'Mitglied'};
}

function fixRegionalCards(){
  document.querySelectorAll('article.member-card').forEach(card=>{
    const member=profileByCard(card);if(!member)return;
    const info=roleInfo(member);
    card.dataset.memberId=member.id;card.dataset.homeRegionId=member.home_region_id||'';card.dataset.roleTheme=info.theme;card.dataset.effectiveRole=info.card;
    card.classList.remove('role-theme-admin','role-theme-supporter','role-theme-business','role-theme-member','admin','supporter','business','member');
    card.classList.add(`role-theme-${info.theme}`,info.theme);
    const star=card.querySelector('.ec-card-badge-role-img');if(star)star.src=info.star;
    const nick=card.querySelector('.member-nickname');if(nick&&info.theme==='supporter'){nick.style.setProperty('color','#050505','important');nick.style.setProperty('-webkit-text-fill-color','#050505','important');nick.style.setProperty('text-shadow','none','important')}
  });
}

function fixBrand(){
  document.querySelectorAll('.ec-brand-logo').forEach(el=>{
    el.classList.add('ec-launch-brand');
    el.innerHTML='<span class="ec-launch-mark">★</span><span class="ec-launch-word"><b>ennstal</b><strong>connect</strong><small>REGIONAL. ECHT. GEMEINSAM.</small></span>';
  });
}

function clickNav(label){const b=[...document.querySelectorAll('.ec-top-nav button')].find(x=>(x.textContent||'').includes(label));b?.click()}

function fixHome(){
  const root=document.querySelector('.home-page');if(!root)return;
  let shell=root.querySelector(':scope > .ec-launch-home');if(shell)return;
  const r=activeRegion();
  shell=document.createElement('section');shell.className='ec-launch-home';
  shell.innerHTML=`<div class="ec-launch-home-head"><div><span>DEINE REGION</span><h1>${esc(r?.name||'Ennstal')} verbindet.</h1><p>Mitglieder, Forum, Gruppen, Veranstaltungen, Neuigkeiten und Betriebe aus deiner aktiven Region – übersichtlich an einem Ort.</p></div><div class="ec-launch-region"><small>Aktive Region</small><strong>${esc(r?.name||'Region')}</strong><span>${r?.id===state.viewer?.home_region_id?'Deine Heimatregion':'Du siehst diese Region'}</span></div></div><div class="ec-launch-home-grid"><button data-go="Mitglieder"><b>Mitglieder</b><span>Menschen aus ${esc(r?.name||'deiner Region')}</span></button><button data-go="Forum"><b>Forum</b><span>Regional diskutieren</span></button><button data-go="Gruppen"><b>Gruppen</b><span>Gemeinsam organisieren</span></button><button data-go="Events"><b>Events</b><span>Regionale Termine</span></button><button data-go="Neuigkeiten"><b>Neuigkeiten</b><span>Aktuelles aus der Region</span></button><button data-go="Betriebe"><b>Betriebe</b><span>Regionale Unternehmen</span></button></div>`;
  [...root.children].forEach(ch=>{if(ch!==shell)ch.classList.add('ec-launch-hidden-home')});root.prepend(shell);shell.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>clickNav(b.dataset.go));
}

function findProfile(root){
  const title=(root.querySelector('.member-profile-hero h1,.ec-stable-name')?.textContent||'').trim();
  if(title){const p=state.profiles.find(x=>x.nickname===title)||state.profiles.find(x=>[x.first_name,x.last_name].filter(Boolean).join(' ')===title);if(p)return p}
  const text=(root.textContent||'').toLowerCase();return state.profiles.find(p=>p.nickname&&text.includes(String(p.nickname).toLowerCase()))||null;
}
const fmtDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-AT')};
const fmtAge=v=>{if(!v)return'';const b=new Date(v),n=new Date();if(Number.isNaN(b.getTime()))return'';let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};

function fixProfiles(){
  document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(root=>{
    if(root.dataset.ecLaunchFixed==='1')return;const member=findProfile(root);if(!member)return;root.dataset.ecLaunchFixed='1';
    const info=roleInfo(member);const hero=root.querySelector(':scope > .member-profile-hero');const oldActions=root.querySelector(':scope > .member-profile-actions');const avatar=hero?.querySelector('img');
    const shell=document.createElement('section');shell.className='ec-launch-profile';
    shell.innerHTML=`<div class="ec-launch-profile-left"><div class="photo"></div><div class="role"><span>FUNKTION</span><strong>${esc(info.profile)}</strong><small>Heimatregion: ${esc(regionName(member.home_region_id))}</small></div><div class="actions"></div></div><div class="ec-launch-profile-data"><header><span>MITGLIEDSPROFIL</span><h1>${esc(member.nickname||'Mitglied')}</h1></header><div class="data"><div><small>Nickname</small><strong>${esc(member.nickname||'')}</strong></div><div><small>Vorname</small><strong>${esc(member.first_name||'')}</strong></div><div><small>Nachname</small><strong>${esc(member.last_name||'')}</strong></div><div><small>Geburtsdatum</small><strong>${esc(fmtDate(member.birth_date))}</strong></div><div><small>Alter</small><strong>${esc(fmtAge(member.birth_date))}</strong></div><div><small>Wohnort</small><strong>${esc(member.location||'')}</strong></div><div><small>Heimatregion</small><strong>${esc(regionName(member.home_region_id))}</strong></div></div>${member.bio?`<section class="about"><span>ÜBER MICH</span><p>${esc(member.bio)}</p></section>`:''}</div>`;
    if(avatar)shell.querySelector('.photo').appendChild(avatar);
    if(oldActions)[...oldActions.querySelectorAll('button')].forEach(b=>shell.querySelector('.actions').appendChild(b));
    [...root.children].forEach(ch=>{if(ch!==shell)ch.classList.add('ec-launch-hide-profile')});root.prepend(shell);
  });
}

function cleanDock(){
  const dock=document.querySelector('.ec-right-dock');if(!dock)return;
  dock.scrollTop=0;dock.style.setProperty('overflow','visible','important');dock.style.setProperty('max-height','none','important');
}

async function run(){await load();fixBrand();fixRegionalCards();fixHome();fixProfiles();cleanDock()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('ec:region-change',()=>setTimeout(()=>{document.querySelector('.ec-launch-home')?.remove();document.querySelectorAll('.ec-launch-hidden-home').forEach(x=>x.classList.remove('ec-launch-hidden-home'));run()},30));
window.addEventListener('DOMContentLoaded',run);run();