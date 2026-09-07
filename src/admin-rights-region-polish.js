import { supabase } from './supabaseClient';

let members=[];
let regions=[];
let assignments=[];
let loading=false;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const activeRegion=()=>{
  const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
  return regions.find(r=>r.slug===slug)||regions[0]||null;
};
const memberByName=name=>members.find(m=>norm(m.nickname)===norm(name))||null;
const assignmentsFor=id=>assignments.filter(a=>a.user_id===id&&a.active);

function effectiveRole(member,region){
  const base=String(member?.role||'MEMBER').toUpperCase();
  if(base==='HEAD_ADMIN')return'Hauptadmin';
  if(base==='ADMIN')return'Community Admin';
  const regional=region&&assignmentsFor(member?.id).some(a=>a.region_id===region.id);
  if(regional)return`Regional Admin · ${region.name}`;
  if(base==='SUPPORTER')return'Supporter';
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return'Unternehmenskonto';
  return'Mitglied';
}

function effectiveTheme(member,region){
  const base=String(member?.role||'MEMBER').toUpperCase();
  if(base==='HEAD_ADMIN'||base==='ADMIN')return'admin';
  if(region&&assignmentsFor(member?.id).some(a=>a.region_id===region.id))return'admin';
  if(base==='SUPPORTER')return'supporter';
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return'business';
  return'member';
}

function decorateCard(card){
  const name=card.querySelector('.admin-member-person-button strong')?.textContent;
  const member=memberByName(name);
  if(!member)return;
  const region=activeRegion();
  const roleText=effectiveRole(member,region);
  const theme=effectiveTheme(member,region);

  card.dataset.ecEffectiveRole=roleText;
  card.dataset.ecEffectiveTheme=theme;
  card.classList.toggle('ec-regional-admin-card',roleText.startsWith('Regional Admin'));

  const personSubtitle=card.querySelector('.admin-member-person-button small');
  if(personSubtitle){
    const flags=[];
    if(member.is_test_account)flags.push('Verborgenes Konto');
    if(member.account_status==='SUSPENDED')flags.push('Gesperrt');
    personSubtitle.textContent=[roleText,...flags].join(' · ');
  }

  const roleCell=[...card.querySelectorAll('.admin-member-card-info>div')].find(div=>/Rolle/i.test(div.querySelector('span')?.textContent||''));
  const roleStrong=roleCell?.querySelector('strong');
  if(roleStrong)roleStrong.textContent=roleText;
}

function polish(){
  if(!members.length)return;
  document.querySelectorAll('.admin-member-card').forEach(decorateCard);
}

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const [{data:ms},{data:rs},{data:as}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge,account_status,is_test_account').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    members=ms||[];regions=rs||[];assignments=as||[];
    polish();
  }catch(error){console.warn('Regionale Admin-Rollen konnten nicht dargestellt werden:',error)}
  finally{loading=false}
}

function boot(){
  void load();
  const observer=new MutationObserver(()=>{
    clearTimeout(window.__ecAdminRightsRegionPolish);
    window.__ecAdminRightsRegionPolish=setTimeout(polish,70);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{polish();void load();},50));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
