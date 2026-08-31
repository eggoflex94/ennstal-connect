import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";
const roleInfo = {
  HEAD_ADMIN: { icon: "★", label: "Head Admin", cls: "head-admin" },
  ADMIN: { icon: "★", label: "Admin", cls: "admin" },
  SUPPORTER: { icon: "●", label: "Supporter", cls: "supporter" },
  MEMBER: { icon: "●", label: "Mitglied", cls: "member" }
};
const getName = (m) => m?.nickname || [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Mitglied";
const getAge = (d) => { if (!d) return null; const b=new Date(d),n=new Date(); let a=n.getFullYear()-b.getFullYear(); if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))a--; return a; };

export default function ProfileView({ member, currentUserId, viewerRole, viewerPermissions = {}, onClose, onProfileSaved, onMessage, onFriend, onBlock, onUnblock, isBlocked = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member || {});
  const [notice, setNotice] = useState("");
  const mine = member?.id === currentUserId;
  const head = viewerRole === "HEAD_ADMIN";
  const canAdmin = head || viewerRole === "ADMIN";
  const role = String(member?.role || "MEMBER").toUpperCase();
  const info = roleInfo[role] || roleInfo.MEMBER;
  const age = getAge(member?.birth_date);
  const notify = (t) => { setNotice(t); setTimeout(() => setNotice(""), 3500); };

  async function save(e) {
    e.preventDefault();
    const allowed = {
      nickname: draft.nickname?.trim() || null,
      bio: draft.bio?.trim() || null,
      avatar_url: draft.avatar_url?.trim() || null,
      location: draft.location?.trim() || null,
      interests: draft.interests?.trim() || null,
      website: draft.website?.trim() || null,
      nickname_color: draft.nickname_color || null,
      profile_accent: draft.profile_accent || "#ff6b25",
      profile_background: draft.profile_background || "#171b22",
      profile_layout: draft.profile_layout || "standard"
    };
    if (head) {
      allowed.first_name = draft.first_name?.trim() || null;
      allowed.last_name = draft.last_name?.trim() || null;
      allowed.birth_date = draft.birth_date || null;
      allowed.gender = draft.gender || null;
    } else if (mine) {
      allowed.gender = draft.gender || null;
    }
    const { data, error } = await supabase.from("profiles").update(allowed).eq("id", member.id).select().single();
    if (error) return notify(error.message);
    setDraft(data);
    setEditing(false);
    onProfileSaved?.(data);
    notify("Profil gespeichert.");
  }

  const detailRows = useMemo(() => [
    ["Vorname", member?.first_name], ["Nachname", member?.last_name], ["Alter", age != null ? `${age} Jahre` : null],
    ["Geburtsdatum", member?.birth_date], ["Geschlecht", member?.gender], ["Wohnort", member?.location],
    ["Interessen", Array.isArray(member?.interests) ? member.interests.join(", ") : member?.interests], ["Website", member?.website]
  ].filter(([,v]) => v), [member, age]);

  return <section className={`profile-view role-${info.cls}`}>
    {notice && <div className="notice">{notice}</div>}
    <button className="back" onClick={onClose}>← Zurück</button>

    <article className="profile-hero" style={{ "--accent": member?.profile_accent || "#ff6b25", background: member?.profile_background || "#252a31" }}>
      <div className="profile-avatar-wrap">
        <img src={member?.avatar_url || DEFAULT_AVATAR} alt={getName(member)} onError={(e)=>{e.currentTarget.src=DEFAULT_AVATAR}} />
        <span className={`role-badge ${info.cls}`}>{info.icon} {info.label}</span>
      </div>
      <div className="profile-title">
        <span className="eyebrow">{role === "HEAD_ADMIN" ? "COMMUNITY LEITUNG" : "MITGLIEDSPROFIL"}</span>
        <h1>{getName(member)}</h1>
        <div className={`real-name ${role}`}>{[member?.first_name, member?.last_name].filter(Boolean).join(" ")}</div>
        <div className={`profile-status ${member?.is_online ? "online" : "offline"}`}><span />{member?.is_online ? "Online" : "Offline"}</div>
        <p>{member?.bio || "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}</p>
      </div>
      <div className="profile-buttons">
        {mine && <button className="primary" onClick={()=>setEditing((x)=>!x)}>{editing ? "Bearbeitung schließen" : "Profil bearbeiten"}</button>}
        {!mine && <>
          <button className="primary" onClick={()=>onMessage?.(member)}>💬 Nachricht</button>
          <button className="ghost" onClick={()=>onFriend?.(member)}>🤝 {member && "Freundschaft"}</button>
          <button className="ghost" onClick={()=>isBlocked ? onUnblock?.(member) : onBlock?.(member)}>{isBlocked ? "🔓 Freigeben" : "🚫 Blockieren"}</button>
        </>}
      </div>
    </article>

    <div className="public-profile-data">
      {detailRows.map(([label,value]) => <div className="public-profile-data-item" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>

    {editing && <form className="panel profile-form" onSubmit={save}>
      <div className="form-grid">
        <label>Nickname<input value={draft.nickname || ""} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label>
        <label>Geschlecht<select value={draft.gender || ""} onChange={e=>setDraft({...draft,gender:e.target.value})}><option value="">—</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label>
        {head && <label>Vorname<input value={draft.first_name || ""} onChange={e=>setDraft({...draft,first_name:e.target.value})}/></label>}
        {head && <label>Nachname<input value={draft.last_name || ""} onChange={e=>setDraft({...draft,last_name:e.target.value})}/></label>}
        {head && <label>Geburtsdatum<input type="date" value={draft.birth_date || ""} onChange={e=>setDraft({...draft,birth_date:e.target.value})}/></label>}
        <label>Wohnort<input value={draft.location || ""} onChange={e=>setDraft({...draft,location:e.target.value})}/></label>
        <label>Website<input value={draft.website || ""} onChange={e=>setDraft({...draft,website:e.target.value})}/></label>
        <label>Interessen<input value={draft.interests || ""} onChange={e=>setDraft({...draft,interests:e.target.value})}/></label>
        <label>Profilbild URL<input value={draft.avatar_url || ""} onChange={e=>setDraft({...draft,avatar_url:e.target.value})}/></label>
        <label style={{gridColumn:"span 2"}}>Über mich<textarea value={draft.bio || ""} onChange={e=>setDraft({...draft,bio:e.target.value})}/></label>
      </div>
      <button className="primary">Änderungen speichern</button>
    </form>}

    {canAdmin && !mine && role !== "HEAD_ADMIN" && <section className="panel admin-tools">
      <span className="eyebrow">MODERATION</span>
      <h2>Admin-Werkzeuge</h2>
      <p>Die globale Sperrung und Freischaltung wird serverseitig abgesichert.</p>
    </section>}
  </section>;
}
