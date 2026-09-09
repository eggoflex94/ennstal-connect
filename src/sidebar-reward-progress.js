import { supabase } from './supabaseClient';

let loadedAt=0;
let cached=null;
let request=null;
let timer=null;

const q=(selector,root=document)=>root.querySelector(selector);
const formatHours=(seconds)=>{
  const hours=Math.max(0,Number(seconds||0)/3600);
  if(hours<1)return `${Math.round(hours*60)} Min.`;
  return `${hours.toLocaleString('de-AT',{minimumFractionDigits:hours<10?1:0,maximumFractionDigits:1})} Std.`;
};
const levelTarget=(state)=>state?.next_score==null?Number(state?.score||0):Number(state?.next_score||0);
const levelFloor=(level)=>({Neu:0,Aktiv:10,Verbunden:30,Engagiert:75,'Community-Profi':150,Stammmitglied:300}[level]||0);
const levelPercent=(state)=>{
  if(!state)return 0;
  const score=Number(state.score||0),next=state.next_score==null?null:Number(state.next_score);
  if(!next)return 100;
  const floor=levelFloor(state.level);
  return Math.max(0,Math.min(100,Math.round(((score-floor)/Math.max(1,next-floor))*100)));
};
const onlinePercent=(seconds)=>Math.max(0,Math.min(100,(Number(seconds||0)/(100*3600))*100));

async function load(force=false){
  if(!supabase)return null;
  if(!force&&cached&&Date.now()-loadedAt<60000)return cached;
  if(request)return request;
  request=(async()=>{
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user?.id)return null;
      const [{data:progress,error:progressError},{data:profile,error:profileError}]=await Promise.all([
        supabase.rpc('community_activity_progress'),
        supabase.from('profiles').select('total_online_seconds').eq('id',user.id).maybeSingle()
      ]);
      if(progressError)throw progressError;
      if(profileError)throw profileError;
      cached={...(progress||{}),total_online_seconds:Number(profile?.total_online_seconds||0)};
      loadedAt=Date.now();
      return cached;
    }catch(error){
      console.warn('Belohnungsfortschritt konnte nicht geladen werden:',error?.message||error);
      return null;
    }finally{request=null}
  })();
  return request;
}

function ensureCard(){
  const dock=q('.ec-right-dock');
  if(!dock)return null;
  let card=q('.ec-dock-reward-card',dock);
  if(!card){
    card=document.createElement('section');
    card.className='ec-dock-reward-card';
    card.setAttribute('aria-label','Community-Belohnungen');
    const communityLabel=[...dock.querySelectorAll('.ec-dock-section-label')].find(node=>(node.textContent||'').trim().toUpperCase()==='COMMUNITY');
    if(communityLabel)dock.insertBefore(card,communityLabel);
    else q('.ec-dock-admin-slot',dock)?.insertAdjacentElement('afterend',card) || dock.appendChild(card);
  }
  return card;
}

function render(state){
  const card=ensureCard();
  if(!card)return;
  if(!state){
    card.innerHTML='<div class="ec-dock-reward-head"><span>BELOHNUNGEN</span><strong>Fortschritt wird geladen …</strong></div>';
    return;
  }
  const score=Number(state.score||0),next=state.next_score==null?null:Number(state.next_score),seconds=Number(state.total_online_seconds||0);
  const onlinePoints=Number(state.components?.online||0);
  const nextCopy=next?`${Math.max(0,next-score)} Punkte bis ${next}`:'Höchste Stufe erreicht';
  card.innerHTML=`
    <div class="ec-dock-reward-head">
      <span>BELOHNUNGEN</span>
      <strong>${String(state.level||'Neu')}</strong>
      <b>${score} Punkte</b>
    </div>
    <div class="ec-dock-reward-row"><span>Community-Level</span><em>${nextCopy}</em></div>
    <div class="ec-dock-reward-bar ec-dock-reward-bar-level" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${levelPercent(state)}"><i style="width:${levelPercent(state)}%"></i></div>
    <div class="ec-dock-reward-row ec-dock-reward-online-copy"><span>Aktive Onlinezeit</span><em>${formatHours(seconds)}</em></div>
    <div class="ec-dock-reward-bar ec-dock-reward-bar-online" role="progressbar" aria-label="Onlinezeit bis zum maximalen Online-Bonus" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(onlinePercent(seconds))}"><i style="width:${onlinePercent(seconds)}%"></i></div>
    <small>${onlinePoints}/50 Online-Punkte · +1 Punkt je 2 aktive Stunden</small>
    <div class="ec-dock-reward-unlocks">
      <span class="${state.red_unlocked?'is-open':'is-locked'}">${state.red_unlocked?'✓':'🔒'} Rot</span>
      <span class="${state.blue_unlocked?'is-open':'is-locked'}">${state.blue_unlocked?'✓':'🔒'} Blau</span>
    </div>`;
}

async function refresh(force=false){
  ensureCard();
  render(await load(force));
}

function boot(){
  void refresh(false);
  new MutationObserver(()=>{if(q('.ec-right-dock')&&!q('.ec-dock-reward-card'))void refresh(false)}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:online-reward',()=>void refresh(true));
  window.addEventListener('ec:activity-progress-refresh',()=>void refresh(true));
  window.addEventListener('ec:region-change',()=>void refresh(false));
  timer=window.setInterval(()=>{if(!document.hidden)void refresh(true)},60000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer)},{once:true});
