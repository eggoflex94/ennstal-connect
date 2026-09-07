import { supabase } from './supabaseClient';

const STARS={ADMIN:'/role-star-red.svg',SUPPORTER:'/supporter-star.svg',BUSINESS:'/role-star-blue.svg'};
let profiles=[];
let regions=[];
let regionalAdmins=[];
let regionalModeration=[];
let loading=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const assignmentsFor=p=>regionalAdmins.filter(a=>a.user_id===p?.id&&a.active);
const activeRegion=()=>{const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';return regions.find(r=>r.slug===slug)||regions[0]||null};
const themeFor=(p,regionId=null)=>{const r=String(p?.role||'MEMBER').toUpperCase();if(r==='HEAD_ADMIN'||r==='ADMIN'||(regionId&&assignmentsFor(p).some(a=>a.region_id===regionId)))return'ADMIN';if(r==='SUPPORTER'||regionalModeration.some(a=>a.user_id===p?.id&&a.active&&(!regionId||a.region_id===regionId))||assignmentsFor(p).length)return'SUPPORTER';if(p?.account_badge==='BUSINESS')return'BUSINESS';return'MEMBER'};
const starFor=(p,regionId=null)=>STARS[themeFor(p,regionId)]||'';
const nick=p=>p?.nickname||'Mitglied';

async function loadProfiles(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const [{data:ps},{data:rs},{data:ras},{data:rms}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge,first_name,last_name,home_region_id').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('active',true)
    ]);
    profiles=ps||[];regions=rs||[];regionalAdmins=ras||[];regionalModeration=rms||[];
  }catch(e){console.warn('Personendarstellung konnte nicht geladen werden:',e)}
  finally{loading=false}
}

function findProfileFromText(text){
  const t=norm(text).toLowerCase();
  if(!t)return null;
  return profiles.find(p=>{
    const n=norm(p.nickname).toLowerCase();
    const full=norm([p.first_name,p.last_name].filter(Boolean).join(' ')).toLowerCase();
    return (n&&t.includes(n))||(full&&full.length>2&&t.includes(full));
  })||null;
}

function identityHTML(p){
  const region=activeRegion();
  const star=starFor(p,region?.id||null);
  return `<span class="ec-global-role-identity" data-profile-id="${esc(p.id)}">${star?`<img class="ec-global-role-star" src="${esc(star)}" alt="" aria-hidden="true">`:''}<strong>${esc(nick(p))}</strong></span>`;
}

function cleanCreatorOwnerRows(){
  const candidates=[...document.querySelectorAll('p,div,span,small,li')].filter(el=>{
    if(el.children.length>6)return false;
    const t=norm(el.textContent);
    return /(?:Erstellt von|Inhaber|Besitzer|Autor|Moderator|Moderation|Zuständig|Veranstalter)\s*:?/i.test(t)&&t.length<180;
  });

  candidates.forEach(el=>{
    if(el.dataset.ecIdentityPolished==='true')return;
    const text=norm(el.textContent);
    const p=findProfileFromText(text);
    if(!p)return;

    const labels=[];
    if(/Erstellt von/i.test(text))labels.push('Erstellt von');
    if(/Veranstalter/i.test(text))labels.push('Veranstalter');
    if(/Autor/i.test(text))labels.push('Autor');
    if(/Moderator|Moderation/i.test(text))labels.push('Moderation');
    if(/Zuständig/i.test(text))labels.push('Zuständig');
    if(/Inhaber|Besitzer/i.test(text))labels.push('Inhaber');
    const label=labels[0]||'';

    el.innerHTML=`${label?`<span class="ec-global-role-prefix">${esc(label)}</span>`:''}${identityHTML(p)}`;
    el.classList.add('ec-global-role-row');
    el.dataset.ecIdentityPolished='true';
  });
}

function removeDuplicateRoleLines(){
  document.querySelectorAll('article,section,.card,.group-card,.forum-card,.event-card,.news-card').forEach(box=>{
    const identities=[...box.querySelectorAll('.ec-global-role-identity')];
    if(!identities.length)return;
    identities.forEach(identity=>{
      const pid=identity.dataset.profileId;
      const p=profiles.find(x=>x.id===pid);
      if(!p)return;
      const n=nick(p);
      [...box.querySelectorAll('p,div,span,small')].forEach(el=>{
        if(el.closest('.ec-global-role-identity')||el.classList.contains('ec-global-role-row'))return;
        const t=norm(el.textContent);
        if(t.length>80)return;
        const roleWords=/^(?:★|☆)?\s*(?:Hauptadmin|Betreiber|Global Admin|Admin|Supporter|Regional Admin|Moderator|Mitglied|Unternehmenskonto)?\s*[:·-]?\s*/i;
        const stripped=t.replace(roleWords,'').trim();
        if(stripped===n&&el.children.length===0)el.classList.add('ec-global-role-duplicate');
      });
    });
  });
}

function stripWrittenRolesNearNames(){
  document.querySelectorAll('strong,b,span,small').forEach(el=>{
    if(el.closest('.ec-global-role-identity')||el.closest('.ec-role-person')||el.classList.contains('ec-compact-menu-label'))return;
    const t=norm(el.textContent);
    if(t.length>100)return;
    const p=findProfileFromText(t);
    if(!p)return;
    if(/Hauptadmin|Betreiber|Global Admin|Regional Admin|Supporter|Unternehmenskonto|Forum-Moderator|Gruppenmoderation|Moderator/i.test(t)){
      const cleaned=t.replace(/\b(Hauptadmin|Betreiber|Global Admin|Regional Admin(?:\s+[^·,|]+)?|Supporter|Unternehmenskonto|Forum-Moderator|Gruppenmoderation|Moderator)\b/gi,'').replace(/[·|]/g,' ').replace(/\s{2,}/g,' ').replace(/^[-:,\s]+|[-:,\s]+$/g,'');
      if(cleaned&&cleaned!==t)el.textContent=cleaned.includes(nick(p))?nick(p):cleaned;
    }
  });
}

function polish(){
  if(!profiles.length)return;
  cleanCreatorOwnerRows();
  removeDuplicateRoleLines();
  stripWrittenRolesNearNames();
}

async function boot(){
  await loadProfiles();
  polish();
  const obs=new MutationObserver(()=>{clearTimeout(window.__ecGlobalRolePolish);window.__ecGlobalRolePolish=setTimeout(polish,70)});
  obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  window.addEventListener('ec:region-change',async()=>{await loadProfiles();polish()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
