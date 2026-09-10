import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const roleMeta = {
  HEAD_ADMIN: { icon: "★", label: "Betreiber", cls: "head-admin" },
  ADMIN: { icon: "★", label: "Admin", cls: "admin" },
  SUPPORTER: { icon: "★", label: "Supporter", cls: "supporter" },
  MEMBER: { icon: "", label: "Mitglied", cls: "member" },
};

const displayName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
const normalizeRole = (role) => String(role || "MEMBER").toUpperCase();
const isHeadAdmin = (role) => normalizeRole(role) === "HEAD_ADMIN";
const isAdmin = (role) => ["ADMIN", "HEAD_ADMIN"].includes(normalizeRole(role));

function normalizeInterests(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}
function interestsToInput(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}
function safeExtension(file) {
  const byType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  return byType[file?.type] || "jpg";
}

function RoleBadge({ role }) {
  const item = roleMeta[normalizeRole(role)] || roleMeta.MEMBER;
  return <span className={`profile-role-badge ${item.cls}`} title={item.label}>
    {item.icon && <span className="profile-role-icon">{item.icon}</span>}
    <span>{item.label}</span>
  </span>;
}

export default function ProfileView({
  member,
  currentUserId,
  viewerRole,
  viewerPermissions = {},
  onClose,
  onProfileSaved,
  onMessage,
  onFriend,
  restrictions = [],
}) {
  const mine = member?.id === currentUserId;
  const viewerIsHeadAdmin = isHeadAdmin(viewerRole);
  const viewerIsAdmin = isAdmin(viewerRole);
  const [draft, setDraft] = useState(member || {});
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspend, setShowSuspend] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...(member || {}), interests: interestsToInput(member?.interests) });
    setEditing(false);
    setAvatarFile(null);
    setAvatarPreview("");
  }, [member]);

  useEffect(() => () => {
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const restricted = useMemo(() => new Set(restrictions || []), [restrictions]);
  const can = (permission) => viewerIsHeadAdmin || Boolean(viewerPermissions?.[permission]);
  const canEditProfile = mine || viewerIsHeadAdmin;

  const notify = (message) => {
    setNotice(message);
    window.clearTimeout(window.__ennstalProfileNoticeTimer);
    window.__ennstalProfileNoticeTimer = window.setTimeout(() => setNotice(""), 5000);
  };

  if (!member) return null;

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function chooseAvatar(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!AVATAR_TYPES.has(file.type)) {
      event.target.value = "";
      notify("Bitte JPG, PNG, WEBP oder GIF auswählen.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      event.target.value = "";
      notify("Das Profilbild darf maximal 8 MB groß sein.");
      return;
    }
    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar(userId) {
    if (!avatarFile) return draft.avatar_url?.trim() || member.avatar_url || null;
    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${safeExtension(avatarFile)}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-avatars")
      .upload(path, avatarFile, { upsert: false, contentType: avatarFile.type, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from("profile-avatars").getPublicUrl(path).data?.publicUrl;
    if (!publicUrl) {
      await supabase.storage.from("profile-avatars").remove([path]);
      throw new Error("Profilbild konnte nicht gespeichert werden.");
    }
    return publicUrl;
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (mine && restricted.has("profile_edit")) return notify("Deine Profilbearbeitung ist derzeit gesperrt.");
    if (saving) return;
    setSaving(true);
    let uploadedUrl = null;
    try {
      if (avatarFile && !mine && !viewerIsHeadAdmin) throw new Error("Keine Berechtigung für den Profilbild-Upload.");
      uploadedUrl = await uploadAvatar(member.id);
      const payload = {
        nickname: draft.nickname?.trim() || null,
        bio: draft.bio?.trim() || null,
        avatar_url: uploadedUrl,
        website: draft.website?.trim() || null,
        location: draft.location?.trim() || null,
        interests: normalizeInterests(draft.interests),
        updated_at: new Date().toISOString(),
      };
      if (mine || viewerIsHeadAdmin) {
        payload.first_name = draft.first_name?.trim() || null;
        payload.last_name = draft.last_name?.trim() || null;
        payload.birth_date = draft.birth_date || null;
      }
      const { data, error } = await supabase.from("profiles").update(payload).eq("id", member.id).select("*").single();
      if (error) throw error;
      setDraft({ ...data, interests: interestsToInput(data.interests) });
      setAvatarFile(null);
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview("");
      setEditing(false);
      onProfileSaved?.(data);
      window.dispatchEvent(new CustomEvent("ec:profile-updated", { detail: data }));
      window.dispatchEvent(new CustomEvent("ec:profile-media-updated", { detail: { avatar_url: data.avatar_url } }));
      notify("✓ Profil erfolgreich gespeichert.");
    } catch (error) {
      console.error("Profil speichern:", error);
      notify(`Profil konnte nicht gespeichert werden: ${error?.message || "Unbekannter Fehler"}`);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole() {
    if (!viewerIsHeadAdmin) return notify("Nur der Betreiber darf Rollen ändern.");
    if (member.id === currentUserId) return notify("Die eigene Betreiber-Rolle kann hier nicht geändert werden.");
    const currentRole = normalizeRole(member.role);
    const nextRole = window.prompt("Neue Rolle eingeben:\n\nMEMBER = Rolle entfernen\nSUPPORTER\nADMIN", currentRole);
    if (nextRole === null) return;
    const normalized = String(nextRole).trim().toUpperCase();
    if (!["MEMBER", "SUPPORTER", "ADMIN"].includes(normalized)) return notify("Ungültige Rolle. Erlaubt: MEMBER, SUPPORTER oder ADMIN.");
    const { error } = await supabase.rpc("admin_set_role", { target_user: member.id, new_role: normalized });
    if (error) return notify(error.message);
    notify(normalized === "MEMBER" ? "✓ Rolle wurde entfernt." : "✓ Rolle wurde aktualisiert.");
    onProfileSaved?.({ ...member, role: normalized });
  }

  async function suspendAccount() {
    const reason = suspendReason.trim();
    if (!reason) return notify("Bitte gib einen Sperrgrund an.");
    const { error } = await supabase.rpc("admin_set_account_status", { target_user: member.id, new_status: "SUSPENDED", reason_text: reason });
    if (error) return notify(error.message);
    setShowSuspend(false);
    setSuspendReason("");
    notify("✓ Konto wurde gesperrt.");
    onProfileSaved?.({ ...member, account_status: "SUSPENDED", is_suspended: true });
  }

  async function unsuspendAccount() {
    const { error } = await supabase.rpc("admin_set_account_status", { target_user: member.id, new_status: "ACTIVE", reason_text: "Konto durch Administration freigeschaltet" });
    if (error) return notify(error.message);
    notify("✓ Konto wurde freigeschaltet.");
    onProfileSaved?.({ ...member, account_status: "ACTIVE", is_suspended: false });
  }

  const memberIsSuspended = member.account_status === "SUSPENDED" || member.is_suspended === true;
  const shownAvatar = avatarPreview || draft.avatar_url || member.avatar_url || DEFAULT_AVATAR;

  return <section className="profile-view integrated-profile-view">
    {notice && <div className="profile-notice">{notice}</div>}
    <button type="button" className="profile-back-button" onClick={onClose}>← Zurück</button>

    <div className="integrated-profile-hero">
      <div className="integrated-avatar-wrap">
        <img src={shownAvatar} alt={displayName(member)} onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR; }} />
      </div>
      <div className="integrated-profile-title">
        <RoleBadge role={member.role} />
        <h1>{displayName(member)}</h1>
        {(member.first_name || member.last_name) && <div className="integrated-real-name">{[member.first_name, member.last_name].filter(Boolean).join(" ")}</div>}
        <p>{member.bio || "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}</p>
      </div>
      <div className="integrated-profile-actions">
        {canEditProfile && <button type="button" className="profile-primary-button" onClick={() => setEditing((value) => !value)}>{editing ? "Bearbeitung schließen" : mine ? "Profil bearbeiten" : "Mitglied bearbeiten"}</button>}
        {!mine && <>
          <button type="button" className="profile-secondary-button" onClick={() => onMessage?.(member)}>💬 Nachricht</button>
          <button type="button" className="profile-secondary-button" onClick={() => onFriend?.(member)}>🤝 Freundschaft</button>
        </>}
      </div>
    </div>

    {editing && <form className="integrated-profile-form" onSubmit={saveProfile}>
      <div className="profile-form-heading"><span>{mine ? "MEIN PROFIL" : "MITGLIED BEARBEITEN"}</span><h2>Profildaten</h2></div>
      <div className="profile-form-grid">
        {(mine || viewerIsHeadAdmin) && <>
          <label>Vorname<input value={draft.first_name || ""} onChange={(e) => updateDraft("first_name", e.target.value)} /></label>
          <label>Nachname<input value={draft.last_name || ""} onChange={(e) => updateDraft("last_name", e.target.value)} /></label>
          <label>Geburtsdatum<input type="date" value={draft.birth_date || ""} onChange={(e) => updateDraft("birth_date", e.target.value)} /></label>
        </>}
        <label>Benutzername<input value={draft.nickname || ""} onChange={(e) => updateDraft("nickname", e.target.value)} /></label>
        <label>Wohnort<input value={draft.location || ""} onChange={(e) => updateDraft("location", e.target.value)} /></label>
        <label>Website<input value={draft.website || ""} onChange={(e) => updateDraft("website", e.target.value)} /></label>
        <label>Interessen<input placeholder="z.B. Sport, Musik, Wandern" value={draft.interests || ""} onChange={(e) => updateDraft("interests", e.target.value)} /></label>
        <label className="profile-avatar-upload-field">Profilbild hochladen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseAvatar} /><small>JPG, PNG, WEBP oder GIF · maximal 8 MB</small></label>
        <label className="full-width">Über mich<textarea rows="6" maxLength="2000" value={draft.bio || ""} onChange={(e) => updateDraft("bio", e.target.value)} placeholder="Erzähl etwas über dich …" /></label>
      </div>
      <button className="profile-primary-button" type="submit" disabled={saving}>{saving ? "Wird gespeichert …" : "✓ Änderungen speichern"}</button>
    </form>}

    <div className="integrated-profile-details">
      <div className="profile-detail-card"><span>INTERESSEN</span><p>{Array.isArray(member.interests) ? member.interests.join(", ") : member.interests || "Keine Interessen angegeben."}</p></div>
      <div className="profile-detail-card"><span>WEBSITE</span><p>{member.website || "Keine Website angegeben."}</p></div>
      <div className="profile-detail-card"><span>WOHNORT</span><p>{member.location || "Kein Wohnort angegeben."}</p></div>
    </div>

    {viewerIsAdmin && !mine && <section className="integrated-admin-tools">
      <div className="profile-form-heading"><span>MODERATION</span><h2>Admin-Werkzeuge</h2></div>
      <div className="admin-tool-grid">
        {viewerIsHeadAdmin && can("manage_roles") && <button type="button" onClick={changeRole}>Rolle ändern / entfernen</button>}
        {viewerIsHeadAdmin && !memberIsSuspended && <button type="button" className="danger-outline" onClick={() => setShowSuspend(true)}>Nutzer sperren</button>}
        {viewerIsHeadAdmin && memberIsSuspended && <button type="button" className="success-outline" onClick={unsuspendAccount}>Nutzer freischalten</button>}
      </div>
      {showSuspend && <div className="suspend-reason-box">
        <label>Sperrgrund<textarea rows="4" value={suspendReason} placeholder="Grund für die Sperre..." onChange={(e) => setSuspendReason(e.target.value)} /></label>
        <div className="suspend-actions"><button type="button" className="danger-confirm" onClick={suspendAccount}>Sperre bestätigen</button><button type="button" className="profile-secondary-button" onClick={() => setShowSuspend(false)}>Abbrechen</button></div>
      </div>}
    </section>}
  </section>;
}
