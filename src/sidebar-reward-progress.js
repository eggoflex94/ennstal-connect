import { supabase } from './supabaseClient';

let loadedAt=0;
let cached=null;
let request=null;
const q=(selector,root=document)=>root.querySelector(selector);
const formatHours=(seconds)=>{const hours=Math.max(0,Number(seconds||0)/3600);if(hours<1)return `${Math.round(hours*60)} Min.`;return `${hours.toLocaleString('de-AT',{minimumFractionDigits:hours<10?1:0,maximumFractionDigits:1})} Std.`};
const levelFloor=(level)=>({Neu:0,Aktiv:10,Verbunden:30,Engagiert:75,'Community-Profi':150,Stammmitglied:300}[level]||0);
const levelPercent=(state)=>{if(!state)return 0;const score=Number(state.score||0),next=state.next_score==null?null:Number(state.next_score);if(!next)return 100;const floor=levelFloor(state.level);return Math.max(0,Math.min(100,Math.round(((score-floor)/Math.max(1,next-floor))*100)))};
const prestigeFloor=(prestige)=>({Bronze:300,Silber:450,Gold:650,Platin:900}[prestige]||300);
const prestigePercent=(state)=>{if(!state)return 0;const score=Number(state.score||0),next=state.prestige_next_score==null?null:Number(state.prestige_next_score);if(!next)return 100;const floor=state.prestige?prestigeFloor(state.prestige):300;return Math.max(0,Math.min(100,Math.round(((score-floor)/Math.max(1,next-floor))*100)))};
const onlinePercent=(seconds)=>Math.max(0,Math.min(100,(Number(seconds||0)/(500*3600))*100));
const withTimeout=(promise,ms=7000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Belohnungsdaten Timeout')),ms))]);

async function load(force=false){
  if(!supabase)return null;
  if(!force&&cached&&Date.now()-loadedAt<120000)return cached;
  if(request)return request;
  request=(async()=>{
    try{
      const {data:{user}}=await withTimeout(supabase.auth.getUser(),5000);
      if(!user?.id)return null;
      const [{data:progress,error:progressError},{data:profile,error:profileError}]=await withTimeout(Promise.all([
        supabase.rpc('community_activity_progress'),
        supabase.from('profiles').select('total_online_seconds').eq('id',user.id).maybeSingle()
      ]),7000);
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
function ensureCard(){const dock=q('.ec-right-dock');if(!dock)return null;let card=q('.ec-dock-reward-card',dock);if(!card){card=document.createElement('section');card.className='ec-dock-reward-card';card.setAttribute('aria-label','Community-Belohnungen');const communityLabel=[...dock.querySelectorAll('.ec-dock-section-label')].find(node=>(node.textContent||'').trim().toUpperCase()==='COMMUNITY');if(communityLabel)dock.insertBefore(card,communityLabel);else q('.ec-dock-admin-slot',dock)?.insertAdjacentElement('afterend',card)||dock.appendChild(card)}return card}
function prestigeCopy(state){const score=Number(state.score||0),prestige=state.prestige||'',next=state.prestige_next_score==null?null:Number(state.prestige_next_score);if(score<300)return `Noch ${300-score} Punkte bis Prestige Bronze`;if(!next)return 'Prestige Platin erreicht';return `${prestige} · noch ${Math.max(0,next-score)} Punkte bis zur nächsten Stufe`}
function render(state){
  const card=ensureCard();if(!card)return;
  if(!state){card.innerHTML='<div class="ec-dock-reward-head"><span>BELOHNUNGEN</span><strong>Derzeit nicht verfügbar</strong></div>';return}
  const score=Number(state.score||0),next=state.next_score==null?null:Number(state.next_score),seconds=Number(state.total_online_seconds||0),onlinePoints=Number(state.components?.online||0),nextCopy=next?`${Math.max(0,next-score)} Punkte bis ${next}`:'Community-Level abgeschlossen',prestigeLabel=state.prestige?`Prestige ${state.prestige}`:'Prestige';
  card.innerHTML=`<div class="ec-dock-reward-head"><span>BELOHNUNGEN</span><strong>${String(state.level||'Neu')}</strong><b>${score} Punkte</b></div><div class="ec-dock-reward-row"><span>Community-Level</span><em>${nextCopy}</em></div><div class="ec-dock-reward-bar ec-dock-reward-bar-level"><i style="width:${levelPercent(state)}%"></i></div><div class="ec-dock-reward-row ec-dock-prestige-row"><span>${prestigeLabel}</span><em>${prestigeCopy(state)}</em></div><div class="ec-dock-reward-bar ec-dock-reward-bar-prestige"><i style="width:${prestigePercent(state)}%"></i></div><div class="ec-dock-reward-row ec-dock-reward-online-copy"><span>Aktive Onlinezeit</span><em>${formatHours(seconds)}</em></div><div class="ec-dock-reward-bar ec-dock-reward-bar-online"><i style="width:${onlinePercent(seconds)}%"></i></div><small>${onlinePoints}/250 Online-Punkte · +1 Punkt je 2 aktive Stunden · max. 500 Std.</small><div class="ec-dock-reward-unlocks"><span class="${state.red_unlocked?'is-open':'is-locked'}">${state.red_unlocked?'✓':'🔒'} Rot</span><span class="${state.blue_unlocked?'is-open':'is-locked'}">${state.blue_unlocked?'✓':'🔒'} Blau</span>${state.prestige?`<span class="is-prestige">★ ${state.prestige}</span>`:''}</div>`;
}
async function refresh(force=false){ensureCard();render(await load(force))}
function boot(){
  void refresh(false);
  window.addEventListener('ec:online-reward',()=>void refresh(true));
  window.addEventListener('ec:activity-progress-refresh',()=>void refresh(true));
  window.addEventListener('ec:region-change',()=>void refresh(false));
  window.addEventListener('focus',()=>{if(Date.now()-loadedAt>120000)void refresh(true)});
  window.addEventListener('ec:navigate',()=>{if(!q('.ec-dock-reward-card'))void refresh(false)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
