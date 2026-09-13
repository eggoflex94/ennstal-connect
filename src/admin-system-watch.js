import { supabase } from './supabaseClient';

const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let allowed=null;

async function canUse(){
  if(allowed!==null)return allowed;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return allowed=false;
    const {data}=await supabase.from('profiles').select('role,account_status').eq('id',user.id).maybeSingle();
    allowed=data?.account_status==='ACTIVE'&&['HEAD_ADMIN','ADMIN'].includes(String(data?.role||'').toUpperCase());
    return allowed;
  }catch{return allowed=false}
}

async function openSystemWatch(){
  document.querySelector('.ec-system-watch-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='ec-system-watch-overlay';
  overlay.innerHTML='<section class="ec-system-watch"><header><div><span>ADMIN · SYSTEM-WÄCHTER</span><h2>Systemprüfung</h2><p>Gemeinsame Kontrolle für auffällige Reloads und hängende Online-Status.</p></div><button type="button" data-close aria-label="Schließen">×</button></header><div class="ec-system-watch-summary"></div><div class="ec-system-watch-actions"><button type="button" data-reload>Reload-Muster anzeigen</button><button type="button" data-online>Online-Status prüfen</button><button type="button" data-refresh>Neu prüfen</button></div><div class="ec-system-watch-detail"></div></section>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
  overlay.onclick=(e)=>{if(e.target===overlay)overlay.remove()};
  const summary=overlay.querySelector('.ec-system-watch-summary');
  const detail=overlay.querySelector('.ec-system-watch-detail');

  const loadSummary=async()=>{
    summary.innerHTML='<p>Systemprüfung läuft …</p>';
    const {data,error}=await supabase.rpc('admin_system_watch_summary',{p_hours:24});
    if(error||data?.allowed===false){summary.innerHTML=`<p class="ec-system-watch-error">${esc(error?.message||'Nicht berechtigt')}</p>`;return}
    summary.innerHTML=`<div><strong>${Number(data?.total_alerts)||0}</strong><span>Hinweise gesamt</span></div><div><strong>${Number(data?.reload_alerts)||0}</strong><span>Reload-Auffälligkeiten</span></div><div><strong>${Number(data?.stale_online)||0}</strong><span>Hängende Online-Status</span></div>`;
  };

  const loadReloads=async()=>{
    detail.innerHTML='<p>Reload-Muster werden geladen …</p>';
    const {data,error}=await supabase.rpc('admin_reload_watch',{p_hours:24});
    if(error){detail.innerHTML=`<p class="ec-system-watch-error">${esc(error.message)}</p>`;return}
    const rows=(data||[]).filter((x)=>Number(x.automation_score)>=40);
    detail.innerHTML=rows.length?rows.map((r)=>`<article><strong>${esc(r.nickname)}</strong><span>Score ${Number(r.automation_score)||0} · ${Number(r.loads_1h)||0} Aufrufe/Std. · ${Number(r.explicit_reloads)||0} Reloads</span></article>`).join(''):'<p>Keine auffälligen Reload-Muster.</p>';
  };

  const loadOnline=async()=>{
    detail.innerHTML='<p>Online-Status werden geprüft …</p>';
    const {data,error}=await supabase.rpc('admin_online_status_watch',{p_stale_minutes:10});
    if(error){detail.innerHTML=`<p class="ec-system-watch-error">${esc(error.message)}</p>`;return}
    detail.innerHTML=(data||[]).length?(data||[]).map((r)=>`<article><strong>${esc(r.nickname)}</strong><span>${Number(r.stale_minutes)||0} Minuten ohne frisches Signal${r.hide_online_status?' · Status privat':''}</span></article>`).join(''):'<p>Keine hängenden Online-Status.</p>';
  };

  overlay.querySelector('[data-reload]').onclick=loadReloads;
  overlay.querySelector('[data-online]').onclick=loadOnline;
  overlay.querySelector('[data-refresh]').onclick=loadSummary;
  await loadSummary();
}

async function inject(){
  const grid=document.querySelector('.ec-admin-hub-grid');
  if(!grid||grid.querySelector('[data-system-watch]')||!(await canUse()))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='ec-admin-hub-tile';
  button.dataset.systemWatch='1';
  button.dataset.tone='teal';
  button.innerHTML='<span class="ec-admin-hub-tile-icon" aria-hidden="true">◎</span><span><strong>System-Wächter</strong><small>Reloads und Online-Status gemeinsam prüfen</small></span>';
  button.onclick=(e)=>{e.preventDefault();void openSystemWatch()};
  grid.appendChild(button);
}

new MutationObserver(()=>void inject()).observe(document.documentElement,{childList:true,subtree:true});
void inject();
