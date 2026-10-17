import { supabase } from './supabaseClient';
let overlay = null;
const safe=(s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
function close(){overlay?.remove();overlay=null}
async function load(){
 const list=overlay?.querySelector('[data-list]'); if(!list)return;
 list.textContent='Regionaladmins werden geladen…';
 const [a,b,c]=await Promise.all([
   supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
   supabase.from('regions').select('id,name').eq('is_active',true),
   supabase.from('profiles').select('id,nickname,role,account_status')
 ]);
 if(!overlay||!list.isConnected)return;
 const error=a.error||b.error||c.error;
 if(error){list.textContent='Fehler beim Laden: '+error.message;return}
 const regions=new Map((b.data||[]).map(x=>[x.id,x.name]));
 const members=new Map((c.data||[]).map(x=>[x.id,x]));
 list.replaceChildren();
 const rows=(a.data||[]).filter(x=>members.has(x.user_id)).sort((x,y)=>String(members.get(x.user_id)?.nickname||'').localeCompare(String(members.get(y.user_id)?.nickname||''),'de'));
 overlay.querySelector('[data-count]').textContent=rows.length+' aktive Zuweisungen';
 if(!rows.length){list.textContent='Keine aktiven regionalen Admin-Zuweisungen gefunden.';return}
 for(const assignment of rows){
  const member=members.get(assignment.user_id),region=regions.get(assignment.region_id)||'Unbekannte Region';
  const item=document.createElement('article');item.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #354052;padding:14px 0;flex-wrap:wrap';
  const desc=document.createElement('div');
  desc.innerHTML='<strong>'+safe(member.nickname||'Mitglied')+'</strong><div style="color:#b7c5d7;font-size:13px">'+safe(region)+' · '+safe(member.role)+'</div>';
  const button=document.createElement('button');button.type='button';button.textContent='Regionalrechte entfernen';button.style.cssText='border:0;border-radius:8px;background:#b42336;color:#fff;padding:9px 12px;cursor:pointer';
  button.onclick=async()=>{
   const given=window.prompt('Warum sollen die Regional-Admin-Rechte von '+(member.nickname||'Mitglied')+' für '+region+' entfernt werden?','');
   if(given===null)return;
   const reason=given.trim();
   if(reason.length<10){window.alert('Bitte mindestens 10 Zeichen als Begründung eingeben.');return}
   if(!window.confirm('Regionalrechte für '+region+' wirklich entfernen?\n\nGrund: '+reason))return;
   button.disabled=true;button.textContent='Wird entfernt…';
   const {error}=await supabase.rpc('head_admin_remove_regional_admin',{p_target:assignment.user_id,p_region:assignment.region_id,p_reason:reason});
   if(error){window.alert('Entfernen fehlgeschlagen: '+error.message);button.disabled=false;button.textContent='Regionalrechte entfernen';return}
   await load();
  };
  if(['MEMBER','SUPPORTER'].includes(member.role)){
    const reset=document.createElement('button');
    reset.type='button';
    reset.textContent='Zum Supporter zurücksetzen';
    reset.style.cssText='border:1px solid #64748b;border-radius:8px;background:#334155;color:#fff;padding:9px 12px;cursor:pointer';
    reset.onclick=async()=>{
      const entered=window.prompt('Grund für die Rückstufung von '+(member.nickname||'Mitglied')+' zum Supporter:','');
      if(entered===null)return;
      const reason=entered.trim();
      if(reason.length<10){window.alert('Bitte mindestens 10 Zeichen als Grund eingeben.');return}
      if(!window.confirm('Alle Regional-Admin-Rechte entfernen und Supporter-Rolle setzen?\\n\\nGrund: '+reason))return;
      reset.disabled=true;
      const {error}=await supabase.rpc('head_admin_regional_to_supporter',{p_target:assignment.user_id,p_reason:reason});
      if(error){window.alert('Zurücksetzen fehlgeschlagen: '+error.message);reset.disabled=false;return}
      await load();
    };
    item.append(desc,button,reset);
  }else item.append(desc,button);
  list.append(item);
 }
}
async function open(){
 close();
 const {data:{user},error}=await supabase.auth.getUser();
 if(error||!user)return;
 const {data:me}=await supabase.from('profiles').select('role,is_primary_head_admin,account_status').eq('id',user.id).maybeSingle();
 if(me?.role!=='HEAD_ADMIN'||!me.is_primary_head_admin||me.account_status!=='ACTIVE'){window.alert('Nur der aktive primäre Head Admin darf Regionaladmins entfernen.');return}
 overlay=document.createElement('div');
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#000b;display:flex;align-items:center;justify-content:center;padding:16px';
 overlay.innerHTML='<section role="dialog" aria-modal="true" aria-label="Regionaladmins entfernen" style="background:#171d29;color:#f8fafc;width:min(700px,100%);max-height:85vh;overflow:auto;border-radius:16px;padding:24px"><header style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="margin:0">Regionaladmins verwalten</h2><p style="color:#b7c5d7;margin:6px 0" data-count>…</p></div><button type="button" data-close style="padding:8px 12px;color:#fff;background:#354052;border:0;border-radius:8px">Schließen</button></header><p style="font-size:13px;color:#b7c5d7">Entfernt nur die ausgewählte regionale Zuweisung. Das Mitglied erhält automatisch eine Nachricht mit deiner Begründung.</p><div data-list></div></section>';
 overlay.querySelector('[data-close]').onclick=close;
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 document.body.append(overlay);void load();
}
window.addEventListener('ec:open-regional-admin-removal',()=>void open());
