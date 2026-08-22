import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "./supabase";

const LOGO = "/logo.png";

function getName(member) {
  if (!member) return "Mitglied";

  return (
    member.nickname ||
    `${member.first_name || ""} ${member.last_name || ""}`.trim() ||
    "Mitglied"
  );
}

function getInitial(member) {
  return getName(member).charAt(0).toUpperCase();
}

function isAdmin(member) {
  return (
    member?.role === "ADMIN" ||
    member?.role === "HEAD_ADMIN"
  );
}

function getAge(birthDate) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  const today = new Date();

  let age =
    today.getFullYear() -
    birth.getFullYear();

  const month =
    today.getMonth() -
    birth.getMonth();

  if (
    month < 0 ||
    (month === 0 &&
      today.getDate() <
        birth.getDate())
  ) {
    age--;
  }

  return age;
}

function Avatar({ member, large = false }) {
  return (
    <div
      className={
        large
          ? "avatar avatar-large"
          : "avatar"
      }
    >
      {member?.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={getName(member)}
        />
      ) : (
        <span>{getInitial(member)}</span>
      )}
    </div>
  );
}

function AdminBadge({ member }) {
  if (!isAdmin(member)) return null;

  return (
    <span
      className="admin-badge"
      title="Administrator"
    >
      ★
    </span>
  );
}

function RoleBadge({ role }) {
  const labels = {
    HEAD_ADMIN: "Hauptadmin",
    ADMIN: "Admin",
    MEMBER: "Mitglied"
  };

  return (
    <span
      className={`role-badge role-${role || "MEMBER"}`}
    >
      {labels[role] || "Mitglied"}
    </span>
  );
}

function AuthModal({
  mode,
  onClose,
  showNotice
}) {
  const [loading, setLoading] =
    useState(false);

  const [form, setForm] =
    useState({
      first_name: "",
      last_name: "",
      nickname: "",
      birth_date: "",
      email: "",
      password: ""
    });

  function updateField(field, value) {
    setForm((old) => ({
      ...old,
      [field]: value
    }));
  }

  async function submit(event) {
    event.preventDefault();

    if (!supabase) return;

    setLoading(true);

    try {
      if (mode === "register") {
        const { error } =
          await supabase.auth.signUp({
            email: form.email.trim(),
            password: form.password,
            options: {
              emailRedirectTo:
                window.location.origin,
              data: {
                first_name:
                  form.first_name.trim(),
                last_name:
                  form.last_name.trim(),
                nickname:
                  form.nickname.trim(),
                birth_date:
                  form.birth_date
              }
            }
          });

        if (error) {
          showNotice(error.message);
          return;
        }

        showNotice(
          "Registrierung erfolgreich. Bitte bestätige deine E-Mail."
        );

        onClose();
      }

      if (mode === "login") {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: form.email.trim(),
            password: form.password
          });

        if (error) {
          showNotice(error.message);
          return;
        }

        showNotice(
          "Erfolgreich angemeldet."
        );

        onClose();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form
        className="modal auth-modal"
        onSubmit={submit}
      >
        <button
          type="button"
          className="close-button"
          onClick={onClose}
        >
          ×
        </button>

        <span className="eyebrow">
          ENNSTAL CONNECT
        </span>

        <h2>
          {mode === "login"
            ? "Anmelden"
            : "Mitglied werden"}
        </h2>

        {mode === "register" && (
          <>
            <div className="form-grid">
              <label>
                Vorname
                <input
                  required
                  value={form.first_name}
                  onChange={(event) =>
                    updateField(
                      "first_name",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Nachname
                <input
                  required
                  value={form.last_name}
                  onChange={(event) =>
                    updateField(
                      "last_name",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>

            <label>
              Spitzname
              <input
                required
                minLength="3"
                value={form.nickname}
                onChange={(event) =>
                  updateField(
                    "nickname",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Geburtsdatum
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
            </label>
          </>
        )}

        <label>
          E-Mail
          <input
            required
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              updateField(
                "email",
                event.target.value
              )
            }
          />
        </label>

        <label>
          Passwort
          <input
            required
            type="password"
            minLength="6"
            autoComplete={
              mode === "login"
                ? "current-password"
                : "new-password"
            }
            value={form.password}
            onChange={(event) =>
              updateField(
                "password",
                event.target.value
              )
            }
          />
        </label>

        <button
          className="primary-button full"
          disabled={loading}
        >
          {loading
            ? "Bitte warten..."
            : mode === "login"
            ? "Anmelden"
            : "Registrieren"}
        </button>
      </form>
    </div>
  );
}

function App() {
  const [session, setSession] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  const [members, setMembers] =
    useState([]);

  const [groups, setGroups] =
    useState([]);

  const [page, setPage] =
    useState("start");

  const [authMode, setAuthMode] =
    useState(null);

  const [notice, setNotice] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  const [selectedMember, setSelectedMember] =
    useState(null);

  const [editProfile, setEditProfile] =
    useState(false);

  const [profileForm, setProfileForm] =
    useState({
      nickname: "",
      bio: "",
      location: "",
      website: "",
      interests: ""
    });

  const [groupOpen, setGroupOpen] =
    useState(false);

  const [groupForm, setGroupForm] =
    useState({
      name: "",
      description: "",
      image_url: ""
    });

  const [friendships, setFriendships] =
    useState([]);

  const [messages, setMessages] =
    useState([]);

  const user =
    session?.user || null;

  function showNotice(message) {
    setNotice(message);

    window.clearTimeout(
      window.__ennstalNoticeTimer
    );

    window.__ennstalNoticeTimer =
      window.setTimeout(() => {
        setNotice("");
      }, 5000);
  }

  async function loadProfile(userId) {
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      console.error(error);
      return null;
    }

    setProfile(data);

    if (data) {
      setProfileForm({
        nickname: data.nickname || "",
        bio: data.bio || "",
        location: data.location || "",
        website: data.website || "",
        interests: data.interests || ""
      });
    }

    return data;
  }

  async function loadMembers() {
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .order("nickname", {
          ascending: true
        });

    if (error) {
      console.error(
        "Mitglieder Fehler:",
        error.message
      );
      return;
    }

    setMembers(data || []);
  }

  async function loadGroups() {
    const { data, error } =
      await supabase
        .from("groups")
        .select("*")
        .order("created_at", {
          ascending: false
        });

    if (error) {
      console.error(
        "Gruppen Fehler:",
        error.message
      );
      return;
    }

    setGroups(data || []);
  }

  async function loadFriendships() {
    if (!user) {
      setFriendships([]);
      return;
    }

    const { data, error } =
      await supabase
        .from("friendships")
        .select("*");

    if (error) {
      console.error(
        "Freundschaften Fehler:",
        error.message
      );
      return;
    }

    setFriendships(data || []);
  }

  async function loadMessages() {
    if (!user) {
      setMessages([]);
      return;
    }

    const { data, error } =
      await supabase
        .from("messages")
        .select("*")
        .order("created_at", {
          ascending: false
        });

    if (error) {
      console.error(
        "Nachrichten Fehler:",
        error.message
      );
      return;
    }

    setMessages(data || []);
  }

  async function loadAll(userId) {
    setLoading(true);

    await loadMembers();
    await loadGroups();

    if (userId) {
      await loadProfile(userId);
      await loadFriendships();
      await loadMessages();
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) return;

    async function initialize() {
      const {
        data: { session: currentSession }
      } =
        await supabase.auth.getSession();

      setSession(currentSession);

      await loadAll(
        currentSession?.user?.id
      );
    }

    initialize();

    const {
      data: { subscription }
    } =
      supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          setSession(newSession);

          if (newSession?.user) {
            await loadAll(
              newSession.user.id
            );
          } else {
            setProfile(null);
            setFriendships([]);
            setMessages([]);
            await loadMembers();
            await loadGroups();
          }
        }
      );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!profile || !supabase) return;

    async function setOnline() {
      const { error } =
        await supabase.rpc(
          "update_online_status",
          {
            online_status: true
          }
        );

      if (error) {
        console.error(
          "Online-Status Fehler:",
          error.message
        );
      }
    }

    setOnline();

    const interval =
      window.setInterval(
        setOnline,
        60000
      );

    return () => {
      window.clearInterval(interval);
    };
  }, [profile?.id]);

  const visibleMembers =
    useMemo(() => {
      const value =
        search.trim().toLowerCase();

      if (!value) {
        return members;
      }

      return members.filter(
        (member) =>
          getName(member)
            .toLowerCase()
            .includes(value)
      );
    }, [members, search]);

  async function signOut() {
    if (!supabase) return;

    await supabase.rpc(
      "update_online_status",
      {
        online_status: false
      }
    );

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      showNotice(error.message);
      return;
    }

    setProfile(null);
    setSession(null);
    setPage("start");

    showNotice(
      "Du wurdest abgemeldet."
    );
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!profile) return;

    const { error } =
      await supabase
        .from("profiles")
        .update({
          nickname:
            profileForm.nickname.trim(),
          bio:
            profileForm.bio.trim(),
          location:
            profileForm.location.trim(),
          website:
            profileForm.website.trim(),
          interests:
            profileForm.interests.trim()
        })
        .eq("id", profile.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadProfile(profile.id);
    await loadMembers();

    setEditProfile(false);

    showNotice(
      "Profil wurde gespeichert."
    );
  }

  async function uploadAvatar(event) {
    const file =
      event.target.files?.[0];

    if (!file || !profile) return;

    if (
      !file.type.startsWith("image/")
    ) {
      showNotice(
        "Bitte wähle ein Bild aus."
      );
      return;
    }

    const extension =
      file.name.split(".").pop();

    const filePath =
      `${profile.id}/avatar.${extension}`;

    const { error: uploadError } =
      await supabase.storage
        .from("avatars")
        .upload(
          filePath,
          file,
          {
            upsert: true
          }
        );

    if (uploadError) {
      showNotice(
        uploadError.message
      );
      return;
    }

    const {
      data: publicUrlData
    } =
      supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

    const avatarUrl =
      `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error } =
      await supabase
        .from("profiles")
        .update({
          avatar_url: avatarUrl
        })
        .eq("id", profile.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadProfile(profile.id);
    await loadMembers();

    showNotice(
      "Profilbild gespeichert."
    );
  }

  async function deleteAvatar() {
    if (!profile) return;

    const { error } =
      await supabase
        .from("profiles")
        .update({
          avatar_url: null
        })
        .eq("id", profile.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadProfile(profile.id);
    await loadMembers();

    showNotice(
      "Profilbild gelöscht."
    );
  }

  async function changeOwnEmail() {
    const newEmail =
      window.prompt(
        "Neue E-Mail-Adresse:"
      );

    if (!newEmail) return;

    const { error } =
      await supabase.auth.updateUser({
        email: newEmail.trim()
      });

    showNotice(
      error
        ? error.message
        : "Bitte bestätige die neue E-Mail-Adresse."
    );
  }

  async function changeOwnPassword() {
    const newPassword =
      window.prompt(
        "Neues Passwort:"
      );

    if (
      !newPassword ||
      newPassword.length < 6
    ) {
      showNotice(
        "Das Passwort muss mindestens 6 Zeichen haben."
      );
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        password: newPassword
      });

    showNotice(
      error
        ? error.message
        : "Passwort wurde geändert."
    );
  }

  async function createGroup(event) {
    event.preventDefault();

    if (!profile) return;

    const { error } =
      await supabase
        .from("groups")
        .insert({
          name:
            groupForm.name.trim(),
          description:
            groupForm.description.trim(),
          image_url:
            groupForm.image_url.trim() ||
            null,
          created_by:
            profile.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    setGroupForm({
      name: "",
      description: "",
      image_url: ""
    });

    setGroupOpen(false);

    await loadGroups();

    showNotice(
      "Gruppe wurde erstellt."
    );
  }

  async function changePoints(member) {
    if (!isAdmin(profile)) {
      showNotice(
        "Du hast keine Adminrechte."
      );
      return;
    }

    const value =
      window.prompt(
        "Punkte eingeben, z.B. 10 oder -5:"
      );

    if (value === null) return;

    const delta = Number(value);

    if (
      !Number.isFinite(delta) ||
      delta === 0
    ) {
      showNotice(
        "Ungültige Punktezahl."
      );
      return;
    }

    const reason =
      window.prompt(
        "Grund für die Änderung:"
      );

    if (!reason) return;

    const { error } =
      await supabase.rpc(
        "admin_change_points",
        {
          target_user: member.id,
          delta,
          reason_text: reason
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadMembers();

    showNotice(
      "Punkte wurden geändert."
    );
  }

  async function sendFriendRequest(member) {
    const { error } =
      await supabase.rpc(
        "send_friend_request",
        {
          target_user: member.id
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadFriendships();

    showNotice(
      "Freundschaftsanfrage gesendet."
    );
  }

  async function acceptFriendRequest(friendship) {
    const { error } =
      await supabase.rpc(
        "accept_friend_request",
        {
          friendship_id: friendship.id
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    await loadFriendships();

    showNotice(
      "Freundschaft angenommen."
    );
  }

  async function sendMessage(member) {
    const message =
      window.prompt(
        `Nachricht an ${getName(member)}:`
      );

    if (!message) return;

    const { error } =
      await supabase.rpc(
        "send_private_message",
        {
          target_user: member.id,
          message_text: message
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Nachricht wurde gesendet."
    );
  }

  async function openMember(member) {
    setSelectedMember(member);

    if (
      user &&
      member.id !== user.id
    ) {
      await supabase.rpc(
        "record_profile_visit",
        {
          target_profile: member.id
        }
      );
    }
  }

  function getFriendship(memberId) {
    if (!user) return null;

    return friendships.find(
      (friendship) =>
        friendship.requester_id === memberId ||
        friendship.addressee_id === memberId
    );
  }

  if (supabaseConfigError) {
    return (
      <div className="loading-screen">
        <div className="setup-card">
          <h1>
            Supabase konfigurieren
          </h1>

          <p>
            {supabaseConfigError}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="setup-card">
          <p>
            Community wird geladen...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="site-header">
        <div className="header-content">
          <button
            className="logo-button"
            onClick={() =>
              setPage("start")
            }
          >
            <img
              className="site-logo"
              src={LOGO}
              alt="Ennstal Connect"
            />
          </button>

          <nav className="nav-links">
            <button
              className={
                page === "start"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setPage("start")
              }
            >
              Start
            </button>

            <button
              className={
                page === "members"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setPage("members")
              }
            >
              Mitglieder
            </button>

            <button
              className={
                page === "groups"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setPage("groups")
              }
            >
              Gruppen
            </button>

            {user && (
              <button
                className={
                  page === "profile"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPage("profile")
                }
              >
                Mein Bereich
              </button>
            )}
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <button
                  className="user-button"
                  onClick={() =>
                    setPage("profile")
                  }
                >
                  <Avatar member={profile} />

                  <span>
                    {getName(profile)}
                  </span>

                  <AdminBadge
                    member={profile}
                  />
                </button>

                <button
                  className="secondary-button"
                  onClick={signOut}
                >
                  Abmelden
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button"
                  onClick={() =>
                    setAuthMode("login")
                  }
                >
                  Anmelden
                </button>

                <button
                  className="primary-button"
                  onClick={() =>
                    setAuthMode("register")
                  }
                >
                  Registrieren
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {notice && (
        <div className="notice">
          {notice}
        </div>
      )}

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() =>
            setAuthMode(null)
          }
          showNotice={showNotice}
        />
      )}

      <main className="main-layout">
        {page === "start" && (
          <>
            <section className="hero">
              <div className="hero-content">
                <span className="eyebrow">
                  REGIONAL. VERBUNDEN. GEMEINSAM.
                </span>

                <h1>
                  Willkommen bei
                  <br />
                  Ennstal Connect
                </h1>

                <p>
                  Deine Community für das
                  Ennstal und die Obersteiermark.
                </p>

                {!user && (
                  <button
                    className="primary-button"
                    onClick={() =>
                      setAuthMode("register")
                    }
                  >
                    Community entdecken
                  </button>
                )}
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <span className="eyebrow">
                  COMMUNITY
                </span>

                <h2>
                  Mitglieder
                </h2>
              </div>

              <div className="online-grid">
                {members
                  .filter(
                    (member) =>
                      member.is_online
                  )
                  .slice(0, 6)
                  .map((member) => (
                    <button
                      key={member.id}
                      className="online-card"
                      onClick={() =>
                        openMember(member)
                      }
                    >
                      <Avatar member={member} />

                      <div>
                        <strong>
                          {getName(member)}
                        </strong>

                        <AdminBadge
                          member={member}
                        />

                        <small className="online-text">
                          ● Online
                        </small>
                      </div>
                    </button>
                  ))}

                {!members.some(
                  (member) =>
                    member.is_online
                ) && (
                  <div className="empty-card">
                    Derzeit ist kein Mitglied online.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {page === "members" && (
          <section className="section">
            <div className="section-heading members-heading">
              <div>
                <span className="eyebrow">
                  COMMUNITY
                </span>

                <h1>
                  Mitglieder
                </h1>

                <p>
                  Entdecke Menschen aus deiner Region.
                </p>
              </div>

              <input
                className="search-input"
                placeholder="Mitglied suchen..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </div>

            <div className="member-grid">
              {visibleMembers.map(
                (member) => {
                  const age =
                    getAge(
                      member.birth_date
                    );

                  const friendship =
                    getFriendship(
                      member.id
                    );

                  return (
                    <article
                      key={member.id}
                      className={`member-card role-card-${member.role || "MEMBER"}`}
                    >
                      <div className="member-card-top">
                        <Avatar
                          member={member}
                          large
                        />

                        <div className="member-symbols">
                          <AdminBadge
                            member={member}
                          />

                          {friendship?.status ===
                            "ACCEPTED" && (
                            <span
                              className="friend-badge"
                              title="Freund"
                            >
                              ♥
                            </span>
                          )}
                        </div>
                      </div>

                      <h3>
                        {getName(member)}
                      </h3>

                      {age !== null && (
                        <p>
                          {age} Jahre
                        </p>
                      )}

                      <RoleBadge
                        role={member.role}
                      />

                      <p className="member-location">
                        {member.location ||
                          "Ennstal & Obersteiermark"}
                      </p>

                      <div className="member-points">
                        ★{" "}
                        {member.community_points || 0}{" "}
                        Punkte
                      </div>

                      <p
                        className={
                          member.is_online
                            ? "online-text"
                            : "offline-text"
                        }
                      >
                        ●{" "}
                        {member.is_online
                          ? "Online"
                          : "Offline"}
                      </p>

                      <button
                        className="secondary-button full"
                        onClick={() =>
                          openMember(member)
                        }
                      >
                        Profil ansehen
                      </button>
                    </article>
                  );
                }
              )}
            </div>
          </section>
        )}

        {page === "groups" && (
          <section className="section">
            <div className="section-heading groups-heading">
              <div>
                <span className="eyebrow">
                  GEMEINSCHAFT
                </span>

                <h1>
                  Gruppen
                </h1>

                <p>
                  Finde Menschen mit
                  gemeinsamen Interessen.
                </p>
              </div>

              {user && (
                <button
                  className="primary-button"
                  onClick={() =>
                    setGroupOpen(true)
                  }
                >
                  + Gruppe erstellen
                </button>
              )}
            </div>

            <div className="group-grid">
              {groups.map((group) => (
                <article
                  key={group.id}
                  className="group-card"
                >
                  {group.image_url && (
                    <img
                      src={group.image_url}
                      alt={group.name}
                    />
                  )}

                  <div className="group-card-content">
                    <h3>
                      {group.name}
                    </h3>

                    <p>
                      {group.description}
                    </p>
                  </div>
                </article>
              ))}

              {!groups.length && (
                <div className="empty-card">
                  Noch keine Gruppen vorhanden.
                </div>
              )}
            </div>
          </section>
        )}

        {page === "profile" &&
          user &&
          profile && (
            <section className="section profile-layout">
              <div className="profile-main">
                <div className="profile-card">
                  <div className="profile-top">
                    <Avatar
                      member={profile}
                      large
                    />

                    <div>
                      <h1>
                        {getName(profile)}
                      </h1>

                      <RoleBadge
                        role={profile.role}
                      />

                      <p>
                        {profile.location ||
                          "Ennstal & Obersteiermark"}
                      </p>
                    </div>
                  </div>

                  <div className="points-panel">
                    <span>
                      Community-Punkte
                    </span>

                    <strong>
                      {profile.community_points || 0}
                    </strong>
                  </div>

                  <p className="profile-bio">
                    {profile.bio ||
                      "Noch keine Beschreibung vorhanden."}
                  </p>

                  <button
                    className="primary-button"
                    onClick={() =>
                      setEditProfile(true)
                    }
                  >
                    Profil bearbeiten
                  </button>
                </div>
              </div>

              <aside className="profile-sidebar">
                <section className="sidebar-card">
                  <h3>
                    Mein Bereich
                  </h3>

                  <button
                    onClick={() =>
                      setEditProfile(true)
                    }
                  >
                    Profil gestalten
                  </button>

                  <button
                    onClick={changeOwnEmail}
                  >
                    E-Mail ändern
                  </button>

                  <button
                    onClick={changeOwnPassword}
                  >
                    Passwort ändern
                  </button>
                </section>

                {isAdmin(profile) && (
                  <section className="sidebar-card admin-panel">
                    <span className="admin-label">
                      NUR ADMIN
                    </span>

                    <h3>
                      Mitglieder verwalten
                    </h3>

                    <div className="admin-member-list">
                      {members.map(
                        (member) => (
                          <div
                            key={member.id}
                            className="admin-member-row"
                          >
                            <span>
                              {getName(member)}
                            </span>

                            <button
                              onClick={() =>
                                changePoints(member)
                              }
                            >
                              Punkte
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                )}

                {messages.length > 0 && (
                  <section className="sidebar-card">
                    <h3>
                      Nachrichten
                    </h3>

                    <strong>
                      {messages.length}
                    </strong>
                  </section>
                )}
              </aside>
            </section>
          )}
      </main>

      {selectedMember && (
        <div className="modal-overlay">
          <div className="modal member-modal">
            <button
              className="close-button"
              onClick={() =>
                setSelectedMember(null)
              }
            >
              ×
            </button>

            <div className="profile-top">
              <Avatar
                member={selectedMember}
                large
              />

              <div>
                <h2>
                  {getName(selectedMember)}
                </h2>

                <RoleBadge
                  role={selectedMember.role}
                />
              </div>
            </div>

            <p>
              {selectedMember.bio ||
                "Dieses Mitglied hat noch keine Beschreibung."}
            </p>

            <p>
              Interessen:
              <br />
              {selectedMember.interests ||
                "Noch keine Angaben"}
            </p>

            {user &&
              selectedMember.id !== user.id && (
                <div className="member-modal-actions">
                  <button
                    className="primary-button"
                    onClick={() =>
                      sendFriendRequest(
                        selectedMember
                      )
                    }
                  >
                    ♥ Freundschaft
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() =>
                      sendMessage(
                        selectedMember
                      )
                    }
                  >
                    ✉ Nachricht
                  </button>

                  {isAdmin(profile) && (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        changePoints(
                          selectedMember
                        )
                      }
                    >
                      ★ Punkte ändern
                    </button>
                  )}
                </div>
              )}
          </div>
        </div>
      )}

      {editProfile &&
        profile && (
          <div className="modal-overlay">
            <form
              className="modal edit-profile-modal"
              onSubmit={saveProfile}
            >
              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setEditProfile(false)
                }
              >
                ×
              </button>

              <h2>
                Mein Profil gestalten
              </h2>

              <div className="avatar-edit">
                <Avatar
                  member={profile}
                  large
                />

                <label className="upload-button">
                  Profilbild auswählen

                  <input
                    type="file"
                    accept="image/*"
                    onChange={uploadAvatar}
                  />
                </label>

                {profile.avatar_url && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={deleteAvatar}
                  >
                    Bild löschen
                  </button>
                )}
              </div>

              <label>
                Spitzname
                <input
                  value={profileForm.nickname}
                  onChange={(event) =>
                    setProfileForm((old) => ({
                      ...old,
                      nickname:
                        event.target.value
                    }))
                  }
                />
              </label>

              <label>
                Über mich
                <textarea
                  rows="4"
                  value={profileForm.bio}
                  onChange={(event) =>
                    setProfileForm((old) => ({
                      ...old,
                      bio:
                        event.target.value
                    }))
                  }
                />
              </label>

              <label>
                Wohnort / Region
                <input
                  value={profileForm.location}
                  onChange={(event) =>
                    setProfileForm((old) => ({
                      ...old,
                      location:
                        event.target.value
                    }))
                  }
                />
              </label>

              <label>
                Website
                <input
                  value={profileForm.website}
                  onChange={(event) =>
                    setProfileForm((old) => ({
                      ...old,
                      website:
                        event.target.value
                    }))
                  }
                />
              </label>

              <label>
                Interessen
                <input
                  placeholder="z.B. Wandern, Musik"
                  value={profileForm.interests}
                  onChange={(event) =>
                    setProfileForm((old) => ({
                      ...old,
                      interests:
                        event.target.value
                    }))
                  }
                />
              </label>

              <button className="primary-button full">
                Änderungen speichern
              </button>
            </form>
          </div>
        )}

      {groupOpen && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={createGroup}
          >
            <button
              type="button"
              className="close-button"
              onClick={() =>
                setGroupOpen(false)
              }
            >
              ×
            </button>

            <h2>
              Neue Gruppe erstellen
            </h2>

            <label>
              Gruppenname
              <input
                required
                value={groupForm.name}
                onChange={(event) =>
                  setGroupForm((old) => ({
                    ...old,
                    name:
                      event.target.value
                  }))
                }
              />
            </label>

            <label>
              Beschreibung
              <textarea
                required
                rows="5"
                value={
                  groupForm.description
                }
                onChange={(event) =>
                  setGroupForm((old) => ({
                    ...old,
                    description:
                      event.target.value
                  }))
                }
              />
            </label>

            <label>
              Bild-URL
              <input
                type="url"
                value={groupForm.image_url}
                onChange={(event) =>
                  setGroupForm((old) => ({
                    ...old,
                    image_url:
                      event.target.value
                  }))
                }
              />
            </label>

            <button className="primary-button full">
              Gruppe erstellen
            </button>
          </form>
        </div>
      )}

      <footer>
        © 2026 Ennstal Connect
      </footer>
    </div>
  );
}

export default App;
