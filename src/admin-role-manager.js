import { supabase } from './supabaseClient';

const ADMIN_STAR='/role-star-red.svg';
const SUPPORTER_STAR='/supporter-star.svg';
const BUSINESS_STAR='/role-star-blue.svg';
let viewer=null;
let members=[];
let regions=[];
let assignments=[];
let moderation=[];
let loading=false;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const memberForCard=card=>{
  const id=card.dataset.ecMemberId;
  if(id)return members.find(m=>m.id===id)||null;
  const name=norm(card.querySelector('.admin-member-person-button strong')?.textContent);
  return members.find(m=>norm(m.nickname)===name)||null;
};
const assignedRegions=id=>assignments.filter(a=>a.user_id===id&&a.active).map(a=>a.region_id);
const moderationFor=id=>moderation.filter(a=>a.user_id===id&&a.active);
const regionName=id=>regions.find(r=>r.id===id)?.name||'Region';
const isRegionalAdmin=id=>assignedRegions(id).length>0;
const permissionLabels={FORUM:'Forum',GROUPS:'Gruppen',EVENTS:'Veranstaltungen',NEWS:'Neuigkeiten',HOMEPAGE:'Startseite',MEMBERS:'Mitglieder',BUSINESSES:'Unternehmenskonten',ANNOUNCEMENTS:'Community-Popups'};
const permissionLabel=p=>permissionLabels[String(p).toUpperCase()]||String(p);
const roleStar=member=>{
  const base=String(member?.role||'MEMBER').toUpperCase();
  if(base==='HEAD_ADMIN'||base==='ADMIN'||isRegionalAdmin(member?.id))return ADMIN_STAR;
  if(base==='SUPPORTER')return SUPPORTER_STAR;
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return BUSINESS_STAR;
  return'';
};
const overviewType=member=>{
  const base=String(member?.role||'MEMBER').toUpperCase();
  if(base==='HEAD_ADMIN'||base==='ADMIN'||isRegionalAdmin(member.id))return'admin';
  if(base==='SUPPORTER')return'supporter';
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return'business';
  return'member';
};

async function refresh(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const [{data:v},{data:ms},{data:rs},{data:as},{data:mods}]=await Promise.all([
      supabase.from('profiles').select('id,role,account_status').eq('id',user.id).maybeSingle(),
      supabase.from('profiles').select('id,nickname,role,account_badge,account_status').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('active',true)
    ]);
    viewer=v||null;members=ms||[];regions=rs||[];assignments=as||[];moderation=mods||[];
    decorate(true);
  }catch(error){console.warn('Rollenverwaltung konnte nicht geladen werden:',error)}
  finally{loading=false}
}

async function ensureSupporter(member){
  if(String(member.role||'MEMBER').toUpperCase()!=='MEMBER')return;
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:'SUPPORTER'});
  if(error)throw error;
}

async function setBaseRole(member,role,status){
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:role});
  if(error)throw error;
  status.textContent='Basisrolle gespeichert.';
}

async function setRegional(member,regionSlug,enabled,status){
  if(!regionSlug)throw new Error('Bitte Region wählen.');
  if(enabled)await ensureSupporter(member);
  const {error}=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:regionSlug,p_enabled:enabled});
  if(error)throw error;
  status.textContent=enabled?'Regionaladmin vergeben – Startseite, Neuigkeiten und Veranstaltungen sind für diese Region freigegeben. Weitere Rechte wie Community-Popups kannst du darunter gezielt aktivieren.':'Regionaladmin entfernt.';
}

async function setRegionalRights(member,regionSlugs,permissions,enabled,status){
  if(!permissions.length)throw new Error('Bitte mindestens ein Recht auswählen.');
  if(enabled)await ensureSupporter(member);
  for(const slug of regionSlugs){
    const {error}=await supabase.rpc('ec_set_regional_moderator',{p_target:member.id,p_region_slug:slug,p_permissions:permissions,p_enabled:enabled});
    if(error)throw error;
  }
  status.textContent=enabled?'Regionale Rechte gespeichert.':'Regionale Rechte entfernt.';
}

function currentRightsText(member){
  const rows=moderationFor(member.id);
  if(!rows.length)return'Keine zusätzlichen regionalen Rechte';
  const allRegionIds=new Set(regions.map(r=>r.id));
  const moderatedIds=new Set(rows.map(r=>r.region_id));
  const samePermissions=rows.length>0&&rows.every(r=>JSON.stringify([...(r.permissions||[])].sort())===JSON.stringify([...(rows[0].permissions||[])].sort()));
  if(allRegionIds.size&&moderatedIds.size===allRegionIds.size&&[...allRegionIds].every(id=>moderatedIds.has(id))&&samePermissions){
    return `Global: ${(rows[0].permissions||[]).map(permissionLabel).join(' · ')||'Rechte'}`;
  }
  return rows.map(row=>`${regionName(row.region_id)}: ${(row.permissions||[]).map(permissionLabel).join(' · ')||'Rechte'}`).join(' | ');
}

function decorateIdentity(card,member){
  card.dataset.ecMemberId=member.id;
  card.dataset.ecOverviewType=overviewType(member);
  const strong=card.querySelector('.admin-member-person-button strong');
  if(strong){
    const star=roleStar(member);
    strong.classList.add('ec-admin-member-identity');
    strong.innerHTML=`${star?`<img src="${esc(star)}" alt="" aria-hidden="true">`:''}<span>${esc(member.nickname||'Mitglied')}</span>`;
  }
  const infoRole=card.querySelector('.admin-member-card-info>div:first-child strong');
  if(infoRole){
    const base=String(member.role||'MEMBER').toUpperCase();
    const regional=assignedRegions(member.id).map(regionName);
    if(regional.length&&!['HEAD_ADMIN','ADMIN'].includes(base))infoRole.textContent=`Regional Admin · ${regional.join(', ')}`;
    else if(String(member.account_badge||'').toUpperCase()==='BUSINESS'&&base==='MEMBER')infoRole.textContent='Unternehmenskonto';
  }
}

function buildOverview(){
  const container=document.querySelector('.admin-member-cards');
  if(!container)return;
  let bar=document.querySelector('.ec-admin-role-overview');
  if(!bar){bar=document.createElement('section');bar.className='ec-admin-role-overview';container.before(bar)}
  const counts={all:members.length,admin:members.filter(m=>overviewType(m)==='admin').length,supporter:members.filter(m=>overviewType(m)==='supporter').length,business:members.filter(m=>overviewType(m)==='business').length,member:members.filter(m=>overviewType(m)==='member').length};
  bar.innerHTML=`<div><strong>Mitglieder & Rollen</strong><small>Nach Rolle filtern und regionale Rechte direkt verwalten.</small></div><div class="ec-admin-role-filters">${[['all','Alle'],['admin','Admins'],['supporter','Supporter'],['business','Unternehmen'],['member','Mitglieder']].map(([key,label])=>`<button type="button" data-filter="${key}"><span>${label}</span><b>${counts[key]}</b></button>`).join('')}</div>`;
  const apply=filter=>{
    container.dataset.ecRoleFilter=filter;
    container.querySelectorAll('.admin-member-card').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.ecOverviewType!==filter});
    bar.querySelectorAll('[data-filter]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.filter===filter));
  };
  bar.querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>apply(btn.dataset.filter));
  apply(container.dataset.ecRoleFilter||'all');
}

function buildManager(card,member,force=false){
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN'||String(member.role||'').toUpperCase()==='HEAD_ADMIN')return;
  if(force)card.querySelector(':scope > .ec-role-manager')?.remove();
  if(card.querySelector(':scope > .ec-role-manager'))return;

  const wrap=document.createElement('section');
  wrap.className='ec-role-manager';
  const assigned=assignedRegions(member.id);
  wrap.innerHTML=`<div class="ec-role-manager-head"><div><strong>Rollen & regionale Rechte</strong><small>Basisrolle, Regionaladmin und einzelne Regionsrechte getrennt steuern.</small></div></div>
    <div class="ec-role-manager-grid">
      <label><span>Basisrolle</span><select class="ec-base-role"><option value="MEMBER">Mitglied</option><option value="SUPPORTER">Supporter</option><option value="ADMIN">Global Admin</option></select></label>
      <label><span>Region</span><select class="ec-region-role"><option value="">Region wählen</option>${regions.map(r=>`<option value="${r.slug}">${esc(r.name)}</option>`).join('')}</select></label>
    </div>
    <div class="ec-role-manager-actions ec-role-basic-actions"><button type="button" data-action="base">Basisrolle speichern</button><button type="button" data-action="regional-on">Regional Admin vergeben</button><button type="button" data-action="regional-off">Regional Admin entfernen</button></div>
    <div class="ec-role-manager-current">${assigned.length?`Regional Admin: ${assigned.map(regionName).join(', ')} · Standardrechte: Startseite, Neuigkeiten, Veranstaltungen`:'Keine regionale Adminrolle'}</div>
    <div class="ec-moderation-manager">
      <div class="ec-moderation-title"><strong>Regionale Rechte</strong><small>Einzeln regional oder global über alle Regionen vergeben.</small></div>
      <div class="ec-moderation-permissions">
        <label><input type="checkbox" value="HOMEPAGE"> Startseite</label>
        <label><input type="checkbox" value="NEWS"> Neuigkeiten</label>
        <label><input type="checkbox" value="EVENTS"> Veranstaltungen</label>
        <label><input type="checkbox" value="ANNOUNCEMENTS"> Community-Popups</label>
        <label><input type="checkbox" value="FORUM"> Forum</label>
        <label><input type="checkbox" value="GROUPS"> Gruppen</label>
        <label><input type="checkbox" value="MEMBERS"> Mitglieder</label>
        <label><input type="checkbox" value="BUSINESSES"> Unternehmenskonten</label>
      </div>
      <div class="ec-role-manager-actions ec-moderation-actions"><button type="button" data-action="rights-region-on">Regional speichern</button><button type="button" data-action="rights-region-off">Regional entfernen</button><button type="button" data-action="rights-global-on">Global speichern</button><button type="button" data-action="rights-global-off">Global entfernen</button></div>
      <div class="ec-role-manager-current ec-moderation-current">${currentRightsText(member)}</div>
    </div>
    <p class="ec-role-manager-status" aria-live="polite"></p>`;

  const base=wrap.querySelector('.ec-base-role');
  base.value=['MEMBER','SUPPORTER','ADMIN'].includes(String(member.role||'').toUpperCase())?String(member.role).toUpperCase():'MEMBER';
  const status=wrap.querySelector('.ec-role-manager-status');
  const selectedPermissions=()=>[...wrap.querySelectorAll('.ec-moderation-permissions input:checked')].map(input=>input.value);
  const selectedRegion=()=>wrap.querySelector('.ec-region-role').value;
  wrap.querySelector('.ec-region-role').addEventListener('change',()=>{
    const region=regions.find(r=>r.slug===selectedRegion());
    const row=region?moderationFor(member.id).find(item=>item.region_id===region.id):null;
    const active=new Set(row?.permissions||[]);
    wrap.querySelectorAll('.ec-moderation-permissions input').forEach(input=>input.checked=active.has(input.value));
  });
  wrap.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;status.textContent='Wird gespeichert …';status.className='ec-role-manager-status';
    try{
      const action=button.dataset.action;
      if(action==='base')await setBaseRole(member,base.value,status);
      else if(action==='regional-on'||action==='regional-off')await setRegional(member,selectedRegion(),action==='regional-on',status);
      else {
        const global=action.includes('global');
        const enabled=action.endsWith('-on');
        const slugs=global?regions.map(r=>r.slug):[selectedRegion()].filter(Boolean);
        if(!slugs.length)throw new Error('Bitte Region wählen.');
        await setRegionalRights(member,slugs,selectedPermissions(),enabled,status);
      }
      status.classList.add('ok');
      await refresh();
      window.dispatchEvent(new CustomEvent('ec:region-change',{detail:{reason:'role-update'}}));
    }catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.';status.classList.add('bad')}
    finally{button.disabled=false}
  });
  card.appendChild(wrap);
}

function decorate(force=false){
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN')return;
  document.querySelectorAll('.admin-member-card').forEach(card=>{const member=memberForCard(card);if(member){decorateIdentity(card,member);buildManager(card,member,force)}});
  buildOverview();
}

function boot(){
  void refresh();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecAdminRoleManager);window.__ecAdminRoleManager=setTimeout(()=>decorate(false),80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(refresh,80));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();