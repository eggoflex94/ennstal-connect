import { supabase } from './supabaseClient';

let profiles=[];
let regions=[];
let assignments=[];
let loading=false;
let loadedAt=0;
let timer=null;
const CACHE_MS=60000;
const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const regionNow=()=>{const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';return regions.find(r=>r.slug===slug)||regions[0]||null};
const assignmentsFor=id=>assignments.filter(a=>a.user_id===id&&a.active);
function effective(member,region){const base=String(member?.role||'MEMBER').toUpperCase();if(base==='HEAD_ADMIN')return{label:'Hauptadmin',theme:'admin'};if(base==='ADMIN')return{label:'Community Admin',theme:'admin'};if(region&&assignmentsFor(member?.id).some(a=>a.region_id===region.id))return{label:`Regional Admin · ${region.name}`,theme:'admin'};if(base==='SUPPORTER')return{label:'Supporter',theme:'supporter'};if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return{label:'Unternehmenskonto',theme:'business'};return{label:'Mitglied',theme:'member'}}
function findMember(page){const id=page?.dataset?.profileId;if(id)return profiles.find(p=>p.id===id)||null;const name=norm(page?.querySelector('.member-profile-hero h1')?.textContent);return profiles.find(p=>norm(p.nickname)===name)||null}
function polish(){const page=document.querySelector('.member-profile-page');if(!page||!profiles.length)return;const member=findMember(page);if(!member)return;const info=effective(member,regionNow());page.dataset.ecEffectiveTheme=info.theme;const hero=page.querySelector('.member-profile-hero');if(!hero)return;hero.dataset.ecEffectiveTheme=info.theme;const label=hero.querySelector(':scope > div > span');if(label&&label.textContent!==info.label)label.textContent=info.label}
async function load(force=false){
  if(loading||!supabase)return;
  if(!force&&loadedAt&&Date.now()-loadedAt<CACHE_MS){polish();return}
  loading=true;
  try{
    const [{data:ps},{data:rs},{data:as}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    profiles=ps||[];regions=rs||[];assignments=as||[];loadedAt=Date.now();polish();
  }catch(error){console.warn('Profilrolle konnte nicht regional dargestellt werden:',error?.message||error)}finally{loading=false}
}
function schedule(delay=50,force=false){clearTimeout(timer);timer=setTimeout(()=>{polish();void load(force)},delay)}
window.addEventListener('ec:navigate',()=>schedule(80,false));
window.addEventListener('ec:region-change',()=>schedule(80,true));
window.addEventListener('focus',()=>schedule(80,false));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(120,true),{once:true});else schedule(120,true);
