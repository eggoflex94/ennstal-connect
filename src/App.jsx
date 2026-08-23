import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

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

function normalizeRole(role) {
  return String(role || "MEMBER").toUpperCase();
}

function roleLabel(role) {
  const value = normalizeRole(role);

  if (value === "ADMIN" || value === "HEAD_ADMIN") {
    return "Admin";
  }

  if (value === "SUPPORTER") {
    return "Supporter";
  }

  return "Mitglied";
}

function isAdmin(role) {
  const value = normalizeRole(role);

  return value === "ADMIN" || value === "HEAD_ADMIN";
}

function Avatar({ member }) {
  return (
    <div className="member-avatar">
      {member?.avatar_url ? (
        <img
          src={member.avatar_url}
          alt={getName(member)}
        />
      ) : (
        getInitial(member)
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("home");

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);

  const [authMode, setAuthMode] = useState(null);

  const [message, setMessage] = useState("");

  const [registerForm, setRegisterForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    birth_date: "",
    email: "",
    password: ""
  });

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });

  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    image_url: ""
  });

  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    location: "",
    event_date: "",
    image_url: ""
  });

  const [newsForm, setNewsForm] = useState({
    title: "",
    content: ""
  });

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 5000);
  }

  async function loadProfile(userId) {
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profil Fehler:", error);
      return;
    }

    setProfile(data);
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*");

    if (error) {
      console.error("Mitglieder Fehler:", error);
      return;
    }

    setMembers(data || []);
  }

  async function loadGroups() {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("Gruppen Fehler:", error);
      return;
    }

    setGroups(data || []);
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("event_date", {
        ascending: true
      });

    if (error) {
      console.error("Events Fehler:", error);
      return;
    }

    setEvents(data || []);
  }

  async function loadNews() {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("News Fehler:", error);
      return;
    }

    setNews(data || []);
  }

  async function loadEverything(userId) {
    setLoading(true);

    await Promise.all([
      loadMembers(),
      loadGroups(),
      loadEvents(),
      loadNews()
    ]);

    if (userId) {
      await loadProfile(userId);
    } else {
      setProfile(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function initialize() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      setSession(session);

      await loadEverything(session?.user?.id);
    }

    initialize();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user?.id) {
          await loadEverything(newSession.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const sortedMembers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    const filtered = members.filter((member) => {
      if (!searchValue) return true;

      const name = getName(member).toLowerCase();

      const fullName = `${member.first_name || ""} ${
        member.last_name || ""
      }`.toLowerCase();

      return (
        name.includes(searchValue) ||
        fullName.includes(searchValue)
      );
    });

    return [...filtered].sort((a, b) => {
      const roleA = normalizeRole(a.role);
      const roleB = normalizeRole(b.role);

      function priority(role) {
        if (
          role === "ADMIN" ||
          role === "HEAD_ADMIN"
        ) {
          return 1;
        }

        if (role === "SUPPORTER") {
          return 2;
        }

        return 3;
      }

      const priorityA = priority(roleA);
      const priorityB = priority(roleB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return getName(a).localeCompare(
        getName(b),
        "de"
      );
    });
  }, [members, search]);

  const admins = sortedMembers.filter((member) =>
    isAdmin(member.role)
  );

  const supporters = sortedMembers.filter(
    (member) =>
      normalizeRole(member.role) === "SUPPORTER"
  );

  const normalMembers = sortedMembers.filter(
    (member) =>
      !isAdmin(member.role) &&
      normalizeRole(member.role) !== "SUPPORTER"
  );

  async function register(event) {
    event.preventDefault();

    const { error } =
      await supabase.auth.signUp({
        email: registerForm.email.trim(),
        password: registerForm.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name:
              registerForm.first_name.trim(),

            last_name:
              registerForm.last_name.trim(),

            nickname:
              registerForm.nickname.trim(),

            birth_date:
              registerForm.birth_date
          }
        }
      });

    if (error) {
      showMessage(error.message);
      return;
    }

    showMessage(
      "Registrierung erfolgreich. Bitte bestätige deine E-Mail."
    );

    setAuthMode(null);
  }

  async function login(event) {
    event.preventDefault();

    const { error } =
      await supabase.auth.signInWithPassword({
        email: loginForm.email.trim(),
        password: loginForm.password
      });

    if (error) {
      showMessage(error.message);
      return;
    }

    showMessage("Erfolgreich angemeldet.");

    setAuthMode(null);
  }

  async function logout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      showMessage(error.message);
      return;
    }

    setProfile(null);
    setSession(null);

    showMessage("Du wurdest abgemeldet.");

    setPage("home");
  }

  async function createGroup(event) {
    event.preventDefault();

    if (!session?.user) {
      showMessage(
        "Du musst angemeldet sein."
      );

      return;
    }

    const { error } =
      await supabase
        .from("groups")
        .insert({
          owner_id: session.user.id,

          name:
            groupForm.name.trim(),

          description:
            groupForm.description.trim(),

          image_url:
            groupForm.image_url.trim() || null
        });

    if (error) {
      showMessage(error.message);
      return;
    }

    showMessage(
      "Gruppe wurde erstellt."
    );

    setGroupForm({
      name: "",
      description: "",
      image_url: ""
    });

    await loadGroups();
  }

  async function createEvent(event) {
    event.preventDefault();

    if (!session?.user) {
      showMessage(
        "Du musst angemeldet sein."
      );

      return;
    }

    const { error } =
      await supabase
        .from("events")
        .insert({
          creator_id: session.user.id,

          title:
            eventForm.title.trim(),

          description:
            eventForm.description.trim(),

          location:
            eventForm.location.trim(),

          event_date:
            eventForm.event_date,

          image_url:
            eventForm.image_url.trim() || null
        });

    if (error) {
      showMessage(error.message);
      return;
    }

    showMessage(
      "Event wurde erstellt."
    );

    setEventForm({
      title: "",
      description: "",
      location: "",
      event_date: "",
      image_url: ""
    });

    await loadEvents();
  }

  async function createNews(event) {
    event.preventDefault();

    if (!session?.user || !isAdmin(profile?.role)) {
      showMessage(
        "Nur Admins können News erstellen."
      );

      return;
    }

    const { error } =
      await supabase
        .from("news")
        .insert({
          author_id: session.user.id,

          title:
            newsForm.title.trim(),

          content:
            newsForm.content.trim()
        });

    if (error) {
      showMessage(error.message);
      return;
    }

    showMessage(
      "News wurde veröffentlicht."
    );

    setNewsForm({
      title: "",
      content: ""
    });

    await loadNews();
  }

  if (loading) {
    return (
      <div className="app-loading">
        Community wird geladen...
      </div>
    );
  }

  return (
    <div className="app">

      <header className="site-header">

        <div
          className="brand"
          onClick={() =>
            setPage("home")
          }
        >
          ENNSTAL CONNECT
        </div>

        <nav className="navigation">

          <button
            className={
              page === "home"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("home")
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

          <button
            className={
              page === "events"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("events")
            }
          >
            Events
          </button>

        </nav>

        <div className="header-user">

          {session ? (
            <>
              <span>
                {getName(profile)}
              </span>

              <button
                onClick={logout}
              >
                Abmelden
              </button>
            </>
          ) : (
            <>
              <button
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
                Mitglied werden
              </button>
            </>
          )}

        </div>

      </header>

      {message && (
        <div className="message">
          {message}
        </div>
      )}

      <main className="main-content">

        {/* STARTSEITE */}

        {page === "home" && (
          <section>

            <div className="hero">
              <span>
                WILLKOMMEN
              </span>

              <h1>
                Deine Community.
                <br />
                Deine Region.
              </h1>

              <p>
                Verbinde dich mit Menschen,
                entdecke Gruppen und bleibe
                über Events und Neuigkeiten
                informiert.
              </p>

              <button
                className="primary-button"
                onClick={() =>
                  setPage("members")
                }
              >
                Mitglieder entdecken
              </button>
            </div>

            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  AKTUELLES
                </span>

                <h2>
                  Neuigkeiten
                </h2>
              </div>
            </div>

            {isAdmin(profile?.role) && (
              <form
                className="create-form"
                onSubmit={createNews}
              >
                <h3>
                  News erstellen
                </h3>

                <input
                  placeholder="Titel"
                  required
                  value={newsForm.title}
                  onChange={(e) =>
                    setNewsForm({
                      ...newsForm,
                      title: e.target.value
                    })
                  }
                />

                <textarea
                  placeholder="Neuigkeit schreiben..."
                  required
                  value={newsForm.content}
                  onChange={(e) =>
                    setNewsForm({
                      ...newsForm,
                      content: e.target.value
                    })
                  }
                />

                <button
                  className="primary-button"
                >
                  Veröffentlichen
                </button>
              </form>
            )}

            <div className="news-grid">

              {news.map((item) => (
                <article
                  className="news-card"
                  key={item.id}
                >
                  <h3>
                    {item.title}
                  </h3>

                  <p>
                    {item.content}
                  </p>

                  <small>
                    {item.created_at
                      ? new Date(
                          item.created_at
                        ).toLocaleDateString(
                          "de-DE"
                        )
                      : ""}
                  </small>
                </article>
              ))}

              {!news.length && (
                <div className="empty-card">
                  Noch keine Neuigkeiten vorhanden.
                </div>
              )}

            </div>

          </section>
        )}

        {/* MITGLIEDER */}

        {page === "members" && (
          <section>

            <div className="section-heading members-heading">

              <div>
                <span className="eyebrow">
                  COMMUNITY
                </span>

                <h1>
                  Mitgliederübersicht
                </h1>

                <p>
                  Entdecke alle registrierten
                  Mitglieder.
                </p>
              </div>

              <input
                className="search-input"
                placeholder="🔍 Mitglied suchen..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
              />

            </div>

            {admins.length > 0 && (
              <>
                <h2 className="member-section-title">
                  ⭐ Admins
                </h2>

                <div className="member-grid">
                  {admins.map((member) => (
                    <article
                      className="member-card role-admin"
                      key={member.id}
                    >
                      <Avatar
                        member={member}
                      />

                      <div className="member-info">

                        <h3>
                          {getName(member)}
                        </h3>

                        <span className="role-badge">
                          ⭐ Admin
                        </span>

                        {member.location && (
                          <p>
                            📍 {member.location}
                          </p>
                        )}

                        <div className="member-points">
                          ★{" "}
                          {member.community_points ||
                            0}{" "}
                          Punkte
                        </div>

                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {supporters.length > 0 && (
              <>
                <h2 className="member-section-title">
                  ★ Supporter
                </h2>

                <div className="member-grid">
                  {supporters.map((member) => (
                    <article
                      className="member-card role-supporter"
                      key={member.id}
                    >
                      <Avatar
                        member={member}
                      />

                      <div className="member-info">

                        <h3>
                          {getName(member)}
                        </h3>

                        <span className="role-badge">
                          ★ Supporter
                        </span>

                        {member.location && (
                          <p>
                            📍 {member.location}
                          </p>
                        )}

                        <div className="member-points">
                          ★{" "}
                          {member.community_points ||
                            0}{" "}
                          Punkte
                        </div>

                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            <h2 className="member-section-title">
              Mitglieder A–Z
            </h2>

            <div className="member-grid">

              {normalMembers.map((member) => (
                <article
                  className="member-card role-member"
                  key={member.id}
                >
                  <Avatar
                    member={member}
                  />

                  <div className="member-info">

                    <h3>
                      {getName(member)}
                    </h3>

                    <span className="role-badge">
                      {roleLabel(member.role)}
                    </span>

                    {member.location && (
                      <p>
                        📍 {member.location}
                      </p>
                    )}

                    <div className="member-points">
                      ★{" "}
                      {member.community_points ||
                        0}{" "}
                      Punkte
                    </div>

                  </div>
                </article>
              ))}

              {!sortedMembers.length && (
                <div className="empty-card">
                  Keine Mitglieder gefunden.
                </div>
              )}

            </div>

          </section>
        )}

        {/* GRUPPEN */}

        {page === "groups" && (
          <section>

            <div className="section-heading">

              <div>
                <span className="eyebrow">
                  GEMEINSCHAFT
                </span>

                <h1>
                  Gruppen
                </h1>
              </div>

            </div>

            {session && (
              <form
                className="create-form"
                onSubmit={createGroup}
              >

                <h3>
                  Neue Gruppe erstellen
                </h3>

                <input
                  placeholder="Gruppenname"
                  required
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      name: e.target.value
                    })
                  }
                />

                <textarea
                  placeholder="Beschreibung"
                  required
                  value={groupForm.description}
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      description: e.target.value
                    })
                  }
                />

                <input
                  placeholder="Bild URL (optional)"
                  value={groupForm.image_url}
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      image_url: e.target.value
                    })
                  }
                />

                <button
                  className="primary-button"
                >
                  Gruppe erstellen
                </button>

              </form>
            )}

            <div className="group-grid">

              {groups.map((group) => (
                <article
                  className="group-card"
                  key={group.id}
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

        {/* EVENTS */}

        {page === "events" && (
          <section>

            <div className="section-heading">

              <div>
                <span className="eyebrow">
                  TREFFEN & AKTIVITÄTEN
                </span>

                <h1>
                  Events
                </h1>
              </div>

            </div>

            {session && (
              <form
                className="create-form"
                onSubmit={createEvent}
              >

                <h3>
                  Event erstellen
                </h3>

                <input
                  placeholder="Titel"
                  required
                  value={eventForm.title}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      title: e.target.value
                    })
                  }
                />

                <textarea
                  placeholder="Beschreibung"
                  required
                  value={eventForm.description}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      description: e.target.value
                    })
                  }
                />

                <input
                  placeholder="Ort"
                  required
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      location: e.target.value
                    })
                  }
                />

                <input
                  type="datetime-local"
                  required
                  value={eventForm.event_date}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      event_date: e.target.value
                    })
                  }
                />

                <input
                  placeholder="Bild URL (optional)"
                  value={eventForm.image_url}
                  onChange={(e) =>
                    setEventForm({
                      ...eventForm,
                      image_url: e.target.value
                    })
                  }
                />

                <button
                  className="primary-button"
                >
                  Event erstellen
                </button>

              </form>
            )}

            <div className="events-grid">

              {events.map((item) => (
                <article
                  className="event-card"
                  key={item.id}
                >

                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title}
                    />
                  )}

                  <div className="event-content">

                    <h3>
                      {item.title}
                    </h3>

                    <p>
                      {item.description}
                    </p>

                    <p>
                      📍 {item.location}
                    </p>

                    <strong>
                      📅{" "}
                      {item.event_date
                        ? new Date(
                            item.event_date
                          ).toLocaleString(
                            "de-DE"
                          )
                        : ""}
                    </strong>

                  </div>

                </article>
              ))}

              {!events.length && (
                <div className="empty-card">
                  Noch keine Events vorhanden.
                </div>
              )}

            </div>

          </section>
        )}

      </main>

      {/* LOGIN */}

      {authMode === "login" && (
        <div className="modal-overlay">

          <form
            className="auth-modal"
            onSubmit={login}
          >

            <button
              type="button"
              className="close-button"
              onClick={() =>
                setAuthMode(null)
              }
            >
              ×
            </button>

            <h2>
              Anmelden
            </h2>

            <input
              type="email"
              placeholder="E-Mail"
              required
              value={loginForm.email}
              onChange={(e) =>
                setLoginForm({
                  ...loginForm,
                  email: e.target.value
                })
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              required
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm({
                  ...loginForm,
                  password: e.target.value
                })
              }
            />

            <button
              className="primary-button"
            >
              Anmelden
            </button>

          </form>

        </div>
      )}

      {/* REGISTRIERUNG */}

      {authMode === "register" && (
        <div className="modal-overlay">

          <form
            className="auth-modal"
            onSubmit={register}
          >

            <button
              type="button"
              className="close-button"
              onClick={() =>
                setAuthMode(null)
              }
            >
              ×
            </button>

            <h2>
              Mitglied werden
            </h2>

            <input
              placeholder="Vorname"
              required
              value={
                registerForm.first_name
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  first_name:
                    e.target.value
                })
              }
            />

            <input
              placeholder="Nachname"
              required
              value={
                registerForm.last_name
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  last_name:
                    e.target.value
                })
              }
            />

            <input
              placeholder="Nickname"
              required
              value={
                registerForm.nickname
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  nickname:
                    e.target.value
                })
              }
            />

            <input
              type="date"
              value={
                registerForm.birth_date
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  birth_date:
                    e.target.value
                })
              }
            />

            <input
              type="email"
              placeholder="E-Mail"
              required
              value={
                registerForm.email
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  email:
                    e.target.value
                })
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              minLength="6"
              required
              value={
                registerForm.password
              }
              onChange={(e) =>
                setRegisterForm({
                  ...registerForm,
                  password:
                    e.target.value
                })
              }
            />

            <button
              className="primary-button"
            >
              Registrieren
            </button>

          </form>

        </div>
      )}

    </div>
  );
}

export default App;
