import { supabase } from './supabaseClient';

let state={viewer:null,profiles:[],regions:[],assignments:[]};
let busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionName=id=>state.regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const activeRegion=()=>{const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region');return state.regions.find(r=>r.slug===slug)||state.regions.find(r=>r.id===state.viewer?.home_region_id)||state.regions[0]||null};
const isHead=()=>String(state.viewer?.role||'').toUpperCase()==='HEAD_ADMIN';

async function load(force=false){
  if(busy||(!force&&state.viewer&&state.profiles.length&&state.regions.length))return;busy=true;
  try{
    const [{data:{user}},{data:profiles},{data:regions},{data:assignments}]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('*').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    state.profiles=profiles||[];state.regions=regions||[];state.assignments=assignments||[];state.viewer=state.profiles.find(p=>p.id===user?.id)||null;
  }finally{busy=false}
}

function effectiveRole(member){
  const base=String(member?.role||'MEMBER').toUpperCase();
  const current=activeRegion();
  const assigned=state.assignments.filter(a=>a.user_id===member?.id&&a.active);
  const regionalHere=Boolean(current&&member?.home_region_id===current.id&&assigned.some(a=>a.region_id===current.id));
  if(base==='HEAD_ADMIN')return{theme:'admin',label:'Hauptadmin',star:'/role-star-red.svg'};
  if(base==='ADMIN')return{theme:'admin',label:'Global Admin',star:'/role-star-red.svg'};
  if(regionalHere)return{theme:'admin',label:`Regional Admin ${current.name}`,star:'/role-star-red.svg'};
  if(assigned.length)return{theme:'supporter',label:`Regional Admin ${assigned.map(a=>regionName(a.region_id)).join(', ')}`,star:'/supporter-star.svg'};
  if(base==='SUPPORTER')return{theme:'supporter',label:'Supporter',star:'/supporter-star.svg'};
  if(member?.account_badge==='BUSINESS')return{theme:'business',label:'Unternehmenskonto',star:'/role-star-blue.svg'};
  return{theme:'member',label:'Mitglied',star:'/role-star-member.svg'};
}

function forceCardTheme(card,role){
  const themes={
    admin:['linear-gradient(145deg,#ff334a 0%,#c70d25 30%,#72000f 62%,#1f0005 84%,#050505 100%)','#ff5367','#fff'],
    supporter:['linear-gradient(145deg,#ffe537 0%,#d6aa00 28%,#806000 58%,#241b00 82%,#050505 100%)','#ffd400','#050505'],
    business:['linear-gradient(145deg,#73cfff 0%,#1677c8 30%,#073c75 62%,#031b36 82%,#050505 100%)','#4eb8ff','#fff'],
    member:['linear-gradient(145deg,#f0f2f4 0%,#aeb7bf 28%,#65717c 58%,#2e353b 80%,#07090b 100%)','#c9d0d5','#111']
  };
  const [bg,border,nick]=themes[role.theme]||themes.member;
  card.style.setProperty('background',bg,'important');
  card.style.setProperty('background-image',bg,'important');
  card.style.setProperty('border-color',border,'important');
  const nickname=card.querySelector('.member-nickname');
  if(nickname){nickname.style.setProperty('color',nick,'important');nickname.style.setProperty('-webkit-text-fill-color',nick,'important');nickname.style.setProperty('text-shadow',nick==='#050505'||nick==='#111'?'none':'0 1px 2px rgba(0,0,0,.35)','important')}
}

function fixMemberCards(){
  document.querySelectorAll('article.member-card').forEach(card=>{
    const id=card.dataset.memberId;
    const name=(card.querySelector('.member-nickname')?.textContent||'').trim();
    const member=state.profiles.find(p=>p.id===id)||state.profiles.find(p=>p.nickname===name);
    if(!member)return;
    const role=effectiveRole(member);
    card.dataset.memberId=member.id;card.dataset.homeRegionId=member.home_region_id||'';card.dataset.effectiveRole=role.label;card.dataset.roleTheme=role.theme;
    card.classList.remove('admin','supporter','business','member','role-theme-admin','role-theme-supporter','role-theme-business','role-theme-member');
    card.classList.add(role.theme,`role-theme-${role.theme}`);
    forceCardTheme(card,role);
    const star=card.querySelector('.ec-card-badge-role-img');if(star)star.src=role.star;
  });
}

function fixBrand(){
  document.querySelectorAll('.ec-brand-logo').forEach(el=>{
    el.className='ec-brand-logo ec-production-brand';
    el.innerHTML='<span class="ec-production-mark">★</span><span class="ec-production-word"><span><b>ennstal</b><strong>connect</strong></span><small>REGIONAL. ECHT. GEMEINSAM.</small></span>';
  });
}

async function logout(){
  try{await supabase.auth.signOut();localStorage.removeItem('ec-active-region');sessionStorage.clear();window.location.replace('/')}catch(error){alert(`Abmelden fehlgeschlagen: ${error?.message||error}`)}
}

function cleanDock(){
  const dock=document.querySelector('.ec-right-dock');if(!dock)return;
  dock.scrollTop=0;
  const labels=[...dock.querySelectorAll('.ec-dock-section-label')];const seen=new Set();
  labels.forEach(label=>{const key=(label.textContent||'').trim().toUpperCase();if(seen.has(key)){const block=label.closest('.ec-stable-admin-dock,.ec-dock-admin-recovery,.ec-dock-admin-slot');if(block)block.remove();else label.remove()}else seen.add(key)});
  let logoutButton=dock.querySelector('.ec-logout,.ec-production-logout');
  if(!logoutButton){logoutButton=document.createElement('button');logoutButton.type='button';logoutButton.className='ec-production-logout';logoutButton.innerHTML='<b>↪</b><span>Abmelden</span>';dock.appendChild(logoutButton)}
  logoutButton.onclick=e=>{e.preventDefault();e.stopPropagation();logout()};
}

function fixProfiles(){
  document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(root=>{
    const launch=root.querySelector(':scope > .ec-launch-profile');
    const stable=root.querySelector(':scope > .ec-stable-profile-card');
    if(launch){root.classList.add('ec-production-profile');return}
    if(stable){root.classList.add('ec-production-profile');stable.classList.add('ec-production-profile-card')}
  });
}

function fixOwnProfileEditor(){
  document.querySelectorAll('.profile-page-layout,.my-area-layout,.profile-form.profile-editor').forEach(el=>el.classList.add('ec-production-editor'));
}

async function run(){await load();fixBrand();fixMemberCards();cleanDock();fixProfiles();fixOwnProfileEditor()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('ec:region-change',()=>setTimeout(()=>{state.viewer=null;run()},30));
window.addEventListener('DOMContentLoaded',run);run();
