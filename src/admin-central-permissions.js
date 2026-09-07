import { supabase } from './supabaseClient';

let loading=false;
let rights={globalAdmin:false,regionalAdmin:false,forum:false,announcements:false};

const activeRegionSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const text=(node)=>String(node?.textContent||'').replace(/\s+/g,' ').trim();

function canShow(label){
  const l=label.toLowerCase();
  if(/mitglieder/.test(l))return rights.globalAdmin||rights.regionalAdmin;
  if(/meldungen/.test(l))return rights.globalAdmin||rights.regionalAdmin||rights.forum;
  if(/admin-forum|forum/.test(l))return rights.globalAdmin||rights.forum;
  if(/community/.test(l))return rights.globalAdmin||rights.regionalAdmin;
  if(/neuigkeiten/.test(l))return rights.globalAdmin||rights.regionalAdmin;
  if(/kontoschutz|verifiz/.test(l))return rights.globalAdmin;
  return rights.globalAdmin;
}

function modernize(){
  const root=document.querySelector('.admin-page');if(!root)return;
  const candidates=[...root.querySelectorAll('section,div')];
  const legacy=candidates.find(el=>/ADMIN-ZENTRALE/i.test(text(el))&&/Alles Wichtige auf einen Blick/i.test(text(el))&&el.querySelectorAll('button').length);
  if(!legacy||legacy.dataset.ecModernAdminCentral==='1')return;
  legacy.dataset.ecModernAdminCentral='1';
  legacy.classList.add('ec-admin-central-modern');
  const buttons=[...legacy.querySelectorAll('button')];
  buttons.forEach(button=>{
    const label=text(button);
    if(!canShow(label)){button.remove();return}
    button.classList.add('ec-admin-central-card');
    const normalized=label
      .replace(/^(👥|♟|⚑|⚐|🚩|▣|▤|✦|✨|▣|✓|✔|📰|🛡️)\s*/,'')
      .replace(/(Mitglieder|Meldungen|Admin-Forum|Community|Neuigkeiten|Kontoschutz)(.*)/i,'$1|$2');
    const [title,desc='']=normalized.split('|');
    const icon=/mitglieder/i.test(label)?'👥':/meldung/i.test(label)?'🚩':/forum/i.test(label)?'🛡️':/community/i.test(label)?'✨':/neuigkeit/i.test(label)?'📰':'✅';
    button.innerHTML=`<span class="ec-admin-central-icon" aria-hidden="true">${icon}</span><span class="ec-admin-central-copy"><strong>${title.trim()}</strong><small>${desc.trim()||'Verwaltungsbereich öffnen'}</small></span><span class="ec-admin-central-arrow" aria-hidden="true">›</span>`;
  });
  const heading=[...legacy.querySelectorAll('h1,h2,h3')].find(h=>/Alles Wichtige auf einen Blick/i.test(text(h)));
  const p=[...legacy.querySelectorAll('p')].find(p=>/Verwaltungsansicht|Navigation/i.test(text(p)));
  const head=heading?.parentElement;
  if(head){head.classList.add('ec-admin-central-head');if(p)p.textContent='Es werden nur Bereiche angezeigt, für die dein Konto aktuell berechtigt ist.'}
  const buttonParent=buttons.find(b=>b.isConnected)?.parentElement;
  if(buttonParent)buttonParent.classList.add('ec-admin-central-grid');
  if(!legacy.querySelector('.ec-admin-central-card')){
    const empty=document.createElement('p');empty.className='ec-admin-central-empty';empty.textContent='Für dein Konto sind in dieser Region derzeit keine zusätzlichen Verwaltungsbereiche freigeschaltet.';legacy.appendChild(empty);
  }
}

async function loadRights(){
  if(loading||!supabase)return;loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const [{data:profile},{data:regions},{data:assignments},{data:mods}]=await Promise.all([
      supabase.from('profiles').select('role,forum_moderator').eq('id',user.id).maybeSingle(),
      supabase.from('regions').select('id,slug').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true)
    ]);
    const role=String(profile?.role||'').toUpperCase();
    const globalAdmin=['HEAD_ADMIN','ADMIN'].includes(role);
    const activeRegion=(regions||[]).find(r=>r.slug===activeRegionSlug());
    const regionalAdmin=!!activeRegion&&(assignments||[]).some(a=>a.active&&a.region_id===activeRegion.id);
    const permissions=new Set((mods||[]).filter(m=>m.active&&(!activeRegion||m.region_id===activeRegion.id)).flatMap(m=>Array.isArray(m.permissions)?m.permissions:[]));
    rights={globalAdmin,regionalAdmin,forum:globalAdmin||!!profile?.forum_moderator||permissions.has('FORUM')||permissions.has('MODERATION'),announcements:globalAdmin||permissions.has('ANNOUNCEMENTS')};
    modernize();
  }catch(error){console.warn('Admin-Zentrale Rechte konnten nicht geladen werden:',error)}finally{loading=false}
}

function boot(){void loadRights();const observer=new MutationObserver(()=>{clearTimeout(window.__ecAdminCentralPermissions);window.__ecAdminCentralPermissions=setTimeout(modernize,100)});observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>void loadRights(),80))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
