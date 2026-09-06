import { supabase } from './supabaseClient';

const ROLE_CLASSES=['head-admin','admin','supporter','business','member'];
const roleMeta=(profile)=>{
  const badge=String(profile?.account_badge||'').toUpperCase();
  if(profile?.role==='HEAD_ADMIN')return{cls:'head-admin',mark:'♛',label:'Head Admin'};
  if(profile?.role==='ADMIN')return{cls:'admin',mark:'★',label:'Community Admin'};
  if(profile?.role==='SUPPORTER')return{cls:'supporter',mark:'★',label:'Supporter'};
  if(badge==='BUSINESS'||badge.includes('UNTERNEHM'))return{cls:'business',mark:'★',label:'Unternehmenskonto'};
  return{cls:'member',mark:'',label:'Mitglied'};
};

function profileIdFrom(link){
  try{return new URL(link.href,location.href).searchParams.get('profile');}catch{return null;}
}

async function sync(){
  const links=[...document.querySelectorAll('.ec-sidebar-shell .ec-profile-link')];
  const ids=[...new Set(links.map(profileIdFrom).filter(Boolean))];
  if(ids.length){
    const {data}=await supabase.from('profiles').select('id,role,account_badge,nickname_color').in('id',ids);
    const map=new Map((data||[]).map(p=>[p.id,p]));
    links.forEach(link=>{
      const p=map.get(profileIdFrom(link));
      if(!p)return;
      const meta=roleMeta(p);
      ROLE_CLASSES.forEach(c=>link.classList.remove(c));
      link.classList.add(meta.cls);
      link.dataset.roleMark=meta.mark;
      link.dataset.roleLabel=meta.label;
      link.style.removeProperty('--ec-member-nickname-color');
      if(meta.cls==='member'&&p.nickname_color)link.style.setProperty('--ec-member-nickname-color',p.nickname_color);
    });
  }

  document.querySelectorAll('.ec-community-activity-row .ec-activity-name').forEach(name=>{
    const classes=ROLE_CLASSES.filter(c=>name.classList.contains(c));
    if(classes.length)return;
    name.classList.add('member');
  });
}

let timer;
const queue=()=>{clearTimeout(timer);timer=setTimeout(()=>void sync(),80)};
const observer=new MutationObserver(queue);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('focus',queue);
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue()});
queue();
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
