import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const roleMeta = {
  HEAD_ADMIN: { label: "Betreiber (Hauptadmin)", cls: "head-admin", star: "/role-star-red.svg" },
  ADMIN: { label: "Admin", cls: "admin", star: "/role-star-red.svg" },
  SUPPORTER: { label: "Supporter", cls: "supporter", star: "/supporter-star.svg" },
  MEMBER: { label: "Mitglied", cls: "member", star: "" },
};

const displayName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
const normalizeRole = (role) => String(role || "MEMBER").toUpperCase();
const isHeadAdmin = (role) => normalizeRole(role) === "HEAD_ADMIN";
const isAdmin = (role) => ["ADMIN", "HEAD_ADMIN"].includes(normalizeRole(role));
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new Error(message)), ms);
  Promise.resolve(promise).then(
    (value) => { window.clearTimeout(timer); resolve(value); },
    (error) => { window.clearTimeout(timer); reject(error); }
  );
});
const isNetworkError = (error) => /failed to fetch|networkerror|network request failed|load failed|timeout|zeitüberschreitung|aborted/i.test(String(error?.message || error || ""));

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
function uploadErrorMessage(error) {
  const raw = String(error?.message || error || "").trim();
  if (isNetworkError(error)) return "Die Verbindung zum Bildspeicher wurde unterbrochen. Bitte prüfe die Verbindung und versuche es nochmals.";
  if (/row-level security|policy|permission|not authorized|unauthorized/i.test(raw)) return "Keine Speicherberechtigung. Bitte einmal ab- und wieder anmelden.";
  if (/payload too large|too large|maximum|size/i.test(raw)) return "Die Datei ist zu groß. Maximal 8 MB.";
  return raw || "Unbekannter Fehler";
}
function formatBirthDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function ageFromBirthDate(value) {
  if (!value) return "—";
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? `${age} Jahre` : "—";
}
function privacyVisible(member, field, mine, viewerIsAdmin) {
  if (mine || viewerIsAdmin) return true;
  return String(member?.privacy_settings?.[field] || "PUBLIC").toUpperCase() !== "PRIVATE";
}

function RoleBadge({ role, accountBadge }) {
  const normalized = normalizeRole(role);
  const item = normalized === "MEMBER" && accountBadge === "BUSINESS"
    ? { label: "Unternehmenskonto", cls: "business", star: "/role-star-blue.svg" }
    : roleMeta[normalized] || roleMeta.MEMBER;
  return <span className={`profile-role-badge ${item.cls}`} title={item.label}>
    {item.star && <img className="profile-role-star" src={item.star} alt="" aria-hidden="true" />}
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
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ ...(member || {}), interests: interestsToInput(member?.interests) });
    setEditing(false);
    setAvatarPreview("");
    setAvatarUploading(false);
    setAvatarStatus("");
  }, [member?.id]);

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

  async function uploadAvatarObject(userId, file) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${safeExtension(file)}`;
      try {
        setAvatarStatus(attempt === 1 ? "Profilbild wird hochgeladen …" : `Verbindung wird erneut aufgebaut … Versuch ${attempt}/3`);
        const result = await withTimeout(
          supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" }),
          60000,
          "Zeitüberschreitung beim Bild-Upload."
        );
        if (!result.error) {
          const publicUrl = supabase.storage.from("profile-avatars").getPublicUrl(path).data?.publicUrl;
          if (!publicUrl) throw new Error("Öffentliche Bildadresse konnte nicht erstellt werden.");
          return { path, publicUrl };
        }
        lastError = result.error;
        if (!isNetworkError(result.error)) throw result.error;
      } catch (error) {
        lastError = error;
        if (!isNetworkError(error)) throw error;
      }
      if (attempt < 3) await sleep(700 * attempt);
    }
    throw lastError || new Error("Bildspeicher nicht erreichbar.");
  }

  async function persistAvatar(userId, publicUrl) {
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        setAvatarStatus("Profilbild wird im Profil gespeichert …");
        const result = await withTimeout(
          supabase.from("profiles").update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq("id", userId).select("*").single(),
          12000,
          "Zeitüberschreitung beim Speichern des Profilbilds."
        );
        if (!result.error && result.data?.avatar_url) return result.data;
        lastError = result.error || new Error("Das Profil hat das neue Bild nicht bestätigt.");
        if (!isNetworkError(lastError)) throw lastError;
      } catch (error) {
        lastError = error;
        if (!isNetworkError(error) || attempt === 2) throw error;
      }
      await sleep(650);
    }
    throw lastError || new Error("Profilbild konnte nicht im Profil gespeichert werden.");
  }

  async function chooseAvatar(event) {
    const input = event.currentTarget;
    const file = input.files?.[0] || null;
    if (!file || avatarUploading) return;
    if (!AVATAR_TYPES.has(file.type)) {
      input.value = "";
      notify("Bitte JPG, PNG, WEBP oder GIF auswählen.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      input.value = "";
      notify("Das Profilbild darf maximal 8 MB groß sein.");
      return;
    }
    if (!mine && !viewerIsHeadAdmin) {
      input.value = "";
      notify("Keine Berechtigung für den Profilbild-Upload.");
      return;
    }

    if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);
    setAvatarUploading(true);
    setAvatarStatus("Profilbild wird hochgeladen …");
    let uploadedPath = "";

    try {
      const uploaded = await uploadAvatarObject(member.id, file);
      uploadedPath = uploaded.path;
      const savedProfile = await persistAvatar(member.id, uploaded.publicUrl);
      setDraft((current) => ({ ...current, avatar_url: savedProfile.avatar_url }));
      if (localPreview.startsWith("blob:")) URL.revokeObjectURL(localPreview);
      setAvatarPreview("");
      setAvatarStatus("✓ Profilbild wurde gespeichert.");
      onProfileSaved?.({ ...member, avatar_url: savedProfile.avatar_url, updated_at: savedProfile.updated_at });
      window.dispatchEvent(new CustomEvent("ec:profile-updated", { detail: savedProfile }));
      window.dispatchEvent(new CustomEvent("ec:profile-media-updated", { detail: { avatar_url: savedProfile.avatar_url } }));
      window.dispatchEvent(new CustomEvent("ec:profile-image-updated", { detail: { avatarUrl: savedProfile.avatar_url } }));
      notify("✓ Profilbild wurde gespeichert.");
      uploadedPath = "";
    } catch (error) {
      console.error("Profilbild-Upload:", error);
      if (uploadedPath) {
        try { await supabase.storage.from("profile-avatars").remove([uploadedPath]); } catch {}
      }
      setAvatarPreview("");
      setAvatarStatus(`Fehler: ${uploadErrorMessage(error)}`);
      notify(`Profilbild konnte nicht gespeichert werden: ${uploadErrorMessage(error)}`);
    } finally {
      setAvatarUploading(false);
      input.value = "";
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (mine && restricted.has("profile_edit")) return notify("Deine Profilbearbeitung ist derzeit gesperrt.");
    if (saving || avatarUploading) return;
    setSaving(true);
    try {
      const payload = {
        nickname: draft.nickname?.trim() || null,
        bio: draft.bio?.trim() || null,
        avatar_url: draft.avatar_url?.trim() || member.avatar_url || null,
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
      const { data, error } = await withTimeout(
        supabase.from("profiles").update(payload).eq("id", member.id).select("*").single(),
        12000,
        "Zeitüberschreitung beim Speichern des Profils."
      );
      if (error) throw error;
      setDraft({ ...data, interests: interestsToInput(data.interests) });
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
    if (!viewerIsHeadAdmin) return notify("Nur der Betreiber (Hauptadmin) darf Rollen ändern.");
    if (member.id === currentUserId) return notify("Die eigene Betreiber-Hauptadmin-Rolle kann hier nicht geändert werden.");
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
  const showName = privacyVisible(member, "name", mine, viewerIsAdmin);
  const showBirthDate = privacyVisible(member, "birth_date", mine, viewerIsAdmin);
  const homeRegion = member.home_region_name || member.region_name || member.home_region || "Nicht festgelegt";

  return <section className="profile-view integrated-profile-view">
    {notice && <div className="profile-notice">{notice}</div>}
    <button type="button" className="profile-back-button" onClick={onClose}>← Zurück</button>

    <div className="integrated-profile-hero profile-original-layout">
      <div className="profile-original-left">
        <div className="integrated-avatar-wrap">
          <img src={shownAvatar} alt={displayName(member)} onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR; }} />
        </div>
        <div className="profile-function-card">
          <span className="profile-function-eyebrow">FUNKTION</span>
          <RoleBadge role={member.role} accountBadge={member.account_badge} />
          <small>Heimatregion: {homeRegion}</small>
        </div>
      </div>

      <div className="profile-original-main">
        <header className="profile-original-heading">
          <span>MITGLIEDSPROFIL</span>
          <h1>{displayName(member)}</h1>
          {member.is_verified && <b className="profile-verified-badge">✓ Verifiziert</b>}
        </header>

        <div className="profile-identity-grid">
          <div className="profile-identity-card"><span>NICKNAME</span><strong>{member.nickname || "—"}</strong></div>
          {showName && <div className="profile-identity-card"><span>VORNAME</span><strong>{member.first_name || "—"}</strong></div>}
          {showName && <div className="profile-identity-card"><span>NACHNAME</span><strong>{member.last_name || "—"}</strong></div>}
          {showBirthDate && <div className="profile-identity-card"><span>GEBURTSDATUM</span><strong>{formatBirthDate(member.birth_date)}</strong></div>}
          {showBirthDate && member.birth_date && <div className="profile-identity-card"><span>ALTER</span><strong>{ageFromBirthDate(member.birth_date)}</strong></div>}
          <div className="profile-identity-card"><span>HEIMATREGION</span><strong>{homeRegion}</strong></div>
        </div>

        <p className="profile-original-bio">{draft.bio || member.bio || "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}</p>
      </div>
    </div>

    <div className="integrated-profile-actions profile-original-actions">
      {canEditProfile && <button type="button" className="profile-primary-button" onClick={() => setEditing((value) => !value)}>{editing ? "Bearbeitung schließen" : mine ? "Profil bearbeiten" : "Mitglied bearbeiten"}</button>}
      {!mine && <>
        <button type="button" className="profile-secondary-button" onClick={() => onMessage?.(member)}>💬 Nachricht</button>
        <button type="button" className="profile-secondary-button" onClick={() => onFriend?.(member)}>🤝 Freundschaft</button>
      </>}
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
        <label className="profile-avatar-upload-field">Profilbild hochladen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseAvatar} disabled={avatarUploading} /><small>{avatarStatus || "JPG, PNG, WEBP oder GIF · maximal 8 MB"}</small></label>
        <label className="full-width">Über mich<textarea rows="6" maxLength="2000" value={draft.bio || ""} onChange={(e) => updateDraft("bio", e.target.value)} placeholder="Erzähl etwas über dich …" /></label>
      </div>
      <button className="profile-primary-button" type="submit" disabled={saving || avatarUploading}>{avatarUploading ? "Profilbild wird gespeichert …" : saving ? "Wird gespeichert …" : "✓ Änderungen speichern"}</button>
    </form>}

    <div className="integrated-profile-details">
      <div className="profile-detail-card"><span>INTERESSEN</span><p>{Array.isArray(draft.interests) ? draft.interests.join(", ") : draft.interests || member.interests || "Keine Interessen angegeben."}</p></div>
      <div className="profile-detail-card"><span>WEBSITE</span><p>{draft.website || member.website || "Keine Website angegeben."}</p></div>
      <div className="profile-detail-card"><span>WOHNORT</span><p>{draft.location || member.location || "Kein Wohnort angegeben."}</p></div>
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
