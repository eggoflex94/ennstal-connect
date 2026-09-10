import { supabase } from './supabaseClient';

let friendIds=new Set();
let viewerId=null;
let booted=false;

function profileIdFromCard(card){
  const direct=card.dataset?.profileId||card.dataset?.memberId||card.getAttribute('data-user-id');
  if(direct)return direct;
  const link=card.querySelector('a[href*="profile="],a[data-profile-id],button[data-profile-id]');
  if(link?.dataset?.profileId)return link.dataset.profileId;
  const href=link?.getAttribute?.('href')||'';
  const m=href.match(/[?&]profile=([^&#]+)/);
  return m?decodeURIComponent(m[1]):null;
}

function badge(){
  const span=document.createElement('span');
  span.className='ec-card-badge-friend';
  span.title='Befreundet';
  span.setAttribute('aria-label','Befreundet');
  const img=document.createElement('img');
  img.className='ec-card-badge-friend-img';
  img.src='/badge-friend.svg?v=20260910b';
  img.alt='Befreundet';
  span.appendChild(img);
  return span;
}

function placeBadge(card){
  const id=profileIdFromCard(card);
  const old=card.querySelector('.ec-card-badge-friend');
  if(!id||id===viewerId||!friendIds.has(id)){old?.remove();return;}
  if(old)return;
  const title=card.querySelector('h1,h2,h3,h4,.member-name,.member-card-name,strong');
  if(title){title.insertAdjacentElement('afterend',badge());return;}
  card.prepend(badge());
}

function apply(){
  document.querySelectorAll('.member-card,article.member-card,[data-profile-id].member-card,[data-member-id]').forEach(placeBadge);
}

async function loadFriendIds(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  viewerId=user.id;
  const {data,error}=await supabase.from('friendships').select('requester_id,receiver_id,status').eq('status','ACCEPTED').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
  if(error)return;
  friendIds=new Set((data||[]).map(r=>r.requester_id===user.id?r.receiver_id:r.requester_id).filter(Boolean));
}

async function refresh(retries=8){
  await loadFriendIds();
  apply();
  if(retries>0&&!document.querySelector('.member-card,article.member-card,[data-member-id]'))setTimeout(()=>refresh(retries-1),180);
}

function boot(){if(booted)return;booted=true;void refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('ec:navigate',()=>setTimeout(()=>void refresh(4),80));
window.addEventListener('ec:region-change',()=>setTimeout(()=>void refresh(4),80));
window.addEventListener('focus',()=>void refresh(2));
