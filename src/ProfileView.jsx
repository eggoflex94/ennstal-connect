import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";

const roleMeta = {
  HEAD_ADMIN: { icon: "★", label: "Head Admin", cls: "head-admin" },
  ADMIN: { icon: "★", label: "Admin", cls: "admin" },
  SUPPORTER: { icon: "●", label: "Supporter", cls: "supporter" },
  MEMBER: { icon: "●", label: "Mitglied", cls: "member" },
};

const displayName = (m) =>
  m?.nickname ||
  [m?.first_name, m?.last_name].filter(Boolean).join(" ") ||
  "Mitglied";

const isHeadAdmin = (role) => String(role || "").toUpperCase() === "HEAD_ADMIN";
const isAdmin = (role) => ["ADMIN", "HEAD_ADMIN"].includes(String(role || "").toUpperCase());

function RoleBadge({ role }) {
  const item = roleMeta[String(role || "MEMBER").toUpperCase()] || roleMeta.MEMBER;
  return (
    <span className={`profile-role-badge ${item.cls}`}>
      <span className="profile-role-icon">{item.icon}</span>
      {item.label}
    </span>
  );
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

  useEffect(() => {
    setDraft(member || {});
  }, [member]);

  const restricted = useMemo(() => new Set(restrictions || []), [restrictions]);
  const can = (permission) => viewerIsHeadAdmin || !!viewerPermissions?.[permission];

  const notify = (message) => {
    setNotice(message);
    window.clearTimeout(window.__ennstalNoticeTimer);
    window.__ennstalNoticeTimer = window.setTimeout(() => setNotice(""), 3500);
  };

  if (!member) return null;

  async function saveProfile(event) {
    event.preventDefault();

    if (restricted.has("profile_edit")) {
      notify("Deine Profilbearbeitung ist derzeit gesperrt.");
      return;
    }

    const payload = {
      nickname: draft.nickname || null,
      bio: draft.bio || null,
      avatar_url: draft.avatar_url || null,
      profile_accent: draft.profile_accent || null,
      profile_background: draft.profile_background || null,
      profile_layout: draft.profile_layout || null,
      interests: draft.interests || null,
      website: draft.website || null,
      location: draft.location || null,
    };

    if (mine) {
      payload.first_name = draft.first_name || null;
      payload.last_name = draft.last_name || null;
      payload.birth_date = draft.birth_date || null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", member.id)
      .select()
      .single();

    if (error) return notify(error.message);

    setEditing(false);
    onProfileSaved?.(data);
    notify("Profil gespeichert.");
  }

  async function suspendAccount() {
    const reason = suspendReason.trim();
    if (!reason) {
      notify("Bitte gib einen Sperrgrund an.");
      return;
    }

    const { error } = await supabase.rpc("admin_set_account_status", {
      target_user: member.id,
      new_status: "SUSPENDED",
      reason_text: reason,
    });

    if (error) return notify(error.message);

    setShowSuspend(false);
    setSuspendReason("");
    notify("Konto wurde gesperrt.");
  }

  async function unsuspendAccount() {
    const { error } = await supabase.rpc("admin_set_account_status", {
      target_user: member.id,
      new_status: "ACTIVE",
      reason_text: "Konto durch Administration freigeschaltet",
    });

    if (error) return notify(error.message);
    notify("Konto wurde freigeschaltet.");
  }

  async function changeRole() {
    const next = window.prompt(
      "Neue Rolle: MEMBER, SUPPORTER oder ADMIN",
      String(member.role || "MEMBER").toUpperCase()
    );
    if (!next) return;

    const { error } = await supabase.rpc("admin_set_role", {
      target_user: member.id,
      new_role: next.trim().toUpperCase(),
    });

    if (error) return notify(error.message);
    notify("Rolle wurde aktualisiert.");
  }

  return (
    <section className="profile-view integrated-profile-view">
      {notice && <div className="profile-notice">{notice}</div>}

      <button className="profile-back-button" onClick={onClose}>
        ← Zurück zur Übersicht
      </button>

      <div
        className={`integrated-profile-hero role-${String(member.role || "MEMBER").toLowerCase()}`}
        style={{
          "--profile-accent": member.profile_accent || "#ff6b22",
          background: member.profile_background || undefined,
        }}
      >
        <div className="integrated-avatar-wrap">
          <img
            src={member.avatar_url || DEFAULT_AVATAR}
            alt={displayName(member)}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR;
            }}
          />
        </div>

        <div className="integrated-profile-title">
          <RoleBadge role={member.role} />
          <h1>{displayName(member)}</h1>
          <div className="integrated-real-name">
            {[member.first_name, member.last_name].filter(Boolean).join(" ")}
          </div>
          <p>{member.bio || "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}</p>
        </div>

        <div className="integrated-profile-actions">
          {mine ? (
            <button className="profile-primary-button" onClick={() => setEditing((value) => !value)}>
              {editing ? "Bearbeitung schließen" : "Profil bearbeiten"}
            </button>
          ) : (
            <>
              <button className="profile-primary-button" onClick={() => onMessage?.(member)}>
                💬 Nachricht senden
              </button>
              <button className="profile-secondary-button" onClick={() => onFriend?.(member)}>
                🤝 Freundschaftsanfrage
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <form className="integrated-profile-form" onSubmit={saveProfile}>
          <div className="profile-form-heading">
            <span>MEIN PROFIL</span>
            <h2>Profil gestalten</h2>
          </div>

          <div className="profile-form-grid">
            <label>
              Vorname
              <input value={draft.first_name || ""} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
            </label>
            <label>
              Nachname
              <input value={draft.last_name || ""} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
            </label>
            <label>
              Geburtsdatum
              <input type="date" value={draft.birth_date || ""} onChange={(e) => setDraft({ ...draft, birth_date: e.target.value })} />
            </label>
            <label>
              Benutzername
              <input value={draft.nickname || ""} onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} />
            </label>
            <label>
              Wohnort
              <input value={draft.location || ""} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </label>
            <label>
              Website
              <input value={draft.website || ""} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
            </label>
            <label>
              Interessen
              <input value={draft.interests || ""} onChange={(e) => setDraft({ ...draft, interests: e.target.value })} />
            </label>
            <label>
              Profilbild URL
              <input value={draft.avatar_url || ""} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })} />
            </label>
            <label className="full-width">
              Über mich
              <textarea rows="6" value={draft.bio || ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </label>
          </div>

          <button className="profile-primary-button" type="submit">
            Änderungen speichern
          </button>
        </form>
      )}

      <div className="integrated-profile-details">
        <div className="profile-detail-card">
          <span>♥ INTERESSEN</span>
          <p>{member.interests || "Keine Interessen angegeben."}</p>
        </div>
        <div className="profile-detail-card">
          <span>⌁ WEBSITE</span>
          <p>{member.website || "Keine Website angegeben."}</p>
        </div>
        <div className="profile-detail-card">
          <span>⌂ WOHNORT</span>
          <p>{member.location || "Kein Wohnort angegeben."}</p>
        </div>
      </div>

      {viewerIsAdmin && !mine && (
        <section className="integrated-admin-tools">
          <div className="profile-form-heading">
            <span>MODERATION</span>
            <h2>★ Admin-Werkzeuge</h2>
          </div>

          <div className="admin-tool-grid">
            {can("manage_roles") && (
              <button onClick={changeRole}>★ Rolle ändern</button>
            )}

            {viewerIsHeadAdmin && !member.is_suspended && (
              <button className="danger-outline" onClick={() => setShowSuspend(true)}>
                🔒 Nutzer sperren
              </button>
            )}

            {viewerIsHeadAdmin && member.is_suspended && (
              <button className="success-outline" onClick={unsuspendAccount}>
                🔓 Nutzer freischalten
              </button>
            )}
          </div>

          {showSuspend && (
            <div className="suspend-reason-box">
              <label>
                Sperrgrund
                <textarea
                  rows="4"
                  value={suspendReason}
                  placeholder="Grund für die Sperre eingeben..."
                  onChange={(e) => setSuspendReason(e.target.value)}
                />
              </label>
              <div>
                <button className="danger-confirm" onClick={suspendAccount}>
                  Sperre bestätigen
                </button>
                <button className="profile-secondary-button" onClick={() => setShowSuspend(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
