import { supabase } from './supabaseClient';

let timer=null;
let observer=null;
let profileData=null;
let relabeling=false;

const HEAD_LABEL='Hauptadmin';

function ownProfileRoots(){
  if(!profileData)return[];
  const nickname=String(profileData.nickname||'').trim().toLowerCase();
  return [...document.querySelectorAll('.integrated-profile-view,.member-profile-page,.profile-page-layout,.profile-view,.ec-clean-profile')].filter((root)=>
    [...root.querySelectorAll('h1,h2,h3,strong,.profile-name,.integrated-profile-name')]
      .some((node)=>String(node.textContent||'').trim().toLowerCase()===nickname)
  );
}

function normalized(text){return String(text||'').trim().toLowerCase();}
function isLegacyHeadAdminLabel(text){
  return [
    'head admin','global admin','betreiber','betreiber (hauptadmin)','betreiber - hauptadmin',
    'betreiber – hauptadmin','global admin · betreiber','global admin - betreiber','hauptadmin · betreiber'
  ].includes(normalized(text));
}

function replaceTextOnly(node){
  if(!node)return false;
  const current=String(node.textContent||'').trim();
  if(normalized(current)==='hauptadmin') return false;
  if(!isLegacyHeadAdminLabel(current)) return false;

  const labelSpan=node.querySelector(':scope > span:not(.ec-restored-profile-eyebrow)');
  if(labelSpan){
    const spanText=String(labelSpan.textContent||'').trim();
    if(normalized(spanText)!=='hauptadmin' && isLegacyHeadAdminLabel(spanText)){
      labelSpan.textContent=HEAD_LABEL;
      labelSpan.dataset.ecHeadLabel='1';
      return true;
    }
  }

  const textNodes=[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE && child.textContent.trim());
  if(textNodes.length){
    if(normalized(textNodes[0].textContent)!=='hauptadmin'){
      textNodes[0].textContent=HEAD_LABEL;
      textNodes.slice(1).forEach(n=>{ if(n.textContent) n.textContent=''; });
      node.dataset.ecHeadLabel='1';
      return true;
    }
    return false;
  }

  if(!node.querySelector('img,svg,picture')){
    node.textContent=HEAD_LABEL;
    node.dataset.ecHeadLabel='1';
    return true;
  }
  return false;
}

function ensureStar(root){
  let changed=false;
  root.querySelectorAll('.ec-restored-profile-function strong,.profile-role-badge,.profile-function-card strong').forEach((holder)=>{
    const text=String(holder.textContent||'').trim();
    if(normalized(text)!=='hauptadmin' && !isLegacyHeadAdminLabel(text))return;
    if(holder.querySelector('img.ec-headadmin-role-star,img[src*="role-star-red.svg"]'))return;
    const img=document.createElement('img');
    img.src='/role-star-red.svg'; img.alt=''; img.setAttribute('aria-hidden','true'); img.className='ec-headadmin-role-star';
    holder.prepend(img); changed=true;
  });
  return changed;
}

function relabel(root){
  if(!root||!profileData||relabeling)return;
  relabeling=true;
  try{
    root.querySelectorAll('.ec-clean-profile-role strong,.profile-role-badge,.integrated-profile-title span,.profile-function-card strong,.profile-function-card span,.profile-role-label,.member-role-label,.ec-restored-profile-function strong,.ec-restored-profile-function strong > span').forEach(replaceTextOnly);
    ensureStar(root);
  }finally{ relabeling=false; }
}

function relabelAll(){ if(!relabeling) ownProfileRoots().forEach(relabel); }
function attachObserver(){
  observer?.disconnect();
  observer=new MutationObserver((records)=>{
    if(relabeling)return;
    const relevant=records.some(r=>{
      const el=r.target?.nodeType===Node.ELEMENT_NODE?r.target:r.target?.parentElement;
      return el?.closest?.('.profile-role-label,.profile-role-badge,.profile-function-card,.ec-restored-profile-function,.integrated-profile-title');
    });
    if(relevant) relabelAll();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
}

async function apply(retries=10){
  if(!profileData){
    const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
    const {data:profile}=await supabase.from('profiles').select('id,nickname,role,account_status').eq('id',user.id).maybeSingle();
    if(!profile||profile.role!=='HEAD_ADMIN'||profile.account_status!=='ACTIVE')return;
    profileData=profile;
  }
  const roots=ownProfileRoots();
  if(!roots.length){if(retries>0)timer=setTimeout(()=>apply(retries-1),160);return;}
  relabelAll(); attachObserver();
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void apply(),30);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:open-profile',schedule);
window.addEventListener('ec:profile-media-updated',schedule);
window.addEventListener('ec:profile-updated',schedule);
window.addEventListener('focus',schedule);
