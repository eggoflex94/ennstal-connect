import { supabase } from './supabaseClient';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function sessionKey(){
  const key='ec-reload-watch-session';
  try{
    let value=sessionStorage.getItem(key);
    if(!value){value=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(key,value)}
    return value;
  }catch{return `session-${Date.now()}`}
}

function navType(){
  try{
    const entry=performance.getEntriesByType('navigation')?.[0];
    return String(entry?.type||'navigate').toUpperCase();
  }catch{return 'OTHER'}
}

async function recordLoad(){
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    await supabase.rpc('record_page_load_event',{p_session_key:sessionKey(),p_path:`${location.pathname}${location.search}`.slice(0,240),p_nav_type:navType()});
  }catch(error){console.warn('Reload-Erkennung konnte den Seitenaufruf nicht erfassen:',error)}
}

function riskLabel(score){
  const n=Number(score)||0;
  if(n>=70)return ['hoch','Automatisierung sehr wahrscheinlich'];
  if(n>=40)return ['mittel','Auffälliges Reload-Muster'];
  return ['niedrig','Beobachten'];
}

async function openReport(){
  document.querySelector('.ec-reload-watch-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='ec-reload-watch-overlay';
  overlay.innerHTML='<section class="ec-reload-watch"><header><div><span>ADMIN · SICHERHEIT</span><h2>Automatische Reloads</h2><p>Erkennt ungewöhnlich viele oder sehr gleichmäßige Seiten-Neuladungen. Treffer sind Hinweise, keine automatische Sanktion.</p></div><button type="button" class="ec-reload-watch-close" aria-label="Schließen">×</button></header><div class="ec-reload-watch-toolbar"><select aria-label="Zeitraum"><option value="6">6 Stunden</option><option value="24" selected>24 Stunden</option><option value="72">3 Tage</option><option value="168">7 Tage</option></select><button type="button" data-refresh>Neu prüfen</button></div><div class="ec-reload-watch-results"><p>Auswertung wird geladen …</p></div></section>';
  document.body.appendChild(overlay);
  overlay.querySelector('.ec-reload-watch-close').onclick=()=>overlay.remove();
  overlay.onclick=(event)=>{if(event.target===overlay)overlay.remove()};
  const select=overlay.querySelector('select');
  const load=async()=>{
    const host=overlay.querySelector('.ec-reload-watch-results');
    host.innerHTML='<p>Auswertung wird geladen …</p>';
    const {data,error}=await supabase.rpc('admin_reload_watch',{p_hours:Number(select.value)||24});
    if(error){host.innerHTML=`<p class="ec-reload-watch-error">${esc(error.message)}</p>`;return}
    if(!data?.length){host.innerHTML='<div class="ec-reload-watch-empty"><strong>Keine auffälligen Reload-Muster</strong><span>Im gewählten Zeitraum liegt aktuell nichts über den Prüfgrenzen.</span></div>';return}
    host.innerHTML=data.map((row)=>{
      const [tone,label]=riskLabel(row.automation_score);
      const avg=row.avg_interval_seconds==null?'–':`${row.avg_interval_seconds} s`;
      const regular=row.interval_stddev_seconds==null?'–':`${row.interval_stddev_seconds} s`;
      return `<article class="ec-reload-watch-row" data-risk="${tone}"><div class="ec-reload-watch-score"><strong>${Number(row.automation_score)||0}</strong><span>Score</span></div><div class="ec-reload-watch-main"><div><h3>${esc(row.nickname)}</h3><span>${esc(row.role)} · ${esc(label)}</span></div><dl><div><dt>10 Min.</dt><dd>${row.loads_10m}</dd></div><div><dt>1 Std.</dt><dd>${row.loads_1h}</dd></div><div><dt>Reloads</dt><dd>${row.explicit_reloads}</dd></div><div><dt>Ø Abstand</dt><dd>${avg}</dd></div><div><dt>Schwankung</dt><dd>${regular}</dd></div></dl><small>Letzter Aufruf: ${new Date(row.last_load_at).toLocaleString('de-AT')} · ${esc(row.last_path||'/')}</small></div></article>`;
    }).join('');
  };
  select.onchange=load;
  overlay.querySelector('[data-refresh]').onclick=load;
  await load();
}

async function adminAllowed(){
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return false;
    const {data}=await supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle();
    return data?.account_status==='ACTIVE'&&['HEAD_ADMIN','ADMIN'].includes(String(data?.role||'').toUpperCase());
  }catch{return false}
}

let authorized=null;
async function injectButton(){
  const grid=document.querySelector('.ec-admin-hub-grid');
  if(!grid||grid.querySelector('[data-reload-watch]'))return;
  if(authorized===null)authorized=await adminAllowed();
  if(!authorized)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='ec-admin-hub-tile';
  button.dataset.reloadWatch='1';
  button.dataset.tone='orange';
  button.innerHTML='<span class="ec-admin-hub-tile-icon" aria-hidden="true">↻</span><span><strong>Reload-Wächter</strong><small>Automatische Seiten-Neuladungen erkennen</small></span>';
  button.onclick=(event)=>{event.preventDefault();void openReport()};
  grid.appendChild(button);
}

const observer=new MutationObserver(()=>{void injectButton()});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('DOMContentLoaded',()=>{void injectButton()},{once:true});
void recordLoad();
