import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";

const roleMeta = {
  HEAD_ADMIN: {
    icon: "★",
    label: "Head Admin",
    cls: "head-admin",
  },
  ADMIN: {
    icon: "★",
    label: "Admin",
    cls: "admin",
  },
  SUPPORTER: {
    icon: "★",
    label: "Supporter",
    cls: "supporter",
  },
  MEMBER: {
    icon: "",
    label: "Mitglied",
    cls: "member",
  },
};

const displayName = (member) => {
  if (!member) return "Mitglied";

  return (
    member.nickname ||
    [member.first_name, member.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Mitglied"
  );
};

const normalizeRole = (role) =>
  String(role || "MEMBER").toUpperCase();

const isHeadAdmin = (role) =>
  normalizeRole(role) === "HEAD_ADMIN";

const isAdmin = (role) =>
  ["ADMIN", "HEAD_ADMIN"].includes(normalizeRole(role));

function normalizeInterests(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function interestsToInput(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value || "";
}

function RoleBadge({ role }) {
  const normalizedRole = normalizeRole(role);
  const item = roleMeta[normalizedRole] || roleMeta.MEMBER;

  return (
    <span
      className={`profile-role-badge ${item.cls}`}
      title={item.label}
    >
      {item.icon && (
        <span className="profile-role-icon">
          {item.icon}
        </span>
      )}

      <span>{item.label}</span>
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

  const [suspendReason, setSuspendReason] =
    useState("");

  const [showSuspend, setShowSuspend] =
    useState(false);

  useEffect(() => {
    setDraft({
      ...(member || {}),
      interests: interestsToInput(member?.interests),
    });

    setEditing(false);
  }, [member]);

  const restricted = useMemo(
    () => new Set(restrictions || []),
    [restrictions]
  );

  const can = (permission) =>
    viewerIsHeadAdmin ||
    Boolean(viewerPermissions?.[permission]);

  const canEditProfile =
    mine ||
    viewerIsHeadAdmin;

  const notify = (message) => {
    setNotice(message);

    window.clearTimeout(
      window.__ennstalProfileNoticeTimer
    );

    window.__ennstalProfileNoticeTimer =
      window.setTimeout(() => {
        setNotice("");
      }, 4000);
  };

  if (!member) return null;

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (
      mine &&
      restricted.has("profile_edit")
    ) {
      notify(
        "Deine Profilbearbeitung ist derzeit gesperrt."
      );
      return;
    }

    const payload = {
      nickname:
        draft.nickname?.trim() || null,

      bio:
        draft.bio?.trim() || null,

      avatar_url:
        draft.avatar_url?.trim() || null,

      website:
        draft.website?.trim() || null,

      location:
        draft.location?.trim() || null,

      interests:
        normalizeInterests(draft.interests),
    };

    /*
      Eigene Profildaten
      HEAD_ADMIN darf zusätzlich andere Mitglieder bearbeiten.
    */

    if (mine || viewerIsHeadAdmin) {
      payload.first_name =
        draft.first_name?.trim() || null;

      payload.last_name =
        draft.last_name?.trim() || null;

      payload.birth_date =
        draft.birth_date || null;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", member.id)
        .select("*")
        .single();

      if (error) {
        console.error(
          "Profil speichern:",
          error
        );

        notify(
          `Profil konnte nicht gespeichert werden: ${error.message}`
        );

        return;
      }

      setDraft({
        ...data,
        interests: interestsToInput(
          data.interests
        ),
      });

      setEditing(false);

      onProfileSaved?.(data);

      notify(
        "✓ Profil erfolgreich gespeichert."
      );
    } catch (error) {
      console.error(error);

      notify(
        "Unerwarteter Fehler beim Speichern."
      );
    }
  }

  async function changeRole() {
    if (!viewerIsHeadAdmin) {
      notify(
        "Nur der Head Admin darf Rollen ändern."
      );
      return;
    }

    if (member.id === currentUserId) {
      notify(
        "Die eigene Head-Admin-Rolle kann hier nicht geändert werden."
      );
      return;
    }

    const currentRole =
      normalizeRole(member.role);

    const nextRole = window.prompt(
      "Neue Rolle eingeben:\n\nMEMBER = Rolle entfernen\nSUPPORTER\nADMIN",
      currentRole
    );

    if (nextRole === null) {
      return;
    }

    const normalized =
      String(nextRole).trim().toUpperCase();

    if (
      ![
        "MEMBER",
        "SUPPORTER",
        "ADMIN",
      ].includes(normalized)
    ) {
      notify(
        "Ungültige Rolle. Erlaubt: MEMBER, SUPPORTER oder ADMIN."
      );
      return;
    }

    const { error } =
      await supabase.rpc(
        "admin_set_role",
        {
          target_user: member.id,
          new_role: normalized,
        }
      );

    if (error) {
      console.error(error);
      notify(error.message);
      return;
    }

    notify(
      normalized === "MEMBER"
        ? "✓ Rolle wurde entfernt."
        : "✓ Rolle wurde aktualisiert."
    );

    onProfileSaved?.({
      ...member,
      role: normalized,
    });
  }

  async function suspendAccount() {
    const reason =
      suspendReason.trim();

    if (!reason) {
      notify(
        "Bitte gib einen Sperrgrund an."
      );
      return;
    }

    const { error } =
      await supabase.rpc(
        "admin_set_account_status",
        {
          target_user: member.id,
          new_status: "SUSPENDED",
          reason_text: reason,
        }
      );

    if (error) {
      console.error(error);
      notify(error.message);
      return;
    }

    setShowSuspend(false);
    setSuspendReason("");

    notify(
      "✓ Konto wurde gesperrt."
    );

    onProfileSaved?.({
      ...member,
      account_status: "SUSPENDED",
      is_suspended: true,
    });
  }

  async function unsuspendAccount() {
    const { error } =
      await supabase.rpc(
        "admin_set_account_status",
        {
          target_user: member.id,
          new_status: "ACTIVE",
          reason_text:
            "Konto durch Administration freigeschaltet",
        }
      );

    if (error) {
      console.error(error);
      notify(error.message);
      return;
    }

    notify(
      "✓ Konto wurde freigeschaltet."
    );

    onProfileSaved?.({
      ...member,
      account_status: "ACTIVE",
      is_suspended: false,
    });
  }

  const memberIsSuspended =
    member.account_status === "SUSPENDED" ||
    member.is_suspended === true;

  return (
    <section className="profile-view integrated-profile-view">

      {notice && (
        <div className="profile-notice">
          {notice}
        </div>
      )}

      <button
        type="button"
        className="profile-back-button"
        onClick={onClose}
      >
        ← Zurück
      </button>

      {/* ================= PROFIL HEADER ================= */}

      <div className="integrated-profile-hero">

        <div className="integrated-avatar-wrap">
          <img
            src={
              member.avatar_url ||
              DEFAULT_AVATAR
            }
            alt={displayName(member)}
            onError={(event) => {
              event.currentTarget.src =
                DEFAULT_AVATAR;
            }}
          />
        </div>

        <div className="integrated-profile-title">

          <RoleBadge
            role={member.role}
          />

          <h1>
            {displayName(member)}
          </h1>

          {member.first_name ||
          member.last_name ? (
            <div className="integrated-real-name">
              {[
                member.first_name,
                member.last_name,
              ]
                .filter(Boolean)
                .join(" ")}
            </div>
          ) : null}

          <p>
            {member.bio ||
              "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}
          </p>
        </div>

        <div className="integrated-profile-actions">

          {canEditProfile && (
            <button
              type="button"
              className="profile-primary-button"
              onClick={() =>
                setEditing(
                  (value) => !value
                )
              }
            >
              {editing
                ? "Bearbeitung schließen"
                : mine
                ? "Profil bearbeiten"
                : "Mitglied bearbeiten"}
            </button>
          )}

          {!mine && (
            <>
              <button
                type="button"
                className="profile-secondary-button"
                onClick={() =>
                  onMessage?.(member)
                }
              >
                💬 Nachricht
              </button>

              <button
                type="button"
                className="profile-secondary-button"
                onClick={() =>
                  onFriend?.(member)
                }
              >
                🤝 Freundschaft
              </button>
            </>
          )}

        </div>
      </div>

      {/* ================= BEARBEITUNG ================= */}

      {editing && (
        <form
          className="integrated-profile-form"
          onSubmit={saveProfile}
        >

          <div className="profile-form-heading">
            <span>
              {mine
                ? "MEIN PROFIL"
                : "MITGLIED BEARBEITEN"}
            </span>

            <h2>
              Profildaten
            </h2>
          </div>

          <div className="profile-form-grid">

            {(mine || viewerIsHeadAdmin) && (
              <>
                <label>
                  Vorname

                  <input
                    value={
                      draft.first_name || ""
                    }
                    onChange={(event) =>
                      updateDraft(
                        "first_name",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Nachname

                  <input
                    value={
                      draft.last_name || ""
                    }
                    onChange={(event) =>
                      updateDraft(
                        "last_name",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Geburtsdatum

                  <input
                    type="date"
                    value={
                      draft.birth_date || ""
                    }
                    onChange={(event) =>
                      updateDraft(
                        "birth_date",
                        event.target.value
                      )
                    }
                  />
                </label>
              </>
            )}

            <label>
              Benutzername

              <input
                value={
                  draft.nickname || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "nickname",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Wohnort

              <input
                value={
                  draft.location || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "location",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Website

              <input
                value={
                  draft.website || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "website",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Interessen
              <input
                placeholder="z.B. Sport, Musik, Wandern"
                value={
                  draft.interests || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "interests",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Profilbild URL

              <input
                value={
                  draft.avatar_url || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "avatar_url",
                    event.target.value
                  )
                }
              />
            </label>

            <label className="full-width">
              Über mich

              <textarea
                rows="5"
                value={
                  draft.bio || ""
                }
                onChange={(event) =>
                  updateDraft(
                    "bio",
                    event.target.value
                  )
                }
              />
            </label>

          </div>

          <button
            className="profile-primary-button"
            type="submit"
          >
            ✓ Änderungen speichern
          </button>

        </form>
      )}

      {/* ================= DETAILS ================= */}

      <div className="integrated-profile-details">

        <div className="profile-detail-card">
          <span>
            INTERESSEN
          </span>

          <p>
            {Array.isArray(member.interests)
              ? member.interests.join(", ")
              : member.interests ||
                "Keine Interessen angegeben."}
          </p>
        </div>

        <div className="profile-detail-card">
          <span>
            WEBSITE
          </span>

          <p>
            {member.website ||
              "Keine Website angegeben."}
          </p>
        </div>

        <div className="profile-detail-card">
          <span>
            WOHNORT
          </span>

          <p>
            {member.location ||
              "Kein Wohnort angegeben."}
          </p>
        </div>

      </div>

      {/* ================= ADMIN ================= */}

      {viewerIsAdmin &&
        !mine && (
          <section className="integrated-admin-tools">

            <div className="profile-form-heading">
              <span>
                MODERATION
              </span>

              <h2>
                Admin-Werkzeuge
              </h2>
            </div>

            <div className="admin-tool-grid">

              {viewerIsHeadAdmin &&
                can("manage_roles") && (
                  <button
                    type="button"
                    onClick={changeRole}
                  >
                    Rolle ändern / entfernen
                  </button>
                )}

              {viewerIsHeadAdmin &&
                !memberIsSuspended && (
                  <button
                    type="button"
                    className="danger-outline"
                    onClick={() =>
                      setShowSuspend(true)
                    }
                  >
                    Nutzer sperren
                  </button>
                )}

              {viewerIsHeadAdmin &&
                memberIsSuspended && (
                  <button
                    type="button"
                    className="success-outline"
                    onClick={
                      unsuspendAccount
                    }
                  >
                    Nutzer freischalten
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
                    placeholder="Grund für die Sperre..."
                    onChange={(event) =>
                      setSuspendReason(
                        event.target.value
                      )
                    }
                  />
                </label>

                <div className="suspend-actions">

                  <button
                    type="button"
                    className="danger-confirm"
                    onClick={
                      suspendAccount
                    }
                  >
                    Sperre bestätigen
                  </button>

                  <button
                    type="button"
                    className="profile-secondary-button"
                    onClick={() =>
                      setShowSuspend(false)
                    }
                  >
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
