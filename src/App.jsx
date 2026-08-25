import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

import {
  Home,
  Users,
  MessageCircle,
  Newspaper,
  Gift,
  Settings,
  Shield,
  Crown,
  Star,
  LogOut,
  Search,
  Plus,
  Send,
  Edit3,
  Trash2,
  X,
  User,
  Sparkles,
  Heart,
  Trophy,
  ChevronRight,
  Image as ImageIcon,
  Menu,
  Loader2,
} from "lucide-react";

/* =========================================================
   KONFIGURATION
========================================================= */

const ROLE_LABEL = {
  member: "Mitglied",
  supporter: "Supporter",
  admin: "Admin",
  head_admin: "Head Admin",
};

const ROLE_ORDER = {
  member: 0,
  supporter: 1,
  admin: 2,
  head_admin: 3,
};

const PAGE_TITLES = {
  home: "Startseite",
  members: "Mitglieder",
  forum: "Forum",
  news: "News & Beiträge",
  rewards: "Belohnungen",
  profile: "Mein Profil",
  admin: "Admin-Bereich",
};

/* =========================================================
   HILFSFUNKTIONEN
========================================================= */

function displayName(profile) {
  if (!profile) return "Unbekannt";

  if (profile.nickname && profile.nickname.trim()) {
    return profile.nickname;
  }

  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Mitglied";
}

function initials(profile) {
  const name = displayName(profile);

  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function getRole(profile) {
  return profile?.role || "member";
}

function roleIcon(role, size = 15) {
  if (role === "head_admin") return <Crown size={size} />;
  if (role === "admin") return <Shield size={size} />;
  if (role === "supporter") return <Star size={size} />;
  return <User size={size} />;
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/* =========================================================
   AVATAR
========================================================= */

function Avatar({ profile, size = "md" }) {
  const image =
    profile?.avatar_url ||
    profile?.image_url ||
    profile?.profile_image ||
    null;

  return (
    <div className={`avatar avatar-${size}`}>
      {image ? (
        <img
          src={image}
          alt={displayName(profile)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span>{initials(profile)}</span>
      )}
    </div>
  );
}

/* =========================================================
   AUTH SCREEN
========================================================= */

function AuthScreen({ onDone }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) throw error;

        await onDone();
      } else {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (error) throw error;

        if (data.user && nickname.trim()) {
          await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,
              nickname: nickname.trim(),
              role: "member",
            });
        }

        setMessage(
          "Registrierung erfolgreich. Bitte bestätige deine E-Mail, falls erforderlich."
        );
      }
    } catch (error) {
      setMessage(error.message || "Ein Fehler ist aufgetreten.");
    }

    setLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Star fill="currentColor" />
          </div>

          <div>
            <strong>ennstal</strong>
            <span>CONNECT</span>
          </div>
        </div>

        <div className="auth-heading">
          <h1>
            {mode === "login"
              ? "Willkommen zurück"
              : "Community beitreten"}
          </h1>

          <p>
            Verbinde dich mit deiner Community.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "register" && (
            <div className="form-group">
              <label>Nickname</label>

              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Dein Nickname"
              />
            </div>
          )}

          <div className="form-group">
            <label>E-Mail</label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.at"
            />
          </div>

          <div className="form-group">
            <label>Passwort</label>

            <input
              type="password"
              required
              minLength="6"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mindestens 6 Zeichen"
            />
          </div>

          {message && (
            <div className="auth-message">
              {message}
            </div>
          )}

          <button
            className="primary-button full"
            disabled={loading}
          >
            {loading && <Loader2 className="spin" size={18} />}

            {mode === "login"
              ? "Anmelden"
              : "Account erstellen"}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() =>
            setMode(
              mode === "login"
                ? "register"
                : "login"
            )
          }
        >
          {mode === "login"
            ? "Noch keinen Account? Registrieren"
            : "Bereits einen Account? Anmelden"}
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);

  const [members, setMembers] = useState([]);
  const [news, setNews] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);

  const [page, setPage] = useState("home");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  const [modal, setModal] = useState(null);
  const [flash, setFlash] = useState("");

  /* =====================================================
     SESSION LADEN
  ===================================================== */

  useEffect(() => {
    async function loadSession() {
      const { data } =
        await supabase.auth.getSession();

      setSession(data.session);
      setLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);

        if (!newSession) {
          setMe(null);
          setMembers([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  /* =====================================================
     DATEN LADEN
  ===================================================== */

  useEffect(() => {
    if (!session?.user) return;

    loadAll();
  }, [session]);

  async function loadAll() {
    setLoading(true);

    await Promise.all([
      loadProfile(),
      loadMembers(),
      loadNews(),
      loadForum(),
    ]);

    setLoading(false);
  }

  async function loadProfile() {
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("Profil konnte nicht geladen werden:", error);
      return;
    }

    if (data) {
      setMe(data);
      return;
    }

    const fallbackProfile = {
      id: session.user.id,
      nickname:
        session.user.email?.split("@")[0] ||
        "Mitglied",
      role: "member",
    };

    const { data: created } =
      await supabase
        .from("profiles")
        .upsert(fallbackProfile)
        .select()
        .maybeSingle();

    setMe(created || fallbackProfile);
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*");

    if (error) {
      console.error(
        "Mitglieder konnten nicht geladen werden:",
        error
      );

      return;
    }

    const sorted = [...(data || [])].sort(
      (a, b) => {
        const roleDiff =
          (ROLE_ORDER[getRole(b)] ?? 0) -
          (ROLE_ORDER[getRole(a)] ?? 0);

        if (roleDiff !== 0) return roleDiff;

        return displayName(a).localeCompare(
          displayName(b)
        );
      }
    );

    setMembers(sorted);
  }

  async function loadNews() {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "News konnten nicht geladen werden:",
        error
      );

      setNews([]);
      return;
    }

    setNews(data || []);
  }

  async function loadForum() {
    const { data, error } = await supabase
      .from("forum_posts")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Forum konnte nicht geladen werden:",
        error
      );

      setForumPosts([]);
      return;
    }

    setForumPosts(data || []);
  }

  /* =====================================================
     FLASH MESSAGE
  ===================================================== */

  function showFlash(text) {
    setFlash(text);

    setTimeout(() => {
      setFlash("");
    }, 3500);
  }

  /* =====================================================
     LOGOUT
  ===================================================== */

  async function logout() {
    await supabase.auth.signOut();

    setSession(null);
    setMe(null);
    setPage("home");
  }

  /* =====================================================
     PROFILE SAVE
  ===================================================== */

  async function saveProfile(values) {
    if (!me) return;

    const updateData = {
      ...me,
      first_name: values.first_name || null,
      last_name: values.last_name || null,
      nickname: values.nickname || null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", me.id);

    if (error) {
      showFlash(error.message);
      return;
    }

    setMe(updateData);

    await loadMembers();

    showFlash("Profil gespeichert.");
  }

  /* =====================================================
     NEWS ERSTELLEN
  ===================================================== */

  async function createNews(values) {
    if (!session?.user) return;

    const payload = {
      title: values.title,
      description: values.description || null,
      content: values.content || null,
      image_url: values.image_url || null,
    };

    const { error } = await supabase
      .from("news")
      .insert(payload);

    if (error) {
      showFlash(error.message);
      return;
    }

    await loadNews();

    setModal(null);

    showFlash("News veröffentlicht.");
  }

  /* =====================================================
     FORUM POST
  ===================================================== */

  async function createForumPost(values) {
    if (!session?.user) return;

    const payload = {
      title: values.title,
      content: values.content,
    };

    const { error } = await supabase
      .from("forum_posts")
      .insert(payload);

    if (error) {
      showFlash(
        error.message ||
          "Beitrag konnte nicht erstellt werden."
      );

      return;
    }

    await loadForum();

    setModal(null);

    showFlash("Beitrag erstellt.");
  }

  /* =====================================================
     BERECHNUNGEN
  ===================================================== */

  const role = getRole(me);

  const isAdmin =
    role === "admin" ||
    role === "head_admin";

  const isHead =
    role === "head_admin";

  const filteredMembers = members.filter(
    (member) => {
      const text =
        `${displayName(member)} ${member.first_name || ""} ${member.last_name || ""}`
          .toLowerCase();

      return text.includes(
        search.toLowerCase()
      );
    }
  );

  /* =====================================================
     NAVIGATION
  ===================================================== */

  const nav = [
    ["home", Home, "Startseite"],
    ["members", Users, "Mitglieder"],
    ["forum", MessageCircle, "Forum"],
    ["news", Newspaper, "News & Beiträge"],
    ["rewards", Gift, "Belohnungen"],
    ["profile", Settings, "Mein Profil"],
  ];

  if (isAdmin) {
    nav.push([
      "admin",
      Shield,
      "Admin-Bereich",
    ]);
  }

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading && !session) {
    return (
      <div className="loading-screen">
        <Loader2 className="spin" size={38} />
      </div>
    );
  }

  /* =====================================================
     AUTH
  ===================================================== */

  if (!session) {
    return (
      <>
        <GlobalStyles />

        <AuthScreen
          onDone={async () => {
            const { data } =
              await supabase.auth.getSession();

            setSession(data.session);
          }}
        />
      </>
    );
  }

  /* =====================================================
     PAGE CONTENT
  ===================================================== */

  function renderPage() {
    /* ---------------- HOME ---------------- */

    if (page === "home") {
      return (
        <div className="page-content">
          <section className="hero-section">
            <div className="hero-label">
              <Sparkles size={15} />
              DEINE COMMUNITY
            </div>

            <h1>
              Willkommen zurück,
              <br />
              <span>{displayName(me)}</span>
            </h1>

            <p>
              Alles Wichtige aus deiner Community
              auf einen Blick.
            </p>
          </section>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Users />
              </div>

              <div>
                <strong>{members.length}</strong>
                <span>Mitglieder</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <MessageCircle />
              </div>

              <div>
                <strong>{forumPosts.length}</strong>
                <span>Diskussionen</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Newspaper />
              </div>

              <div>
                <strong>{news.length}</strong>
                <span>News & Beiträge</span>
              </div>
            </div>
          </div>

          <section className="content-section">
            <div className="section-header">
              <div>
                <h2>Neu in der Community</h2>

                <p>
                  Die neuesten Beiträge und
                  Ankündigungen.
                </p>
              </div>

              <button
                className="text-button"
                onClick={() => setPage("news")}
              >
                Alle ansehen
                <ChevronRight size={18} />
              </button>
            </div>

            {news.length === 0 ? (
              <div className="empty-state">
                <Newspaper size={38} />

                <h3>Noch keine News vorhanden</h3>

                <p>
                  Sobald neue Beiträge veröffentlicht
                  werden, erscheinen sie hier.
                </p>
              </div>
            ) : (
              <div className="news-preview-grid">
                {news.slice(0, 3).map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      );
    }

    /* ---------------- MEMBERS ---------------- */

    if (page === "members") {
      return (
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                ENNSTAL.CONNECT
              </div>

              <h1>Mitglieder</h1>

              <p>
                Entdecke die Menschen in deiner
                Community.
              </p>
            </div>
          </div>

          <div className="search-bar">
            <Search size={20} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Mitglieder suchen..."
            />
          </div>

          <div className="members-grid">
            {filteredMembers.map(
              (member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  isCurrent={
                    member.id === me?.id
                  }
                  canManage={isAdmin}
                  onManage={() =>
                    showFlash(
                      `Verwaltung für ${displayName(
                        member
                      )} kann hier erweitert werden.`
                    )
                  }
                />
              )
            )}
          </div>
        </div>
      );
    }

    /* ---------------- FORUM ---------------- */

    if (page === "forum") {
      return (
        <div className="page-content">
          <div className="page-heading row-heading">
            <div>
              <div className="eyebrow">
                COMMUNITY
              </div>

              <h1>Forum</h1>

              <p>
                Tausche dich mit anderen Mitgliedern
                aus.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() =>
                setModal("forum")
              }
            >
              <Plus size={18} />
              Neuer Beitrag
            </button>
          </div>

          {forumPosts.length === 0 ? (
            <div className="empty-state big">
              <MessageCircle size={46} />

              <h3>Noch keine Diskussionen</h3>

              <p>
                Starte die erste Diskussion und
                bringe die Community zum Leben.
              </p>

              <button
                className="primary-button"
                onClick={() =>
                  setModal("forum")
                }
              >
                <Plus size={18} />
                Diskussion starten
              </button>
            </div>
          ) : (
            <div className="forum-list">
              {forumPosts.map((post) => (
                <div
                  className="forum-card"
                  key={post.id}
                >
                  <div className="forum-icon">
                    <MessageCircle size={22} />
                  </div>

                  <div className="forum-content">
                    <h3>
                      {post.title ||
                        "Community-Beitrag"}
                    </h3>

                    <p>
                      {post.content}
                    </p>

                    <span>
                      {formatDate(
                        post.created_at
                      )}
                    </span>
                  </div>

                  <ChevronRight
                    className="forum-arrow"
                    size={22}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    /* ---------------- NEWS ---------------- */

    if (page === "news") {
      return (
        <div className="page-content">
          <div className="page-heading row-heading">
            <div>
              <div className="eyebrow">
                COMMUNITY
              </div>

              <h1>News & Beiträge</h1>

              <p>
                Alle Neuigkeiten aus deiner
                Community.
              </p>
            </div>

            {isAdmin && (
              <button
                className="primary-button"
                onClick={() =>
                  setModal("news")
                }
              >
                <Plus size={18} />
                News erstellen
              </button>
            )}
          </div>

          {news.length === 0 ? (
            <div className="empty-state big">
              <Newspaper size={46} />

              <h3>Noch keine News vorhanden</h3>

              <p>
                Hier erscheinen zukünftige
                Ankündigungen und Beiträge.
              </p>
            </div>
          ) : (
            <div className="news-grid">
              {news.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  large
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    /* ---------------- REWARDS ---------------- */

    if (page === "rewards") {
      return (
        <div className="page-content">
          <div className="page-heading">
            <div className="eyebrow">
              COMMUNITY
            </div>

            <h1>Belohnungen</h1>

            <p>
              Verdiene dir besondere Vorteile
              durch deine Aktivität.
            </p>
          </div>

          <div className="rewards-grid">
            <RewardCard
              icon={<Star />}
              title="Aktives Mitglied"
              text="Sei aktiv und beteilige dich an der Community."
            />

            <RewardCard
              icon={<MessageCircle />}
              title="Diskussionsstarter"
              text="Starte interessante Gespräche im Forum."
            />

            <RewardCard
              icon={<Heart />}
              title="Community Support"
              text="Hilf anderen Mitgliedern und unterstütze die Community."
            />

            <RewardCard
              icon={<Trophy />}
              title="Community Champion"
              text="Eine besondere Auszeichnung für engagierte Mitglieder."
            />
          </div>
        </div>
      );
    }

    /* ---------------- PROFILE ---------------- */

    if (page === "profile") {
      return (
        <ProfilePage
          me={me}
          onSave={saveProfile}
        />
      );
    }

    /* ---------------- ADMIN ---------------- */

    if (page === "admin") {
      return (
        <div className="page-content">
          <div className="page-heading">
            <div className="eyebrow">
              VERWALTUNG
            </div>

            <h1>Admin-Bereich</h1>

            <p>
              Verwalte deine Community.
            </p>
          </div>

          <div className="admin-grid">
            <AdminCard
              icon={<Users />}
              title="Mitglieder"
              text={`${members.length} Mitglieder registriert`}
              action={() =>
                setPage("members")
              }
            />

            <AdminCard
              icon={<Newspaper />}
              title="News"
              text="Beiträge und Ankündigungen verwalten"
              action={() =>
                setPage("news")
              }
            />

            <AdminCard
              icon={<MessageCircle />}
              title="Forum"
              text="Community-Diskussionen verwalten"
              action={() =>
                setPage("forum")
              }
            />

            {isHead && (
              <AdminCard
                icon={<Crown />}
                title="Head Admin"
                text="Erweiterte Verwaltung und Rollen"
                action={() =>
                  showFlash(
                    "Erweiterte Head-Admin-Funktionen."
                  )
                }
              />
            )}
          </div>
        </div>
      );
    }

    return null;
  }

  /* =====================================================
     MAIN APP
  ===================================================== */

  return (
    <>
      <GlobalStyles />

      <div className="app-shell">
        {/* SIDEBAR */}

        <aside
          className={`sidebar ${
            mobileMenu ? "sidebar-open" : ""
          }`}
        >
          <div className="sidebar-top">
            <div className="brand">
              <div className="brand-icon">
                <Star fill="currentColor" />
              </div>

              <div className="brand-text">
                <strong>ennstal</strong>
                <span>CONNECT</span>
              </div>
            </div>

            <div className="user-card">
              <Avatar
                profile={me}
                size="sm"
              />

              <div className="user-info">
                <strong>
                  {displayName(me)}
                </strong>

                <span>
                  {roleIcon(role, 13)}
                  {ROLE_LABEL[role] ||
                    "Mitglied"}
                </span>
              </div>
            </div>
          </div>

          <nav className="navigation">
            {nav.map(
              ([key, Icon, label]) => (
                <button
                  key={key}
                  className={`nav-item ${
                    page === key
                      ? "nav-active"
                      : ""
                  }`}
                  onClick={() => {
                    setPage(key);
                    setMobileMenu(false);
                  }}
                >
                  <Icon size={20} />

                  <span>{label}</span>
                </button>
              )
            )}
          </nav>

          <div className="sidebar-bottom">
            <button
              className="logout-button"
              onClick={logout}
            >
              <LogOut size={20} />

              <span>Abmelden</span>
            </button>
          </div>
        </aside>

        {/* MAIN */}

        <main className="main-area">
          <header className="topbar">
            <button
              className="mobile-menu"
              onClick={() =>
                setMobileMenu(!mobileMenu)
              }
            >
              <Menu />
            </button>

            <div className="breadcrumb">
              ENNSTAL.CONNECT
              <ChevronRight size={15} />
              <span>
                {PAGE_TITLES[page]}
              </span>
            </div>

            <div className="top-profile">
              <Avatar
                profile={me}
                size="xs"
              />

              <span>
                {displayName(me)}
              </span>
            </div>
          </header>

          <div className="main-scroll">
            {renderPage()}
          </div>
        </main>
      </div>

      {/* FLASH */}

      {flash && (
        <div className="flash-message">
          {flash}
        </div>
      )}

      {/* NEWS MODAL */}

      {modal === "news" && (
        <NewsModal
          onClose={() =>
            setModal(null)
          }
          onSubmit={createNews}
        />
      )}

      {/* FORUM MODAL */}

      {modal === "forum" && (
        <ForumModal
          onClose={() =>
            setModal(null)
          }
          onSubmit={createForumPost}
        />
      )}
    </>
  );
}

/* =========================================================
   MEMBER CARD
========================================================= */

function MemberCard({
  member,
  isCurrent,
  canManage,
  onManage,
}) {
  const role = getRole(member);

  return (
    <div className="member-card">
      <div className="member-card-top">
        <Avatar
          profile={member}
          size="lg"
        />

        <div className="member-role">
          {roleIcon(role)}
          {ROLE_LABEL[role] ||
            "Mitglied"}
        </div>
      </div>

      <div className="member-info">
        <h3>
          {displayName(member)}

          {isCurrent && (
            <span className="you-badge">
              Du
            </span>
          )}
        </h3>

        {(member.first_name ||
          member.last_name) && (
          <p>
            {[
              member.first_name,
              member.last_name,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
        )}
      </div>

      <div className="member-footer">
        <div className="status">
          <span className="online-dot" />
          Community Mitglied
        </div>

        {canManage && !isCurrent && (
          <button
            className="icon-action"
            onClick={onManage}
            title="Mitglied verwalten"
          >
            <Settings size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   NEWS CARD
========================================================= */

function NewsCard({ item, large }) {
  return (
    <article
      className={`news-card ${
        large ? "news-card-large" : ""
      }`}
    >
      {item.image_url ? (
        <div className="news-image">
          <img
            src={item.image_url}
            alt={item.title}
          />
        </div>
      ) : (
        <div className="news-image news-image-placeholder">
          <Newspaper size={32} />
        </div>
      )}

      <div className="news-card-content">
        <span className="news-date">
          {formatDate(item.created_at)}
        </span>

        <h3>
          {item.title || "Community News"}
        </h3>

        <p>
          {item.description ||
            item.content ||
            "Neue Informationen aus der Community."}
        </p>

        <button className="text-button">
          Beitrag lesen
          <ChevronRight size={17} />
        </button>
      </div>
    </article>
  );
}

/* =========================================================
   REWARD CARD
========================================================= */

function RewardCard({
  icon,
  title,
  text,
}) {
  return (
    <div className="reward-card">
      <div className="reward-icon">
        {icon}
      </div>

      <h3>{title}</h3>

      <p>{text}</p>

      <div className="reward-progress">
        <div />
      </div>

      <span>Noch nicht freigeschaltet</span>
    </div>
  );
}

/* =========================================================
   ADMIN CARD
========================================================= */

function AdminCard({
  icon,
  title,
  text,
  action,
}) {
  return (
    <button
      className="admin-card"
      onClick={action}
    >
      <div className="admin-card-icon">
        {icon}
      </div>

      <div>
        <h3>{title}</h3>

        <p>{text}</p>
      </div>

      <ChevronRight size={20} />
    </button>
  );
}

/* =========================================================
   PROFILE PAGE
========================================================= */

function ProfilePage({ me, onSave }) {
  const [firstName, setFirstName] =
    useState(me?.first_name || "");

  const [lastName, setLastName] =
    useState(me?.last_name || "");

  const [nickname, setNickname] =
    useState(me?.nickname || "");

  const [saving, setSaving] =
    useState(false);

  async function submit(e) {
    e.preventDefault();

    setSaving(true);

    await onSave({
      first_name: firstName,
      last_name: lastName,
      nickname,
    });

    setSaving(false);
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div className="eyebrow">
          ACCOUNT
        </div>

        <h1>Mein Profil</h1>

        <p>
          Passe deine persönlichen Informationen
          an.
        </p>
      </div>

      <div className="profile-layout">
        <div className="profile-preview">
          <Avatar
            profile={{
              ...me,
              first_name: firstName,
              last_name: lastName,
              nickname,
            }}
            size="xl"
          />

          <h2>
            {nickname ||
              [firstName, lastName]
                .filter(Boolean)
                .join(" ") ||
              "Mitglied"}
          </h2>

          <div className="role-pill">
            {roleIcon(getRole(me))}
            {ROLE_LABEL[getRole(me)]}
          </div>
        </div>

        <form
          className="profile-form"
          onSubmit={submit}
        >
          <div className="form-row">
            <div className="form-group">
              <label>Vorname</label>

              <input
                value={firstName}
                onChange={(e) =>
                  setFirstName(
                    e.target.value
                  )
                }
                placeholder="Vorname"
              />
            </div>

            <div className="form-group">
              <label>Nachname</label>

              <input
                value={lastName}
                onChange={(e) =>
                  setLastName(
                    e.target.value
                  )
                }
                placeholder="Nachname"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Nickname</label>

            <input
              value={nickname}
              onChange={(e) =>
                setNickname(e.target.value)
              }
              placeholder="Dein Community Name"
            />
          </div>

          <button
            className="primary-button"
            disabled={saving}
          >
            {saving && (
              <Loader2
                className="spin"
                size={18}
              />
            )}

            <Edit3 size={18} />
            Profil speichern
          </button>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   NEWS MODAL
========================================================= */

function NewsModal({
  onClose,
  onSubmit,
}) {
  const [title, setTitle] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [content, setContent] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  async function submit(e) {
    e.preventDefault();

    await onSubmit({
      title,
      description,
      content,
      image_url: imageUrl,
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>News erstellen</h2>

            <p>
              Teile Neuigkeiten mit deiner
              Community.
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Titel</label>

            <input
              required
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="Titel der News"
            />
          </div>

          <div className="form-group">
            <label>Kurzbeschreibung</label>

            <input
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              placeholder="Kurze Zusammenfassung"
            />
          </div>

          <div className="form-group">
            <label>Inhalt</label>

            <textarea
              rows="6"
              value={content}
              onChange={(e) =>
                setContent(e.target.value)
              }
              placeholder="Schreibe deinen Beitrag..."
            />
          </div>

          <div className="form-group">
            <label>
              <ImageIcon size={15} />
              Bild URL
            </label>

            <input
              value={imageUrl}
              onChange={(e) =>
                setImageUrl(
                  e.target.value
                )
              }
              placeholder="https://..."
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Abbrechen
            </button>

            <button className="primary-button">
              <Send size={18} />
              Veröffentlichen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   FORUM MODAL
========================================================= */

function ForumModal({
  onClose,
  onSubmit,
}) {
  const [title, setTitle] =
    useState("");

  const [content, setContent] =
    useState("");

  async function submit(e) {
    e.preventDefault();

    await onSubmit({
      title,
      content,
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Neue Diskussion</h2>

            <p>
              Starte ein Gespräch mit der
              Community.
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            <X />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Titel</label>

            <input
              required
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="Worum geht es?"
            />
          </div>

          <div className="form-group">
            <label>Beitrag</label>

            <textarea
              required
              rows="7"
              value={content}
              onChange={(e) =>
                setContent(
                  e.target.value
                )
              }
              placeholder="Schreibe deine Nachricht..."
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Abbrechen
            </button>

            <button className="primary-button">
              <Send size={18} />
              Beitrag erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================================================
   KOMPLETTE STYLES
========================================================= */

function GlobalStyles() {
  return (
    <style>{`

      * {
        box-sizing: border-box;
      }

      html,
      body,
      #root {
        margin: 0;
        min-height: 100%;
        width: 100%;
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      body {
        background: #f3f6fa;
        color: #253548;
      }

      button,
      input,
      textarea {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      /* ================= APP ================= */

      .app-shell {
        min-height: 100vh;
        display: flex;
        background:
          radial-gradient(
            circle at top right,
            #ffffff 0%,
            #eef2f8 42%,
            #e8edf5 100%
          );
      }

      /* ================= SIDEBAR ================= */

      .sidebar {
        width: 278px;
        min-height: 100vh;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        background:
          linear-gradient(
            180deg,
            #253241 0%,
            #182431 100%
          );
        color: white;
        padding: 18px 14px;
        position: relative;
        z-index: 20;
        box-shadow:
          10px 0 35px
          rgba(20, 30, 45, 0.08);
      }

      .sidebar-top {
        display: flex;
        flex-direction: column;
        gap: 28px;
      }

      .brand {
        min-height: 70px;
        border-radius: 22px;
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 10px 12px;
        border: 1px solid
          rgba(255,255,255,0.08);
        background:
          rgba(255,255,255,0.035);
      }

      .brand-icon {
        width: 50px;
        height: 50px;
        border-radius: 16px;
        display: grid;
        place-items: center;
        background:
          linear-gradient(
            135deg,
            #ffb14b,
            #ff6b19
          );
        color: white;
        box-shadow:
          0 10px 25px
          rgba(255, 112, 25, 0.32);
      }

      .brand-icon svg {
        width: 24px;
        height: 24px;
      }

      .brand-text {
        display: flex;
        flex-direction: column;
      }

      .brand-text strong {
        font-size: 20px;
        line-height: 1;
        letter-spacing: -0.5px;
      }

      .brand-text span {
        margin-top: 7px;
        color: #aab5c1;
        font-size: 10px;
        letter-spacing: 3px;
        font-weight: 700;
      }

      .user-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 13px;
        border-radius: 18px;
        background:
          rgba(255,255,255,0.95);
        color: #253548;
        box-shadow:
          0 12px 28px
          rgba(0,0,0,0.08);
      }

      .user-info {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }

      .user-info strong {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .user-info span {
        display: flex;
        align-items: center;
        gap: 5px;
        color: #6c7785;
        font-size: 11px;
        font-weight: 700;
      }

      .navigation {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .nav-item {
        width: 100%;
        min-height: 50px;
        display: flex;
        align-items: center;
        gap: 14px;
        border: none;
        border-radius: 14px;
        padding: 0 14px;
        background: transparent;
        color: #aeb9c6;
        font-size: 15px;
        font-weight: 650;
        text-align: left;
        transition:
          0.2s ease;
      }

      .nav-item:hover {
        background:
          rgba(255,255,255,0.06);
        color: white;
      }

      .nav-active {
        background:
          linear-gradient(
            135deg,
            #ff9a32,
            #ff5e14
          );
        color: white;
        box-shadow:
          0 12px 24px
          rgba(255,95,20,0.22);
      }

      .sidebar-bottom {
        margin-top: auto;
        padding-top: 20px;
      }

      .logout-button {
        width: 100%;
        min-height: 48px;
        display: flex;
        align-items: center;
        gap: 13px;
        border-radius: 14px;
        padding: 0 14px;
        border:
          1px solid
          rgba(255,255,255,0.1);
        background:
          rgba(255,255,255,0.035);
        color: #c8d1db;
        font-weight: 650;
      }

      .logout-button:hover {
        background:
          rgba(255,255,255,0.08);
        color: white;
      }

      /* ================= MAIN ================= */

      .main-area {
        flex: 1;
        min-width: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .topbar {
        height: 82px;
        flex-shrink: 0;
        padding: 0 36px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom:
          1px solid
          rgba(35,50,68,0.08);
        background:
          rgba(255,255,255,0.6);
        backdrop-filter: blur(15px);
      }

      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #7a8795;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1px;
      }

      .breadcrumb span {
        color: #344356;
      }

      .top-profile {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 14px;
      }

      .main-scroll {
        flex: 1;
        min-width: 0;
      }

      .page-content {
        width: 100%;
        max-width: 1450px;
        margin: 0 auto;
        padding: 42px 36px 70px;
      }

      /* ================= PAGE ================= */

      .eyebrow,
      .hero-label {
        color: #ef741b;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 2px;
      }

      .page-heading {
        margin-bottom: 32px;
      }

      .row-heading {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 25px;
      }

      .page-heading h1 {
        margin: 8px 0 10px;
        font-size: clamp(32px, 4vw, 44px);
        letter-spacing: -1.5px;
        color: #26374a;
      }

      .page-heading p,
      .hero-section p {
        margin: 0;
        color: #687789;
        font-size: 16px;
      }

      .hero-section {
        padding: 25px 0 34px;
      }

      .hero-label {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .hero-section h1 {
        margin: 18px 0 15px;
        font-size: clamp(40px, 5vw, 58px);
        line-height: 1.05;
        letter-spacing: -2.5px;
        color: #27394d;
      }

      .hero-section h1 span {
        color: #ef741b;
      }

      /* ================= STATS ================= */

      .stats-grid {
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 18px;
        margin-bottom: 34px;
      }

      .stat-card {
        min-height: 118px;
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 22px;
        background:
          rgba(255,255,255,0.86);
        border:
          1px solid
          rgba(255,255,255,0.9);
        border-radius: 22px;
        box-shadow:
          0 16px 40px
          rgba(47,62,82,0.08);
      }

      .stat-icon {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        color: #f4771d;
        background: #fff3e7;
      }

      .stat-card strong {
        display: block;
        color: #2d3c4f;
        font-size: 26px;
      }

      .stat-card span {
        display: block;
        margin-top: 3px;
        color: #7b8794;
        font-size: 13px;
      }

      /* ================= CONTENT ================= */

      .content-section {
        padding: 30px;
        border-radius: 28px;
        background:
          rgba(255,255,255,0.78);
        border:
          1px solid
          rgba(255,255,255,0.95);
        box-shadow:
          0 20px 55px
          rgba(40,55,75,0.07);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 25px;
      }

      .section-header h2 {
        margin: 0 0 5px;
        color: #2a394c;
      }

      .section-header p {
        margin: 0;
        color: #778495;
        font-size: 14px;
      }

      /* ================= SEARCH ================= */

      .search-bar {
        max-width: 480px;
        height: 52px;
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 0 16px;
        margin-bottom: 25px;
        background: white;
        border:
          1px solid
          #e1e6ed;
        border-radius: 15px;
        box-shadow:
          0 8px 25px
          rgba(45,55,70,0.05);
      }

      .search-bar svg {
        color: #98a4b2;
      }

      .search-bar input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        color: #29394b;
      }

      /* ================= MEMBERS ================= */

      .members-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fill, minmax(260px, 1fr));
        gap: 20px;
      }

      .member-card {
        min-height: 300px;
        display: flex;
        flex-direction: column;
        padding: 22px;
        border-radius: 24px;
        background:
          rgba(255,255,255,0.9);
        border:
          1px solid
          rgba(255,255,255,0.95);
        box-shadow:
          0 18px 45px
          rgba(45,60,80,0.08);
        transition:
          transform .2s ease,
          box-shadow .2s ease;
      }

      .member-card:hover {
        transform: translateY(-4px);
        box-shadow:
          0 25px 55px
          rgba(45,60,80,0.12);
      }

      .member-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .member-role,
      .role-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        border-radius: 100px;
        color: #ad5a18;
        background: #fff5e9;
        border: 1px solid #ffd6ac;
        font-size: 11px;
        font-weight: 800;
      }

      .member-info {
        margin-top: 24px;
      }

      .member-info h3 {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 7px;
        margin: 0;
        color: #27384b;
        font-size: 21px;
      }

      .member-info p {
        margin: 8px 0 0;
        color: #738091;
        font-size: 14px;
      }

      .you-badge {
        padding: 4px 8px;
        border-radius: 8px;
        background: #eef3f8;
        color: #6f7d8b;
        font-size: 10px;
        font-weight: 800;
      }

      .member-footer {
        margin-top: auto;
        padding-top: 22px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #edf0f4;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 7px;
        color: #84909d;
        font-size: 12px;
      }

      .online-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #48bf7b;
        box-shadow:
          0 0 0 4px
          rgba(72,191,123,0.12);
      }

      /* ================= AVATAR ================= */

      .avatar {
        flex-shrink: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        border-radius: 50%;
        color: white;
        background:
          linear-gradient(
            135deg,
            #ffad47,
            #f5671d
          );
        font-weight: 850;
        box-shadow:
          0 8px 22px
          rgba(242,105,30,0.22);
      }

      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .avatar-xs {
        width: 32px;
        height: 32px;
        font-size: 10px;
      }

      .avatar-sm {
        width: 42px;
        height: 42px;
        font-size: 13px;
      }

      .avatar-md {
        width: 50px;
        height: 50px;
        font-size: 15px;
      }

      .avatar-lg {
        width: 76px;
        height: 76px;
        font-size: 22px;
      }

      .avatar-xl {
        width: 130px;
        height: 130px;
        font-size: 38px;
      }

      /* ================= BUTTONS ================= */

      .primary-button,
      .secondary-button,
      .text-button,
      .icon-action {
        border: none;
      }

      .primary-button {
        min-height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        padding: 0 18px;
        border-radius: 13px;
        background:
          linear-gradient(
            135deg,
            #ff982f,
            #ff5c12
          );
        color: white;
        font-weight: 800;
        box-shadow:
          0 10px 22px
          rgba(255,102,20,0.2);
      }

      .primary-button:hover {
        transform: translateY(-1px);
      }

      .primary-button:disabled {
        opacity: .65;
        cursor: not-allowed;
      }

      .full {
        width: 100%;
      }

      .secondary-button {
        min-height: 46px;
        padding: 0 18px;
        border-radius: 13px;
        background: #eef2f6;
        color: #536174;
        font-weight: 750;
      }

      .text-button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        background: transparent;
        color: #e86d1d;
        font-size: 13px;
        font-weight: 850;
      }

      .icon-action {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: #f1f4f7;
        color: #697687;
      }

      /* ================= NEWS ================= */

      .news-preview-grid,
      .news-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
      }

      .news-card {
        overflow: hidden;
        border-radius: 20px;
        background: white;
        border: 1px solid #edf0f4;
        box-shadow:
          0 12px 28px
          rgba(40,55,75,0.06);
      }

      .news-image {
        height: 155px;
        overflow: hidden;
        background: #edf1f5;
      }

      .news-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .news-image-placeholder {
        display: grid;
        place-items: center;
        color: #f07a28;
        background:
          linear-gradient(
            135deg,
            #fff4e7,
            #ffe8cf
          );
      }

      .news-card-content {
        padding: 20px;
      }

      .news-date {
        color: #9aa5b0;
        font-size: 11px;
        font-weight: 750;
      }

      .news-card h3 {
        margin: 8px 0;
        color: #29394b;
        font-size: 19px;
      }

      .news-card p {
        margin: 0 0 14px;
        color: #748091;
        line-height: 1.6;
        font-size: 14px;
      }

      /* ================= FORUM ================= */

      .forum-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .forum-card {
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 21px;
        border-radius: 20px;
        background: white;
        border: 1px solid #e9edf2;
      }

      .forum-icon {
        width: 52px;
        height: 52px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border-radius: 16px;
        color: #f27622;
        background: #fff2e4;
      }

      .forum-content {
        flex: 1;
        min-width: 0;
      }

      .forum-content h3 {
        margin: 0 0 6px;
        color: #2d3c4e;
      }

      .forum-content p {
        margin: 0;
        color: #718092;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .forum-content span {
        display: block;
        margin-top: 9px;
        color: #9ba5b0;
        font-size: 11px;
      }

      .forum-arrow {
        color: #a8b1bb;
      }

      /* ================= EMPTY ================= */

      .empty-state {
        min-height: 250px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 35px;
        border-radius: 20px;
        color: #8c98a5;
        background:
          rgba(248,250,252,0.8);
        border: 1px dashed #d9e0e7;
      }

      .empty-state.big {
        min-height: 380px;
      }

      .empty-state h3 {
        margin: 15px 0 7px;
        color: #47586b;
      }

      .empty-state p {
        max-width: 420px;
        margin: 0;
        line-height: 1.6;
      }

      .empty-state .primary-button {
        margin-top: 20px;
      }

      /* ================= REWARDS ================= */

      .rewards-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(240px, 1fr));
        gap: 20px;
      }

      .reward-card {
        padding: 26px;
        border-radius: 24px;
        background: white;
        border: 1px solid #edf0f4;
      }

      .reward-icon {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 17px;
        color: #f17822;
        background: #fff2e5;
      }

      .reward-card h3 {
        margin: 20px 0 9px;
      }

      .reward-card p {
        min-height: 65px;
        color: #778394;
        font-size: 14px;
        line-height: 1.6;
      }

      .reward-progress {
        height: 7px;
        overflow: hidden;
        margin: 20px 0 10px;
        border-radius: 10px;
        background: #edf1f4;
      }

      .reward-progress div {
        width: 22%;
        height: 100%;
        border-radius: inherit;
        background:
          linear-gradient(
            90deg,
            #ffb14c,
            #ff6b19
          );
      }

      .reward-card > span {
        color: #9ba5b0;
        font-size: 11px;
      }

      /* ================= PROFILE ================= */

      .profile-layout {
        display: grid;
        grid-template-columns:
          minmax(260px, .8fr)
          minmax(350px, 1.2fr);
        gap: 22px;
      }

      .profile-preview,
      .profile-form {
        padding: 32px;
        border-radius: 26px;
        background:
          rgba(255,255,255,.88);
        border: 1px solid white;
      }

      .profile-preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }

      .profile-preview h2 {
        margin: 20px 0 12px;
      }

      .profile-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .form-group label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #526174;
        font-size: 12px;
        font-weight: 800;
      }

      .form-group input,
      .form-group textarea {
        width: 100%;
        outline: none;
        border: 1px solid #dde4eb;
        border-radius: 12px;
        padding: 13px 14px;
        color: #2c3b4d;
        background: white;
        transition: .2s ease;
      }

      .form-group textarea {
        resize: vertical;
      }

      .form-group input:focus,
      .form-group textarea:focus {
        border-color: #ff8b38;
        box-shadow:
          0 0 0 4px
          rgba(255,139,56,.12);
      }

      /* ================= ADMIN ================= */

      .admin-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit, minmax(270px, 1fr));
        gap: 18px;
      }

      .admin-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 22px;
        text-align: left;
        border-radius: 20px;
        border: 1px solid #e8edf2;
        background: white;
        color: #2d3b4c;
      }

      .admin-card:hover {
        border-color: #ffc18e;
      }

      .admin-card-icon {
        width: 50px;
        height: 50px;
        display: grid;
        place-items: center;
        border-radius: 15px;
        color: #ef741b;
        background: #fff3e7;
      }

      .admin-card div:nth-child(2) {
        flex: 1;
      }

      .admin-card h3 {
        margin: 0 0 5px;
      }

      .admin-card p {
        margin: 0;
        color: #7c8794;
        font-size: 13px;
      }

      /* ================= MODAL ================= */

      .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: grid;
        place-items: center;
        padding: 20px;
        background:
          rgba(22,31,43,.48);
        backdrop-filter: blur(8px);
      }

      .modal {
        width: min(620px, 100%);
        max-height: calc(100vh - 40px);
        overflow-y: auto;
        padding: 28px;
        border-radius: 26px;
        background: white;
        box-shadow:
          0 30px 90px
          rgba(0,0,0,.25);
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 25px;
      }

      .modal-header h2 {
        margin: 0 0 6px;
      }

      .modal-header p {
        margin: 0;
        color: #788596;
        font-size: 14px;
      }

      .modal-close {
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        display: grid;
        place-items: center;
        border: none;
        border-radius: 12px;
        background: #f1f4f7;
        color: #667384;
      }

      .modal form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 8px;
      }

      /* ================= AUTH ================= */

      .auth-page,
      .loading-screen {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 20px;
        background:
          radial-gradient(
            circle at top,
            #fff2e3,
            #edf2f8 55%,
            #e2e9f2
          );
      }

      .auth-card {
        width: min(460px, 100%);
        padding: 38px;
        border-radius: 30px;
        background:
          rgba(255,255,255,.92);
        border: 1px solid white;
        box-shadow:
          0 30px 90px
          rgba(50,65,85,.15);
      }

      .auth-logo {
        display: flex;
        align-items: center;
        gap: 13px;
      }

      .auth-logo-icon {
        width: 54px;
        height: 54px;
        display: grid;
        place-items: center;
        border-radius: 17px;
        color: white;
        background:
          linear-gradient(
            135deg,
            #ffae49,
            #ff6416
          );
      }

      .auth-logo strong {
        display: block;
        font-size: 21px;
      }

      .auth-logo span {
        color: #8d99a6;
        font-size: 10px;
        letter-spacing: 3px;
        font-weight: 800;
      }

      .auth-heading {
        margin: 35px 0 25px;
      }

      .auth-heading h1 {
        margin: 0 0 9px;
        color: #293a4d;
      }

      .auth-heading p {
        margin: 0;
        color: #7c8897;
      }

      .auth-card form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .auth-message {
        padding: 12px;
        border-radius: 10px;
        background: #fff2e7;
        color: #a45118;
        font-size: 13px;
      }

      .auth-switch {
        width: 100%;
        margin-top: 18px;
        border: none;
        background: transparent;
        color: #e86f1f;
        font-weight: 750;
      }

      /* ================= FLASH ================= */

      .flash-message {
        position: fixed;
        right: 25px;
        bottom: 25px;
        z-index: 200;
        max-width: 380px;
        padding: 15px 20px;
        border-radius: 14px;
        background: #273647;
        color: white;
        box-shadow:
          0 20px 50px
          rgba(0,0,0,.2);
        font-size: 14px;
      }

      /* ================= MOBILE ================= */

      .mobile-menu {
        display: none;
        width: 42px;
        height: 42px;
        place-items: center;
        border: none;
        border-radius: 12px;
        background: #eef2f6;
        color: #344456;
      }

      .spin {
        animation:
          spin 1s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 900px) {
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          transform: translateX(-110%);
          transition: transform .25s ease;
        }

        .sidebar-open {
          transform: translateX(0);
        }

        .mobile-menu {
          display: grid;
        }

        .topbar {
          padding: 0 20px;
        }

        .page-content {
          padding: 28px 20px 50px;
        }

        .stats-grid {
          grid-template-columns: 1fr;
        }

        .profile-layout {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 620px) {
        .breadcrumb {
          display: none;
        }

        .topbar {
          justify-content: space-between;
        }

        .top-profile span {
          display: none;
        }

        .row-heading {
          flex-direction: column;
          align-items: flex-start;
        }

        .form-row {
          grid-template-columns: 1fr;
        }

        .content-section {
          padding: 20px;
        }

        .section-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .forum-card {
          align-items: flex-start;
        }

        .forum-arrow {
          display: none;
        }

        .modal {
          padding: 22px;
        }
      }

    `}</style>
  );
}
