import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Crown,
  Eye,
  Flag,
  Gift,
  Home,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Shield,
  Star,
  UserMinus,
  Users,
  UserPlus,
  X,
  Check,
  Plus,
  UserCog,
  Ban,
  Newspaper,
  ShoppingCart,
  Trophy,
  Heart,
  Pin,
  Clock,
  Camera,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* =========================================================
   SUPABASE
========================================================= */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState("home");
  const [search, setSearch] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);

  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMode, setLoginMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  const [posts, setPosts] = useState([
    {
      id: 1,
      author: "Marco Egger",
      role: "HEAD ADMIN",
      time: "vor 2 Stunden",
      title: "Sommerfest 2024 🎉",
      text: "Unser großes Sommerfest findet am 15. August statt! 🎶🍻 Weitere Infos findet ihr unter Events.",
      likes: 24,
      comments: 8,
      avatar: "/default-avatar.svg",
    },
    {
      id: 2,
      author: "Ennstal Connect",
      role: "ADMIN",
      time: "vor 1 Tag",
      title: "Neue Gruppe: Wanderfreunde Ennstal ⛰️",
      text: "Die neue Wandergruppe ist online! Tauscht euch aus, verabredet euch zu Touren und entdeckt unsere Region. 💚",
      likes: 18,
      comments: 6,
      avatar: "/default-avatar.svg",
    },
  ]);

  const [friendRequests, setFriendRequests] = useState([
    {
      id: 1,
      name: "Sarah Winkler",
      time: "vor 2 Stunden",
      avatar: "/default-avatar.svg",
    },
    {
      id: 2,
      name: "Stefan Maier",
      time: "vor 5 Stunden",
      avatar: "/default-avatar.svg",
    },
  ]);

  const [onlineFriends] = useState([
    "Lisa Huber",
    "Thomas Bauer",
    "Anna Steiner",
    "Markus Gruber",
    "Julia Pichler",
  ]);

  /* =========================================================
     AUTH
  ========================================================= */

  useEffect(() => {
    async function init() {
      if (!supabase) {
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      });

      await loadMembers();

      setLoading(false);
    }

    init();
  }, []);

  async function loadProfile(userId) {
    if (!supabase) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data);
    }
  }

  async function loadMembers() {
    if (!supabase) {
      setMembers([
        {
          id: "demo1",
          username: "Marco Egger",
          role: "head_admin",
          online: true,
          avatar_url: "/default-avatar.svg",
        },
        {
          id: "demo2",
          username: "Ennstal Connect",
          role: "admin",
          online: false,
          avatar_url: "/default-avatar.svg",
        },
      ]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setMembers(data);
  }

  async function handleAuth(e) {
    e.preventDefault();

    if (!supabase) {
      setAuthMessage(
        "Supabase ist noch nicht verbunden. Bitte VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY prüfen."
      );
      return;
    }

    setAuthMessage("");

    try {
      if (loginMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        setShowLogin(false);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setAuthMessage(
          "Registrierung erfolgreich. Bitte bestätige gegebenenfalls deine E-Mail."
        );
      }
    } catch (error) {
      setAuthMessage(error.message);
    }
  }

  async function logout() {
    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setProfile(null);
    setShowProfileMenu(false);
  }

  /* =========================================================
     ROLLEN
  ========================================================= */

  async function changeRole(memberId, newRole) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? { ...member, role: newRole }
          : member
      )
    );

    if (supabase) {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", memberId);

      if (error) {
        alert("Die Rolle konnte nicht gespeichert werden: " + error.message);
        await loadMembers();
        return;
      }
    }

    if (selectedMember?.id === memberId) {
      setSelectedMember((current) => ({
        ...current,
        role: newRole,
      }));
    }
  }

  async function removeRole(memberId) {
    await changeRole(memberId, "member");
  }

  /* =========================================================
     FREUNDSCHAFTSANFRAGEN
  ========================================================= */

  function acceptRequest(id) {
    setFriendRequests((current) =>
      current.filter((request) => request.id !== id)
    );
  }

  function declineRequest(id) {
    setFriendRequests((current) =>
      current.filter((request) => request.id !== id)
    );
  }

  /* =========================================================
     NEUER BEITRAG
  ========================================================= */

  function createPost() {
    const title = prompt("Titel des Beitrags:");
    if (!title) return;

    const text = prompt("Text:");

    setPosts((current) => [
      {
        id: Date.now(),
        author:
          profile?.username ||
          profile?.full_name ||
          user?.email ||
          "Mitglied",
        role: profile?.role || "MITGLIED",
        time: "Gerade eben",
        title,
        text: text || "",
        likes: 0,
        comments: 0,
        avatar: profile?.avatar_url || "/default-avatar.svg",
      },
      ...current,
    ]);
  }

  const stats = useMemo(
    () => ({
      members: members.length || 128,
      online: 42,
      groups: 8,
      events: 5,
      posts: posts.length + 35,
    }),
    [members, posts]
  );

  const displayName =
    profile?.username ||
    profile?.full_name ||
    user?.email?.split("@")[0] ||
    "Gast";

  const isAdmin =
    profile?.role === "admin" ||
    profile?.role === "head_admin";

  if (loading) {
    return (
      <>
        <GlobalStyles />
        <div className="loading-screen">
          <div className="loader-logo">
            ENNSTAL <span>CONNECT</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalStyles />

      <div className="app-shell">

        {/* =====================================================
            SIDEBAR
        ====================================================== */}

        <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
          <div className="sidebar-logo">
            <div className="mountain-line" />
            <h1>ENNSTAL</h1>
            <span>Unsere Region • Unsere Community ♥</span>
          </div>

          <nav className="main-nav">
            <NavButton
              icon={<Home />}
              label="Startseite"
              active={page === "home"}
              onClick={() => setPage("home")}
            />

            <NavButton
              icon={<Users />}
              label="Mitglieder"
              active={page === "members"}
              onClick={() => setPage("members")}
            />

            <NavButton
              icon={<UserPlus />}
              label="Freunde"
              badge="2"
              active={page === "friends"}
              onClick={() => setPage("friends")}
            />

            <NavButton
              icon={<Users />}
              label="Gruppen"
              active={page === "groups"}
              onClick={() => setPage("groups")}
            />

            <NavButton
              icon={<CalendarDays />}
              label="Events"
              active={page === "events"}
              onClick={() => setPage("events")}
            />

            <NavButton
              icon={<MessageCircle />}
              label="Nachrichten"
              badge="3"
              active={page === "messages"}
              onClick={() => setPage("messages")}
            />

            <NavButton
              icon={<MapPin />}
              label="Punkte & Belohnungen"
              onClick={() => setPage("points")}
            />

            <NavButton
              icon={<Eye />}
              label="Profilbesucher"
              onClick={() => setPage("visitors")}
            />

            <NavButton
              icon={<Ban />}
              label="Blockierte Nutzer"
              onClick={() => setPage("blocked")}
            />

            <NavButton
              icon={<Flag />}
              label="Meldungen"
              onClick={() => setPage("reports")}
            />

            <NavButton
              icon={<Newspaper />}
              label="News"
              onClick={() => setPage("news")}
            />

            <NavButton
              icon={<ShoppingCart />}
              label="Marktplatz"
              onClick={() => setPage("market")}
            />

            {isAdmin && (
              <NavButton
                icon={<Crown />}
                label="Admin-Bereich"
                admin
                active={page === "admin"}
                onClick={() => setPage("admin")}
              />
            )}
          </nav>

          <button
            className="create-button"
            onClick={createPost}
          >
            <Plus size={19} />
            Erstellen
            <ChevronDown size={16} />
          </button>

          <div className="sidebar-online">
            <div className="online-count">
              <span className="online-dot" />
              42 Online
            </div>

            <div className="avatar-stack">
              {[1, 2, 3, 4].map((item) => (
                <img
                  key={item}
                  src="/default-avatar.svg"
                  alt=""
                />
              ))}
            </div>
          </div>
        </aside>

        {/* =====================================================
            MAIN
        ====================================================== */}

        <main className="main-content">

          {/* TOPBAR */}

          <header className="topbar">
            <button
              className="mobile-menu"
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu />
            </button>

            <div className="searchbar">
              <Search size={21} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mitglieder, Gruppen, Events, Beiträge suchen..."
              />
            </div>

            <div className="top-actions">
              <button className="icon-button notification-button">
                <Mail />
                <span className="notification-count">3</span>
              </button>

              <button className="icon-button notification-button">
                <Bell />
                <span className="notification-count">7</span>
              </button>

              {user ? (
                <div className="profile-menu-wrapper">
                  <button
                    className="profile-button"
                    onClick={() =>
                      setShowProfileMenu(!showProfileMenu)
                    }
                  >
                    <img
                      src={
                        profile?.avatar_url ||
                        "/default-avatar.svg"
                      }
                      alt=""
                    />

                    <div>
                      <strong>{displayName}</strong>
                      <small>
                        <Crown size={12} />
                        {profile?.role === "head_admin"
                          ? "HEAD ADMIN"
                          : profile?.role === "admin"
                          ? "ADMIN"
                          : "MITGLIED"}
                      </small>
                    </div>

                    <ChevronDown size={18} />
                  </button>

                  {showProfileMenu && (
                    <div className="profile-dropdown">
                      <button onClick={() => setPage("profile")}>
                        <Users size={17} />
                        Mein Profil
                      </button>

                      <button onClick={() => setPage("settings")}>
                        <Settings size={17} />
                        Einstellungen
                      </button>

                      <div className="dropdown-divider" />

                      <button
                        className="logout-button"
                        onClick={logout}
                      >
                        <LogOut size={17} />
                        Abmelden
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  className="login-top-button"
                  onClick={() => setShowLogin(true)}
                >
                  Einloggen
                </button>
              )}
            </div>
          </header>

          {/* =====================================================
              HOME
          ====================================================== */}

          {page === "home" && (
            <>
              <section className="dashboard-grid">

                <div className="dashboard-main">

                  <div className="hero">
                    <img src="/hero.jpg" alt="Ennstal" />

                    <div className="hero-overlay" />

                    <div className="hero-content">
                      <div className="welcome-text">
                        Willkommen bei
                      </div>

                      <h2>
                        ENNSTAL <span>CONNECT</span>
                      </h2>

                      <p>
                        Unsere Region
                        <span>•</span>
                        Unsere Community
                        <Heart size={18} fill="currentColor" />
                      </p>
                    </div>
                  </div>

                  <div className="stats-grid">
                    <StatCard
                      icon={<Users />}
                      number={stats.members}
                      label="Mitglieder"
                    />

                    <StatCard
                      icon={<span className="green-stat-dot" />}
                      number={stats.online}
                      label="Online"
                    />

                    <StatCard
                      icon={<Users />}
                      number={stats.groups}
                      label="Gruppen"
                    />

                    <StatCard
                      icon={<CalendarDays />}
                      number={stats.events}
                      label="Events"
                    />

                    <StatCard
                      icon={<MessageCircle />}
                      number={stats.posts}
                      label="Beiträge"
                    />
                  </div>

                  <div className="content-columns">

                    <section className="feed-section">
                      <SectionTitle
                        icon={<Newspaper />}
                        title="Neuigkeiten"
                      />

                      {posts.map((post) => (
                        <article
                          className="post-card"
                          key={post.id}
                        >
                          <div className="post-header">
                            <img
                              src={post.avatar}
                              alt=""
                              className="post-avatar"
                            />

                            <div className="post-author">
                              <strong>{post.author}</strong>

                              {post.role && (
                                <span
                                  className={`role-badge ${
                                    post.role
                                      .toLowerCase()
                                      .replace(" ", "-")
                                  }`}
                                >
                                  {post.role}
                                </span>
                              )}

                              <small>{post.time}</small>
                            </div>

                            <Pin
                              size={21}
                              className="pin-icon"
                            />
                          </div>

                          <h3>{post.title}</h3>

                          <p>{post.text}</p>

                          <div className="post-footer">
                            <div>
                              <button>
                                <Heart size={18} fill="currentColor" />
                                {post.likes}
                              </button>

                              <button>
                                <MessageCircle size={18} />
                                {post.comments}
                              </button>
                            </div>

                            <button className="more-button">
                              Mehr anzeigen →
                            </button>
                          </div>
                        </article>
                      ))}
                    </section>

                    <div className="middle-column">
                      <section className="list-card">
                        <CardHeader
                          icon={<CalendarDays />}
                          title="Kommende Events"
                        />

                        <EventItem
                          image="/banner.png"
                          title="Sommerfest 2024"
                          date="15. August 2024, 18:00"
                          place="Schladming"
                          members="12 nehmen teil"
                        />

                        <EventItem
                          image="/hero.jpg"
                          title="Bergtour Dachstein"
                          date="22. August 2024, 08:00"
                          place="Ramsau"
                          members="8 nehmen teil"
                        />

                        <EventItem
                          image="/banner.png"
                          title="Grillabend"
                          date="30. August 2024, 17:00"
                          place="Bad Mitterndorf"
                          members="5 nehmen teil"
                        />
                      </section>

                      <section className="list-card groups-card">
                        <CardHeader
                          icon={<Users />}
                          title="Beliebte Gruppen"
                        />

                        <GroupItem
                          image="/hero.jpg"
                          title="Wanderfreunde Ennstal"
                          members="24 Mitglieder"
                        />

                        <GroupItem
                          image="/banner.png"
                          title="Motorfreunde"
                          members="18 Mitglieder"
                        />

                        <GroupItem
                          image="/hero.jpg"
                          title="Fotografie Ennstal"
                          members="15 Mitglieder"
                        />
                      </section>
                    </div>
                  </div>

                  <section className="quick-access">
                    <SectionTitle
                      icon={<Plus />}
                      title="Schnellzugriff"
                    />

                    <div className="quick-buttons">
                      <button
                        className="quick-primary"
                        onClick={createPost}
                      >
                        <Plus />
                        Neuen Beitrag
                      </button>

                      <button onClick={() => setPage("groups")}>
                        <Users />
                        Gruppe erstellen
                      </button>

                      <button onClick={() => setPage("events")}>
                        <CalendarDays />
                        Event erstellen
                      </button>

                      <button onClick={() => setPage("news")}>
                        <Newspaper />
                        News schreiben
                      </button>
                    </div>
                  </section>
                </div>

                {/* RIGHT COLUMN */}

                <aside className="right-column">

                  <div className="weather-card">
                    <div>
                      <strong>Schladming</strong>

                      <div className="weather-content">
                        <div className="sun-icon">☀</div>

                        <div>
                          <b>18°C</b>
                          <span>Sonnig</span>
                          <small>Perfekt für Outdoor!</small>
                        </div>
                      </div>
                    </div>

                    <div className="mountain-weather">
                      ⛰
                    </div>
                  </div>

                  <div className="quote-card">
                    „Gemeinsam
                    <br />
                    sind wir stärker.“ ❤️
                  </div>

                  <section className="right-card">
                    <CardHeader
                      icon={<span className="online-dot" />}
                      title="Online Freunde"
                      action="Alle anzeigen"
                    />

                    <div className="friend-list">
                      {onlineFriends.map((name) => (
                        <div
                          className="online-friend"
                          key={name}
                        >
                          <div className="friend-avatar-wrapper">
                            <img
                              src="/default-avatar.svg"
                              alt=""
                            />
                            <span />
                          </div>

                          <div>
                            <strong>{name}</strong>
                            <small>Online</small>
                          </div>

                          <button>
                            <MessageCircle size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="right-card">
                    <CardHeader
                      icon={<UserPlus />}
                      title="Letzte Freundschaftsanfragen"
                    />

                    {friendRequests.map((request) => (
                      <div
                        className="request-item"
                        key={request.id}
                      >
                        <img
                          src={request.avatar}
                          alt=""
                        />

                        <div>
                          <strong>{request.name}</strong>
                          <small>{request.time}</small>
                        </div>

                        <button
                          className="accept-button"
                          onClick={() =>
                            acceptRequest(request.id)
                          }
                        >
                          <Check />
                        </button>

                        <button
                          className="decline-button"
                          onClick={() =>
                            declineRequest(request.id)
                          }
                        >
                          <X />
                        </button>
                      </div>
                    ))}

                    <button className="full-width-button">
                      Alle Anfragen anzeigen
                    </button>
                  </section>

                  <section className="points-card">
                    <CardHeader
                      icon={<Trophy />}
                      title="Deine Punkte"
                    />

                    <div className="points-content">
                      <div>
                        <b>320</b>
                        <span>Punkte</span>
                      </div>

                      <button>
                        Punkte einlösen
                      </button>
                    </div>

                    <div className="daily-reward">
                      <Gift />
                      <div>
                        <span>Tägliche Belohnung</span>
                        <b>03:24:15</b>
                      </div>
                    </div>
                  </section>

                  <section className="right-card">
                    <CardHeader
                      icon={<Eye />}
                      title="Profilbesucher"
                      action="Alle anzeigen"
                    />

                    <div className="online-friend">
                      <img
                        src="/default-avatar.svg"
                        alt=""
                      />

                      <div>
                        <strong>Michael Lang</strong>
                        <small>vor 2 Stunden</small>
                      </div>

                      <button>
                        <Eye size={18} />
                      </button>
                    </div>
                  </section>
                </aside>
              </section>
            </>
          )}

          {/* =====================================================
              MEMBERS
          ====================================================== */}

          {page === "members" && (
            <section className="page-section members-page">
              <div className="page-heading">
                <div>
                  <h2>Mitglieder</h2>
                  <p>
                    Verwalte und entdecke die Mitglieder der Community.
                  </p>
                </div>
              </div>

              <div className="members-grid">
                {members
                  .filter((member) =>
                    (member.username || "")
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  )
                  .map((member) => (
                    <button
                      className="member-card"
                      key={member.id}
                      onClick={() => setSelectedMember(member)}
                    >
                      <div className="member-role">
                        {getRoleLabel(member.role)}
                      </div>

                      <img
                        src={
                          member.avatar_url ||
                          "/default-avatar.svg"
                        }
                        alt=""
                      />

                      <h3>
                        {member.username ||
                          member.full_name ||
                          "Mitglied"}
                      </h3>

                      <div
                        className={`member-status ${
                          member.online
                            ? "online"
                            : "offline"
                        }`}
                      >
                        <span />
                        {member.online ? "Online" : "Offline"}
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          )}

          {/* =====================================================
              ADMIN
          ====================================================== */}

          {page === "admin" && isAdmin && (
            <section className="page-section">
              <div className="page-heading">
                <div>
                  <h2>Admin-Bereich</h2>
                  <p>
                    Mitglieder und Rollen verwalten.
                  </p>
                </div>
              </div>

              <div className="admin-table">
                {members.map((member) => (
                  <div
                    className="admin-member-row"
                    key={member.id}
                  >
                    <img
                      src={
                        member.avatar_url ||
                        "/default-avatar.svg"
                      }
                      alt=""
                    />

                    <div className="admin-member-name">
                      <strong>
                        {member.username ||
                          member.full_name ||
                          "Mitglied"}
                      </strong>

                      <small>
                        Aktuelle Rolle:{" "}
                        {getRoleLabel(member.role)}
                      </small>
                    </div>

                    <div className="admin-actions">
                      <button
                        onClick={() =>
                          changeRole(member.id, "supporter")
                        }
                      >
                        Supporter
                      </button>

                      <button
                        onClick={() =>
                          changeRole(member.id, "admin")
                        }
                      >
                        Admin
                      </button>

                      <button
                        className="remove-role"
                        onClick={() =>
                          removeRole(member.id)
                        }
                      >
                        Rolle entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* OTHER PAGES */}

          {![
            "home",
            "members",
            "admin",
          ].includes(page) && (
            <section className="page-section empty-page">
              <div>
                <h2>{getPageTitle(page)}</h2>
                <p>
                  Dieser Bereich ist vorbereitet und kann jetzt
                  mit deinen Daten verbunden werden.
                </p>
              </div>
            </section>
          )}

          <footer>
            © 2026 Ennstal Connect |
            Unsere Region • Unsere Community 🧡
            <span>Datenschutz</span>
            <span>Impressum</span>
            <span>Support</span>
          </footer>
        </main>
      </div>

      {/* =====================================================
          MEMBER MODAL
      ====================================================== */}

      {selectedMember && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedMember(null)}
        >
          <div
            className="member-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedMember(null)}
            >
              <X />
            </button>

            <div className="modal-profile">
              <img
                src={
                  selectedMember.avatar_url ||
                  "/default-avatar.svg"
                }
                alt=""
              />

              <h2>
                {selectedMember.username ||
                  selectedMember.full_name ||
                  "Mitglied"}
              </h2>

              <p>
                {getRoleLabel(selectedMember.role)}
              </p>

              <div
                className={`member-status ${
                  selectedMember.online
                    ? "online"
                    : "offline"
                }`}
              >
                <span />
                {selectedMember.online
                  ? "Online"
                  : "Offline"}
              </div>
            </div>

            {isAdmin && selectedMember.id !== user?.id && (
              <div className="admin-tools">
                <div className="admin-tools-title">
                  <Shield />
                  <div>
                    <span>MODERATION</span>
                    <h3>Admin-Werkzeuge</h3>
                  </div>
                </div>

                <div className="admin-tool-grid">
                  <button
                    onClick={() =>
                      changeRole(
                        selectedMember.id,
                        "supporter"
                      )
                    }
                  >
                    <Star />
                    Supporter ernennen
                  </button>

                  <button
                    onClick={() =>
                      changeRole(
                        selectedMember.id,
                        "admin"
                      )
                    }
                  >
                    <Crown />
                    Zum Admin ernennen
                  </button>

                  <button
                    className="remove-role-modal"
                    onClick={() =>
                      removeRole(selectedMember.id)
                    }
                  >
                    <UserMinus />
                    Rolle entfernen
                  </button>

                  <button
                    className="danger-tool"
                    onClick={() =>
                      alert(
                        "Profilbild-Funktion kann hier mit Supabase Storage verbunden werden."
                      )
                    }
                  >
                    <Camera />
                    Profilbild löschen
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="message-member">
                <MessageCircle />
                Nachricht senden
              </button>

              <button className="friend-member">
                <Check />
                Bereits befreundet
              </button>

              <button className="block-member">
                <Ban />
                Nutzer blockieren
              </button>

              <button className="report-member">
                <Flag />
                Nutzer melden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          LOGIN MODAL
      ====================================================== */}

      {showLogin && (
        <div
          className="modal-backdrop"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="login-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowLogin(false)}
            >
              <X />
            </button>

            <h2>
              {loginMode === "login"
                ? "Willkommen zurück"
                : "Account erstellen"}
            </h2>

            <p>
              {loginMode === "login"
                ? "Melde dich bei Ennstal Connect an."
                : "Werde Teil unserer Community."}
            </p>

            <form onSubmit={handleAuth}>
              <input
                type="email"
                placeholder="E-Mail-Adresse"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
              />

              <input
                type="password"
                placeholder="Passwort"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
              />

              {authMessage && (
                <div className="auth-message">
                  {authMessage}
                </div>
              )}

              <button type="submit">
                {loginMode === "login"
                  ? "Einloggen"
                  : "Registrieren"}
              </button>
            </form>

            <button
              className="auth-switch"
              onClick={() => {
                setLoginMode(
                  loginMode === "login"
                    ? "register"
                    : "login"
                );
                setAuthMessage("");
              }}
            >
              {loginMode === "login"
                ? "Noch keinen Account? Registrieren"
                : "Bereits registriert? Einloggen"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function NavButton({
  icon,
  label,
  badge,
  active,
  onClick,
  admin,
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""} ${
        admin ? "admin-nav" : ""
      }`}
      onClick={onClick}
    >
      {icon}

      <span>{label}</span>

      {badge && (
        <b className="nav-badge">{badge}</b>
      )}
    </button>
  );
}

function StatCard({ icon, number, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>

      <div>
        <strong>{number}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div className="section-title">
      <div>{icon}</div>
      <h2>{title}</h2>
    </div>
  );
}

function CardHeader({ icon, title, action }) {
  return (
    <div className="card-header">
      <div>
        {icon}
        <h3>{title}</h3>
      </div>

      {action && (
        <button>{action}</button>
      )}
    </div>
  );
}

function EventItem({
  image,
  title,
  date,
  place,
  members,
}) {
  return (
    <div className="event-item">
      <img src={image} alt="" />

      <div className="event-info">
        <strong>{title}</strong>
        <span>
          <Clock size={13} />
          {date}
        </span>

        <span>
          <MapPin size={13} />
          {place}
        </span>

        <small>{members}</small>
      </div>

      <button>Teilnehmen</button>
    </div>
  );
}

function GroupItem({
  image,
  title,
  members,
}) {
  return (
    <div className="group-item">
      <img src={image} alt="" />

      <div>
        <strong>{title}</strong>
        <span>{members}</span>
      </div>

      <button>Beitreten</button>
    </div>
  );
}

function getRoleLabel(role) {
  switch (role) {
    case "head_admin":
      return "HEAD ADMIN";
    case "admin":
      return "ADMIN";
    case "supporter":
      return "SUPPORTER";
    default:
      return "MITGLIED";
  }
}

function getPageTitle(page) {
  const titles = {
    friends: "Freunde",
    groups: "Gruppen",
    events: "Events",
    messages: "Nachrichten",
    points: "Punkte & Belohnungen",
    visitors: "Profilbesucher",
    blocked: "Blockierte Nutzer",
    reports: "Meldungen",
    news: "News",
    market: "Marktplatz",
    profile: "Mein Profil",
    settings: "Einstellungen",
  };

  return titles[page] || "Ennstal Connect";
}

/* =========================================================
   STYLES
========================================================= */

function GlobalStyles() {
  return (
    <style>{`

* {
  box-sizing: border-box;
}

:root {
  --orange: #ff6817;
  --orange-light: #ff8b37;
  --dark: #222b36;
  --dark-soft: #2c3642;
  --text: #2f3a48;
  --muted: #788391;
  --line: #e5e9ef;
  --card: rgba(255,255,255,.93);
  --green: #20a365;
  --red: #ef5146;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  background:
    linear-gradient(
      120deg,
      #edf1f6,
      #dfe5ec
    );
  color: var(--text);
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

/* APP */

.app-shell {
  min-height: 100vh;
  display: flex;
}

/* SIDEBAR */

.sidebar {
  width: 220px;
  min-height: 100vh;
  flex-shrink: 0;
  background:
    linear-gradient(
      180deg,
      #29333f 0%,
      #1f2833 100%
    );
  color: white;
  padding: 14px 10px;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 50;
}

.sidebar-logo {
  height: 82px;
  padding: 12px 15px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  position: relative;
}

.sidebar-logo h1 {
  margin: 0;
  font-size: 34px;
  letter-spacing: 1px;
  line-height: 34px;
}

.sidebar-logo span {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--orange-light);
  font-weight: 800;
}

.mountain-line {
  position: absolute;
  top: 0;
  left: 18px;
  width: 135px;
  height: 20px;
  border-top: 3px solid var(--orange);
  clip-path: polygon(
    0 100%,
    25% 20%,
    48% 70%,
    72% 0,
    100% 100%
  );
}

.main-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.nav-button {
  border: 0;
  background: transparent;
  color: #d8dde4;
  min-height: 48px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 0 15px;
  text-align: left;
  transition: .2s;
  position: relative;
}

.nav-button svg {
  width: 21px;
}

.nav-button:hover {
  background: rgba(255,255,255,.07);
}

.nav-button.active {
  color: white;
  background:
    linear-gradient(
      135deg,
      var(--orange),
      #ff7b2c
    );
  box-shadow:
    0 8px 22px rgba(255,104,23,.3);
}

.nav-button.admin-nav {
  color: #ffd35b;
}

.nav-badge {
  margin-left: auto;
  background: var(--orange);
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: white;
  font-size: 12px;
}

.create-button {
  width: calc(100% - 20px);
  margin: 20px 10px;
  border: 0;
  color: white;
  height: 48px;
  border-radius: 13px;
  background:
    linear-gradient(
      135deg,
      #ff6817,
      #ff812f
    );
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow:
    0 10px 25px rgba(255,104,23,.25);
}

.sidebar-online {
  margin-top: 12px;
  padding: 15px;
  border-radius: 14px;
  background: rgba(255,255,255,.045);
}

.online-count {
  font-size: 13px;
  color: #dbe0e7;
  margin-bottom: 12px;
}

.online-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  background: var(--green);
  margin-right: 7px;
}

.avatar-stack {
  display: flex;
}

.avatar-stack img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #27313c;
  margin-left: -7px;
}

.avatar-stack img:first-child {
  margin-left: 0;
}

/* MAIN */

.main-content {
  flex: 1;
  min-width: 0;
}

.topbar {
  height: 95px;
  display: flex;
  align-items: center;
  gap: 25px;
  padding: 0 26px;
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(0,0,0,.04);
  position: sticky;
  top: 0;
  z-index: 40;
}

.mobile-menu {
  display: none;
}

.searchbar {
  width: min(540px, 48vw);
  height: 52px;
  border-radius: 28px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 18px;
  margin: auto;
  background:
    linear-gradient(
      135deg,
      #eef1f5,
      #e5eaf0
    );
}

.searchbar input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 13px;
}

.icon-button {
  width: 55px;
  height: 55px;
  border: 0;
  border-radius: 50%;
  background: #f0f2f5;
  color: var(--dark);
  display: grid;
  place-items: center;
  position: relative;
}

.notification-count {
  position: absolute;
  right: -2px;
  top: -3px;
  min-width: 21px;
  height: 21px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 10px;
  background: var(--orange);
  color: white;
}

.profile-menu-wrapper {
  position: relative;
}

.profile-button {
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
}

.profile-button img {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.profile-button div {
  text-align: left;
}

.profile-button strong,
.profile-button small {
  display: block;
}

.profile-button small {
  color: #d79814;
  font-size: 10px;
  margin-top: 4px;
  font-weight: 800;
}

.profile-button small svg {
  vertical-align: -2px;
  margin-right: 3px;
}

.profile-dropdown {
  position: absolute;
  right: 0;
  top: 68px;
  width: 210px;
  padding: 8px;
  background: white;
  border-radius: 15px;
  box-shadow:
    0 20px 60px rgba(28,36,47,.18);
  border: 1px solid var(--line);
}

.profile-dropdown button {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 12px;
  border-radius: 10px;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text);
}

.profile-dropdown button:hover {
  background: #f5f6f8;
}

.dropdown-divider {
  height: 1px;
  background: var(--line);
  margin: 6px;
}

.logout-button {
  color: var(--red) !important;
}

.login-top-button {
  border: 0;
  background: var(--orange);
  color: white;
  padding: 13px 21px;
  border-radius: 12px;
  font-weight: 700;
}

/* DASHBOARD */

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 304px;
  gap: 15px;
  padding: 14px;
}

.dashboard-main {
  min-width: 0;
}

.hero {
  height: 222px;
  border-radius: 15px;
  overflow: hidden;
  position: relative;
  background: #1e2935;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      rgba(8,15,24,.48),
      rgba(8,15,24,.05),
      rgba(255,104,23,.06)
    );
}

.hero-content {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: white;
  text-shadow:
    0 2px 12px rgba(0,0,0,.45);
}

.welcome-text {
  font-family: cursive;
  font-size: 35px;
}

.hero-content h2 {
  margin: 0;
  font-size: clamp(38px, 5vw, 54px);
  letter-spacing: 1px;
}

.hero-content h2 span {
  color: var(--orange);
}

.hero-content p {
  margin: 4px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
}

.hero-content p svg {
  color: var(--orange);
}

/* STATS */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin: 14px 0;
}

.stat-card {
  min-height: 80px;
  background: var(--card);
  border: 1px solid rgba(0,0,0,.04);
  border-radius: 13px;
  padding: 15px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow:
    0 8px 30px rgba(38,48,60,.04);
}

.stat-icon {
  color: var(--orange);
  display: grid;
  place-items: center;
}

.green-stat-dot {
  width: 16px;
  height: 16px;
  display: block;
  background: var(--green);
  border-radius: 50%;
}

.stat-card strong,
.stat-card span {
  display: block;
}

.stat-card strong {
  font-size: 21px;
}

.stat-card span {
  color: var(--muted);
  margin-top: 3px;
  font-size: 13px;
}

/* CONTENT */

.content-columns {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 14px;
}

.feed-section,
.list-card,
.quick-access,
.right-card,
.points-card {
  background: var(--card);
  border-radius: 15px;
  border: 1px solid rgba(0,0,0,.04);
  box-shadow:
    0 8px 30px rgba(38,48,60,.04);
}

.feed-section {
  padding: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 10px;
}

.section-title > div {
  width: 33px;
  height: 33px;
  border-radius: 50%;
  background: var(--orange);
  color: white;
  display: grid;
  place-items: center;
}

.section-title h2 {
  margin: 0;
  font-size: 17px;
}

.post-card {
  background:
    linear-gradient(
      135deg,
      #ffffff,
      #f5f7f9
    );
  border-radius: 16px;
  padding: 14px;
  margin-top: 10px;
  border: 1px solid #e9edf1;
}

.post-header {
  display: flex;
  align-items: center;
}

.post-avatar {
  width: 51px;
  height: 51px;
  border-radius: 50%;
  object-fit: cover;
  margin-right: 10px;
}

.post-author strong {
  font-size: 14px;
}

.post-author small {
  display: block;
  color: var(--muted);
  margin-top: 2px;
  font-size: 12px;
}

.role-badge {
  margin-left: 5px;
  padding: 3px 7px;
  border-radius: 8px;
  color: #c28b11;
  background: #fff5d9;
  font-size: 10px;
  font-weight: 800;
}

.pin-icon {
  color: var(--orange);
  margin-left: auto;
}

.post-card h3 {
  margin: 13px 0 5px;
  font-size: 16px;
}

.post-card p {
  color: #596574;
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
}

.post-footer {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.post-footer > div {
  display: flex;
  gap: 18px;
}

.post-footer button {
  border: 0;
  background: transparent;
  color: #647181;
  display: flex;
  align-items: center;
  gap: 5px;
}

.post-footer > div button:first-child svg {
  color: #ef554c;
}

.more-button {
  background: #eef1f4 !important;
  padding: 9px 15px;
  border-radius: 10px !important;
  font-size: 12px;
}

/* LISTS */

.middle-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.list-card {
  padding: 10px;
}

.card-header {
  min-height: 34px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-header > div > svg,
.card-header > div > span {
  color: var(--orange);
}

.card-header h3 {
  margin: 0;
  font-size: 16px;
}

.card-header > button {
  border: 0;
  background: transparent;
  color: #df671e;
  font-size: 12px;
}

.event-item,
.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 2px;
  border-top: 1px solid var(--line);
}

.event-item img,
.group-item img {
  width: 88px;
  height: 74px;
  border-radius: 11px;
  object-fit: cover;
}

.event-info,
.group-item > div {
  flex: 1;
}

.event-info strong,
.event-info span,
.event-info small,
.group-item strong,
.group-item span {
  display: block;
}

.event-info strong,
.group-item strong {
  font-size: 13px;
}

.event-info span,
.group-item span {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
  display: flex;
  gap: 4px;
  align-items: center;
}

.event-info small {
  color: #7b8795;
  margin-top: 3px;
}

.event-item button,
.group-item button {
  border: 0;
  color: white;
  background: var(--orange);
  border-radius: 9px;
  padding: 10px 14px;
  font-size: 11px;
}

/* QUICK */

.quick-access {
  margin-top: 14px;
  padding: 12px;
}

.quick-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
}

.quick-buttons button {
  min-height: 43px;
  border: 1px solid #ff8c4b;
  background: white;
  border-radius: 9px;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
}

.quick-buttons .quick-primary {
  color: white;
  background: var(--orange);
}

/* RIGHT */

.right-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.weather-card {
  min-height: 122px;
  border-radius: 15px;
  padding: 18px;
  background:
    linear-gradient(
      135deg,
      #2d3746,
      #27313d
    );
  color: white;
  display: flex;
  justify-content: space-between;
  overflow: hidden;
}

.weather-card strong {
  font-size: 14px;
}

.weather-content {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.sun-icon {
  font-size: 37px;
  color: #ffb21a;
}

.weather-content b {
  display: block;
  font-size: 29px;
}

.weather-content span,
.weather-content small {
  display: block;
  font-size: 11px;
  opacity: .85;
  margin-top: 2px;
}

.mountain-weather {
  font-size: 55px;
  color: var(--orange);
  align-self: center;
}

.quote-card {
  background:
    linear-gradient(
      135deg,
      #f7f7f7,
      #e8eaed
    );
  border-radius: 15px;
  min-height: 100px;
  display: grid;
  place-items: center;
  text-align: center;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.25;
}

.right-card,
.points-card {
  padding: 12px;
}

.friend-list {
  margin-top: 5px;
}

.online-friend,
.request-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 0;
}

.online-friend > img,
.request-item > img {
  width: 43px;
  height: 43px;
  border-radius: 50%;
  object-fit: cover;
}

.friend-avatar-wrapper {
  position: relative;
}

.friend-avatar-wrapper img {
  width: 43px;
  height: 43px;
  border-radius: 50%;
  object-fit: cover;
}

.friend-avatar-wrapper span {
  position: absolute;
  right: -1px;
  bottom: 1px;
  width: 10px;
  height: 10px;
  background: var(--green);
  border-radius: 50%;
  border: 2px solid white;
}

.online-friend > div:nth-child(2),
.request-item > div {
  flex: 1;
}

.online-friend strong,
.online-friend small,
.request-item strong,
.request-item small {
  display: block;
}

.online-friend strong,
.request-item strong {
  font-size: 13px;
}

.online-friend small,
.request-item small {
  color: var(--muted);
  font-size: 11px;
  margin-top: 3px;
}

.online-friend button {
  border: 0;
  background: #f0f2f4;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #3e4955;
}

.accept-button,
.decline-button {
  width: 37px;
  height: 37px;
  border: 0;
  border-radius: 50%;
  color: white;
  display: grid;
  place-items: center;
}

.accept-button {
  background: var(--green);
}

.decline-button {
  background: var(--orange);
}

.full-width-button {
  width: 100%;
  height: 37px;
  border: 0;
  border-radius: 10px;
  background: #eef1f4;
  color: var(--text);
  font-weight: 600;
}

.points-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
}

.points-content b {
  display: block;
  font-size: 30px;
}

.points-content span {
  font-size: 11px;
  color: var(--muted);
}

.points-content button {
  border: 0;
  background: var(--orange);
  color: white;
  padding: 13px 19px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}

.daily-reward {
  background: #fff8ee;
  padding: 10px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.daily-reward svg {
  color: var(--orange);
}

.daily-reward span,
.daily-reward b {
  display: block;
}

.daily-reward span {
  font-size: 11px;
  color: var(--muted);
}

.daily-reward b {
  margin-top: 3px;
}

/* PAGE */

.page-section {
  padding: 32px;
  min-height: calc(100vh - 95px);
}

.page-heading h2 {
  margin: 0;
  font-size: 29px;
}

.page-heading p {
  color: var(--muted);
}

.members-grid {
  margin-top: 25px;
  display: grid;
  grid-template-columns:
    repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}

.member-card {
  border: 0;
  min-height: 290px;
  border-radius: 22px;
  background: rgba(255,255,255,.9);
  box-shadow:
    0 12px 35px rgba(38,48,60,.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 25px 18px;
  color: var(--text);
}

.member-role {
  align-self: stretch;
  color: var(--orange);
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 1px;
}

.member-card > img {
  width: 95px;
  height: 95px;
  border-radius: 50%;
  object-fit: cover;
  margin-top: 15px;
  box-shadow:
    0 8px 22px rgba(0,0,0,.12);
}

.member-card h3 {
  margin: 18px 0 10px;
}

.member-status {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 13px;
}

.member-status span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.member-status.online span {
  background: var(--green);
}

.member-status.offline span {
  background: #aab3bd;
}

/* ADMIN */

.admin-table {
  margin-top: 25px;
  background: white;
  border-radius: 16px;
  overflow: hidden;
}

.admin-member-row {
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  gap: 14px;
}

.admin-member-row > img {
  width: 50px;
  height: 50px;
  border-radius: 50%;
}

.admin-member-name {
  flex: 1;
}

.admin-member-name strong,
.admin-member-name small {
  display: block;
}

.admin-member-name small {
  color: var(--muted);
  margin-top: 4px;
}

.admin-actions {
  display: flex;
  gap: 8px;
}

.admin-actions button {
  border: 1px solid #e3e6ea;
  background: white;
  border-radius: 9px;
  padding: 9px 13px;
}

.admin-actions .remove-role {
  color: var(--red);
  border-color: #f2b4af;
}

/* MODALS */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15,23,34,.72);
  backdrop-filter: blur(7px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.member-modal,
.login-modal {
  width: min(730px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background:
    linear-gradient(
      135deg,
      #ffffff,
      #eef1f4
    );
  border-radius: 24px;
  position: relative;
  padding: 35px;
  box-shadow:
    0 30px 100px rgba(0,0,0,.4);
}

.login-modal {
  width: min(430px, 100%);
}

.modal-close {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 38px;
  height: 38px;
  border: 0;
  background: #eef1f4;
  border-radius: 50%;
}

.modal-profile {
  text-align: center;
  padding-bottom: 25px;
}

.modal-profile img {
  width: 105px;
  height: 105px;
  border-radius: 50%;
  object-fit: cover;
}

.modal-profile h2 {
  margin: 12px 0 4px;
}

.modal-profile p {
  color: var(--orange);
  font-size: 12px;
  font-weight: 800;
}

.modal-profile .member-status {
  justify-content: center;
}

.admin-tools {
  border: 1px solid #f0a59f;
  border-radius: 18px;
  padding: 20px;
}

.admin-tools-title {
  display: flex;
  align-items: center;
  gap: 11px;
}

.admin-tools-title > svg {
  color: #586270;
}

.admin-tools-title span {
  font-size: 10px;
  color: #df7b77;
  font-weight: 900;
  letter-spacing: 2px;
}

.admin-tools-title h3 {
  margin: 3px 0;
}

.admin-tool-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

.admin-tool-grid button {
  min-height: 55px;
  border-radius: 12px;
  border: 1px solid #dce1e6;
  background: #27313d;
  color: white;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  font-weight: 700;
  text-align: left;
}

.admin-tool-grid button:nth-child(2) {
  border-color: #e9c464;
  color: #ffe17b;
}

.admin-tool-grid .remove-role-modal {
  border-color: #42bf8d;
  color: #9ee5c2;
}

.admin-tool-grid .danger-tool {
  border-color: #ee8e8b;
  color: #ffb2af;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 23px;
}

.modal-actions button {
  min-height: 54px;
  border-radius: 13px;
  border: 1px solid #e0a274;
  background: white;
  color: #b8641d;
  font-weight: 700;
  font-size: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.modal-actions .message-member {
  color: white;
  background:
    linear-gradient(
      135deg,
      var(--orange),
      #ff9145
    );
  border: 0;
}

.modal-actions .block-member {
  color: #c8544d;
}

.modal-actions .report-member {
  color: #c65e58;
  background: #fffafa;
}

.login-modal h2 {
  margin: 0;
}

.login-modal > p {
  color: var(--muted);
}

.login-modal form {
  margin-top: 20px;
}

.login-modal input {
  width: 100%;
  height: 51px;
  border: 1px solid #dce1e6;
  border-radius: 11px;
  margin-bottom: 10px;
  padding: 0 15px;
  outline-color: var(--orange);
}

.login-modal form button {
  width: 100%;
  height: 51px;
  border: 0;
  border-radius: 11px;
  background: var(--orange);
  color: white;
  font-weight: 800;
}

.auth-message {
  padding: 10px;
  margin-bottom: 10px;
  background: #fff0ed;
  color: #bd4f48;
  border-radius: 9px;
  font-size: 13px;
}

.auth-switch {
  width: 100%;
  margin-top: 15px;
  border: 0;
  background: transparent;
  color: var(--orange);
}

.empty-page {
  display: grid;
  place-items: center;
  text-align: center;
}

.empty-page h2 {
  font-size: 32px;
}

footer {
  text-align: center;
  padding: 18px;
  font-size: 11px;
  color: #66717d;
}

footer span {
  margin-left: 15px;
}

/* LOADING */

.loading-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #202a35;
}

.loader-logo {
  color: white;
  font-size: 35px;
  font-weight: 900;
}

.loader-logo span {
  color: var(--orange);
}

/* RESPONSIVE */

@media (max-width: 1300px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .right-column {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .weather-card,
  .quote-card {
    min-height: 140px;
  }
}

@media (max-width: 1050px) {
  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .content-columns {
    grid-template-columns: 1fr;
  }

  .sidebar {
    width: 210px;
  }
}

@media (max-width: 800px) {
  .sidebar {
    position: fixed;
    transform: translateX(-100%);
    transition: .25s;
    width: 255px;
    box-shadow: 20px 0 60px rgba(0,0,0,.3);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .mobile-menu {
    display: grid;
    place-items: center;
    border: 0;
    background: #edf0f4;
    width: 45px;
    height: 45px;
    border-radius: 12px;
  }

  .topbar {
    height: 76px;
    padding: 0 12px;
  }

  .searchbar {
    width: auto;
    flex: 1;
  }

  .profile-button > div,
  .profile-button > svg {
    display: none;
  }

  .icon-button {
    width: 45px;
    height: 45px;
  }

  .profile-button img {
    width: 45px;
    height: 45px;
  }

  .dashboard-grid {
    padding: 10px;
  }

  .right-column {
    grid-template-columns: 1fr;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .quick-buttons {
    grid-template-columns: 1fr 1fr;
  }

  .page-section {
    padding: 20px 12px;
  }

  .admin-member-row {
    flex-wrap: wrap;
  }

  .admin-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .admin-tool-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .top-actions .notification-button {
    display: none;
  }

  .hero {
    height: 240px;
  }

  .welcome-text {
    font-size: 25px;
  }

  .hero-content h2 {
    font-size: 35px;
  }

  .hero-content p {
    font-size: 12px;
  }

  .stats-grid {
    grid-template-columns: 1fr 1fr;
  }

  .event-item img {
    width: 65px;
    height: 65px;
  }

  .event-item button {
    padding: 8px;
  }

  .member-modal {
    padding: 22px 15px;
  }
}

`}</style>
  );
}
