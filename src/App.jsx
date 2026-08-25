import { useEffect, useMemo, useState } from "react";
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
  ChevronRight,
  Edit3,
  Save,
  X,
  User,
  Check,
  Plus,
  Lock,
  Unlock,
  Trash2
} from "lucide-react";


/* =========================================================
   ROLLEN
========================================================= */

const ROLE_LABEL = {
  member: "Mitglied",
  supporter: "Supporter",
  admin: "Admin",
  head_admin: "Head Admin"
};

const ROLE_ORDER = {
  member: 0,
  supporter: 1,
  admin: 2,
  head_admin: 3
};


/* =========================================================
   HILFSFUNKTIONEN
========================================================= */

function displayName(profile) {
  if (!profile) return "Unbekannt";

  const fullName = [
    profile.first_name,
    profile.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return profile.nickname || fullName || "Mitglied";
}


function getInitials(profile) {
  const name = displayName(profile);

  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


function getAvatar(profile) {
  if (profile?.avatar_url) {
    return profile.avatar_url;
  }

  const seed =
    profile?.nickname ||
    profile?.first_name ||
    profile?.id ||
    "user";

  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
    seed
  )}&backgroundColor=ff7a1a`;
}


function RoleIcon({ role, size = 15 }) {
  if (role === "head_admin") {
    return <Crown size={size} />;
  }

  if (role === "admin") {
    return <Shield size={size} />;
  }

  if (role === "supporter") {
    return <Star size={size} />;
  }

  return <User size={size} />;
}


function RoleBadge({ role }) {
  return (
    <span className={`role-badge role-${role}`}>
      <RoleIcon role={role} size={14} />
      {ROLE_LABEL[role] || "Mitglied"}
    </span>
  );
}


/* =========================================================
   AUTH SCREEN
========================================================= */

function AuthScreen({ onDone }) {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
            password
          });

        if (error) throw error;

        await onDone();
      }


      if (mode === "register") {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password
          });

        if (error) throw error;

        const userId = data.user?.id;

        if (userId) {
          const { error: profileError } =
            await supabase
              .from("profiles")
              .upsert(
                {
                  id: userId,
                  first_name: firstName.trim() || null,
                  last_name: lastName.trim() || null,
                  nickname: nickname.trim() || null,
                  role: "member"
                },
                {
                  onConflict: "id"
                }
              );

          if (profileError) {
            console.error(profileError);
          }
        }

        setMessage(
          "Registrierung erfolgreich. Prüfe gegebenenfalls deine E-Mails."
        );
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Ein Fehler ist aufgetreten.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-logo">
          <div className="brand-icon">
            <Star fill="currentColor" />
          </div>

          <div>
            <strong>ennstal</strong>
            <span>CONNECT</span>
          </div>
        </div>


        <h1>
          {mode === "login"
            ? "Willkommen zurück"
            : "Community beitreten"}
        </h1>

        <p>
          {mode === "login"
            ? "Melde dich bei deiner Community an."
            : "Erstelle dein persönliches Community-Profil."}
        </p>


        <form onSubmit={handleSubmit}>

          {mode === "register" && (
            <>

              <div className="form-row">

                <div className="field">
                  <label>Vorname</label>

                  <input
                    value={firstName}
                    onChange={(e) =>
                      setFirstName(e.target.value)
                    }
                    placeholder="Marco"
                  />
                </div>


                <div className="field">
                  <label>Nachname</label>

                  <input
                    value={lastName}
                    onChange={(e) =>
                      setLastName(e.target.value)
                    }
                    placeholder="Egger"
                  />
                </div>

              </div>


              <div className="field">

                <label>Nickname</label>

                <input
                  value={nickname}
                  onChange={(e) =>
                    setNickname(e.target.value)
                  }
                  placeholder="Dein Nickname"
                />

              </div>

            </>
          )}


          <div className="field">

            <label>E-Mail</label>

            <input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="name@email.at"
            />

          </div>


          <div className="field">

            <label>Passwort</label>

            <input
              type="password"
              required
              minLength="6"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="Mindestens 6 Zeichen"
            />

          </div>


          {message && (
            <div className="auth-message">
              {message}
            </div>
          )}


          <button
            className="primary-button"
            disabled={loading}
          >
            {loading
              ? "Bitte warten..."
              : mode === "login"
                ? "Anmelden"
                : "Account erstellen"}
          </button>

        </form>


        <button
          className="auth-switch"
          onClick={() => {
            setMode(
              mode === "login"
                ? "register"
                : "login"
            );

            setMessage("");
          }}
        >
          {mode === "login"
            ? "Noch keinen Account? Jetzt registrieren"
            : "Bereits registriert? Jetzt anmelden"}
        </button>

      </div>

    </div>
  );
}


/* =========================================================
   APP
========================================================= */

export default function App() {

  const [session, setSession] =
    useState(null);

  const [me, setMe] =
    useState(null);

  const [profiles, setProfiles] =
    useState([]);

  const [news, setNews] =
    useState([]);

  const [activePage, setActivePage] =
    useState("home");

  const [selectedProfile, setSelectedProfile] =
    useState(null);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);


  /* =====================================================
     AUTH LADEN
  ===================================================== */

  useEffect(() => {

    async function loadSession() {
      const { data } =
        await supabase.auth.getSession();

      setSession(data.session);
    }

    loadSession();


    const {
      data: listener
    } = supabase.auth.onAuthStateChange(
      (_, newSession) => {
        setSession(newSession);
      }
    );


    return () => {
      listener.subscription.unsubscribe();
    };

  }, []);


  /* =====================================================
     DATEN LADEN
  ===================================================== */

  useEffect(() => {

    if (!session?.user?.id) {
      setMe(null);
      setProfiles([]);
      setLoading(false);
      return;
    }

    loadAll();

  }, [session]);


  async function loadAll() {

    setLoading(true);

    try {

      const [
        profileResult,
        profilesResult,
        newsResult
      ] = await Promise.all([

        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("*")
          .order("created_at", {
            ascending: false
          }),

        supabase
          .from("news")
          .select("*")
          .order("created_at", {
            ascending: false
          })

      ]);


      if (
        profileResult.error &&
        profileResult.error.code !== "PGRST116"
      ) {
        console.error(
          "Profil konnte nicht geladen werden:",
          profileResult.error
        );
      }


      setMe(profileResult.data || null);

      setProfiles(
        profilesResult.data || []
      );

      setNews(
        newsResult.data || []
      );

    } catch (error) {

      console.error(
        "Fehler beim Laden:",
        error
      );

    } finally {

      setLoading(false);

    }
  }


  /* =====================================================
     BERECHTIGUNGEN
  ===================================================== */

  const role = me?.role || "member";

  const isSupporter =
    ROLE_ORDER[role] >=
    ROLE_ORDER.supporter;

  const isAdmin =
    ROLE_ORDER[role] >=
    ROLE_ORDER.admin;

  const isHead =
    role === "head_admin";


  /* =====================================================
     NAVIGATION
  ===================================================== */

  const nav = useMemo(() => {

    const items = [

      ["home", Home, "Startseite"],

      ["members", Users, "Mitglieder"],

      ["forum", MessageCircle, "Forum"],

      ["news", Newspaper, "News & Beiträge"],

      ["rewards", Gift, "Belohnungen"],

      ["profile", Settings, "Mein Profil"]

    ];


    if (isAdmin) {
      items.push([
        "admin",
        Shield,
        "Admin-Bereich"
      ]);
    }


    if (isHead) {
      items.push([
        "logs",
        Crown,
        "Admin-Logbuch"
      ]);
    }


    return items;

  }, [isAdmin, isHead]);


  /* =====================================================
     LOGOUT
  ===================================================== */

  async function logout() {

    await supabase.auth.signOut();

    setSession(null);
    setMe(null);

  }


  /* =====================================================
     PROFIL SPEICHERN
  ===================================================== */

  async function saveProfile(values) {

    if (!session?.user?.id) return;

    const payload = {
      first_name:
        values.first_name?.trim() || null,

      last_name:
        values.last_name?.trim() || null,

      nickname:
        values.nickname?.trim() || null
    };


    const { data, error } =
      await supabase
        .from("profiles")
        .update(payload)
        .eq("id", session.user.id)
        .select()
        .single();


    if (error) {

      alert(
        "Profil konnte nicht gespeichert werden: " +
        error.message
      );

      return;
    }


    setMe(data);

    setProfiles((old) =>
      old.map((profile) =>
        profile.id === data.id
          ? data
          : profile
      )
    );


    alert("Profil gespeichert!");
  }


  /* =====================================================
     RENDER
  ===================================================== */

  if (!session) {

    return (
      <AuthScreen
        onDone={async () => {
          const { data } =
            await supabase.auth.getSession();

          setSession(data.session);
        }}
      />
    );

  }


  if (loading) {

    return (
      <div className="loading-screen">
        <div className="loader" />
        <span>Community wird geladen...</span>
      </div>
    );

  }


  return (

    <div className="app-shell">


      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside className="sidebar">


        <button
          className="brand"
          onClick={() =>
            setActivePage("home")
          }
        >

          <div className="brand-icon">
            <Star fill="currentColor" />
          </div>

          <div className="brand-text">
            <strong>ennstal</strong>
            <span>CONNECT</span>
          </div>

        </button>


        <button
          className="sidebar-profile"
          onClick={() =>
            setActivePage("profile")
          }
        >

          <img
            src={getAvatar(me)}
            alt={displayName(me)}
          />

          <div>

            <strong>
              {displayName(me)}
            </strong>

            <RoleBadge role={role} />

          </div>

        </button>


        <nav className="navigation">

          {nav.map(
            ([key, Icon, label]) => (

              <button
                key={key}

                className={
                  activePage === key
                    ? "nav-item active"
                    : "nav-item"
                }

                onClick={() => {

                  setSelectedProfile(null);

                  setActivePage(key);

                }}
              >

                <Icon size={21} />

                <span>{label}</span>

              </button>

            )
          )}

        </nav>


        <button
          className="logout-button"
          onClick={logout}
        >

          <LogOut size={20} />

          Abmelden

        </button>


      </aside>


      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main-content">


        <header className="topbar">

          <div className="breadcrumb">

            ENNSTAL.CONNECT

            <ChevronRight size={16} />

            <strong>
              {nav.find(
                (item) =>
                  item[0] === activePage
              )?.[2] || "Community"}
            </strong>

          </div>


          <button
            className="top-profile"
            onClick={() =>
              setActivePage("profile")
            }
          >

            <img
              src={getAvatar(me)}
              alt=""
            />

            <strong>
              {displayName(me)}
            </strong>

          </button>

        </header>


        <section className="page-content">

          {activePage === "home" && (

            <HomePage
              me={me}
              profiles={profiles}
              news={news}
              setActivePage={setActivePage}
            />

          )}


          {activePage === "members" && (

            <MembersPage
              profiles={profiles}
              search={search}
              setSearch={setSearch}
              onOpenProfile={(profile) => {
                setSelectedProfile(profile);
                setActivePage("member-profile");
              }}
            />

          )}


          {activePage === "member-profile" && (

            <PublicProfilePage
              profile={selectedProfile}
              onBack={() =>
                setActivePage("members")
              }
            />

          )}


          {activePage === "profile" && (

            <MyProfilePage
              me={me}
              onSave={saveProfile}
            />

          )}


          {activePage === "rewards" && (

            <RewardsPage
              isSupporter={isSupporter}
              isAdmin={isAdmin}
              isHead={isHead}
            />

          )}


          {activePage === "forum" && (
            <SimplePage
              title="Forum"
              text="Hier entstehen die Community-Diskussionen."
              icon={MessageCircle}
            />
          )}


          {activePage === "news" && (
            <NewsPage
              news={news}
            />
          )}


          {activePage === "admin" &&
            isAdmin && (

              <AdminPage
                profiles={profiles}
                me={me}
                isHead={isHead}
                reload={loadAll}
              />

            )}


          {activePage === "logs" &&
            isHead && (

              <SimplePage
                title="Admin-Logbuch"
                text="Erweiterte Head-Admin-Funktionen."
                icon={Crown}
              />

            )}

        </section>

      </main>

    </div>

  );
}


/* =========================================================
   STARTSEITE
========================================================= */

function HomePage({
  me,
  profiles,
  news,
  setActivePage
}) {

  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          DEINE COMMUNITY
        </span>

        <h1>
          Willkommen zurück,
          <br />
          {displayName(me)}
        </h1>

        <p>
          Alles Wichtige aus deiner Community
          auf einen Blick.
        </p>

      </div>


      <div className="stats-grid">

        <button
          className="stat-card"
          onClick={() =>
            setActivePage("members")
          }
        >

          <Users />

          <div>

            <strong>
              {profiles.length}
            </strong>

            <span>Mitglieder</span>

          </div>

        </button>


        <button
          className="stat-card"
          onClick={() =>
            setActivePage("forum")
          }
        >

          <MessageCircle />

          <div>

            <strong>Forum</strong>

            <span>Diskussionen</span>

          </div>

        </button>


        <button
          className="stat-card"
          onClick={() =>
            setActivePage("news")
          }
        >

          <Newspaper />

          <div>

            <strong>
              {news.length}
            </strong>

            <span>News & Beiträge</span>

          </div>

        </button>

      </div>


      <div className="content-card">

        <h2>Neu in der Community</h2>

        {news.length === 0 ? (

          <div className="empty-state">

            <Newspaper size={35} />

            <p>
              Noch keine News vorhanden.
            </p>

          </div>

        ) : (

          news.slice(0, 3).map((item) => (

            <article
              className="news-preview"
              key={item.id}
            >

              <h3>
                {item.title}
              </h3>

              <p>
                {item.content}
              </p>

            </article>

          ))

        )}

      </div>

    </div>

  );
}


/* =========================================================
   MITGLIEDER
========================================================= */

function MembersPage({
  profiles,
  search,
  setSearch,
  onOpenProfile
}) {

  const filteredProfiles =
    profiles.filter((profile) => {

      const query =
        search.toLowerCase();

      return (
        displayName(profile)
          .toLowerCase()
          .includes(query) ||

        profile.first_name
          ?.toLowerCase()
          .includes(query) ||

        profile.last_name
          ?.toLowerCase()
          .includes(query)
      );

    });


  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          COMMUNITY
        </span>

        <h1>Mitglieder</h1>

        <p>
          Entdecke die Menschen deiner Community.
        </p>

      </div>


      <div className="search-box">

        <Search size={20} />

        <input
          placeholder="Mitglieder suchen..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

      </div>


      <div className="members-grid">

        {filteredProfiles.map(
          (profile) => (

            <button
              className="member-card"
              key={profile.id}
              onClick={() =>
                onOpenProfile(profile)
              }
            >

              <img
                className="member-avatar"
                src={getAvatar(profile)}
                alt={displayName(profile)}
              />

              <div className="member-info">

                <h3>
                  {displayName(profile)}
                </h3>

                <p>
                  {[
                    profile.first_name,
                    profile.last_name
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </p>

                <RoleBadge
                  role={
                    profile.role || "member"
                  }
                />

              </div>


              <ChevronRight
                className="member-arrow"
                size={20}
              />

            </button>

          )
        )}

      </div>

    </div>

  );
}


/* =========================================================
   ANDERES PROFIL
========================================================= */

function PublicProfilePage({
  profile,
  onBack
}) {

  if (!profile) {

    return (
      <SimplePage
        title="Profil nicht gefunden"
        text="Dieses Mitglied konnte nicht geladen werden."
        icon={User}
      />
    );

  }


  return (

    <div>

      <button
        className="back-button"
        onClick={onBack}
      >
        ← Zurück zu Mitgliedern
      </button>


      <div className="public-profile-card">

        <img
          className="public-avatar"
          src={getAvatar(profile)}
          alt={displayName(profile)}
        />


        <div className="public-profile-info">

          <span className="eyebrow">
            COMMUNITY MITGLIED
          </span>

          <h1>
            {displayName(profile)}
          </h1>


          <p>

            {[
              profile.first_name,
              profile.last_name
            ]
              .filter(Boolean)
              .join(" ")}

          </p>


          <RoleBadge
            role={
              profile.role || "member"
            }
          />

        </div>

      </div>

    </div>

  );
}


/* =========================================================
   MEIN PROFIL
========================================================= */

function MyProfilePage({
  me,
  onSave
}) {

  const [firstName, setFirstName] =
    useState(me?.first_name || "");

  const [lastName, setLastName] =
    useState(me?.last_name || "");

  const [nickname, setNickname] =
    useState(me?.nickname || "");

  const [editing, setEditing] =
    useState(false);


  useEffect(() => {

    setFirstName(me?.first_name || "");
    setLastName(me?.last_name || "");
    setNickname(me?.nickname || "");

  }, [me]);


  async function handleSave() {

    await onSave({
      first_name: firstName,
      last_name: lastName,
      nickname
    });

    setEditing(false);
  }


  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          ACCOUNT
        </span>

        <h1>Mein Profil</h1>

        <p>
          Passe deine persönlichen Informationen an.
        </p>

      </div>


      <div className="profile-layout">


        <div className="profile-summary">

          <img
            className="profile-main-avatar"
            src={getAvatar(me)}
            alt={displayName(me)}
          />

          <h2>
            {displayName(me)}
          </h2>

          <RoleBadge
            role={
              me?.role || "member"
            }
          />

        </div>


        <div className="profile-form-card">


          <div className="profile-form-header">

            <div>

              <h2>
                Persönliche Daten
              </h2>

              <p>
                Diese Daten werden in der Community angezeigt.
              </p>

            </div>


            {!editing ? (

              <button
                className="secondary-button"
                onClick={() =>
                  setEditing(true)
                }
              >

                <Edit3 size={18} />

                Bearbeiten

              </button>

            ) : (

              <button
                className="cancel-button"
                onClick={() => {

                  setFirstName(
                    me?.first_name || ""
                  );

                  setLastName(
                    me?.last_name || ""
                  );

                  setNickname(
                    me?.nickname || ""
                  );

                  setEditing(false);

                }}
              >

                <X size={18} />

                Abbrechen

              </button>

            )}

          </div>


          <div className="form-row">

            <div className="field">

              <label>
                Vorname
              </label>

              <input
                disabled={!editing}
                value={firstName}
                onChange={(e) =>
                  setFirstName(e.target.value)
                }
              />

            </div>


            <div className="field">

              <label>
                Nachname
              </label>

              <input
                disabled={!editing}
                value={lastName}
                onChange={(e) =>
                  setLastName(e.target.value)
                }
              />

            </div>

          </div>


          <div className="field">

            <label>
              Nickname
            </label>

            <input
              disabled={!editing}
              value={nickname}
              onChange={(e) =>
                setNickname(e.target.value)
              }
            />

          </div>


          {editing && (

            <button
              className="primary-button"
              onClick={handleSave}
            >

              <Save size={19} />

              Profil speichern

            </button>

          )}

        </div>

      </div>

    </div>

  );
}


/* =========================================================
   BELOHNUNGEN
========================================================= */

function RewardsPage({
  isSupporter,
  isAdmin,
  isHead
}) {

  const unlocked =
    isSupporter ||
    isAdmin ||
    isHead;


  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          COMMUNITY
        </span>

        <h1>Belohnungen</h1>

        <p>
          Entdecke Vorteile und Community-Belohnungen.
        </p>

      </div>


      {!unlocked && (

        <div className="locked-card">

          <Lock size={32} />

          <h2>
            Noch gesperrt
          </h2>

          <p>
            Diese Belohnungen werden für Supporter
            und das Admin-Team freigeschaltet.
          </p>

        </div>

      )}


      {unlocked && (

        <div className="rewards-grid">

          <div className="reward-card">

            <Gift />

            <h3>
              Supporter Bonus
            </h3>

            <p>
              Exklusive Community-Vorteile.
            </p>

            <span className="reward-unlocked">

              <Unlock size={15} />

              Freigeschaltet

            </span>

          </div>


          <div className="reward-card">

            <Star />

            <h3>
              Premium Status
            </h3>

            <p>
              Zusätzliche Features und Vorteile.
            </p>

            <span className="reward-unlocked">

              <Unlock size={15} />

              Freigeschaltet

            </span>

          </div>

        </div>

      )}

    </div>

  );
}


/* =========================================================
   NEWS
========================================================= */

function NewsPage({ news }) {

  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          COMMUNITY
        </span>

        <h1>
          News & Beiträge
        </h1>

        <p>
          Aktuelle Neuigkeiten aus der Community.
        </p>

      </div>


      <div className="news-list">

        {news.length === 0 ? (

          <div className="empty-state">

            <Newspaper size={38} />

            <h3>
              Noch keine Beiträge
            </h3>

            <p>
              Sobald Beiträge veröffentlicht werden,
              erscheinen sie hier.
            </p>

          </div>

        ) : (

          news.map((item) => (

            <article
              className="news-card"
              key={item.id}
            >

              <h2>
                {item.title}
              </h2>

              <p>
                {item.content}
              </p>

            </article>

          ))

        )}

      </div>

    </div>

  );
}


/* =========================================================
   ADMIN
========================================================= */

function AdminPage({
  profiles,
  me,
  isHead,
  reload
}) {

  const [busy, setBusy] =
    useState(null);


  async function changeRole(
    profile,
    newRole
  ) {

    if (!isHead) {
      alert(
        "Nur ein Head Admin kann Rollen verändern."
      );

      return;
    }


    if (profile.id === me.id) {
      alert(
        "Du kannst deine eigene Rolle hier nicht verändern."
      );

      return;
    }


    setBusy(profile.id);


    const { error } =
      await supabase
        .from("profiles")
        .update({
          role: newRole
        })
        .eq("id", profile.id);


    setBusy(null);


    if (error) {

      alert(error.message);

      return;

    }


    await reload();

  }


  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          VERWALTUNG
        </span>

        <h1>
          Admin-Bereich
        </h1>

        <p>
          Verwalte deine Community.
        </p>

      </div>


      <div className="admin-members">

        {profiles.map((profile) => (

          <div
            className="admin-member-row"
            key={profile.id}
          >

            <img
              src={getAvatar(profile)}
              alt=""
            />


            <div className="admin-member-info">

              <strong>
                {displayName(profile)}
              </strong>

              <span>
                {profile.first_name}{" "}
                {profile.last_name}
              </span>

            </div>


            <RoleBadge
              role={
                profile.role || "member"
              }
            />


            {isHead &&
              profile.id !== me.id && (

                <select
                  disabled={
                    busy === profile.id
                  }

                  value={
                    profile.role || "member"
                  }

                  onChange={(e) =>
                    changeRole(
                      profile,
                      e.target.value
                    )
                  }
                >

                  <option value="member">
                    Mitglied
                  </option>

                  <option value="supporter">
                    Supporter
                  </option>

                  <option value="admin">
                    Admin
                  </option>

                  <option value="head_admin">
                    Head Admin
                  </option>

                </select>

              )}

          </div>

        ))}

      </div>

    </div>

  );
}


/* =========================================================
   EINFACHE SEITE
========================================================= */

function SimplePage({
  title,
  text,
  icon: Icon
}) {

  return (

    <div>

      <div className="page-heading">

        <span className="eyebrow">
          ENNSTAL.CONNECT
        </span>

        <h1>{title}</h1>

        <p>{text}</p>

      </div>


      <div className="empty-state large">

        <Icon size={45} />

        <h2>
          In Entwicklung
        </h2>

        <p>
          Dieser Bereich wird gerade aufgebaut.
        </p>

      </div>

    </div>

  );
}
