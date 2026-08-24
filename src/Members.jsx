import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  Search, User, Shield, ShieldCheck, Star, Crown, Users,
  Circle, MessageCircle, Ban, Flag, Trash2, X, Check,
  Lock, Unlock, Settings2, RefreshCw
} from "lucide-react";

/*
  ENNSTAL CONNECT – Mitgliederverwaltung
  Neues Konzept:
  MEMBER | SUPPORTER | ADMIN | HEAD_ADMIN
  Keine alten Rollen owner/moderator/user und kein Punktesystem.
*/

const ROLE_LABELS = {
  MEMBER: "Mitglied",
  SUPPORTER: "Supporter",
  ADMIN: "Admin",
  HEAD_ADMIN: "Head Admin",
};

const ROLE_ORDER = {
  MEMBER: 1,
  SUPPORTER: 2,
  ADMIN: 3,
  HEAD_ADMIN: 4,
};

function normalizeRole(role) {
  const value = String(role || "MEMBER").trim().toUpperCase();

  // Übergang alter Daten zum neuen System
  if (value === "USER") return "MEMBER";
  if (value === "MODERATOR") return "ADMIN";
  if (value === "OWNER") return "HEAD_ADMIN";

  return ROLE_LABELS[value] ? value : "MEMBER";
}

function getDisplayName(member) {
  const fullName = [member.first_name, member.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return member.nickname || fullName || "Unbekanntes Mitglied";
}

function roleIcon(role) {
  switch (normalizeRole(role)) {
    case "HEAD_ADMIN":
      return <Crown size={16} />;
    case "ADMIN":
      return <ShieldCheck size={16} />;
    case "SUPPORTER":
      return <Star size={16} />;
    default:
      return <User size={16} />;
  }
}

function Avatar({ member, size = "normal" }) {
  const name = getDisplayName(member);

  return (
    <div className={`member-avatar member-avatar-${size}`}>
      <img
        src={member.avatar_url || "/default-avatar.svg"}
        alt={name}
        onError={(event) => {
          event.currentTarget.src = "/default-avatar.svg";
        }}
      />
    </div>
  );
}

export default function Members({ onNavigate }) {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);

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

      if (authError) throw authError;
      setCurrentUserId(user?.id || null);

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
          bio,
          is_suspended,
          suspension_reason
        `);

      if (membersError) throw membersError;

      const sorted = [...(data || [])].sort(
        (a, b) =>
          ROLE_ORDER[normalizeRole(b.role)] -
          ROLE_ORDER[normalizeRole(a.role)]
      );

      setMembers(sorted);
    } catch (err) {
      console.error(err);
      setError(err.message || "Mitglieder konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const currentProfile = useMemo(
    () => members.find((member) => member.id === currentUserId) || null,
    [members, currentUserId]
  );

  const currentRole = normalizeRole(currentProfile?.role);
  const isHeadAdmin = currentRole === "HEAD_ADMIN";
  const isAdmin = currentRole === "ADMIN" || isHeadAdmin;

  function canManage(target) {
    if (!target || target.id === currentUserId) return false;

    const targetRole = normalizeRole(target.role);

    if (isHeadAdmin) return targetRole !== "HEAD_ADMIN";
    if (currentRole === "ADMIN") {
      return targetRole === "MEMBER" || targetRole === "SUPPORTER";
    }

    return false;
  }

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return members;

    return members.filter((member) => {
      const name = getDisplayName(member).toLowerCase();
      const role = ROLE_LABELS[normalizeRole(member.role)].toLowerCase();

      return name.includes(query) || role.includes(query);
    });
  }, [members, search]);

  async function updateMember(member, updates, logAction) {
    if (!canManage(member)) {
      alert("Du hast keine Berechtigung, dieses Mitglied zu verwalten.");
      return;
    }

    setSaving(true);

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", member.id);

      if (updateError) throw updateError;

      // Admin-Log wird nur versucht, wenn die Tabelle vorhanden ist.
      // Ein fehlendes Log blockiert die eigentliche Admin-Aktion nicht.
      if (logAction && currentUserId) {
        const { error: logError } = await supabase
          .from("admin_logs")
          .insert({
            admin_id: currentUserId,
            target_user_id: member.id,
            action: logAction,
          });

        if (logError) console.warn("Admin-Log konnte nicht gespeichert werden:", logError.message);
      }

      setMembers((old) =>
        old
          .map((item) =>
            item.id === member.id ? { ...item, ...updates } : item
          )
          .sort(
            (a, b) =>
              ROLE_ORDER[normalizeRole(b.role)] -
              ROLE_ORDER[normalizeRole(a.role)]
          )
      );

      setSelectedMember((old) =>
        old?.id === member.id ? { ...old, ...updates } : old
      );
    } catch (err) {
      console.error(err);
      alert(err.message || "Die Änderung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member, role) {
    if (role === "HEAD_ADMIN") {
      alert("Nur der bestehende Head Admin sollte einen weiteren Head Admin über die gesicherte Admin-Verwaltung festlegen.");
      return;
    }

    await updateMember(
      member,
      { role },
      `ROLE_CHANGED_TO_${role}`
    );
  }

  async function toggleSuspension(member) {
    if (!canManage(member)) return;

    if (member.is_suspended) {
      await updateMember(
        member,
        { is_suspended: false, suspension_reason: null },
        "ACCOUNT_UNSUSPENDED"
      );
      return;
    }

    const reason = window.prompt(
      `Grund für die Sperre von "${getDisplayName(member)}":`
    );

    if (!reason || !reason.trim()) {
      alert("Eine Profilsperre benötigt einen triftigen Grund.");
      return;
    }

    await updateMember(
      member,
      {
        is_suspended: true,
        suspension_reason: reason.trim(),
      },
      "ACCOUNT_SUSPENDED"
    );
  }

  async function deleteAvatar(member) {
    const confirmed = window.confirm(
      `Profilbild von "${getDisplayName(member)}" löschen?`
    );

    if (!confirmed) return;

    await updateMember(member, { avatar_url: null }, "AVATAR_REMOVED");
  }

  function openMessages(member) {
    if (onNavigate) {
      onNavigate("messages", member.id);
    } else {
      alert(`Nachrichten mit ${getDisplayName(member)} öffnen.`);
    }
  }

  if (loading) {
    return (
      <div className="members-page">
        <div className="members-loading">Mitglieder werden geladen...</div>
      </div>
    );
  }

  return (
    <div className="members-page">
      <section className="members-header">
        <div>
          <div className="members-kicker">
            <Users size={16} />
            COMMUNITY
          </div>
          <h1>Mitglieder</h1>
          <p>Entdecke die Community und verwalte Mitglieder, Rollen und Sperren.</p>
        </div>

        <div className="members-header-count">
          <Users size={20} />
          <div>
            <strong>{members.length}</strong>
            <span>Mitglieder</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="members-error">
          <span>{error}</span>
          <button type="button" onClick={loadData}>
            <RefreshCw size={16} /> Erneut versuchen
          </button>
        </div>
      )}

      <div className="members-toolbar">
        <div className="members-search">
          <Search size={20} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Mitglieder suchen..."
          />
          {search && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearch("")}
              aria-label="Suche löschen"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <button className="members-refresh" type="button" onClick={loadData}>
          <RefreshCw size={17} />
          Aktualisieren
        </button>
      </div>

      <section className="members-section">
        <div className="section-heading">
          <div>
            <h2>Community-Mitglieder</h2>
            <p>{filteredMembers.length} von {members.length} Mitgliedern</p>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="members-empty">
            <Users size={42} />
            <h3>Keine Mitglieder gefunden</h3>
            <p>Versuche einen anderen Suchbegriff.</p>
          </div>
        ) : (
          <div className="members-grid">
            {filteredMembers.map((member) => {
              const role = normalizeRole(member.role);

              return (
                <article className="member-card" key={member.id}>
                  <div className="member-card-top">
                    <div className="member-status-avatar">
                      <Avatar member={member} />
                      <span
                        className={
                          member.is_online
                            ? "status-dot online"
                            : "status-dot offline"
                        }
                      />
                    </div>

                    <div className={`member-role role-${role.toLowerCase()}`}>
                      {roleIcon(role)}
                      {ROLE_LABELS[role]}
                    </div>
                  </div>

                  <div className="member-info">
                    <h3>{getDisplayName(member)}</h3>

                    <div className="member-online-status">
                      <Circle
                        size={9}
                        fill="currentColor"
                      />
                      {member.is_online ? "Online" : "Offline"}
                    </div>

                    {member.is_suspended && (
                      <div className="member-suspended-badge">
                        <Lock size={14} />
                        Profil gesperrt
                      </div>
                    )}

                    {member.bio && <p className="member-bio">{member.bio}</p>}
                  </div>

                  <div className="member-actions">
                    <button
                      className="member-message-button"
                      type="button"
                      onClick={() => openMessages(member)}
                    >
                      <MessageCircle size={18} />
                      Nachricht
                    </button>

                    {canManage(member) && (
                      <button
                        className="member-manage-button"
                        type="button"
                        onClick={() => setSelectedMember(member)}
                      >
                        <Settings2 size={17} />
                        Verwalten
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedMember && (
        <div
          className="member-modal-backdrop"
          onMouseDown={() => setSelectedMember(null)}
        >
          <div
            className="member-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="member-modal-close"
              type="button"
              onClick={() => setSelectedMember(null)}
              aria-label="Schließen"
            >
              <X size={22} />
            </button>

            <div className="member-modal-profile">
              <div className="member-modal-avatar-wrap">
                <Avatar member={selectedMember} size="large" />
                <span
                  className={
                    selectedMember.is_online
                      ? "modal-status online"
                      : "modal-status offline"
                  }
                />
              </div>

              <h2>{getDisplayName(selectedMember)}</h2>

              <div className={`member-role role-${normalizeRole(selectedMember.role).toLowerCase()}`}>
                {roleIcon(selectedMember.role)}
                {ROLE_LABELS[normalizeRole(selectedMember.role)]}
              </div>

              {selectedMember.is_suspended && (
                <div className="member-suspension-info">
                  <Lock size={16} />
                  <div>
                    <strong>Profil gesperrt</strong>
                    <span>{selectedMember.suspension_reason || "Kein Grund hinterlegt."}</span>
                  </div>
                </div>
              )}
            </div>

            {canManage(selectedMember) && (
              <div className="member-admin-tools">
                <div className="admin-tools-label">
                  <Shield size={16} />
                  ADMIN-BEREICH
                </div>

                <h3>
                  <Crown size={20} />
                  Mitglied verwalten
                </h3>

                <div className="role-action-grid">
                  <button
                    type="button"
                    className="role-action supporter-action"
                    disabled={saving}
                    onClick={() => changeRole(selectedMember, "SUPPORTER")}
                  >
                    <Star size={20} />
                    Supporter setzen
                  </button>

                  {isHeadAdmin && (
                    <button
                      type="button"
                      className="role-action admin-action"
                      disabled={saving}
                      onClick={() => changeRole(selectedMember, "ADMIN")}
                    >
                      <ShieldCheck size={20} />
                      Zum Admin machen
                    </button>
                  )}

                  <button
                    type="button"
                    className="role-action remove-role-action"
                    disabled={saving}
                    onClick={() => changeRole(selectedMember, "MEMBER")}
                  >
                    <User size={20} />
                    Zum Mitglied machen
                  </button>

                  <button
                    type="button"
                    className="role-action delete-avatar-action"
                    disabled={saving}
                    onClick={() => deleteAvatar(selectedMember)}
                  >
                    <Trash2 size={20} />
                    Profilbild löschen
                  </button>

                  <button
                    type="button"
                    className="role-action suspend-action"
                    disabled={saving}
                    onClick={() => toggleSuspension(selectedMember)}
                  >
                    {selectedMember.is_suspended ? (
                      <>
                        <Unlock size={20} />
                        Sperre aufheben
                      </>
                    ) : (
                      <>
                        <Lock size={20} />
                        Profil sperren
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="member-modal-actions">
              <button
                type="button"
                className="modal-message"
                onClick={() => openMessages(selectedMember)}
              >
                <MessageCircle size={21} />
                Nachricht senden
              </button>

              <button type="button" className="modal-friend">
                <Check size={21} />
                Freundschaft verwalten
              </button>

              <button type="button" className="modal-block">
                <Ban size={21} />
                Nutzer blockieren
              </button>

              <button type="button" className="modal-report">
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
