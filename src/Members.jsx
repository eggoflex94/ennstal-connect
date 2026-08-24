import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Search,
  User,
  Shield,
  ShieldCheck,
  Star,
  UserRoundCog,
  MessageCircle,
  Ban,
  Flag,
  Trash2,
  X,
  Check,
  Crown,
  Users,
  Circle,
} from "lucide-react";

const ROLE_LABELS = {
  user: "Mitglied",
  member: "Mitglied",
  supporter: "Supporter",
  moderator: "Moderator",
  admin: "Admin",
  owner: "Admin",
};

function getDisplayName(member) {
  const fullName = [member.first_name, member.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return member.nickname || fullName || "Unbekannter Nutzer";
}

function getRole(member) {
  return String(member.role || "user").toLowerCase();
}

function getRoleLabel(role) {
  return ROLE_LABELS[String(role || "user").toLowerCase()] || "Mitglied";
}

function getRoleIcon(role) {
  const currentRole = String(role || "user").toLowerCase();

  if (currentRole === "admin" || currentRole === "owner") {
    return <Crown size={16} />;
  }

  if (currentRole === "moderator") {
    return <ShieldCheck size={16} />;
  }

  if (currentRole === "supporter") {
    return <Star size={16} />;
  }

  return <User size={16} />;
}

export default function Members() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        console.error(authError);
      }

      setCurrentUser(user);

      const { data, error: membersError } = await supabase
        .from("profiles")
        .select(`
          id,
          first_name,
          last_name,
          nickname,
          avatar_url,
          role,
          is_online,
          bio
        `)
        .order("role", { ascending: false });

      if (membersError) {
        throw membersError;
      }

      setMembers(data || []);
    } catch (err) {
      console.error(err);
      setError("Mitglieder konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const currentProfile = useMemo(() => {
    if (!currentUser) return null;

    return members.find(
      (member) => member.id === currentUser.id
    );
  }, [currentUser, members]);

  const isAdmin =
    getRole(currentProfile) === "admin" ||
    getRole(currentProfile) === "owner";

  const isModerator =
    getRole(currentProfile) === "moderator";

  const canManage =
    isAdmin || isModerator;

  const filteredMembers = useMemo(() => {
    const query = search.toLowerCase().trim();

    if (!query) return members;

    return members.filter((member) => {
      const name = getDisplayName(member).toLowerCase();
      const role = getRoleLabel(member.role).toLowerCase();

      return (
        name.includes(query) ||
        role.includes(query)
      );
    });
  }, [members, search]);

  async function updateRole(member, newRole) {
    if (!member || !canManage) return;

    /*
      Moderatoren dürfen keine Admins verwalten.
    */
    if (
      isModerator &&
      (
        getRole(member) === "admin" ||
        getRole(member) === "owner"
      )
    ) {
      alert("Du kannst keinen Administrator verwalten.");
      return;
    }

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          role: newRole,
        })
        .eq("id", member.id);

      if (error) throw error;

      setMembers((oldMembers) =>
        oldMembers.map((item) =>
          item.id === member.id
            ? { ...item, role: newRole }
            : item
        )
      );

      setSelectedMember((old) =>
        old
          ? { ...old, role: newRole }
          : old
      );
    } catch (err) {
      console.error(err);
      alert(
        "Die Rolle konnte nicht geändert werden: " +
          (err.message || "Unbekannter Fehler")
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function removeRole(member) {
    if (!member || !canManage) return;

    if (member.id === currentUser?.id) {
      alert("Du kannst deine eigene Rolle nicht entfernen.");
      return;
    }

    const confirmed = window.confirm(
      `Möchtest du die Rolle von "${getDisplayName(member)}" wirklich entfernen?`
    );

    if (!confirmed) return;

    await updateRole(member, "user");
  }

  async function deleteAvatar(member) {
    if (!member || !canManage) return;

    const confirmed = window.confirm(
      `Profilbild von "${getDisplayName(member)}" löschen?`
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          avatar_url: null,
        })
        .eq("id", member.id);

      if (error) throw error;

      setMembers((oldMembers) =>
        oldMembers.map((item) =>
          item.id === member.id
            ? { ...item, avatar_url: null }
            : item
        )
      );

      setSelectedMember((old) =>
        old
          ? { ...old, avatar_url: null }
          : old
      );
    } catch (err) {
      console.error(err);
      alert(
        "Das Profilbild konnte nicht gelöscht werden: " +
          (err.message || "Unbekannter Fehler")
      );
    } finally {
      setActionLoading(false);
    }
  }

  function sendMessage(member) {
    /*
      Hier wird aktuell kein unbekanntes Tabellenmodell
      vorausgesetzt, damit kein Supabase-Fehler entsteht.

      Wenn du bereits eine Nachrichten-Seite hast,
      kannst du die Navigation hier später anpassen.
    */

    if (!member) return;

    alert(
      `Nachrichtenfunktion für ${getDisplayName(member)} öffnen.`
    );
  }

  function blockUser(member) {
    if (!member) return;

    alert(
      `Blockieren von ${getDisplayName(member)} muss mit deiner vorhandenen Blocked-Users-Tabelle verbunden werden.`
    );
  }

  function reportUser(member) {
    if (!member) return;

    alert(
      `Melden von ${getDisplayName(member)} muss mit deiner vorhandenen Reports-Tabelle verbunden werden.`
    );
  }

  function MemberAvatar({ member, size = "normal" }) {
    const name = getDisplayName(member);

    return (
      <div
        className={`member-avatar member-avatar-${size}`}
      >
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={name}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <img
            src="/default-avatar.svg"
            alt={name}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="members-page">
        <div className="members-loading">
          Mitglieder werden geladen...
        </div>
      </div>
    );
  }

  return (
    <div className="members-page">

      {/* KOPFBEREICH */}

      <section className="members-header">
        <div>
          <div className="members-kicker">
            <Users size={16} />
            COMMUNITY
          </div>

          <h1>Mitglieder</h1>

          <p>
            Entdecke Mitglieder deiner Community und
            verwalte Rollen und Berechtigungen.
          </p>
        </div>

        <div className="members-header-count">
          <Users size={20} />
          <div>
            <strong>{members.length}</strong>
            <span>Mitglieder</span>
          </div>
        </div>
      </section>

      {/* FEHLERMELDUNG */}

      {error && (
        <div className="members-error">
          {error}
          <button onClick={loadData}>
            Erneut versuchen
          </button>
        </div>
      )}

      {/* SUCHE */}

      <div className="members-toolbar">
        <div className="members-search">
          <Search size={20} />

          <input
            type="text"
            placeholder="Mitglieder suchen..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          {search && (
            <button
              className="clear-search"
              onClick={() => setSearch("")}
              type="button"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <button
          className="members-refresh"
          type="button"
          onClick={loadData}
        >
          Aktualisieren
        </button>
      </div>

      {/* MITGLIEDER */}

      <section className="members-section">
        <div className="section-heading">
          <div>
            <h2>Mitglieder</h2>
            <p>
              {filteredMembers.length} von {members.length} Mitgliedern
            </p>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="members-empty">
            <Users size={42} />
            <h3>Keine Mitglieder gefunden</h3>
            <p>
              Versuche einen anderen Suchbegriff.
            </p>
          </div>
        ) : (
          <div className="members-grid">
            {filteredMembers.map((member) => {
              const role = getRole(member);

              return (
                <article
                  className="member-card"
                  key={member.id}
                >
                  <div className="member-card-top">

                    <div className="member-status-avatar">
                      <MemberAvatar member={member} />

                      <span
                        className={
                          member.is_online
                            ? "status-dot online"
                            : "status-dot offline"
                        }
                      />
                    </div>

                    <div
                      className={`member-role role-${role}`}
                    >
                      {getRoleIcon(role)}
                      {getRoleLabel(role)}
                    </div>
                  </div>

                  <div className="member-info">
                    <h3>
                      {getDisplayName(member)}
                    </h3>

                    <div className="member-online-status">
                      <Circle
                        size={9}
                        fill={
                          member.is_online
                            ? "currentColor"
                            : "currentColor"
                        }
                      />

                      {member.is_online
                        ? "Online"
                        : "Offline"}
                    </div>

                    {member.bio && (
                      <p className="member-bio">
                        {member.bio}
                      </p>
                    )}
                  </div>

                  <div className="member-actions">

                    <button
                      className="member-message-button"
                      type="button"
                      onClick={() =>
                        sendMessage(member)
                      }
                    >
                      <MessageCircle size={18} />
                      Nachricht
                    </button>

                    <button
                      className="member-manage-button"
                      type="button"
                      onClick={() =>
                        setSelectedMember(member)
                      }
                    >
                      Verwalten
                    </button>

                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL */}

      {selectedMember && (
        <div
          className="member-modal-backdrop"
          onMouseDown={() =>
            setSelectedMember(null)
          }
        >
          <div
            className="member-modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >

            <button
              className="member-modal-close"
              type="button"
              onClick={() =>
                setSelectedMember(null)
              }
            >
              <X size={22} />
            </button>

            {/* PROFIL */}

            <div className="member-modal-profile">

              <div className="member-modal-avatar-wrap">
                <MemberAvatar
                  member={selectedMember}
                  size="large"
                />

                <span
                  className={
                    selectedMember.is_online
                      ? "modal-status online"
                      : "modal-status offline"
                  }
                />
              </div>

              <h2>
                {getDisplayName(selectedMember)}
              </h2>

              <div
                className={`member-role role-${getRole(
                  selectedMember
                )}`}
              >
                {getRoleIcon(
                  getRole(selectedMember)
                )}

                {getRoleLabel(
                  selectedMember.role
                )}
              </div>

              <p>
                {selectedMember.is_online
                  ? "● Online"
                  : "● Offline"}
              </p>

            </div>

            {/* ROLLENVERWALTUNG */}

            {canManage &&
              selectedMember.id !== currentUser?.id && (
                <div className="member-admin-tools">

                  <div className="admin-tools-label">
                    <Shield size={16} />
                    MODERATION
                  </div>

                  <h3>
                    <Crown size={20} />
                    Admin-Werkzeuge
                  </h3>

                  <div className="role-action-grid">

                    {/* SUPPORTER */}

                    <button
                      type="button"
                      className="role-action supporter-action"
                      disabled={actionLoading}
                      onClick={() =>
                        updateRole(
                          selectedMember,
                          "supporter"
                        )
                      }
                    >
                      <Star size={20} />
                      Supporter ernennen
                    </button>

                    {/* MODERATOR */}

                    <button
                      type="button"
                      className="role-action moderator-action"
                      disabled={
                        actionLoading ||
                        !isAdmin
                      }
                      onClick={() =>
                        updateRole(
                          selectedMember,
                          "moderator"
                        )
                      }
                    >
                      <ShieldCheck size={20} />
                      Zum Moderator ernennen
                    </button>

                    {/* ADMIN */}

                    <button
                      type="button"
                      className="role-action admin-action"
                      disabled={
                        actionLoading ||
                        !isAdmin
                      }
                      onClick={() =>
                        updateRole(
                          selectedMember,
                          "admin"
                        )
                      }
                    >
                      <Crown size={20} />
                      Zum Admin ernennen
                    </button>

                    {/* ROLLE ENTFERNEN */}

                    <button
                      type="button"
                      className="role-action remove-role-action"
                      disabled={
                        actionLoading ||
                        getRole(selectedMember) ===
                          "user" ||
                        getRole(selectedMember) ===
                          "member"
                      }
                      onClick={() =>
                        removeRole(selectedMember)
                      }
                    >
                      <UserRoundCog size={20} />
                      Rolle entfernen
                    </button>

                    {/* PROFILBILD */}

                    <button
                      type="button"
                      className="role-action delete-avatar-action"
                      disabled={actionLoading}
                      onClick={() =>
                        deleteAvatar(selectedMember)
                      }
                    >
                      <Trash2 size={20} />
                      Profilbild löschen
                    </button>

                  </div>
                </div>
              )}

            {/* NORMALE AKTIONEN */}

            <div className="member-modal-actions">

              <button
                type="button"
                className="modal-message"
                onClick={() =>
                  sendMessage(selectedMember)
                }
              >
                <MessageCircle size={21} />
                Nachricht senden
              </button>

              <button
                type="button"
                className="modal-friend"
              >
                <Check size={21} />
                Bereits befreundet
              </button>

              <button
                type="button"
                className="modal-block"
                onClick={() =>
                  blockUser(selectedMember)
                }
              >
                <Ban size={21} />
                Nutzer blockieren
              </button>

              <button
                type="button"
                className="modal-report"
                onClick={() =>
                  reportUser(selectedMember)
                }
              >
                <Flag size={21} />
                Nutzer melden
              </button>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
