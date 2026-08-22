import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "./supabase";

const LOGO = "/logo.png";

function isAdmin(role) {
  return role === "ADMIN" || role === "HEAD_ADMIN";
}

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

function Avatar({ member, large = false }) {
  return (
    <div className={`avatar ${large ? "avatar-large" : ""}`}>
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

function AdminStar({ member }) {
  if (!member || !isAdmin(member.role)) return null;

  return (
    <span
      className="admin-star"
      title="Admin"
    >
      ★
    </span>
  );
}

function AuthModal({
  mode,
  onClose,
  showNotice
}) {
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
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
              emailRedirectTo: window.location.origin,
              data: {
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                nickname: form.nickname.trim(),
                birth_date: form.birth_date
              }
            }
          });

        if (error) {
          showNotice(error.message);
        } else {
          showNotice(
            "Registrierung erfolgreich. Bitte bestätige deine E-Mail."
          );
          onClose();
        }
      }

      if (mode === "login") {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: form.email.trim(),
            password: form.password
          });

        if (error) {
          showNotice(error.message);
        } else {
          showNotice("Erfolgreich angemeldet.");
          onClose();
        }
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
                  onChange={(e) =>
                    updateField(
                      "first_name",
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                Nachname
                <input
                  required
                  value={form.last_name}
                  onChange={(e) =>
                    updateField(
                      "last_name",
                      e.target.value
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
                onChange={(e) =>
                  updateField(
                    "nickname",
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Geburtsdatum
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) =>
                  updateField(
                    "birth_date",
                    e.target.value
                  )
                }
              />
            </label>
          </>
        )}

        <label>
          E-Mail
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) =>
              updateField(
                "email",
                e.target.value
              )
            }
          />
        </label>

        <label>
          Passwort
          <input
            type="password"
            required
            minLength="6"
            autoComplete={
              mode === "login"
                ? "current-password"
                : "new-password"
            }
            value={form.password}
            onChange={(e) =>
              updateField(
                "password",
                e.target.value
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
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);

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

  const [groupOpen, setGroupOpen] =
    useState(false);

  const [profileForm, setProfileForm] =
    useState({
      nickname: "",
      bio: "",
      location: "",
      website: "",
      interests: ""
    });

  const [groupForm, setGroupForm] =
    useState({
      name: "",
      description: "",
      image_url: ""
    });

  const user = session?.user || null;

  const approvedMembers = useMemo(() => {
    return members.filter(
      (member) =>
        member.status === "APPROVED"
    );
  }, [members]);

  const filteredMembers = useMemo(() => {
    const value =
      search.trim().toLowerCase();

    if (!value) {
      return approvedMembers;
    }

    return approvedMembers.filter(
      (member) =>
        getName(member)
          .toLowerCase()
          .includes(value)
    );
  }, [
    approvedMembers,
    search
  ]);

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
        .single();

    if (error) {
      showNotice(error.message);
      return null;
    }

    setProfile(data);

    setProfileForm({
      nickname: data.nickname || "",
      bio: data.bio || "",
      location: data.location || "",
      website: data.website || "",
      interests: data.interests || ""
    });

    return data;
  }

  async function loadMembers() {
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .order("nickname");

    if (error) {
      console.error(error);
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
      console.warn(
        "Gruppen konnten noch nicht geladen werden:",
        error.message
      );
      return;
    }

    setGroups(data || []);
  }

  async function loadAll(userId) {
    await loadMembers();
    await loadGroups();

    if (userId) {
      await loadProfile(userId);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        const currentSession =
          data.session || null;

        setSession(currentSession);

        if (currentSession?.user) {
          loadAll(
            currentSession.user.id
          );
        } else {
          loadAll(null);
        }
      });

    const {
      data: { subscription }
    } =
      supabase.auth.onAuthStateChange(
        (_event, newSession) => {
          setSession(newSession);

          if (newSession?.user) {
            loadAll(
              newSession.user.id
            );
          } else {
            setProfile(null);
            loadMembers();
            loadGroups();
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
      const { error } = await supabase.rpc("set_user_online");
      if (error) console.error("Online-Status Fehler:", error.message);
    }

    setOnline();
    const interval = window.setInterval(setOnline, 60000);
    return () => window.clearInterval(interval);
  }, [profile?.id]);

  async function signOut() {
    if (!user || !supabase) return;

    const { error: offlineError } = await supabase.rpc("set_user_offline");
    if (offlineError) console.error("Offline-Status Fehler:", offlineError.message);

    const { error } = await supabase.auth.signOut();
    if (error) {
      showNotice(error.message);
      return;
    }

    setProfile(null);
    setSession(null);
    setPage("start");
    showNotice("Du wurdest abgemeldet.");
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
      `${profile.id}/avatar-${Date.now()}.${extension}`;

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
      publicUrlData.publicUrl;

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
      "Profilbild wurde gespeichert."
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
      "Profilbild gelöscht. No Pic ist wieder aktiv."
    );
  }

  async function changeOwnEmail() {
    const newEmail =
      window.prompt(
        "Neue E-Mail-Adresse eingeben:"
      );

    if (
      !newEmail ||
      !newEmail.includes("@")
    ) {
      return;
    }

    const { error } =
      await supabase.auth.updateUser({
        email: newEmail.trim()
      });

    if (error) {
      showNotice(error.message);
    } else {
      showNotice(
        "E-Mail-Änderung wurde gestartet. Bitte bestätige die neue Adresse."
      );
    }
  }

  async function changeOwnPassword() {
    const newPassword =
      window.prompt(
        "Neues Passwort eingeben:"
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

    if (
      !groupForm.name.trim() ||
      !groupForm.description.trim() ||
      !groupForm.image_url.trim()
    ) {
      showNotice(
        "Gruppenname, Beschreibung und Bild sind Pflicht."
      );
      return;
    }

    const { error } =
      await supabase
        .from("groups")
        .insert({
          name:
            groupForm.name.trim(),
          description:
            groupForm.description.trim(),
          image_url:
            groupForm.image_url.trim(),
          created_by: profile.id
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

  async function approveMember(member) {
    const { error } =
      await supabase
        .from("profiles")
        .update({
          status: "APPROVED"
        })
        .eq("id", member.id);

    showNotice(
      error
        ? error.message
        : `${getName(member)} wurde freigegeben.`
    );

    await loadMembers();
  }

  async function rejectMember(member) {
    const { error } =
      await supabase
        .from("profiles")
        .update({
          status: "REJECTED"
        })
        .eq("id", member.id);

    showNotice(
      error
        ? error.message
        : "Mitglied wurde abgelehnt."
    );

    await loadMembers();
  }

  async function changePoints(member) {
    if (!profile) return;

    const value = window.prompt(`Punkte für ${getName(member)} eingeben.

10 = hinzufügen
-5 = abziehen`);
    if (value === null) return;

    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === 0) {
      showNotice("Bitte eine gültige Punktezahl eingeben.");
      return;
    }

    const reason = window.prompt("Grund für die Punkteänderung:");
    if (!reason || reason.trim().length < 3) {
      showNotice("Bitte einen Grund mit mindestens 3 Zeichen eingeben.");
      return;
    }

    const { error } = await supabase.rpc("admin_change_points", {
      target_user: member.id,
      delta: amount,
      change_kind: amount > 0 ? "ADD" : "REMOVE",
      reason_text: reason.trim()
    });

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(`${getName(member)}: ${amount > 0 ? "+" : ""}${amount} Punkte`);
    await loadMembers();
    if (profile.id === member.id) await loadProfile(profile.id);
  }

  async function claimOnlineReward() {
    const { data, error } =
      await supabase.rpc(
        "claim_online_reward"
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    if (data?.message) {
      showNotice(data.message);
    }

    if (profile) {
      await loadProfile(profile.id);
    }

    await loadMembers();
  }

  const pendingMembers =
    members.filter(
      (member) =>
        member.status ===
        "PENDING_ADMIN"
    );

  if (supabaseConfigError) {
    return (
      <div className="loading-screen">
        <div className="setup-card">
          <img
            src={LOGO}
            alt="Ennstal Connect"
            className="setup-logo"
          />

          <h1>
            Verbindung wird eingerichtet
          </h1>

          <p>
            {supabaseConfigError}
          </p>

          <p>
            Bitte überprüfe in Netlify:
            <br />
            <strong>
              VITE_SUPABASE_URL
            </strong>
            <br />
            <strong>
              VITE_SUPABASE_ANON_KEY
            </strong>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="setup-card">
          <img
            src={LOGO}
            alt="Ennstal Connect"
            className="setup-logo"
          />

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
              onClick={() =>
                setPage("start")
              }
              className={
                page === "start"
                  ? "active"
                  : ""
              }
            >
              Start
            </button>

            <button
              onClick={() =>
                setPage("members")
              }
              className={
                page === "members"
                  ? "active"
                  : ""
              }
            >
              Mitglieder
            </button>

            <button
              onClick={() =>
                setPage("groups")
              }
              className={
                page === "groups"
                  ? "active"
                  : ""
              }
            >
              Gruppen
            </button>

            {user && (
              <button
                onClick={() =>
                  setPage("profile")
                }
                className={
                  page === "profile"
                    ? "active"
                    : ""
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

                  <AdminStar
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
              <div className="hero-overlay" />

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
                  Die regionale Community
                  für Ennstal und
                  Obersteiermark.
                </p>

                {!user && (
                  <button
                    className="primary-button hero-button"
                    onClick={() =>
                      setAuthMode(
                        "register"
                      )
                    }
                  >
                    Community entdecken
                  </button>
                )}

                {user && (
                  <button
                    className="primary-button hero-button"
                    onClick={() =>
                      setPage("members")
                    }
                  >
                    Mitglieder entdecken
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
                  Gerade online
                </h2>
              </div>

              <div className="online-grid">
                {approvedMembers
                  .filter(
                    (member) =>
                      member.is_online
                  )
                  .slice(0, 6)
                  .map((member) => (
                    <button
                      key={member.id}
                      className="online-card"
                      onClick={() => {
                        setSelectedMember(
                          member
                        );
                      }}
                    >
                      <Avatar member={member} />

                      <div>
                        <strong>
                          {getName(member)}
                        </strong>

                        <AdminStar
                          member={member}
                        />

                        <small className="online-text">
                          ● Online
                        </small>
                      </div>
                    </button>
                  ))}

                {!approvedMembers.some(
                  (member) =>
                    member.is_online
                ) && (
                  <div className="empty-card">
                    Derzeit ist kein Mitglied
                    online.
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
                  Entdecke Menschen aus
                  deiner Region.
                </p>
              </div>

              <input
                className="search-input"
                placeholder="Mitglied suchen..."
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
              />
            </div>

            <div className="member-grid">
              {filteredMembers.map(
                (member) => (
                  <button
                    key={member.id}
                    className="member-card"
                    onClick={() =>
                      setSelectedMember(
                        member
                      )
                    }
                  >
                    <div className="member-card-top">
                      <Avatar
                        member={member}
                        large
                      />

                      <span
                        className={
                          member.is_online
                            ? "status-dot online"
                            : "status-dot"
                        }
                      />
                    </div>

                    <h3>
                      {getName(member)}

                      <AdminStar
                        member={member}
                      />
                    </h3>

                    <p className="member-location">
                      {member.location ||
                        "Ennstal & Obersteiermark"}
                    </p>

                    <div className="member-points">
                      ★{" "}
                      {member.community_points ||
                        0}{" "}
                      Punkte
                    </div>

                    <small
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
                    </small>
                  </button>
                )
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
                  <img
                    src={group.image_url}
                    alt={group.name}
                  />

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
                  <br />
                  Sei der Erste und erstelle
                  eine Gruppe.
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

                        <AdminStar
                          member={profile}
                        />
                      </h1>

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
                      {profile.community_points ||
                        0}
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

                  <button
                    className="secondary-button"
                    onClick={claimOnlineReward}
                  >
                    Onlinezeit-Belohnung prüfen
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
                    onClick={
                      changeOwnPassword
                    }
                  >
                    Passwort ändern
                  </button>
                </section>

                {isAdmin(profile.role) && (
                  <section className="sidebar-card admin-panel">
                    <span className="admin-label">
                      NUR ADMIN
                    </span>

                    <h3>
                      Admin Tools
                    </h3>

                    <div className="admin-stat">
                      Offene Mitglieder:
                      <strong>
                        {pendingMembers.length}
                      </strong>
                    </div>

                    <p>
                      Mitglieder freigeben,
                      ablehnen und Punkte
                      verwalten.
                    </p>

                    {pendingMembers.map(
                      (member) => (
                        <div
                          key={member.id}
                          className="pending-member"
                        >
                          <div>
                            <strong>
                              {getName(
                                member
                              )}
                            </strong>
                          </div>

                          <div className="admin-actions">
                            <button
                              className="approve-button"
                              onClick={() =>
                                approveMember(
                                  member
                                )
                              }
                            >
                              ✓
                            </button>

                            <button
                              className="danger-button"
                              onClick={() =>
                                rejectMember(
                                  member
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    )}

                    <div className="admin-member-list">
                      {approvedMembers.map(
                        (member) => (
                          <div
                            key={member.id}
                            className="admin-member-row"
                          >
                            <span>
                              {getName(
                                member
                              )}
                            </span>

                            <button
                              onClick={() =>
                                changePoints(
                                  member
                                )
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
                  {getName(
                    selectedMember
                  )}

                  <AdminStar
                    member={
                      selectedMember
                    }
                  />
                </h2>

                <p>
                  {selectedMember.location ||
                    "Ennstal & Obersteiermark"}
                </p>
              </div>
            </div>

            <div className="points-panel">
              <span>
                Community-Punkte
              </span>

              <strong>
                {selectedMember.community_points ||
                  0}
              </strong>
            </div>

            <p>
              {selectedMember.bio ||
                "Dieses Mitglied hat noch keine Beschreibung hinzugefügt."}
            </p>

            <p>
              Interessen:
              <br />
              {selectedMember.interests ||
                "Noch keine Angaben"}
            </p>

            <p
              className={
                selectedMember.is_online
                  ? "online-text"
                  : "offline-text"
              }
            >
              ●{" "}
              {selectedMember.is_online
                ? "Dieses Mitglied ist online"
                : "Dieses Mitglied ist derzeit offline"}
            </p>
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
                    onChange={
                      uploadAvatar
                    }
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
                  value={
                    profileForm.nickname
                  }
                  onChange={(e) =>
                    setProfileForm(
                      (old) => ({
                        ...old,
                        nickname:
                          e.target.value
                      })
                    )
                  }
                />
              </label>

              <label>
                Über mich
                <textarea
                  rows="4"
                  value={
                    profileForm.bio
                  }
                  onChange={(e) =>
                    setProfileForm(
                      (old) => ({
                        ...old,
                        bio:
                          e.target.value
                      })
                    )
                  }
                />
              </label>

              <label>
                Wohnort / Region
                <input
                  value={
                    profileForm.location
                  }
                  onChange={(e) =>
                    setProfileForm(
                      (old) => ({
                        ...old,
                        location:
                          e.target.value
                      })
                    )
                  }
                />
              </label>

              <label>
                Website
                <input
                  value={
                    profileForm.website
                  }
                  onChange={(e) =>
                    setProfileForm(
                      (old) => ({
                        ...old,
                        website:
                          e.target.value
                      })
                    )
                  }
                />
              </label>

              <label>
                Interessen
                <input
                  placeholder="z.B. Wandern, Musik, Fußball"
                  value={
                    profileForm.interests
                  }
                  onChange={(e) =>
                    setProfileForm(
                      (old) => ({
                        ...old,
                        interests:
                          e.target.value
                      })
                    )
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
              Gruppenname *
              <input
                required
                value={
                  groupForm.name
                }
                onChange={(e) =>
                  setGroupForm(
                    (old) => ({
                      ...old,
                      name:
                        e.target.value
                    })
                  )
                }
              />
            </label>

            <label>
              Beschreibung *
              <textarea
                required
                rows="5"
                value={
                  groupForm.description
                }
                onChange={(e) =>
                  setGroupForm(
                    (old) => ({
                      ...old,
                      description:
                        e.target.value
                    })
                  )
                }
              />
            </label>

            <label>
              Bild-URL *
              <input
                required
                type="url"
                placeholder="https://..."
                value={
                  groupForm.image_url
                }
                onChange={(e) =>
                  setGroupForm(
                    (old) => ({
                      ...old,
                      image_url:
                        e.target.value
                    })
                  )
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
