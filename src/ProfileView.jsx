
import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const DEFAULT_AVATAR = "/default-avatar.svg";

const roleLabel = (role) => {
  if (role === "HEAD_ADMIN") return "Hauptadmin";
  if (role === "ADMIN") return "Admin";
  if (role === "SUPPORTER") return "Supporter";
  return "Mitglied";
};

const getAge = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};

export default function ProfileView({
  member,
  currentUserId,
  onClose,
  onProfileSaved,
  onMessage,
}) {
  const ownProfile = member?.id === currentUserId;
  const [tab, setTab] = useState("about");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(() => ({
    nickname: member?.nickname || "",
    first_name: member?.first_name || "",
    last_name: member?.last_name || "",
    birth_date: member?.birth_date || "",
    avatar_url: member?.avatar_url || "",
    bio: member?.bio || "",
    location: member?.location || "",
    interests: member?.interests || "",
    website: member?.website || "",
  }));

  const displayName = useMemo(() =>
    member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied",
  [member]);

  if (!member) return null;

  async function saveProfile(event) {
    event.preventDefault();
    if (!ownProfile) return;
    setSaving(true);
    setNotice("");
    const payload = {
      nickname: draft.nickname.trim() || null,
      first_name: draft.first_name.trim() || null,
      last_name: draft.last_name.trim() || null,
      birth_date: draft.birth_date || null,
      avatar_url: draft.avatar_url.trim() || null,
      bio: draft.bio.trim() || null,
      location: draft.location.trim() || null,
      interests: draft.interests.trim() || null,
      website: draft.website.trim() || null,
    };
    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", currentUserId)
      .select("*")
      .single();
    setSaving(false);
    if (error) {
      setNotice(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }
    setEditing(false);
    setNotice("Profil wurde gespeichert.");
    onProfileSaved?.(data);
  }

  const age = getAge(member.birth_date);
  const roleClass = member.role === "HEAD_ADMIN" || member.role === "ADMIN"
    ? "role-admin"
    : member.role === "SUPPORTER" ? "role-supporter" : "role-member";

  return (
    <section className="profile-page-new">
      <header className="profile-hero-new">
        <div className="profile-avatar-wrap">
          <img src={member.avatar_url || DEFAULT_AVATAR} alt={displayName} onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
          <span className={`profile-online-dot ${member.is_online ? "is-online" : ""}`} />
        </div>

        <div className="profile-identity-new">
          <div className="profile-name-row">
            <h1>{displayName}</h1>
            {(member.role === "HEAD_ADMIN" || member.role === "ADMIN") && <span className="profile-role-star admin-star-new">★</span>}
            {member.role === "SUPPORTER" && <span className="profile-role-star supporter-star-new">★</span>}
          </div>
          <div className={`profile-role-label ${roleClass}`}>{member.role === "HEAD_ADMIN" ? "♛ " : ""}{roleLabel(member.role)}</div>
          <div className="profile-presence"><span className={member.is_online ? "dot-online" : "dot-offline"} />{member.is_online ? "Online" : "Offline"}</div>
        </div>

        <div className="profile-actions-new">
          {ownProfile ? (
            <button className="profile-edit-button" type="button" onClick={() => setEditing((v) => !v)}>✎ {editing ? "Bearbeitung schließen" : "Profil bearbeiten"}</button>
          ) : (
            <button className="profile-edit-button" type="button" onClick={() => onMessage?.(member)}>◌ Nachricht</button>
          )}
          {!ownProfile && <button className="profile-more-button" type="button" onClick={onClose}>← Zurück</button>}
        </div>
      </header>

      <div className="profile-stats-new">
        <div><span>◫</span><small>Mitglied seit</small><strong>{member.created_at ? new Date(member.created_at).toLocaleDateString("de-AT") : "—"}</strong></div>
        <div><span>◌</span><small>Beiträge</small><strong>{member.posts_count ?? 0}</strong></div>
        <div><span>♧</span><small>Freunde</small><strong>{member.friends_count ?? 0}</strong></div>
        <div><span>◉</span><small>Profilbesuche</small><strong>{member.profile_visits_count ?? 0}</strong></div>
      </div>

      <nav className="profile-tabs-new">
        {[['about','Über mich'],['posts','Beiträge'],['friends','Freunde'],['activity','Aktivitäten'],['settings','Einstellungen']]
          .filter(([key]) => ownProfile || key !== 'settings')
          .map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      {notice && <div className="profile-save-notice">{notice}</div>}

      {editing && ownProfile && (
        <form className="profile-edit-form-new" onSubmit={saveProfile}>
          <div className="profile-edit-head"><div><span>PROFIL</span><h2>Deine Daten bearbeiten</h2></div><button className="profile-save-button" disabled={saving}>{saving ? "Speichert…" : "Änderungen speichern"}</button></div>
          <div className="profile-edit-grid">
            {[['nickname','Nickname'],['first_name','Vorname'],['last_name','Nachname'],['birth_date','Geburtsdatum'],['avatar_url','Profilbild URL'],['location','Wohnort'],['interests','Interessen'],['website','Website']].map(([key,label]) => (
              <label key={key}>{label}<input type={key === 'birth_date' ? 'date' : 'text'} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>
            ))}
          </div>
          <label>Über mich<textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} /></label>
        </form>
      )}

      <div className="profile-main-grid-new">
        <div className="profile-left-new">
          {tab === "about" && <section className="profile-panel-new"><h2>Über mich</h2><p>{member.bio || "Dieses Mitglied hat noch keinen Profiltext hinterlegt."}</p></section>}
          {tab === "posts" && <section className="profile-panel-new"><h2>Neueste Beiträge</h2><div className="profile-empty-new">Beiträge werden hier direkt aus der Community geladen.</div></section>}
          {tab === "friends" && <section className="profile-panel-new"><h2>Freunde</h2><div className="profile-empty-new">Freundesliste wird hier angezeigt.</div></section>}
          {tab === "activity" && <section className="profile-panel-new"><h2>Aktivitäten</h2><div className="profile-empty-new">Öffentliche Aktivitäten werden hier angezeigt.</div></section>}
          {tab === "settings" && ownProfile && <section className="profile-panel-new"><h2>Konto & Sicherheit</h2><div className="profile-setting-row">🔒 Passwort ändern <span>›</span></div><div className="profile-setting-row">✉ E-Mail ändern <span>›</span></div></section>}
        </div>

        <aside className="profile-right-new">
          <section className="profile-panel-new profile-info-new"><div className="profile-info-heading"><h2>Persönliche Informationen</h2>{ownProfile && <button type="button" onClick={() => setEditing(true)}>Bearbeiten</button>}</div>
            <div><span>Vorname</span><strong>{member.first_name || "—"}</strong></div>
            <div><span>Nachname</span><strong>{member.last_name || "—"}</strong></div>
            <div><span>Geburtsdatum</span><strong>{member.birth_date ? new Date(member.birth_date).toLocaleDateString("de-AT") + (age !== null ? ` (${age} Jahre)` : "") : "—"}</strong></div>
            <div><span>Wohnort</span><strong>{member.location || "—"}</strong></div>
            <div><span>Interessen</span><strong>{member.interests || "—"}</strong></div>
            {member.website && <div><span>Website</span><strong>{member.website}</strong></div>}
          </section>
        </aside>
      </div>
    </section>
  );
}
