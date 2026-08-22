import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

const FRIEND_LOGO = "/freunde-logo.png";

/* =========================================================
   HILFSFUNKTIONEN
========================================================= */

function formatDate(value) {
  if (!value) return "Noch keine Aktivität";

  return new Date(value).toLocaleString("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getInitials(member) {
  if (!member) return "?";

  return (
    member.nickname?.charAt(0)?.toUpperCase() ||
    member.first_name?.charAt(0)?.toUpperCase() ||
    "?"
  );
}

function isAdmin(role) {
  return role === "ADMIN" || role === "HEAD_ADMIN";
}

function roleLabel(role) {
  switch (role) {
    case "HEAD_ADMIN":
      return "Hauptadmin";

    case "ADMIN":
      return "Admin";

    case "SUPPORTER":
      return "Supporter";

    default:
      return "Mitglied";
  }
}

/* =========================================================
   AVATAR
========================================================= */

function Avatar({ member, className = "" }) {
  return (
    <div className={`member-avatar ${className}`}>
      {member?.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={member.nickname || "Profilbild"}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : (
        <span>{getInitials(member)}</span>
      )}
    </div>
  );
}

/* =========================================================
   ROLLEN
========================================================= */

function RoleStars({ member }) {
  if (!member) return null;

  return (
    <span className="member-badges">
      {member.role === "HEAD_ADMIN" && (
        <span className="admin-star" title="Hauptadmin">
          ★
        </span>
      )}

      {member.role === "ADMIN" && (
        <span className="admin-star" title="Admin">
          ★
        </span>
      )}

      {member.role === "SUPPORTER" && (
        <span className="supporter-star" title="Supporter">
          ★
        </span>
      )}
    </span>
  );
}

/* =========================================================
   LOGIN / REGISTRIERUNG
========================================================= */

function AuthModal({ mode, onClose, onModeChange }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    nickname: "",
    email: "",
    password: "",
  });

  function updateField(key, value) {
    setForm((old) => ({
      ...old,
      [key]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,

          options: {
            emailRedirectTo: window.location.origin,

            data: {
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              birth_date: form.birth_date,
              nickname: form.nickname.trim(),
            },
          },
        });

        if (error) {
          setMessage(error.message);
        } else {
          setMessage(
            "Registrierung erfolgreich. Bitte bestätige deine E-Mail. Danach muss dein Konto von einem Admin freigegeben werden."
          );
        }
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: form.email.trim(),
            password: form.password,
          });

        if (error) {
          setMessage(error.message);
        } else {
          onClose();
        }
      }
    } catch (error) {
      setMessage(error.message || "Ein Fehler ist aufgetreten.");
    }

    setLoading(false);
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSubmit}>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
        >
          ×
        </button>

        <h2>
          {mode === "login"
            ? "Anmelden"
            : "Mitglied werden"}
        </h2>

        {mode === "register" && (
          <>
            <input
              required
              placeholder="Vorname"
              value={form.first_name}
              onChange={(event) =>
                updateField(
                  "first_name",
                  event.target.value
                )
              }
            />

            <input
              required
              placeholder="Nachname"
              value={form.last_name}
              onChange={(event) =>
                updateField(
                  "last_name",
                  event.target.value
                )
              }
            />

            <input
              required
              type="date"
              value={form.birth_date}
              onChange={(event) =>
                updateField(
                  "birth_date",
                  event.target.value
                )
              }
            />

            <input
              required
              minLength="3"
              placeholder="Nickname"
              value={form.nickname}
              onChange={(event) =>
                updateField(
                  "nickname",
                  event.target.value
                )
              }
            />
          </>
        )}

        <input
          required
          type="email"
          placeholder="E-Mail-Adresse"
          value={form.email}
          onChange={(event) =>
            updateField(
              "email",
              event.target.value
            )
          }
        />

        <input
          required
          type="password"
          minLength="6"
          placeholder="Passwort"
          value={form.password}
          onChange={(event) =>
            updateField(
              "password",
              event.target.value
            )
          }
        />

        <button
          className="primary-button full-button"
          disabled={loading}
        >
          {loading
            ? "Bitte warten ..."
            : mode === "login"
              ? "Anmelden"
              : "Registrieren"}
        </button>

        {message && (
          <p className="auth-message">
            {message}
          </p>
        )}

        <button
          type="button"
          className="secondary-button full-button"
          onClick={() =>
            onModeChange(
              mode === "login"
                ? "register"
                : "login"
            )
          }
        >
          {mode === "login"
            ? "Noch kein Konto? Registrieren"
            : "Bereits registriert? Anmelden"}
        </button>
      </form>
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [members, setMembers] = useState([]);
  const [friends, setFriends] = useState([]);

  const [friendRequests, setFriendRequests] =
    useState([]);

  const [sentRequests, setSentRequests] =
    useState([]);

  const [search, setSearch] = useState("");

  const [authOpen, setAuthOpen] =
    useState(false);

  const [authMode, setAuthMode] =
    useState("login");

  const [selectedProfile, setSelectedProfile] =
    useState(null);

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [adminOpen, setAdminOpen] =
    useState(false);

  const [pendingMembers, setPendingMembers] =
    useState([]);

  const [notice, setNotice] =
    useState("");

  /* =======================================================
     BENACHRICHTIGUNG
  ======================================================= */

  function showNotice(text) {
    setNotice(text);

    window.setTimeout(() => {
      setNotice("");
    }, 4000);
  }

  /* =======================================================
     AUTH
  ======================================================= */

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(data.user || null);
      });

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user || null);
        }
      );

    return () => subscription.unsubscribe();
  }, []);

  /* =======================================================
     PROFIL LADEN
  ======================================================= */

  async function loadProfile() {
    if (!user) {
      setProfile(null);
      return;
    }

    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    if (error) {
      console.error("Profil Fehler:", error);
      return;
    }

    setProfile(data || null);
  }

  /* =======================================================
     MITGLIEDER LADEN
  ======================================================= */

  async function loadMembers() {
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("status", "APPROVED")
        .order("nickname");

    if (error) {
      console.error("Mitglieder Fehler:", error);
      return;
    }

    setMembers(data || []);
  }

  /* =======================================================
     FREUNDE LADEN
  ======================================================= */

  async function loadFriends() {
    if (!user) {
      setFriends([]);
      setFriendRequests([]);
      setSentRequests([]);
      return;
    }

    const { data, error } =
      await supabase
        .from("friendships")
        .select("*")
        .or(
          `requester_id.eq.${user.id},receiver_id.eq.${user.id}`
        );

    if (error) {
      console.error("Freunde Fehler:", error);
      return;
    }

    const relationships = data || [];

    const accepted =
      relationships.filter(
        (item) => item.status === "ACCEPTED"
      );

    const incoming =
      relationships.filter(
        (item) =>
          item.status === "PENDING" &&
          item.receiver_id === user.id
      );

    const outgoing =
      relationships.filter(
        (item) =>
          item.status === "PENDING" &&
          item.requester_id === user.id
      );

    const friendIds =
      accepted.map((item) =>
        item.requester_id === user.id
          ? item.receiver_id
          : item.requester_id
      );

    let friendProfiles = [];

    if (friendIds.length > 0) {
      const { data: friendData } =
        await supabase
          .from("profiles")
          .select("*")
          .in("id", friendIds);

      friendProfiles = friendData || [];
    }

    const incomingIds =
      incoming.map(
        (item) => item.requester_id
      );

    let requestProfiles = [];

    if (incomingIds.length > 0) {
      const { data } =
        await supabase
          .from("profiles")
          .select("*")
          .in("id", incomingIds);

      requestProfiles = data || [];
    }

    setFriends(friendProfiles);

    setFriendRequests(
      incoming.map((request) => ({
        ...request,

        member:
          requestProfiles.find(
            (item) =>
              item.id === request.requester_id
          ),
      }))
    );

    setSentRequests(outgoing);
  }

  /* =======================================================
     ADMIN DATEN
  ======================================================= */

  async function loadPendingMembers() {
    if (!profile || !isAdmin(profile.role)) {
      setPendingMembers([]);
      return;
    }

    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("status", "PENDING_ADMIN")
        .order("created_at");

    if (error) {
      console.error(error);
      return;
    }

    setPendingMembers(data || []);
  }

  /* =======================================================
     DATEN LADEN
  ======================================================= */

  useEffect(() => {
    loadProfile();
    loadMembers();
    loadFriends();
  }, [user]);

  useEffect(() => {
    loadPendingMembers();
  }, [profile]);

  /* =======================================================
     ONLINE STATUS
  ======================================================= */

  useEffect(() => {
    if (!user) return;

    async function updateOnline() {
      await supabase
        .from("profiles")
        .update({
          is_online: true,
          last_seen:
            new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    updateOnline();

    const interval =
      window.setInterval(
        updateOnline,
        60000
      );

    return () => {
      window.clearInterval(interval);

      supabase
        .from("profiles")
        .update({
          is_online: false,
          last_seen:
            new Date().toISOString(),
        })
        .eq("id", user.id);
    };
  }, [user]);

  /* =======================================================
     PROFIL ÖFFNEN
  ======================================================= */

  function openProfile(member) {
    if (!member) return;

    if (!user) {
      showNotice(
        "Bitte melde dich zuerst an, um Profile zu öffnen."
      );

      return;
    }

    setSelectedProfile(member);
    setProfileOpen(true);
  }

  /* =======================================================
     FREUNDSCHAFT STATUS
  ======================================================= */

  const friendIds = useMemo(
    () =>
      new Set(
        friends.map(
          (friend) => friend.id
        )
      ),
    [friends]
  );

  function getFriendshipStatus(memberId) {
    if (!user) return null;

    if (friendIds.has(memberId)) {
      return "FRIEND";
    }

    const incoming =
      friendRequests.find(
        (item) =>
          item.requester_id === memberId
      );

    if (incoming) {
      return "INCOMING";
    }

    const outgoing =
      sentRequests.find(
        (item) =>
          item.receiver_id === memberId
      );

    if (outgoing) {
      return "OUTGOING";
    }

    return null;
  }

  /* =======================================================
     FREUNDSCHAFTSANFRAGE
  ======================================================= */

  async function sendFriendRequest(member) {
    if (!user) {
      showNotice(
        "Bitte melde dich zuerst an."
      );

      return;
    }

    if (member.id === user.id) {
      return;
    }

    const { error } =
      await supabase
        .from("friendships")
        .insert({
          requester_id: user.id,
          receiver_id: member.id,
          status: "PENDING",
        });

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        `Freundschaftsanfrage an ${member.nickname} gesendet.`
      );
    }

    loadFriends();
  }

  async function answerFriendRequest(
    request,
    status
  ) {
    const { error } =
      await supabase
        .from("friendships")
        .update({
          status,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", request.id);

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        status === "ACCEPTED"
          ? "Freundschaftsanfrage angenommen."
          : "Freundschaftsanfrage abgelehnt."
      );
    }

    loadFriends();
  }

  async function removeFriend(member) {
    if (!user) return;

    const confirmed =
      window.confirm(
        `Freundschaft mit ${member.nickname} wirklich entfernen?`
      );

    if (!confirmed) return;

    const { error } =
      await supabase
        .from("friendships")
        .delete()
        .or(
          `and(requester_id.eq.${user.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${user.id})`
        );

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        "Freundschaft entfernt."
      );
    }

    loadFriends();
  }

  /* =======================================================
     ADMIN
  ======================================================= */

  async function approveMember(memberId) {
    const { error } =
      await supabase
        .from("profiles")
        .update({
          status: "APPROVED",
        })
        .eq("id", memberId);

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        "Mitglied wurde freigegeben."
      );
    }

    loadMembers();
    loadPendingMembers();
  }

  async function rejectMember(memberId) {
    const { error } =
      await supabase
        .from("profiles")
        .update({
          status: "REJECTED",
        })
        .eq("id", memberId);

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        "Registrierung wurde abgelehnt."
      );
    }

    loadPendingMembers();
  }

  /* =======================================================
     PUNKTE
  ======================================================= */

  async function changePoints(member) {
    if (!isAdmin(profile?.role)) {
      return;
    }

    const value =
      window.prompt(
        "Punkte eingeben. Beispiel: 10 oder -5"
      );

    if (value === null) return;

    const points = Number(value);

    if (
      !Number.isFinite(points) ||
      points === 0
    ) {
      showNotice(
        "Bitte eine gültige Punktezahl eingeben."
      );

      return;
    }

    const reason =
      window.prompt(
        "Grund für die Punkteänderung:"
      );

    if (
      !reason ||
      reason.trim().length < 3
    ) {
      showNotice(
        "Bitte eine Begründung eingeben."
      );

      return;
    }

    const { data: memberData } =
      await supabase
        .from("profiles")
        .select("community_points")
        .eq("id", member.id)
        .single();

    if (!memberData) {
      showNotice(
        "Mitglied konnte nicht geladen werden."
      );

      return;
    }

    const newPoints =
      Math.max(
        0,
        (memberData.community_points || 0) +
          points
      );

    const { error } =
      await supabase
        .from("profiles")
        .update({
          community_points: newPoints,
        })
        .eq("id", member.id);

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        `${member.nickname}: ${
          points > 0 ? "+" : ""
        }${points} Punkte.`
      );
    }

    loadMembers();

    if (
      selectedProfile?.id === member.id
    ) {
      setSelectedProfile({
        ...selectedProfile,
        community_points: newPoints,
      });
    }
  }

  /* =======================================================
     ABMELDEN
  ======================================================= */

  async function signOut() {
    if (user) {
      await supabase
        .from("profiles")
        .update({
          is_online: false,
          last_seen:
            new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    await supabase.auth.signOut();

    setProfile(null);
    setUser(null);
    setFriends([]);

    showNotice("Du wurdest abgemeldet.");
  }

  /* =======================================================
     SUCHE
  ======================================================= */

  const filteredMembers =
    useMemo(() => {
      const value =
        search.trim().toLowerCase();

      if (!value) {
        return members;
      }

      return members.filter(
        (member) =>
          `${member.nickname || ""} ${
            member.first_name || ""
          } ${member.last_name || ""}`
            .toLowerCase()
            .includes(value)
      );
    }, [members, search]);

  const onlineFriends =
    friends.filter(
      (friend) => friend.is_online
    );

  const offlineFriends =
    friends.filter(
      (friend) => !friend.is_online
    );

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <>
      <header className="site-header">
        <div className="header-content">

          <div className="logo-area">
            <img
              src="/logo.png"
              alt="Ennstal Connect"
              className="logo"
            />
          </div>

          <nav className="nav-links">
            <button
              onClick={() =>
                document
                  .getElementById("start")
                  ?.scrollIntoView({
                    behavior: "smooth",
                  })
              }
            >
              Start
            </button>

            <button
              onClick={() =>
                document
                  .getElementById("mitglieder")
                  ?.scrollIntoView({
                    behavior: "smooth",
                  })
              }
            >
              Mitglieder
            </button>

            <button
              onClick={() =>
                document
                  .getElementById("freunde")
                  ?.scrollIntoView({
                    behavior: "smooth",
                  })
              }
            >
              Freunde
            </button>
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <button
                  className="secondary-button"
                  onClick={() =>
                    openProfile(profile)
                  }
                >
                  {profile?.nickname ||
                    "Mein Profil"}
                </button>

                <button
                  className="primary-button"
                  onClick={signOut}
                >
                  Abmelden
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }}
                >
                  Anmelden
                </button>

                <button
                  className="primary-button"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthOpen(true);
                  }}
                >
                  Registrieren
                </button>
              </>
            )}
          </div>

        </div>
      </header>

      <main className="site-main">

        <section
          id="start"
          className="hero"
        >
          <div className="hero-content">
            <h1>
              Ennstal Connect
            </h1>

            <p>
              Deine regionale Community für
              Ennstal und Obersteiermark.
              Entdecke Mitglieder,
              Freundschaften und die Community.
            </p>

            {!user && (
              <button
                className="primary-button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthOpen(true);
                }}
              >
                Community entdecken
              </button>
            )}
          </div>
        </section>

        {notice && (
          <div className="message-popup">
            {notice}
          </div>
        )}

        {profile &&
          profile.status !== "APPROVED" && (
            <div className="message-popup">
              Dein Konto wartet noch auf die
              Freigabe durch einen Admin.
            </div>
          )}

        <div className="page-layout">

          <div className="content-area">

            <section
              id="mitglieder"
              className="card"
            >
              <h2>
                Mitglieder entdecken
              </h2>

              <p>
                Klicke auf einen Nickname,
                um das Profil eines Mitglieds
                zu öffnen.
              </p>

              <div className="member-search">
                <input
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Mitglieder suchen ..."
                />
              </div>

              <div className="members-grid">

                {filteredMembers.map(
                  (member) => {
                    const friendship =
                      getFriendshipStatus(
                        member.id
                      );

                    return (
                      <article
                        className="member-card"
                        key={member.id}
                      >
                        {friendship ===
                          "FRIEND" && (
                          <img
                            src={FRIEND_LOGO}
                            alt="Freund"
                            className="friend-icon"
                          />
                        )}

                        <div className="member-top">

                          <Avatar
                            member={member}
                          />

                          <div className="member-info">

                            <button
                              className={
                                member.role ===
                                  "ADMIN" ||
                                member.role ===
                                  "HEAD_ADMIN"
                                  ? "nickname nickname-admin"
                                  : member.nickname_color_owned
                                    ? "nickname nickname-premium"
                                    : "nickname nickname-standard"
                              }
                              onClick={() =>
                                openProfile(member)
                              }
                            >
                              {member.nickname}
                            </button>

                            <RoleStars
                              member={member}
                            />

                            <strong>
                              {member.community_points ||
                                0}{" "}
                              Punkte
                            </strong>

                            <div className="status-line">
                              <span
                                className={`status-dot ${
                                  member.is_online
                                    ? "online"
                                    : "offline"
                                }`}
                              />

                              <span
                                className={
                                  member.is_online
                                    ? "status-online"
                                    : "status-offline"
                                }
                              >
                                {member.is_online
                                  ? "Online"
                                  : `Zuletzt online: ${formatDate(
                                      member.last_seen
                                    )}`}
                              </span>
                            </div>

                          </div>

                        </div>

                        {isAdmin(
                          profile?.role
                        ) && (
                          <button
                            className="secondary-button"
                            onClick={() =>
                              changePoints(member)
                            }
                          >
                            Punkte ändern
                          </button>
                        )}

                      </article>
                    );
                  }
                )}

              </div>

              {!filteredMembers.length && (
                <p>
                  Keine Mitglieder gefunden.
                </p>
              )}

            </section>

          </div>

          <aside className="profile-sidebar">

            {user && profile && (
              <section className="card">

                <div className="profile-header">

                  <Avatar
                    member={profile}
                    className="profile-avatar"
                  />

                  <div>
                    <h3 className="profile-name">
                      {profile.nickname}
                    </h3>

                    <p className="profile-role">
                      {roleLabel(profile.role)}
                    </p>

                    <RoleStars
                      member={profile}
                    />
                  </div>

                </div>

                <div className="points-box">
                  <span className="points-label">
                    Deine Community-Punkte
                  </span>

                  <strong className="points-value">
                    {profile.community_points ||
                      0}
                  </strong>
                </div>

                <button
                  className="secondary-button full-button"
                  onClick={() =>
                    openProfile(profile)
                  }
                >
                  Mein Profil öffnen
                </button>

              </section>
            )}

            {user && (
              <section
                id="freunde"
                className="card"
              >

                <h3>
                  Freunde online
                </h3>

                <div className="friends-online-list">

                  {onlineFriends.map(
                    (friend) => (
                      <button
                        key={friend.id}
                        className="friend-online-item"
                        onClick={() =>
                          openProfile(friend)
                        }
                      >
                        <Avatar
                          member={friend}
                        />

                        <div>
                          <strong>
                            {friend.nickname}
                          </strong>

                          <RoleStars
                            member={friend}
                          />

                          <div>
                            {friend.community_points ||
                              0}{" "}
                            Punkte
                          </div>

                          <small className="status-online">
                            ● Online
                          </small>
                        </div>
                      </button>
                    )
                  )}

                  {!onlineFriends.length && (
                    <p>
                      Momentan ist keiner deiner
                      Freunde online.
                    </p>
                  )}

                </div>

                {offlineFriends.length > 0 && (
                  <>
                    <hr />

                    <h4>
                      Freunde offline
                    </h4>

                    <div className="friends-online-list">

                      {offlineFriends.map(
                        (friend) => (
                          <button
                            key={friend.id}
                            className="friend-online-item"
                            onClick={() =>
                              openProfile(friend)
                            }
                          >
                            <Avatar
                              member={friend}
                            />

                            <div>
                              <strong>
                                {friend.nickname}
                              </strong>

                              <RoleStars
                                member={friend}
                              />

                              <div>
                                {friend.community_points ||
                                  0}{" "}
                                Punkte
                              </div>

                              <small className="status-offline">
                                Zuletzt online:
                                <br />
                                {formatDate(
                                  friend.last_seen
                                )}
                              </small>
                            </div>

                          </button>
                        )
                      )}

                    </div>
                  </>
                )}

              </section>
            )}

            {user &&
              friendRequests.length > 0 && (
                <section className="card">

                  <h3>
                    Freundschaftsanfragen
                  </h3>

                  {friendRequests.map(
                    (request) => (
                      <div
                        key={request.id}
                        className="friend-online-item"
                      >
                        <Avatar
                          member={request.member}
                        />

                        <div>
                          <strong>
                            {request.member
                              ?.nickname}
                          </strong>

                          <RoleStars
                            member={request.member}
                          />

                          <br />

                          <button
                            className="primary-button"
                            onClick={() =>
                              answerFriendRequest(
                                request,
                                "ACCEPTED"
                              )
                            }
                          >
                            Annehmen
                          </button>

                          <button
                            className="secondary-button"
                            onClick={() =>
                              answerFriendRequest(
                                request,
                                "REJECTED"
                              )
                            }
                          >
                            Ablehnen
                          </button>
                        </div>
                      </div>
                    )
                  )}

                </section>
              )}

            {isAdmin(profile?.role) && (
              <section className="card admin-section">

                <button
                  className="primary-button full-button"
                  onClick={() =>
                    setAdminOpen(
                      !adminOpen
                    )
                  }
                >
                  Admin Tools{" "}
                  {adminOpen
                    ? "▲"
                    : "▼"}
                </button>

                {adminOpen && (
                  <>
                    <h3>
                      Offene Registrierungen
                    </h3>

                    {pendingMembers.map(
                      (member) => (
                        <div
                          key={member.id}
                          className="admin-member-row"
                        >

                          <div className="admin-member-info">

                            <Avatar
                              member={member}
                            />

                            <div>
                              <strong>
                                {member.nickname}
                              </strong>

                              <div>
                                {member.first_name}{" "}
                                {member.last_name}
                              </div>
                            </div>

                          </div>

                          <div>

                            <button
                              className="primary-button"
                              onClick={() =>
                                approveMember(
                                  member.id
                                )
                              }
                            >
                              ✓
                            </button>

                            <button
                              className="danger-button"
                              onClick={() =>
                                rejectMember(
                                  member.id
                                )
                              }
                            >
                              ×
                            </button>

                          </div>

                        </div>
                      )
                    )}

                    {!pendingMembers.length && (
                      <p>
                        Keine offenen
                        Registrierungen.
                      </p>
                    )}
                  </>
                )}

              </section>
            )}

          </aside>

        </div>

      </main>

      {/* PROFIL MODAL */}

      {profileOpen &&
        selectedProfile && (
          <div className="modal-overlay">

            <div className="modal">

              <button
                className="close-button"
                onClick={() =>
                  setProfileOpen(false)
                }
              >
                ×
              </button>

              <div className="profile-header">

                <Avatar
                  member={selectedProfile}
                  className="profile-avatar"
                />

                <div>

                  <h2
                    className={
                      isAdmin(
                        selectedProfile.role
                      )
                        ? "nickname-admin"
                        : selectedProfile.nickname_color_owned
                          ? "nickname-premium"
                          : "nickname-standard"
                    }
                  >
                    {selectedProfile.nickname}
                  </h2>

                  <p>
                    {roleLabel(
                      selectedProfile.role
                    )}
                  </p>

                  <RoleStars
                    member={selectedProfile}
                  />

                </div>

              </div>

              <div className="points-box">

                <span className="points-label">
                  Community-Punkte
                </span>

                <strong className="points-value">
                  {selectedProfile.community_points ||
                    0}
                </strong>

              </div>

              <p
                className={
                  selectedProfile.is_online
                    ? "status-online"
                    : "status-offline"
                }
              >
                {selectedProfile.is_online
                  ? "● Dieses Mitglied ist online"
                  : `● Zuletzt online: ${formatDate(
                      selectedProfile.last_seen
                    )}`}
              </p>

              {isAdmin(profile?.role) && (
                <div className="admin-section">

                  <h3>
                    Admin Informationen
                  </h3>

                  <p>
                    <strong>
                      E-Mail:
                    </strong>

                    <br />

                    {selectedProfile.email ||
                      "E-Mail wird über Auth verwaltet"}
                  </p>

                </div>
              )}

              {user &&
                selectedProfile.id !==
                  user.id && (
                  <div>

                    {getFriendshipStatus(
                      selectedProfile.id
                    ) === "FRIEND" && (
                      <>
                        <p>
                          Ihr seid Freunde.
                        </p>

                        <button
                          className="danger-button full-button"
                          onClick={() =>
                            removeFriend(
                              selectedProfile
                            )
                          }
                        >
                          Freundschaft entfernen
                        </button>
                      </>
                    )}

                    {getFriendshipStatus(
                      selectedProfile.id
                    ) === "INCOMING" && (
                      <p>
                        Dieses Mitglied hat dir
                        eine Freundschaftsanfrage
                        gesendet.
                      </p>
                    )}

                    {getFriendshipStatus(
                      selectedProfile.id
                    ) === "OUTGOING" && (
                      <p>
                        Freundschaftsanfrage wurde
                        bereits gesendet.
                      </p>
                    )}

                    {!getFriendshipStatus(
                      selectedProfile.id
                    ) && (
                      <button
                        className="primary-button full-button"
                        onClick={() =>
                          sendFriendRequest(
                            selectedProfile
                          )
                        }
                      >
                        Freundschaftsanfrage senden
                      </button>
                    )}

                  </div>
                )}

              {isAdmin(profile?.role) &&
                selectedProfile.id !==
                  user?.id && (
                  <button
                    className="secondary-button full-button"
                    onClick={() =>
                      changePoints(
                        selectedProfile
                      )
                    }
                  >
                    Punkte ändern
                  </button>
                )}

            </div>

          </div>
        )}

      {authOpen && (
        <AuthModal
          mode={authMode}
          onClose={() =>
            setAuthOpen(false)
          }
          onModeChange={setAuthMode}
        />
      )}

      <footer className="site-footer">

        <div className="footer-content">

          <div>

            <img
              src="/logo.png"
              alt="Ennstal Connect"
              className="footer-logo"
            />

            <p>
              Deine regionale Community für
              Ennstal und Obersteiermark.
            </p>

          </div>

        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()}{" "}
          Ennstal Connect
        </div>

      </footer>
    </>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
