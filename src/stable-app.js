import { supabase } from './supabaseClient';

let viewer=null,profiles=[],regions=[],regionalAdmins=[],running=false,queued=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const regionName=id=>regions.find(r=>r.id===id)?.name||'Nicht festgelegt';
const isHead=()=>String(viewer?.role||'').toUpperCase()==='HEAD_ADMIN';
const fmtDate=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-AT')};
const age=v=>{if(!v)return'';const b=new Date(v),n=new Date();if(Number.isNaN(b.getTime()))return'';let a=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--;return `${a} Jahre`};

async function loadContext(force=false){
  if(!force&&viewer&&profiles.length&&regions.length)return;
  const [{data:{user}},{data:ps},{data:rs},{data:ra}]=await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('*').eq('account_status','ACTIVE').order('nickname'),
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
  ]);
  profiles=ps||[];regions=rs||[];regionalAdmins=ra||[];viewer=profiles.find(p=>p.id===user?.id)||null;
}

function activeRegion(){
  const slug=document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region');
  return regions.find(r=>r.slug===slug)||regions.find(r=>r.id===viewer?.home_region_id)||regions[0]||null;
}

function assignmentsFor(member){return regionalAdmins.filter(a=>a.user_id===member?.id&&a.active)}
function effectiveRole(member){
  const base=String(member?.role||'MEMBER').toUpperCase(),current=activeRegion(),assigned=assignmentsFor(member);
  const regionalHere=Boolean(current&&member?.home_region_id===current.id&&assigned.some(a=>a.region_id===current.id));
  if(base==='HEAD_ADMIN')return{theme:'admin',label:'Hauptadmin · Betreiber',profile:'★ Hauptadmin · Betreiber',star:'/role-star-red.svg'};
  if(base==='ADMIN')return{theme:'admin',label:'Global Admin',profile:'★ Global Admin',star:'/role-star-red.svg'};
  if(regionalHere)return{theme:'admin',label:`Regional Admin ${current.name}`,profile:`★ Regional Admin ${current.name}`,star:'/role-star-red.svg'};
  if(assigned.length)return{theme:'supporter',label:'Supporter',profile:`★ Regional Admin ${assigned.map(a=>regionName(a.region_id)).join(', ')}`,star:'/supporter-star.svg'};
  if(base==='SUPPORTER')return{theme:'supporter',label:'Supporter',profile:'★ Supporter',star:'/supporter-star.svg'};
  if(member?.account_badge==='BUSINESS')return{theme:'business',label:'Unternehmenskonto',profile:'Unternehmenskonto',star:'/role-star-blue.svg'};
  return{theme:'member',label:'Mitglied',profile:'Mitglied',star:'/role-star-member.svg'};
}

function ensureBranding(){
  document.querySelectorAll('.ec-brand-logo').forEach(brand=>{
    if(brand.dataset.ecBrand==='2026'&&brand.querySelector('img.ec-standard-logo'))return;
    brand.dataset.ecBrand='2026';
    brand.innerHTML='<img class="ec-standard-logo" src="/ennstal-connect-brand-2026.svg" alt="Ennstal Connect">';
  });
  document.querySelectorAll('img[src*="admin-crown"],img[src*="Admin-crown"]').forEach(img=>img.remove());
}

function syncCard(card,member){
  const role=effectiveRole(member);
  card.dataset.memberId=member.id;card.dataset.homeRegionId=member.home_region_id||'';card.dataset.roleTheme=role.theme;card.dataset.effectiveRole=role.label;
  card.classList.remove('admin','supporter','business','member','role-theme-admin','role-theme-supporter','role-theme-business','role-theme-member');
  card.classList.add(role.theme,`role-theme-${role.theme}`);
  const star=card.querySelector('.ec-card-badge-role-img');if(star&&star.getAttribute('src')!==role.star)star.src=role.star;
  const nick=card.querySelector('.member-nickname');if(nick){nick.style.removeProperty('color');nick.style.removeProperty('-webkit-text-fill-color');nick.style.removeProperty('text-shadow')}
}

function allRegionsMode(region){return Boolean(document.querySelector('.ec-all-regions-toggle')?.textContent?.includes(`Nur ${region.name}`))}
function findMemberForCard(card){
  const id=card.dataset.memberId;if(id){const p=profiles.find(x=>x.id===id);if(p)return p}
  const name=(card.querySelector('.member-nickname')?.textContent||card.querySelector('strong')?.textContent||'').trim();
  return profiles.find(x=>x.nickname===name)||profiles.find(x=>[x.first_name,x.last_name].filter(Boolean).join(' ')===name)||null;
}

function ensureMembersToolbar(){
  const grid=document.querySelector('.member-grid,.members-grid,.ec-final-member-grid');if(!grid)return;
  let bar=document.querySelector('.ec-stable-member-toolbar');if(!bar){bar=document.createElement('div');bar.className='ec-stable-member-toolbar';grid.before(bar)}
  const region=activeRegion(),nativeSearch=[...document.querySelectorAll('input')].find(i=>/mitglied/i.test(i.placeholder||''));if(nativeSearch)nativeSearch.classList.add('ec-native-member-search');
  const mode=allRegionsMode(region);
  bar.innerHTML=`<label><span>Mitglied suchen</span><input type="search" placeholder="Name oder Nickname" value="${esc(nativeSearch?.value||'')}"></label><label><span>Region</span><select>${regions.map(r=>`<option value="${r.slug}" ${r.id===region?.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button type="button">${mode?`Nur ${esc(region?.name||'Region')}`:'Alle Regionen durchsuchen'}</button>`;
  bar.querySelector('input').oninput=e=>{if(!nativeSearch)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;setter?.call(nativeSearch,e.target.value);nativeSearch.dispatchEvent(new Event('input',{bubbles:true}));nativeSearch.dispatchEvent(new Event('change',{bubbles:true}))};
  bar.querySelector('select').onchange=e=>{const native=document.querySelector('.ec-region-picker select');if(native){native.value=e.target.value;native.dispatchEvent(new Event('change',{bubbles:true}))}};
  bar.querySelector('button').onclick=()=>document.querySelector('.ec-all-regions-toggle')?.click();
}

function syncMemberDirectory(){
  const region=activeRegion();if(!region)return;const all=allRegionsMode(region);
  document.querySelectorAll('.member-grid .member-card,.members-grid .member-card,.ec-final-member-grid .member-card').forEach(card=>{
    const member=findMemberForCard(card);if(!member)return;syncCard(card,member);card.hidden=all?false:member.home_region_id!==region.id;
  });
  ensureMembersToolbar();
}

function ensureHome(){
  const root=document.querySelector('.home-page');if(!root)return;
  let home=root.querySelector(':scope > .ec-stable-home');if(home)return;
  const region=activeRegion();
  home=document.createElement('section');home.className='ec-stable-home';
  home.innerHTML=`<div class="ec-stable-home-hero"><div><span>DEINE REGION</span><h1>${esc(region?.name||'Ennstal')} verbindet Menschen.</h1><p>Alles Wichtige aus deiner Community: Mitglieder, Forum, Gruppen, Events, Neuigkeiten und Betriebe – regional, übersichtlich und gemeinsam.</p></div><aside><small>Aktive Region</small><strong>${esc(region?.name||'Region')}</strong><em>${region?.id===viewer?.home_region_id?'Deine Heimatregion':'Du besuchst diese Region'}</em></aside></div><div class="ec-stable-home-links"><button data-go="Mitglieder"><b>Mitglieder</b><span>Menschen aus der Region finden</span></button><button data-go="Forum"><b>Forum</b><span>Regional austauschen</span></button><button data-go="Gruppen"><b>Gruppen</b><span>Gemeinsam organisieren</span></button><button data-go="Events"><b>Events</b><span>Veranstaltungen entdecken</span></button><button data-go="Neuigkeiten"><b>Neuigkeiten</b><span>Aktuelles aus ${esc(region?.name||'der Region')}</span></button><button data-go="Betriebe"><b>Betriebe</b><span>Regionale Unternehmen</span></button></div>`;
  [...root.children].forEach(child=>{if(child!==home)child.classList.add('ec-stable-home-hidden')});root.prepend(home);
  home.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{const label=button.dataset.go;[...document.querySelectorAll('.ec-top-nav button')].find(b=>(b.textContent||'').includes(label))?.click()});
}

function memberFromProfilePage(root){
  const title=(root.querySelector('.member-profile-hero h1,.ec-stable-name')?.textContent||'').trim();
  return profiles.find(p=>p.nickname===title)||profiles.find(p=>[p.first_name,p.last_name].filter(Boolean).join(' ')===title)||null;
}
async function areFriends(member){if(!viewer?.id||viewer.id===member.id)return false;const{data}=await supabase.from('friendships').select('id').eq('status','ACCEPTED').or(`and(requester_id.eq.${viewer.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${viewer.id})`).limit(1);return Boolean(data?.length)}
function privacyAllows(member,field,isFriend){if(viewer?.id===member.id||['HEAD_ADMIN','ADMIN'].includes(String(viewer?.role||'').toUpperCase()))return true;const value=String(member?.privacy_settings?.[field]||'PUBLIC').toUpperCase();return value==='PUBLIC'||(value==='FRIENDS'&&isFriend)}
function row(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return`<div class="ec-stable-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`}

function closeModal(){document.querySelector('.ec-admin-direct-modal')?.remove();document.querySelector('.ec-stable-admin-modal')?.remove()}
async function saveMemberAction(member,action,slug,status){
  if(action==='home'){const{error}=await supabase.rpc('ec_head_set_home_region',{p_target:member.id,p_region_slug:slug});if(error)throw error}
  if(action==='regional-on'||action==='regional-off'){const{error}=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:slug,p_enabled:action==='regional-on'});if(error)throw error}
  if(action==='global-on'||action==='global-off'){const{error}=await supabase.rpc('ec_set_global_admin',{p_target:member.id,p_enabled:action==='global-on'});if(error)throw error}
  if(action==='demote'){const{error}=await supabase.rpc('ec_demote_global_to_regional_admin',{p_target:member.id,p_region_slug:slug});if(error)throw error}
  status.textContent='Gespeichert.';status.className='ec-admin-direct-status success';await loadContext(true);
}

async function openMemberAdmin(member){
  if(!isHead())return;closeModal();const assigned=assignmentsFor(member);const modal=document.createElement('div');modal.className='ec-stable-admin-modal';
  modal.innerHTML=`<div class="ec-stable-admin-dialog"><header class="ec-stable-admin-head"><div><span>HEAD ADMIN</span><h2>${esc(member.nickname||'Mitglied')} verwalten</h2><p>Heimatregion und Rollen</p></div><button type="button" class="ec-stable-admin-close" aria-label="Schließen">×</button></header><div class="ec-stable-admin-summary"><b>Funktion</b><span>${esc(effectiveRole(member).profile)}</span><b>Heimatregion</b><span>${esc(regionName(member.home_region_id))}</span><b>Regional Admin</b><span>${assigned.length?assigned.map(a=>esc(regionName(a.region_id))).join(', '):'Keine'}</span></div><div class="ec-stable-admin-form"><label>Heimatregion<select class="ec-home">${regions.map(r=>`<option value="${r.slug}" ${r.id===member.home_region_id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><button data-a="home">Heimatregion speichern</button><label>Region für Adminrechte<select class="ec-region"><option value="">Region wählen</option>${regions.map(r=>`<option value="${r.slug}">${esc(r.name)}</option>`).join('')}</select></label><div class="ec-stable-admin-buttons"><button data-a="regional-on">Regional Admin vergeben</button><button data-a="regional-off">Regional Admin entfernen</button></div>${String(member.role||'').toUpperCase()==='ADMIN'?'<button data-a="demote">Global Admin → Regional Admin</button><button data-a="global-off">Global Admin entfernen</button>':'<button data-a="global-on">Global Admin vergeben</button>'}</div><div class="ec-admin-direct-status"></div></div>`;
  document.body.appendChild(modal);modal.querySelector('.ec-stable-admin-close').onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};
  const status=modal.querySelector('.ec-admin-direct-status');modal.querySelector('.ec-stable-admin-form').onclick=async e=>{const action=e.target?.dataset?.a;if(!action)return;const slug=(action==='home'?modal.querySelector('.ec-home'):modal.querySelector('.ec-region')).value;if(!['global-on','global-off'].includes(action)&&!slug){status.textContent='Bitte Region auswählen.';return}e.target.disabled=true;status.textContent='Wird gespeichert …';try{await saveMemberAction(member,action,slug,status);setTimeout(()=>openMemberAdmin(profiles.find(p=>p.id===member.id)||member),250)}catch(error){status.textContent=error.message||'Speichern fehlgeschlagen';status.className='ec-admin-direct-status error'}finally{e.target.disabled=false}};
}

async function openAdminCenter(regionsOnly=false){
  if(!isHead())return;await loadContext(true);closeModal();const modal=document.createElement('div');modal.className='ec-admin-direct-modal';
  modal.innerHTML=`<div class="ec-admin-direct-box"><header class="ec-admin-direct-head"><div><span>HEAD ADMIN</span><h2>${regionsOnly?'Regionen & Rechte':'Admin-Zentrale'}</h2><p>Mitglieder, Heimatregionen und Rollen direkt verwalten.</p></div><button type="button" class="ec-admin-direct-close" aria-label="Schließen">×</button></header><div class="ec-admin-direct-toolbar"><input type="search" placeholder="Mitglied suchen …"><select><option value="">Alle Regionen</option>${regions.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div><div class="ec-admin-direct-list"></div></div>`;
  document.body.appendChild(modal);modal.querySelector('.ec-admin-direct-close').onclick=closeModal;modal.onclick=e=>{if(e.target===modal)closeModal()};
  const input=modal.querySelector('input'),filter=modal.querySelector('select'),list=modal.querySelector('.ec-admin-direct-list');
  const render=()=>{const q=input.value.trim().toLowerCase(),rid=filter.value;const items=profiles.filter(p=>p.id!==viewer?.id).filter(p=>(!rid||p.home_region_id===rid)&&(!q||`${p.nickname||''} ${p.first_name||''} ${p.last_name||''}`.toLowerCase().includes(q)));list.innerHTML=items.map(p=>`<article data-id="${p.id}"><div><strong>${esc(p.nickname||[p.first_name,p.last_name].filter(Boolean).join(' ')||'Mitglied')}</strong><small>${esc(effectiveRole(p).profile)} · ${esc(regionName(p.home_region_id))}</small></div><button type="button">Verwalten</button></article>`).join('')||'<p>Keine Mitglieder gefunden.</p>';list.querySelectorAll('article button').forEach(button=>button.onclick=()=>openMemberAdmin(profiles.find(p=>p.id===button.closest('article').dataset.id)))};
  input.oninput=render;filter.onchange=render;render();
}

async function enhanceMemberProfile(root){
  if(root.dataset.ecStableProfile==='1')return;const hero=root.querySelector(':scope > .member-profile-hero');if(!hero)return;const member=memberFromProfilePage(root);if(!member)return;
  root.dataset.ecStableProfile='1';root.classList.add('ec-stable-profile-page');const friend=await areFriends(member),avatar=hero.querySelector('img'),sourceActions=root.querySelector(':scope > .member-profile-actions'),sourceAdmin=root.querySelector(':scope > .member-admin-tools'),roleInfo=effectiveRole(member);
  const layout=document.createElement('section');layout.className='ec-stable-profile-card';const left=document.createElement('div');left.className='ec-stable-profile-left';const photo=document.createElement('div');photo.className='ec-stable-photo';if(avatar)photo.appendChild(avatar);left.appendChild(photo);
  const role=document.createElement('div');role.className=`ec-stable-role role-${roleInfo.theme}`;role.innerHTML=`<span>FUNKTION</span><strong>${esc(roleInfo.profile)}</strong><small>Heimatregion: ${esc(regionName(member.home_region_id))}</small>`;left.appendChild(role);
  const actions=document.createElement('div');actions.className='ec-stable-actions';if(sourceActions){[...sourceActions.querySelectorAll('button')].forEach(button=>{button.classList.add('ec-stable-action');button.textContent=(button.textContent||'').replace(/[💬🤝♥✓⏳🚫🚩]/g,'').replace(/\s+/g,' ').trim();actions.appendChild(button)});sourceActions.hidden=true}left.appendChild(actions);if(isHead()){const admin=document.createElement('button');admin.type='button';admin.className='ec-stable-admin-toggle';admin.textContent='Admin Tools';admin.onclick=()=>openMemberAdmin(member);left.appendChild(admin)}
  const rows=[row('Nickname',member.nickname)];if(privacyAllows(member,'name',friend))rows.push(row('Vorname',member.first_name),row('Nachname',member.last_name));if(privacyAllows(member,'birth_date',friend))rows.push(row('Geburtsdatum',fmtDate(member.birth_date)),row('Alter',age(member.birth_date)));if(privacyAllows(member,'location',friend))rows.push(row('Wohnort',member.location));rows.push(row('Heimatregion',regionName(member.home_region_id)));
  const data=document.createElement('div');data.className='ec-stable-profile-data';data.innerHTML=`<div class="ec-stable-data-head"><div><span>MITGLIEDSPROFIL</span><h1 class="ec-stable-name">${esc(member.nickname||'Mitglied')}</h1></div>${member.is_verified?'<b title="Verifiziert">✓</b>':''}</div><div class="ec-stable-data-grid">${rows.join('')}</div>`;layout.append(left,data);root.insertBefore(layout,hero);hero.hidden=true;if(sourceAdmin)sourceAdmin.hidden=true;
  if(member.bio&&privacyAllows(member,'bio',friend)){const more=document.createElement('section');more.className='ec-stable-more ec-stable-section';more.innerHTML=`<span>ÜBER MICH</span><h2>Über ${esc(member.nickname||'dieses Mitglied')}</h2><p>${esc(member.bio)}</p>`;layout.after(more)}
}

function ensureDock(){
  const dock=document.querySelector('.ec-right-dock');if(!dock)return;
  dock.querySelectorAll('.ec-dock-admin-slot,.ec-dock-admin-recovery,.ec-production-logout,.ec-stable-admin-dock').forEach(el=>el.remove());
  if(isHead()){
    const box=document.createElement('div');box.className='ec-stable-admin-dock';box.innerHTML='<div class="ec-dock-divider"></div><div class="ec-dock-section-label">VERWALTUNG</div><button data-a="center"><b>⚙</b><span>Admin-Zentrale</span></button><button data-a="regions"><b>⌖</b><span>Regionen & Rechte</span></button>';
    const community=[...dock.querySelectorAll('.ec-dock-section-label')].find(x=>/COMMUNITY/i.test(x.textContent||''));dock.insertBefore(box,community||null);box.querySelector('[data-a="center"]').onclick=()=>openAdminCenter(false);box.querySelector('[data-a="regions"]').onclick=()=>openAdminCenter(true);
  }
  let logout=dock.querySelector('.ec-logout,.ec-stable-logout');if(!logout){logout=document.createElement('button');logout.type='button';logout.className='ec-stable-logout';logout.innerHTML='<b>↪</b><span>Abmelden</span>';dock.appendChild(logout)}
  logout.onclick=async e=>{e.preventDefault();e.stopPropagation();logout.disabled=true;try{await supabase.auth.signOut();localStorage.removeItem('ec-active-region');sessionStorage.clear();location.replace('/')}catch(error){logout.disabled=false;alert(`Abmelden fehlgeschlagen: ${error.message||error}`)}};
}

function normalizePages(){document.querySelectorAll('.forum-page,.groups-page,.news-page,.events-page,.community-page,.ads-page,.profile-page-layout,.my-area-layout').forEach(root=>root.classList.add('ec-stable-page'))}

async function run(){
  if(running)return;running=true;
  try{await loadContext();ensureBranding();ensureHome();syncMemberDirectory();ensureDock();normalizePages();document.querySelectorAll('.member-profile-page:not(.public-profile-preview)').forEach(root=>void enhanceMemberProfile(root))}finally{running=false}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;void run()})}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>setTimeout(()=>{document.querySelector('.ec-stable-home')?.remove();document.querySelectorAll('.ec-stable-home-hidden').forEach(x=>x.classList.remove('ec-stable-home-hidden'));void loadContext(true).then(run)},40));
window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
window.addEventListener('DOMContentLoaded',run);void run();