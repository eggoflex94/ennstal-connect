import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR="/default-avatar.svg";
const meta={HEAD_ADMIN:["👑","Head Admin","head-admin"],ADMIN:["★","Admin","admin"],SUPPORTER:["✦","Supporter","supporter"],MEMBER:["●","Mitglied","member"]};
const name=m=>m?.nickname||[m?.first_name,m?.last_name].filter(Boolean).join(" ")||"Mitglied";
const isHead=r=>r==="HEAD_ADMIN";
const isAdmin=r=>r==="ADMIN"||r==="HEAD_ADMIN";
function Badge({role}){const [i,l,c]=meta[role]||meta.MEMBER;return <span className={`role-badge ${c}`}>{i} {l}</span>}

export default function ProfileView({member,currentUserId,viewerRole,viewerPermissions={},onClose,onProfileSaved,onMessage,onFriend,restrictions=[]}) {
 const mine=member.id===currentUserId, head=isHead(viewerRole), admin=isAdmin(viewerRole);
 const [draft,setDraft]=useState(member), [editing,setEditing]=useState(false), [notice,setNotice]=useState("");
 useEffect(()=>{setDraft(member)},[member]);
 const can=k=>head||!!viewerPermissions[k];
 const restricted=useMemo(()=>new Set(restrictions),[restrictions]);
 const notify=t=>{setNotice(t);setTimeout(()=>setNotice(""),3500)};
 async function save(e){e.preventDefault(); if(restricted.has("profile_edit"))return notify("Deine Profilbearbeitung ist derzeit gesperrt."); const payload={nickname:draft.nickname,bio:draft.bio,avatar_url:draft.avatar_url,profile_accent:draft.profile_accent,profile_background:draft.profile_background,profile_layout:draft.profile_layout}; if(head){payload.first_name=draft.first_name;payload.last_name=draft.last_name;payload.birth_date=draft.birth_date;} const {data,error}=await supabase.from("profiles").update(payload).eq("id",member.id).select().single(); if(error)return notify(error.message); onProfileSaved?.(data);setEditing(false);notify("Profil gespeichert.");}
 async function adminAction(action, feature=null){
   const reason=window.prompt(`Grund für "${action}":`); if(reason===null)return;
   if(action==="warn"){const {error}=await supabase.rpc("admin_warn_user",{target_user:member.id,reason_text:reason});if(error)return notify(error.message);}
   if(action==="suspend"){const {error}=await supabase.rpc("admin_set_account_status",{target_user:member.id,new_status:"SUSPENDED",reason_text:reason});if(error)return notify(error.message);}
   if(action==="delete"){if(!window.confirm("Mitglied wirklich deaktivieren?"))return;const {error}=await supabase.rpc("admin_set_account_status",{target_user:member.id,new_status:"DELETED",reason_text:reason});if(error)return notify(error.message);}
   if(action==="restrict"){const until=window.prompt("Ablaufdatum ISO/leer für dauerhaft:","");const {error}=await supabase.rpc("admin_set_user_restriction",{target_user:member.id,feature_name:feature,reason_text:reason,expires_at_value:until||null});if(error)return notify(error.message);}
   if(action==="role"){const role=window.prompt("Neue Rolle: MEMBER, SUPPORTER oder ADMIN",member.role);if(!role)return;const {error}=await supabase.rpc("admin_set_role",{target_user:member.id,new_role:role.toUpperCase()});if(error)return notify(error.message);}
   notify("Admin-Aktion gespeichert.");
 }
 return <section className="profile-view">
   {notice&&<div className="notice">{notice}</div>}
   <button className="back" onClick={onClose}>← Zurück</button>
   <div className="profile-hero" style={{"--accent":member.profile_accent||"#b8c0c9",background:member.profile_background||"#252a31"}}>
     <div className="profile-avatar-wrap"><img src={member.avatar_url||DEFAULT_AVATAR}/><Badge role={member.role}/></div>
     <div className="profile-title"><span className="eyebrow">{member.role==="HEAD_ADMIN"?"COMMUNITY LEITUNG":"MITGLIEDSPROFIL"}</span><h1>{name(member)}</h1><div className="real-name">{member.first_name} {member.last_name}</div><p>{member.bio||"Dieses Mitglied hat noch keine Beschreibung hinterlegt."}</p></div>
     {mine?<button className="primary" onClick={()=>setEditing(!editing)}>{editing?"Bearbeitung schließen":"Profil bearbeiten"}</button>:<div className="profile-buttons"><button className="primary" onClick={()=>onMessage?.(member)}>Nachricht</button><button className="ghost" onClick={()=>onFriend?.(member)}>Freund hinzufügen</button></div>}
   </div>
   {editing&&<form className="panel profile-form" onSubmit={save}>
      {head&&<div className="admin-data"><label>Vorname<input value={draft.first_name||""} onChange={e=>setDraft({...draft,first_name:e.target.value})} required/></label><label>Nachname<input value={draft.last_name||""} onChange={e=>setDraft({...draft,last_name:e.target.value})} required/></label><label>Geburtsdatum<input type="date" value={draft.birth_date||""} onChange={e=>setDraft({...draft,birth_date:e.target.value})} required/></label></div>}
      <label>Benutzername<input value={draft.nickname||""} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label>
      <label>Über mich<textarea value={draft.bio||""} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label>
      <label>Profilbild URL<input value={draft.avatar_url||""} onChange={e=>setDraft({...draft,avatar_url:e.target.value})}/></label>
      <label>Akzentfarbe<input type="color" value={draft.profile_accent||"#aeb7c2"} onChange={e=>setDraft({...draft,profile_accent:e.target.value})}/></label>
      <button className="primary">Speichern</button>
      {!head&&<small>Vorname, Nachname und Geburtsdatum können nach der Registrierung nur vom Head Admin geändert werden.</small>
   </form>}
   {admin&&!mine&&<section className="panel admin-tools"><span className="eyebrow">MODERATION</span><h2>🛠️ Admin-Werkzeuge</h2><div className="admin-tool-grid">
      {can("manage_warnings")&&<button onClick={()=>adminAction("warn")}>⚠️ Verwarnung</button>}
      {can("manage_restrictions")&&["messages","forum","news","profile_edit"].map(f=><button key={f} onClick={()=>adminAction("restrict",f)}>🔒 {f} sperren</button>)}
      {can("manage_roles")&&<button onClick={()=>adminAction("role")}>★ Rolle ändern</button>}
      {head&&<button className="danger" onClick={()=>adminAction("suspend")}>🚫 Konto sperren</button>}
      {head&&<button className="danger" onClick={()=>adminAction("delete")}>🗑 Mitglied deaktivieren</button>}
   </div></section>}
 </section>
}
