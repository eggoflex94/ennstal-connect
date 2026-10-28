import React,{useEffect,useState} from 'react';
import {supabase} from './supabaseClient.js';
import './member-sections.css';

export function MemberSectionTabs({items,page,onNavigate,label}){
 return <nav className="ec-member-section-tabs" aria-label={label}>{items.map(([key,title,count])=><button type="button" key={key} aria-current={page===key?'page':undefined} onClick={()=>onNavigate(key)}>{title}{count>0&&<span className="ec-section-count">{count}</span>}</button>)}</nav>;
}

export function MemberSettings({profile,regions,onNavigate,onUpdated}){
 const [region,setRegion]=useState(profile?.home_region_id||'');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>setRegion(profile?.home_region_id||''),[profile?.home_region_id]);
 async function save(event){
  event.preventDefault();const selected=regions.find(r=>r.id===region);if(!selected)return;
  setBusy(true);setStatus('');
  try{
   const {error}=await supabase.rpc('ec_change_home_region',{p_region_slug:selected.slug});if(error)throw error;
   localStorage.setItem('ec-active-region',selected.slug);
   window.dispatchEvent(new CustomEvent('ec:region-change',{detail:selected}));
   window.dispatchEvent(new CustomEvent('ec:home-region-updated'));
   await onUpdated();setStatus('Heimatregion gespeichert.');
  }catch(error){setStatus(error.message||'Heimatregion konnte nicht gespeichert werden.');}finally{setBusy(false);}
 }
 return <section className="ec-member-settings"><div className="page-heading"><div><span className="eyebrow">MEIN KONTO</span><h1>Einstellungen & Datenschutz</h1><p>Dein Konto und deine persönlichen Einstellungen an einem Ort.</p></div></div><div className="ec-member-settings-grid">
  <article className="panel"><h2>Datenschutz</h2><p>Bestimme, wer deine Profilangaben sehen darf, und verwalte blockierte Mitglieder.</p><div className="ec-member-section-actions"><button type="button" onClick={()=>onNavigate('profile')}>Profil & Sichtbarkeit bearbeiten</button><button type="button" onClick={()=>onNavigate('blocked')}>Blockierte Mitglieder</button><button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('ec:open-privacy-center'))}>Meine Daten & Konto</button></div></article>
  <article className="panel"><h2>Heimatregion</h2><p>Deine Heimatregion bestimmt, wo du standardmäßig als Mitglied angezeigt wirst. Andere Regionen kannst du weiterhin oben entdecken.</p><form onSubmit={save}><label>Deine Heimatregion<select value={region} onChange={event=>setRegion(event.target.value)} required>{regions.map(r=><option key={r.id} value={r.id}>{r.short_name||r.name}</option>)}</select></label><button type="submit" disabled={busy||!region||region===profile?.home_region_id}>{busy?'Wird gespeichert …':'Heimatregion speichern'}</button></form><p role="status">{status}</p></article>
 </div></section>;
}

export function MemberActivityFeed({onNavigate,onOpenMember,members=[]}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try{
    const [updates,actions]=await Promise.all([supabase.from('public_profile_updates').select('id,profile_id,nickname,activity_type,created_at').order('created_at',{ascending:false}).limit(20),supabase.from('profile_activity').select('id,actor_id,profile_id,activity_type,text,created_at').order('created_at',{ascending:false}).limit(20)]);
    if(!live)return;
    const combined=[...(updates.error?[]:updates.data||[]).map(r=>({...r,kind:'profile'})),...(actions.error?[]:actions.data||[]).map(r=>({...r,kind:'activity'}))];
    const seen=new Set();setRows(combined.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).filter(r=>{const key=[r.kind==='activity'?(r.actor_id||r.profile_id):r.profile_id,r.activity_type,r.created_at].join(':');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,30));
    setError(updates.error||actions.error?'Ein Teil der Aktivitäten konnte nicht geladen werden.':'');
   }catch{if(live)setError('Aktivitäten konnten nicht geladen werden.');}finally{if(live)setLoading(false);}
  };
  void load();const timer=window.setInterval(load,30000);window.addEventListener('focus',load);
  return()=>{live=false;window.clearInterval(timer);window.removeEventListener('focus',load);};
 },[]);
 return <section className="panel ec-member-activity-feed"><h2>Aktivitäten aus der Community</h2><p>Profil-Aktualisierungen und Community-Aktionen findest du gesammelt hier.</p>{loading&&<p role="status">Aktivitäten werden geladen …</p>}{error&&<p role="status">{error}</p>}{!loading&&!rows.length&&!error&&<p>Noch keine neuen Aktivitäten.</p>}<div>{rows.map((row,index)=>{const member=members.find(m=>m.id===(row.kind==='activity'?(row.actor_id||row.profile_id):row.profile_id));return <article key={row.id?`${row.kind}:${row.id}`:index}><button type="button" data-member-preview-id={member?.id} onClick={()=>row.kind==='profile'&&member?onOpenMember(member):onNavigate(/GROUP/.test(row.activity_type||'')?'groups':/EVENT/.test(row.activity_type||'')?'events':/FORUM/.test(row.activity_type||'')?'forum':'community')}><strong>{row.nickname||member?.nickname||'Community'}</strong><span>{row.text||row.activity_type||'Profil aktualisiert'}</span><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('de-AT',{dateStyle:'short',timeStyle:'short'})}</time></button></article>;})}</div></section>;
}
