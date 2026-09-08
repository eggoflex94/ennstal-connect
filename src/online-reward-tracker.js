import { supabase } from './supabaseClient';

const TICK_MS=60_000;
const IDLE_LIMIT_MS=5*60_000;
let lastTick=Date.now();
let lastInteraction=Date.now();
let ticking=false;

function noteActivity(){lastInteraction=Date.now()}
['pointerdown','keydown','touchstart','scroll','mousemove'].forEach(type=>window.addEventListener(type,noteActivity,{passive:true}));

function showRewardToast(rewards){
  if(!rewards)return;
  let toast=document.querySelector('.ec-online-reward-toast');
  if(!toast){toast=document.createElement('div');toast.className='ec-online-reward-toast';document.body.appendChild(toast)}
  toast.innerHTML=`<strong>Neue Profilgestaltung freigeschaltet</strong><span>${rewards===1?'Ein neuer Design-Meilenstein ist jetzt verfügbar.':`${rewards} neue Design-Meilensteine sind jetzt verfügbar.`}</span>`;
  toast.classList.add('is-visible');
  clearTimeout(window.__ecOnlineRewardToast);
  window.__ecOnlineRewardToast=setTimeout(()=>toast.classList.remove('is-visible'),4500);
}

async function tick(){
  if(ticking||!supabase)return;
  const now=Date.now();
  const elapsed=Math.max(1,Math.min(300,Math.round((now-lastTick)/1000)));
  lastTick=now;
  if(document.visibilityState!=='visible'||now-lastInteraction>IDLE_LIMIT_MS)return;
  ticking=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user)return;
    const {data,error}=await supabase.rpc('record_online_time',{p_seconds:elapsed});
    if(error){console.warn('Onlinezeit konnte nicht gespeichert werden:',error.message);return}
    const rewards=Number(data?.rewards||0);
    if(rewards>0){showRewardToast(rewards);window.dispatchEvent(new CustomEvent('ec:online-reward',{detail:data||{}}))}
  }catch(error){console.warn('Onlinezeit konnte nicht gespeichert werden:',error?.message||error)}finally{ticking=false}
}

window.addEventListener('focus',()=>{noteActivity();lastTick=Date.now()});
document.addEventListener('visibilitychange',()=>{lastTick=Date.now();if(document.visibilityState==='visible')noteActivity()});
window.setInterval(()=>void tick(),TICK_MS);
