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
  Lock,
  Unlock,
  Trash2,
  Edit3,
  Save,
  Plus,
  LogOut,
  User,
  X,
  Check,
  AlertTriangle
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
   STANDARD-BERECHTIGUNGEN
========================================================= */

const DEFAULT_PERMISSIONS = {
  manage_members: false,
  manage_warnings: false,
  manage_restrictions: false,
  manage_roles: false,
  manage_forum: false,
  manage_news: false
};


/* =========================================================
   HILFSFUNKTIONEN
========================================================= */

function displayName(profile) {
  if (!profile) return "Unbekannt";

  if (profile.nickname && profile.nickname.trim()) {
    return profile.nickname;
  }

  const fullName = [
    profile.first_name,
    profile.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Mitglied";
}


function roleIcon(role, size = 15) {
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


function roleClass(role) {
  if (role === "head_admin") return "role-head-admin";
  if (role === "admin") return "role-admin";
  if (role === "supporter") return "role-supporter";

  return "role-member";
}


/* =========================================================
   APP
========================================================= */

export default function App() {
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);

  const [members, setMembers] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [newsPosts, setNewsPosts] = useState([]);

  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);

  const [page, setPage] = useState("home");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [memberSearch, setMemberSearch] = useState("");

  const [forumTitle, setForumTitle] = useState("");
  const [forumContent, setForumContent] = useState("");

  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");

  const [editingForum, setEditingForum] = useState(null);
  const [editingNews, setEditingNews] = useState(null);

  const [selectedMember, setSelectedMember] = useState(null);

  const [profileNickname, setProfileNickname] = useState("");
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("login");


  /* =========================================================
     FLASH NACHRICHT
  ========================================================= */

  function flash(text) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }


  /* =========================================================
     SESSION LADEN
  ========================================================= */

  useEffect(() => {
    let mounted = true;

    async function init() {
      const {
        data
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(data.session || null);

      if (data.session) {
        await loadEverything(data.session.user.id);
      }

      if (mounted) {
        setLoading(false);
      }
    }

    init();

    const {
      data: listener
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession || null);

      if (newSession?.user?.id) {
        await loadEverything(newSession.user.id);
      } else {
        setMe(null);
        setMembers([]);
        setForumPosts([]);
        setNewsPosts([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);


  /* =========================================================
     ALLES LADEN
  ========================================================= */

  async function loadEverything(userId) {
    await Promise.all([
      loadMyProfile(userId),
      loadMembers(),
      loadForum(),
      loadNews()
    ]);
  }


  /* =========================================================
     MEIN PROFIL
  ========================================================= */

  async function loadMyProfile(userId) {
    const {
      data,
      error
    } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profil konnte nicht geladen werden:", error);
      return;
    }

    if (data) {
      setMe(data);

      setProfileNickname(data.nickname || "");
      setProfileFirstName(data.first_name || "");
      setProfileLastName(data.last_name || "");

      await loadPermissions(userId, data.role);
    }
  }


  /* =========================================================
     BERECHTIGUNGEN LADEN
  ========================================================= */

  async function loadPermissions(userId, role) {
    if (role === "head_admin") {
      setPermissions({
        manage_members: true,
        manage_warnings: true,
        manage_restrictions: true,
        manage_roles: true,
        manage_forum: true,
        manage_news: true
      });

      return;
    }

    if (role === "member" || role === "supporter") {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }

    const {
      data,
      error
    } = await supabase
      .from("admin_permissions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }

    setPermissions({
      manage_members: Boolean(data.manage_members),
      manage_warnings: Boolean(data.manage_warnings),
      manage_restrictions: Boolean(data.manage_restrictions),
      manage_roles: Boolean(data.manage_roles),
      manage_forum: Boolean(data.manage_forum),
      manage_news: Boolean(data.manage_news)
    });
  }


  /* =========================================================
     MITGLIEDER LADEN
  ========================================================= */

  async function loadMembers() {
    const {
      data,
      error
    } = await supabase
      .from("profiles")
      .select("*")
      .order("nickname", {
        ascending: true
      });

    if (error) {
      console.error("Mitglieder konnten nicht geladen werden:", error);
      return;
    }

    setMembers(data || []);
  }


  /* =========================================================
     FORUM LADEN
  ========================================================= */

  async function loadForum() {
    const {
      data,
      error
    } = await supabase
      .from("forum_posts")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("Forum konnte nicht geladen werden:", error);
      return;
    }

    setForumPosts(data || []);
  }


  /* =========================================================
     NEWS LADEN
  ========================================================= */

  async function loadNews() {
    const {
      data,
      error
    } = await supabase
      .from("news")
      .select("*")
      .order("created_at", {
        ascending: false
      });

    if (error) {
      console.error("News konnten nicht geladen werden:", error);
      return;
    }

    setNewsPosts(data || []);
  }


  /* =========================================================
     ROLLEN
  ========================================================= */

  const myRole = me?.role || "member";

  const isHead = myRole === "head_admin";

  const isAdmin =
    myRole === "admin" ||
    myRole === "head_admin";

  const isSupporter =
    myRole === "supporter";

  const canManageMembers =
    isHead ||
    permissions.manage_members;

  const canManageRoles =
    isHead ||
    permissions.manage_roles;

  const canManageForum =
    isHead ||
    permissions.manage_forum;

  const canManageNews =
    isHead ||
    permissions.manage_news;


  /* =========================================================
     NAVIGATION
  ========================================================= */

  const nav = [
    ["home", Home, "Startseite"],
    ["members", Users, "Mitglieder"],
    ["forum", MessageCircle, "Forum"],
    ["news", Newspaper, "News & Beiträge"],
    ["rewards", Gift, "Belohnungen"],
    ["profile", Settings, "Mein Profil"]
  ];

  if (isAdmin) {
    nav.push([
      "admin",
      Shield,
      "Admin-Bereich"
    ]);
  }

  if (isHead) {
    nav.push([
      "logs",
      Crown,
      "Admin-Logbuch"
    ]);
  }


  /* =========================================================
     MITGLIEDER FILTERN
  ========================================================= */

  const filteredMembers = useMemo(() => {
    const search = memberSearch.toLowerCase().trim();

    if (!search) return members;

    return members.filter((member) => {
      const name = displayName(member).toLowerCase();

      return name.includes(search);
    });
  }, [members, memberSearch]);


  /* =========================================================
     ANMELDEN
  ========================================================= */

  async function handleAuth(event) {
    event.preventDefault();

    if (!authEmail || !authPassword) {
      flash("Bitte E-Mail und Passwort eingeben.");
      return;
    }

    setLoading(true);

    if (authMode === "login") {
      const {
        error
      } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });

      if (error) {
        flash(error.message);
      }
    }

    if (authMode === "register") {
      const {
        error
      } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword
      });

      if (error) {
        flash(error.message);
      } else {
        flash("Registrierung erfolgreich.");
      }
    }

    setLoading(false);
  }


  /* =========================================================
     ABMELDEN
  ========================================================= */

  async function logout() {
    await supabase.auth.signOut();

    setSession(null);
    setMe(null);

    flash("Du wurdest abgemeldet.");
  }


  /* =========================================================
     ROLLE ÄNDERN
  ========================================================= */

  async function changeRole(member, newRole) {
    if (!isHead) {
      flash("Nur ein Head Admin darf Rollen verwalten.");
      return;
    }

    if (!member?.id) return;

    if (member.id === me.id && newRole !== "head_admin") {
      flash("Du kannst deinen eigenen Head-Admin-Status nicht entfernen.");
      return;
    }

    const {
      error
    } = await supabase
      .from("profiles")
      .update({
        role: newRole
      })
      .eq("id", member.id);

    if (error) {
      console.error(error);
      flash("Rolle konnte nicht geändert werden.");
      return;
    }

    if (newRole === "admin") {
      await supabase
        .from("admin_permissions")
        .upsert(
          {
            user_id: member.id,
            ...DEFAULT_PERMISSIONS
          },
          {
            onConflict: "user_id"
          }
        );
    }

    await loadMembers();

    if (member.id === me.id) {
      await loadMyProfile(member.id);
    }

    flash(
      `${displayName(member)} ist jetzt ${ROLE_LABEL[newRole]}.`
    );
  }


  /* =========================================================
     ADMIN-BERECHTIGUNGEN ÄNDERN
  ========================================================= */

  async function togglePermission(member, key, value) {
    if (!isHead) {
      flash("Nur ein Head Admin darf Berechtigungen verwalten.");
      return;
    }

    if (member.role !== "admin") {
      flash("Berechtigungen können nur für Admins vergeben werden.");
      return;
    }

    const {
      data: existing
    } = await supabase
      .from("admin_permissions")
      .select("*")
      .eq("user_id", member.id)
      .maybeSingle();

    const newPermissions = {
      ...DEFAULT_PERMISSIONS,
      ...(existing || {}),
      [key]: value,
      user_id: member.id
    };

    const {
      error
    } = await supabase
      .from("admin_permissions")
      .upsert(newPermissions, {
        onConflict: "user_id"
      });

    if (error) {
      console.error(error);
      flash("Berechtigung konnte nicht gespeichert werden.");
      return;
    }

    flash("Berechtigung gespeichert.");
  }


  /* =========================================================
     FORUM ERSTELLEN
  ========================================================= */

  async function createForumPost(event) {
    event.preventDefault();

    if (!forumTitle.trim() || !forumContent.trim()) {
      flash("Bitte Titel und Inhalt eingeben.");
      return;
    }

    const {
      error
    } = await supabase
      .from("forum_posts")
      .insert({
        user_id: session.user.id,
        title: forumTitle.trim(),
        content: forumContent.trim()
      });

    if (error) {
      console.error(error);
      flash("Forenbeitrag konnte nicht erstellt werden.");
      return;
    }

    setForumTitle("");
    setForumContent("");

    await loadForum();

    flash("Beitrag veröffentlicht.");
  }


  /* =========================================================
     FORUM LÖSCHEN
     Head Admin darf ALLE löschen.
     Andere nur eigene bzw. mit Berechtigung.
  ========================================================= */

  async function deleteForumPost(post) {
    const isOwner = post.user_id === session.user.id;

    if (!isOwner && !canManageForum) {
      flash("Du darfst diesen Beitrag nicht löschen.");
      return;
    }

    const {
      error
    } = await supabase
      .from("forum_posts")
      .delete()
      .eq("id", post.id);

    if (error) {
      console.error(error);
      flash("Beitrag konnte nicht gelöscht werden.");
      return;
    }

    await loadForum();

    flash("Beitrag gelöscht.");
  }


  /* =========================================================
     FORUM BEARBEITEN
  ========================================================= */

  async function saveForumEdit(post) {
    const isOwner = post.user_id === session.user.id;

    if (!isOwner && !canManageForum) {
      flash("Du darfst diesen Beitrag nicht bearbeiten.");
      return;
    }

    const {
      error
    } = await supabase
      .from("forum_posts")
      .update({
        title: editingForum.title,
        content: editingForum.content
      })
      .eq("id", post.id);

    if (error) {
      console.error(error);
      flash("Beitrag konnte nicht gespeichert werden.");
      return;
    }

    setEditingForum(null);

    await loadForum();

    flash("Beitrag gespeichert.");
  }


  /* =========================================================
     NEWS ERSTELLEN
  ========================================================= */

  async function createNews(event) {
    event.preventDefault();

    if (!canManageNews) {
      flash("Du hast keine Berechtigung, News zu veröffentlichen.");
      return;
    }

    if (!newsTitle.trim() || !newsContent.trim()) {
      flash("Bitte Titel und Inhalt eingeben.");
      return;
    }

    const {
      error
    } = await supabase
      .from("news")
      .insert({
        user_id: session.user.id,
        title: newsTitle.trim(),
        content: newsContent.trim()
      });

    if (error) {
      console.error(error);
      flash("News konnte nicht veröffentlicht werden.");
      return;
    }

    setNewsTitle("");
    setNewsContent("");

    await loadNews();

    flash("News veröffentlicht.");
  }


  /* =========================================================
     NEWS LÖSCHEN
  ========================================================= */

  async function deleteNews(post) {
    if (!canManageNews) {
      flash("Du darfst keine News löschen.");
      return;
    }

    const {
      error
    } = await supabase
      .from("news")
      .delete()
      .eq("id", post.id);

    if (error) {
      console.error(error);
      flash("News konnte nicht gelöscht werden.");
      return;
    }

    await loadNews();

    flash("News gelöscht.");
  }


  /* =========================================================
     PROFIL SPEICHERN
  ========================================================= */

  async function saveProfile() {
    const {
      error
    } = await supabase
      .from("profiles")
      .update({
        nickname: profileNickname.trim(),
        first_name: profileFirstName.trim(),
        last_name: profileLastName.trim()
      })
      .eq("id", me.id);

    if (error) {
      console.error(error);
      flash("Profil konnte nicht gespeichert werden.");
      return;
    }

    await loadMyProfile(me.id);
    await loadMembers();

    flash("Profil gespeichert.");
  }


  /* =========================================================
     LOGIN SCREEN
  ========================================================= */

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">

          <div className="brand auth-brand">
            <div className="brand-mark">
              <Star fill="currentColor" />
            </div>

            <div className="brand-text">
              <b>ennstal</b>
              <span>connect</span>
            </div>
          </div>

          <h1>
            {authMode === "login"
              ? "Willkommen zurück"
              : "Community beitreten"}
          </h1>

          <p>
            Die regionale Community für Ennstal
            und Obersteiermark.
          </p>

          <form onSubmit={handleAuth}>

            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={authEmail}
              onChange={(event) =>
                setAuthEmail(event.target.value)
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              value={authPassword}
              onChange={(event) =>
                setAuthPassword(event.target.value)
              }
            />

            <button
              type="submit"
              className="primary-button"
            >
              {authMode === "login"
                ? "Anmelden"
                : "Registrieren"}
            </button>

          </form>

          <button
            className="text-button"
            onClick={() =>
              setAuthMode(
                authMode === "login"
                  ? "register"
                  : "login"
              )
            }
          >
            {authMode === "login"
              ? "Noch kein Konto? Registrieren"
              : "Bereits registriert? Anmelden"}
          </button>

        </div>
      </div>
    );
  }


  /* =========================================================
     LADEN
  ========================================================= */

  if (loading) {
    return (
      <div className="loading-screen">
        Community wird geladen ...
      </div>
    );
  }


  /* =========================================================
     HAUPT-APP
  ========================================================= */

  return (
    <div className="app-shell">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="brand">

          <div className="brand-mark">
            <Star fill="currentColor" />
          </div>

          <div className="brand-text">
            <b>ennstal</b>
            <span>connect</span>
          </div>

        </div>


        {/* PROFIL IN SIDEBAR */}

        <button
          className="sidebar-profile"
          onClick={() => setPage("profile")}
        >

          <div className="avatar">
            {displayName(me).charAt(0).toUpperCase()}
          </div>

          <div className="sidebar-profile-info">

            <strong>
              {displayName(me)}
            </strong>

            <span
              className={`role-badge ${roleClass(myRole)}`}
            >
              {roleIcon(myRole, 13)}
              {ROLE_LABEL[myRole]}
            </span>

          </div>

        </button>


        {/* NAVIGATION */}

        <nav className="nav">

          {nav.map(([key, Icon, label]) => (
            <button
              key={key}
              className={
                page === key
                  ? "nav-item active"
                  : "nav-item"
              }
              onClick={() => setPage(key)}
            >
              <Icon size={19} />

              <span>
                {label}
              </span>
            </button>
          ))}

        </nav>


        <button
          className="logout-button"
          onClick={logout}
        >
          <LogOut size={18} />

          <span>
            Abmelden
          </span>
        </button>

      </aside>


      {/* HAUPTBEREICH */}

      <main className="main-content">

        {message && (
          <div className="flash-message">
            <Check size={18} />
            {message}
          </div>
        )}


        {/* =====================================================
            STARTSEITE
        ===================================================== */}

        {page === "home" && (
          <section className="page">

            <div className="hero-card">

              <div>
                <p className="eyebrow">
                  DEINE COMMUNITY
                </p>

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

              <div className="hero-icon">
                👋
              </div>

            </div>


            <div className="dashboard-grid">

              <button
                className="dashboard-card"
                onClick={() => setPage("members")}
              >
                <Users size={28} />

                <strong>
                  {members.length}
                </strong>

                <span>
                  Mitglieder
                </span>
              </button>


              <button
                className="dashboard-card"
                onClick={() => setPage("forum")}
              >
                <MessageCircle size={28} />

                <strong>
                  {forumPosts.length}
                </strong>

                <span>
                  Diskussionen
                </span>
              </button>


              <button
                className="dashboard-card"
                onClick={() => setPage("news")}
              >
                <Newspaper size={28} />

                <strong>
                  {newsPosts.length}
                </strong>

                <span>
                  News & Beiträge
                </span>
              </button>

            </div>


            <div className="section-card">

              <h2>
                Neu in der Community
              </h2>

              {newsPosts.length === 0 ? (
                <p className="empty-text">
                  Noch keine News vorhanden.
                </p>
              ) : (
                newsPosts.slice(0, 3).map((post) => (
                  <div
                    className="mini-post"
                    key={post.id}
                  >
                    <strong>
                      {post.title}
                    </strong>

                    <p>
                      {post.content}
                    </p>
                  </div>
                ))
              )}

            </div>

          </section>
        )}


        {/* =====================================================
            MITGLIEDER
        ===================================================== */}

        {page === "members" && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  ENNSTAL CONNECT
                </p>

                <h1>
                  Mitglieder
                </h1>

                <p>
                  Entdecke die Community.
                </p>
              </div>

            </div>


            <input
              className="search-input"
              placeholder="Mitglieder suchen..."
              value={memberSearch}
              onChange={(event) =>
                setMemberSearch(event.target.value)
              }
            />


            <div className="member-grid">

              {filteredMembers.map((member) => (
                <article
                  className={`member-card ${roleClass(member.role)}`}
                  key={member.id}
                >

                  <div className="member-avatar">
                    {displayName(member)
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <span
                    className={`role-badge ${roleClass(member.role)}`}
                  >
                    {roleIcon(member.role)}
                    {ROLE_LABEL[member.role || "member"]}
                  </span>

                  <h3>
                    {displayName(member)}
                  </h3>

                  {(member.first_name || member.last_name) && (
                    <p>
                      {[member.first_name, member.last_name]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}

                  {isHead && (
                    <button
                      className="small-button"
                      onClick={() =>
                        setSelectedMember(member)
                      }
                    >
                      <Settings size={15} />
                      Verwalten
                    </button>
                  )}

                </article>
              ))}

            </div>

          </section>
        )}


        {/* =====================================================
            FORUM
        ===================================================== */}

        {page === "forum" && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  COMMUNITY
                </p>

                <h1>
                  Forum
                </h1>

                <p>
                  Diskutiere mit der Community.
                </p>
              </div>

            </div>


            <form
              className="create-card"
              onSubmit={createForumPost}
            >

              <input
                placeholder="Titel deiner Diskussion"
                value={forumTitle}
                onChange={(event) =>
                  setForumTitle(event.target.value)
                }
              />

              <textarea
                placeholder="Was möchtest du besprechen?"
                value={forumContent}
                onChange={(event) =>
                  setForumContent(event.target.value)
                }
              />

              <button
                className="primary-button"
                type="submit"
              >
                <Plus size={18} />
                Beitrag veröffentlichen
              </button>

            </form>


            <div className="post-list">

              {forumPosts.length === 0 && (
                <div className="empty-card">
                  Noch keine Diskussionen vorhanden.
                </div>
              )}


              {forumPosts.map((post) => {
                const author = members.find(
                  (member) =>
                    member.id === post.user_id
                );

                const canEdit =
                  post.user_id === session.user.id ||
                  canManageForum;

                return (
                  <article
                    className="post-card"
                    key={post.id}
                  >

                    {editingForum?.id === post.id ? (
                      <>

                        <input
                          value={editingForum.title}
                          onChange={(event) =>
                            setEditingForum({
                              ...editingForum,
                              title: event.target.value
                            })
                          }
                        />

                        <textarea
                          value={editingForum.content}
                          onChange={(event) =>
                            setEditingForum({
                              ...editingForum,
                              content: event.target.value
                            })
                          }
                        />

                        <div className="post-actions">

                          <button
                            className="small-button"
                            onClick={() =>
                              saveForumEdit(post)
                            }
                          >
                            <Save size={15} />
                            Speichern
                          </button>

                          <button
                            className="small-button"
                            onClick={() =>
                              setEditingForum(null)
                            }
                          >
                            <X size={15} />
                            Abbrechen
                          </button>

                        </div>

                      </>
                    ) : (
                      <>

                        <div className="post-author">

                          <div className="avatar small">
                            {displayName(author)
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>

                            <strong>
                              {displayName(author)}
                            </strong>

                            {author && (
                              <span
                                className={`role-badge ${roleClass(author.role)}`}
                              >
                                {roleIcon(author.role, 12)}
                                {ROLE_LABEL[author.role]}
                              </span>
                            )}

                          </div>

                        </div>


                        <h2>
                          {post.title}
                        </h2>

                        <p>
                          {post.content}
                        </p>


                        {canEdit && (
                          <div className="post-actions">

                            <button
                              className="icon-button"
                              onClick={() =>
                                setEditingForum({
                                  ...post
                                })
                              }
                            >
                              <Edit3 size={17} />
                            </button>

                            <button
                              className="icon-button danger"
                              onClick={() =>
                                deleteForumPost(post)
                              }
                            >
                              <Trash2 size={17} />
                            </button>

                          </div>
                        )}

                      </>
                    )}

                  </article>
                );
              })}

            </div>

          </section>
        )}


        {/* =====================================================
            NEWS
        ===================================================== */}

        {page === "news" && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  COMMUNITY NEWS
                </p>

                <h1>
                  News & Beiträge
                </h1>

                <p>
                  Neuigkeiten aus Ennstal Connect.
                </p>
              </div>

            </div>


            {canManageNews && (
              <form
                className="create-card"
                onSubmit={createNews}
              >

                <input
                  placeholder="Titel der News"
                  value={newsTitle}
                  onChange={(event) =>
                    setNewsTitle(event.target.value)
                  }
                />

                <textarea
                  placeholder="Was gibt es Neues?"
                  value={newsContent}
                  onChange={(event) =>
                    setNewsContent(event.target.value)
                  }
                />

                <button
                  type="submit"
                  className="primary-button"
                >
                  <Plus size={18} />
                  News veröffentlichen
                </button>

              </form>
            )}


            <div className="post-list">

              {newsPosts.length === 0 && (
                <div className="empty-card">
                  Noch keine News vorhanden.
                </div>
              )}


              {newsPosts.map((post) => {
                const author = members.find(
                  (member) =>
                    member.id === post.user_id
                );

                return (
                  <article
                    className="post-card news-card"
                    key={post.id}
                  >

                    <div className="post-author">

                      <div className="avatar small">
                        {displayName(author)
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>

                        <strong>
                          {displayName(author)}
                        </strong>

                        {author && (
                          <span
                            className={`role-badge ${roleClass(author.role)}`}
                          >
                            {roleIcon(author.role, 12)}
                            {ROLE_LABEL[author.role]}
                          </span>
                        )}

                      </div>

                    </div>


                    <h2>
                      {post.title}
                    </h2>

                    <p>
                      {post.content}
                    </p>


                    {canManageNews && (
                      <div className="post-actions">

                        <button
                          className="icon-button danger"
                          onClick={() =>
                            deleteNews(post)
                          }
                        >
                          <Trash2 size={17} />
                        </button>

                      </div>
                    )}

                  </article>
                );
              })}

            </div>

          </section>
        )}


        {/* =====================================================
            BELOHNUNGEN
        ===================================================== */}

        {page === "rewards" && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  COMMUNITY
                </p>

                <h1>
                  Belohnungen
                </h1>

                <p>
                  Entdecke deine verfügbaren Belohnungen.
                </p>
              </div>

            </div>


            <div className="reward-grid">

              <div className="reward-card">
                <Gift size={32} />
                <h3>
                  Community Badge
                </h3>
                <p>
                  Deine erste Belohnung.
                </p>
              </div>

              <div className="reward-card">
                <Star size={32} />
                <h3>
                  Supporter Bonus
                </h3>
                <p>
                  Exklusive Vorteile für aktive Mitglieder.
                </p>
              </div>

              <div className="reward-card">
                <Crown size={32} />
                <h3>
                  Community Status
                </h3>
                <p>
                  Verdiene dir besondere Community-Status.
                </p>
              </div>

            </div>

          </section>
        )}


        {/* =====================================================
            PROFIL
        ===================================================== */}

        {page === "profile" && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  DEIN ACCOUNT
                </p>

                <h1>
                  Mein Profil
                </h1>
              </div>

            </div>


            <div className="profile-card">

              <div className="profile-avatar-large">
                {displayName(me)
                  .charAt(0)
                  .toUpperCase()}
              </div>


              <div className="profile-role">

                <span
                  className={`role-badge ${roleClass(myRole)}`}
                >
                  {roleIcon(myRole)}
                  {ROLE_LABEL[myRole]}
                </span>

              </div>


              <input
                placeholder="Nickname"
                value={profileNickname}
                onChange={(event) =>
                  setProfileNickname(event.target.value)
                }
              />

              <input
                placeholder="Vorname"
                value={profileFirstName}
                onChange={(event) =>
                  setProfileFirstName(event.target.value)
                }
              />

              <input
                placeholder="Nachname"
                value={profileLastName}
                onChange={(event) =>
                  setProfileLastName(event.target.value)
                }
              />


              <button
                className="primary-button"
                onClick={saveProfile}
              >
                <Save size={18} />
                Profil speichern
              </button>

            </div>

          </section>
        )}


        {/* =====================================================
            ADMIN
        ===================================================== */}

        {page === "admin" && isAdmin && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  VERWALTUNG
                </p>

                <h1>
                  Admin-Bereich
                </h1>

                <p>
                  Verwalte deine Community.
                </p>
              </div>

            </div>


            {!isHead && (
              <div className="info-card">

                <Shield size={22} />

                <div>
                  <strong>
                    Deine Berechtigungen
                  </strong>

                  <p>
                    Nicht alle Verwaltungsfunktionen
                    müssen für dich freigeschaltet sein.
                  </p>
                </div>

              </div>
            )}


            <div className="admin-grid">

              <div className="admin-card">

                <Users size={25} />

                <h3>
                  Mitglieder
                </h3>

                <p>
                  {members.length} registrierte Mitglieder
                </p>

                {canManageMembers ? (
                  <Unlock size={18} />
                ) : (
                  <Lock size={18} />
                )}

              </div>


              <div className="admin-card">

                <MessageCircle size={25} />

                <h3>
                  Forum
                </h3>

                <p>
                  {forumPosts.length} Beiträge
                </p>

                {canManageForum ? (
                  <Unlock size={18} />
                ) : (
                  <Lock size={18} />
                )}

              </div>


              <div className="admin-card">

                <Newspaper size={25} />

                <h3>
                  News
                </h3>

                <p>
                  {newsPosts.length} News
                </p>

                {canManageNews ? (
                  <Unlock size={18} />
                ) : (
                  <Lock size={18} />
                )}

              </div>

            </div>


            {isHead && (
              <div className="section-card">

                <h2>
                  Rollen und Berechtigungen
                </h2>

                <p>
                  Als Head Admin kannst du Admins,
                  Supporter und Mitglieder verwalten.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    setPage("members")
                  }
                >
                  <Users size={18} />
                  Mitglieder verwalten
                </button>

              </div>
            )}

          </section>
        )}


        {/* =====================================================
            ADMIN LOGBUCH
        ===================================================== */}

        {page === "logs" && isHead && (
          <section className="page">

            <div className="page-header">

              <div>
                <p className="eyebrow">
                  HEAD ADMIN
                </p>

                <h1>
                  Admin-Logbuch
                </h1>

                <p>
                  Übersicht über die Community-Verwaltung.
                </p>
              </div>

            </div>


            <div className="section-card">

              <div className="log-item">
                <strong>
                  Community-System aktiv
                </strong>

                <span>
                  Mitglieder: {members.length}
                </span>
              </div>

              <div className="log-item">
                <strong>
                  Forum
                </strong>

                <span>
                  Beiträge: {forumPosts.length}
                </span>
              </div>

              <div className="log-item">
                <strong>
                  News
                </strong>

                <span>
                  Beiträge: {newsPosts.length}
                </span>
              </div>

            </div>

          </section>
        )}

      </main>


      {/* =====================================================
          HEAD ADMIN MEMBER MODAL
      ===================================================== */}

      {selectedMember && isHead && (
        <div className="modal-backdrop">

          <div className="modal">

            <button
              className="modal-close"
              onClick={() =>
                setSelectedMember(null)
              }
            >
              <X size={20} />
            </button>


            <h2>
              {displayName(selectedMember)}
            </h2>


            <div
              className={`role-badge ${roleClass(selectedMember.role)}`}
            >
              {roleIcon(selectedMember.role)}
              {ROLE_LABEL[selectedMember.role]}
            </div>


            <h3>
              Rolle ändern
            </h3>


            <div className="role-buttons">

              {Object.keys(ROLE_LABEL).map((role) => (
                <button
                  key={role}
                  className={
                    selectedMember.role === role
                      ? "role-select active"
                      : "role-select"
                  }
                  onClick={() =>
                    changeRole(
                      selectedMember,
                      role
                    )
                  }
                >
                  {roleIcon(role)}
                  {ROLE_LABEL[role]}
                </button>
              ))}

            </div>


            {selectedMember.role === "admin" && (
              <AdminPermissionPanel
                member={selectedMember}
                onToggle={togglePermission}
              />
            )}

          </div>

        </div>
      )}

    </div>
  );
}


/* =========================================================
   ADMIN BERECHTIGUNGS-PANEL
========================================================= */

function AdminPermissionPanel({
  member,
  onToggle
}) {
  const [current, setCurrent] = useState(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    let mounted = true;

    async function load() {
      const {
        data
      } = await supabase
        .from("admin_permissions")
        .select("*")
        .eq("user_id", member.id)
        .maybeSingle();

      if (!mounted) return;

      setCurrent({
        ...DEFAULT_PERMISSIONS,
        ...(data || {})
      });

      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [member.id]);


  const labels = {
    manage_members: "Mitglieder verwalten",
    manage_warnings: "Verwarnungen verwalten",
    manage_restrictions: "Funktionen sperren",
    manage_roles: "Rollen verwalten",
    manage_forum: "Forum verwalten",
    manage_news: "News verwalten"
  };


  if (loading) {
    return (
      <p>
        Berechtigungen werden geladen ...
      </p>
    );
  }


  return (
    <div className="permission-panel">

      <h3>
        Admin-Berechtigungen
      </h3>


      {Object.entries(labels).map(([key, label]) => (
        <label
          className="permission-row"
          key={key}
        >

          <span>
            {label}
          </span>

          <input
            type="checkbox"
            checked={Boolean(current[key])}
            onChange={async (event) => {
              const value = event.target.checked;

              setCurrent({
                ...current,
                [key]: value
              });

              await onToggle(
                member,
                key,
                value
              );
            }}
          />

        </label>
      ))}

    </div>
  );
}
