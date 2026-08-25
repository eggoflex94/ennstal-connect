import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const ROLE_LABELS = {
  head_admin: "👑 Head Admin",
  admin: "★ Admin",
  supporter: "✦ Supporter",
  member: "Mitglied",
};

const DEFAULT_PERMISSIONS = {
  manage_members: false,
  manage_roles: false,
  manage_permissions: false,
  manage_forum: false,
  manage_news: false,
  manage_warnings: false,
  manage_restrictions: false,
  view_admin_logs: false,
};

function displayName(profile) {
  if (!profile) return "Mitglied";

  if (profile.nickname?.trim()) {
    return profile.nickname;
  }

  const fullName = [
    profile.first_name,
    profile.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  return fullName || "Mitglied";
}

function getInitials(profile) {
  const name = displayName(profile);

  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ profile, size = "normal" }) {
  return (
    <div className={`avatar avatar-${size}`}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={displayName(profile)}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span>{getInitials(profile)}</span>
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  return (
    <span className={`role-badge role-${role || "member"}`}>
      {ROLE_LABELS[role] || "Mitglied"}
    </span>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  const [members, setMembers] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [newsPosts, setNewsPosts] = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);

  const [permissions, setPermissions] =
    useState(DEFAULT_PERMISSIONS);

  const [restrictions, setRestrictions] = useState([]);

  const [activePage, setActivePage] = useState("home");
  const [loading, setLoading] = useState(true);

  const [forumTitle, setForumTitle] = useState("");
  const [forumContent, setForumContent] = useState("");

  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");

  const [memberSearch, setMemberSearch] = useState("");

  const isHeadAdmin = profile?.role === "head_admin";
  const isAdmin = profile?.role === "admin";
  const isSupporter = profile?.role === "supporter";

  const canModerate =
    isHeadAdmin ||
    permissions.manage_members ||
    permissions.manage_forum ||
    permissions.manage_warnings ||
    permissions.manage_restrictions;

  const canManageRoles =
    isHeadAdmin || permissions.manage_roles;

  const canManageNews =
    isHeadAdmin || permissions.manage_news;

  const canViewLogs =
    isHeadAdmin || permissions.view_admin_logs;

  const canUseRewards =
    isHeadAdmin ||
    isAdmin ||
    isSupporter ||
    profile?.rewards_enabled === true;

  function hasRestriction(feature) {
    return restrictions.some(
      (restriction) =>
        restriction.feature === feature &&
        restriction.is_active !== false
    );
  }

  async function loadAll(currentUser) {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [
      profileResult,
      membersResult,
      permissionsResult,
      restrictionsResult,
      forumResult,
      newsResult,
      logsResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("admin_permissions")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle(),

      supabase
        .from("user_restrictions")
        .select("*")
        .eq("user_id", currentUser.id),

      supabase
        .from("forum_posts")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("news")
        .select("*")
        .order("created_at", {
          ascending: false,
        }),

      supabase
        .from("admin_logs")
        .select("*")
        .order("created_at", {
          ascending: false,
        })
        .limit(100),
    ]);

    if (profileResult.data) {
      setProfile(profileResult.data);
    }

    setMembers(membersResult.data || []);

    setPermissions({
      ...DEFAULT_PERMISSIONS,
      ...(permissionsResult.data || {}),
    });

    setRestrictions(
      (restrictionsResult.data || []).filter(
        (item) => item.is_active !== false
      )
    );

    setForumPosts(forumResult.data || []);
    setNewsPosts(newsResult.data || []);

    if (isHeadAdmin || canViewLogs) {
      setAdminLogs(logsResult.data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);

      if (session?.user) {
        await loadAll(session.user);
      } else {
        setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user) {
          await loadAll(newSession.user);
        } else {
          setProfile(null);
          setMembers([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function refresh() {
    if (session?.user) {
      await loadAll(session.user);
    }
  }

  async function writeAdminLog(
    action,
    targetUserId = null,
    details = null
  ) {
    if (!session?.user) return;

    await supabase.from("admin_logs").insert({
      admin_id: session.user.id,
      target_user_id: targetUserId,
      action,
      details,
    });
  }

  async function createForumPost(event) {
    event.preventDefault();

    if (!session?.user) return;

    if (hasRestriction("forum")) {
      alert("Deine Forum-Funktion wurde gesperrt.");
      return;
    }

    if (!forumTitle.trim() || !forumContent.trim()) {
      alert("Bitte Titel und Inhalt eingeben.");
      return;
    }

    const { error } = await supabase
      .from("forum_posts")
      .insert({
        user_id: session.user.id,
        title: forumTitle.trim(),
        content: forumContent.trim(),
      });

    if (error) {
      alert(error.message);
      return;
    }

    setForumTitle("");
    setForumContent("");

    await refresh();
  }

  async function deleteForumPost(post) {
    const allowed =
      isHeadAdmin ||
      post.user_id === session?.user?.id ||
      permissions.manage_forum;

    if (!allowed) {
      alert("Du hast keine Berechtigung.");
      return;
    }

    if (!window.confirm("Beitrag wirklich löschen?")) {
      return;
    }

    const { error } = await supabase
      .from("forum_posts")
      .delete()
      .eq("id", post.id);

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "forum_post_deleted",
      post.user_id,
      {
        post_id: post.id,
        title: post.title,
      }
    );

    await refresh();
  }

  async function editForumPost(post) {
    const allowed =
      isHeadAdmin ||
      post.user_id === session?.user?.id ||
      permissions.manage_forum;

    if (!allowed) {
      alert("Du hast keine Berechtigung.");
      return;
    }

    const title = window.prompt(
      "Titel bearbeiten:",
      post.title
    );

    if (title === null) return;

    const content = window.prompt(
      "Beitrag bearbeiten:",
      post.content
    );

    if (content === null) return;

    const { error } = await supabase
      .from("forum_posts")
      .update({
        title,
        content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "forum_post_edited",
      post.user_id,
      {
        post_id: post.id,
      }
    );

    await refresh();
  }

  async function createNews(event) {
    event.preventDefault();

    if (!canManageNews) {
      alert("Keine Berechtigung für News.");
      return;
    }

    if (!newsTitle.trim() || !newsContent.trim()) {
      alert("Bitte Titel und Inhalt eingeben.");
      return;
    }

    const { error } = await supabase
      .from("news")
      .insert({
        author_id: session.user.id,
        title: newsTitle.trim(),
        content: newsContent.trim(),
      });

    if (error) {
      alert(error.message);
      return;
    }

    setNewsTitle("");
    setNewsContent("");

    await writeAdminLog(
      "news_created",
      null,
      {
        title: newsTitle,
      }
    );

    await refresh();
  }

  async function deleteNews(post) {
    if (!canManageNews) {
      alert("Keine Berechtigung.");
      return;
    }

    if (!window.confirm("News-Beitrag löschen?")) {
      return;
    }

    const { error } = await supabase
      .from("news")
      .delete()
      .eq("id", post.id);

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "news_deleted",
      post.author_id,
      {
        news_id: post.id,
      }
    );

    await refresh();
  }

  async function changeRole(member, role) {
    if (!canManageRoles) {
      alert("Keine Berechtigung.");
      return;
    }

    if (
      member.role === "head_admin" &&
      !isHeadAdmin
    ) {
      alert("Head Admin kann nur vom Head Admin geändert werden.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        role,
      })
      .eq("id", member.id);

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "role_changed",
      member.id,
      {
        old_role: member.role,
        new_role: role,
      }
    );

    await refresh();
  }

  async function toggleRestriction(member, feature) {
    if (
      !isHeadAdmin &&
      !permissions.manage_restrictions
    ) {
      alert("Keine Berechtigung.");
      return;
    }

    const { data: existing } = await supabase
      .from("user_restrictions")
      .select("*")
      .eq("user_id", member.id)
      .eq("feature", feature)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_restrictions")
        .update({
          is_active: !existing.is_active,
        })
        .eq("id", existing.id);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("user_restrictions")
        .insert({
          user_id: member.id,
          feature,
          is_active: true,
        });

      if (error) {
        alert(error.message);
        return;
      }
    }

    await writeAdminLog(
      "restriction_changed",
      member.id,
      {
        feature,
      }
    );

    await refresh();
  }

  async function updatePermission(
    member,
    permission,
    value
  ) {
    if (!isHeadAdmin) {
      alert(
        "Nur der Head Admin darf Admin-Berechtigungen ändern."
      );
      return;
    }

    const { data: existing } = await supabase
      .from("admin_permissions")
      .select("*")
      .eq("user_id", member.id)
      .maybeSingle();

    const data = {
      ...DEFAULT_PERMISSIONS,
      ...(existing || {}),
      user_id: member.id,
      [permission]: value,
    };

    const { error } = await supabase
      .from("admin_permissions")
      .upsert(data, {
        onConflict: "user_id",
      });

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "permission_changed",
      member.id,
      {
        permission,
        value,
      }
    );

    await refresh();
  }

  async function toggleMemberRewards(member) {
    if (!isHeadAdmin) {
      alert(
        "Nur der Head Admin kann Belohnungen freischalten."
      );
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        rewards_enabled: !member.rewards_enabled,
      })
      .eq("id", member.id);

    if (error) {
      alert(error.message);
      return;
    }

    await writeAdminLog(
      "rewards_changed",
      member.id,
      {
        enabled: !member.rewards_enabled,
      }
    );

    await refresh();
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  const filteredMembers = useMemo(() => {
    const search = memberSearch.toLowerCase();

    return members.filter((member) => {
      return [
        member.first_name,
        member.last_name,
        member.nickname,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [members, memberSearch]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          ENNSTAL <span>CONNECT</span>
        </div>

        <p>Community wird geladen ...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>
            ENNSTAL <span>CONNECT</span>
          </h1>

          <p>
            Bitte melde dich an, um die Community zu nutzen.
          </p>

          <button
            className="primary"
            onClick={() =>
              supabase.auth.signInWithOAuth({
                provider: "google",
              })
            }
          >
            Anmelden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">★</div>

          <div>
            <strong>
              ENNSTAL <span>CONNECT</span>
            </strong>

            <small>DEINE COMMUNITY</small>
          </div>
        </div>

        <button
          className="profile-summary"
          onClick={() =>
            setActivePage("profile")
          }
        >
          <Avatar profile={profile} size="small" />

          <div className="profile-summary-text">
            <strong>{displayName(profile)}</strong>

            <RoleBadge role={profile?.role} />
          </div>
        </button>

        <nav className="navigation">
          <button
            className={
              activePage === "home" ? "active" : ""
            }
            onClick={() =>
              setActivePage("home")
            }
          >
            ⌂ Startseite
          </button>

          <button
            className={
              activePage === "members" ? "active" : ""
            }
            onClick={() =>
              setActivePage("members")
            }
          >
            ♙ Mitglieder
          </button>

          <button
            className={
              activePage === "forum" ? "active" : ""
            }
            disabled={hasRestriction("forum")}
            onClick={() =>
              setActivePage("forum")
            }
          >
            ☏ Forum
          </button>

          <button
            className={
              activePage === "news" ? "active" : ""
            }
            disabled={hasRestriction("news")}
            onClick={() =>
              setActivePage("news")
            }
          >
            ▣ News & Beiträge
          </button>

          <button
            className={
              activePage === "rewards" ? "active" : ""
            }
            disabled={!canUseRewards}
            onClick={() =>
              setActivePage("rewards")
            }
          >
            🎁 Belohnungen
          </button>

          <button
            className={
              activePage === "profile" ? "active" : ""
            }
            disabled={hasRestriction("profile")}
            onClick={() =>
              setActivePage("profile")
            }
          >
            ⚙ Mein Profil
          </button>

          {canModerate && (
            <button
              className={
                activePage === "admin"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setActivePage("admin")
              }
            >
              ★ Admin-Bereich
            </button>
          )}

          {canViewLogs && (
            <button
              className={
                activePage === "logs"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setActivePage("logs")
              }
            >
              👑 Admin-Logbuch
            </button>
          )}
        </nav>

        <button
          className="logout-button"
          onClick={logout}
        >
          Abmelden
        </button>
      </aside>

      <main className="main-content">
        {activePage === "home" && (
          <HomePage
            profile={profile}
            forumPosts={forumPosts}
            newsPosts={newsPosts}
            onNavigate={setActivePage}
          />
        )}

        {activePage === "members" && (
          <section className="page">
            <div className="page-header">
              <div>
                <span className="eyebrow">
                  COMMUNITY
                </span>

                <h1>Mitglieder</h1>

                <p>
                  Entdecke die Menschen hinter
                  Ennstal Connect.
                </p>
              </div>
            </div>

            <input
              className="search-input"
              placeholder="Mitglieder suchen ..."
              value={memberSearch}
              onChange={(event) =>
                setMemberSearch(event.target.value)
              }
            />

            <div className="member-grid">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onOpenAdmin={() => {
                    setActivePage("admin");
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {activePage === "forum" && (
          <ForumPage
            profile={profile}
            forumPosts={forumPosts}
            title={forumTitle}
            content={forumContent}
            setTitle={setForumTitle}
            setContent={setForumContent}
            onCreate={createForumPost}
            onDelete={deleteForumPost}
            onEdit={editForumPost}
            isHeadAdmin={isHeadAdmin}
            canManageForum={
              permissions.manage_forum
            }
          />
        )}

        {activePage === "news" && (
          <NewsPage
            profile={profile}
            newsPosts={newsPosts}
            title={newsTitle}
            content={newsContent}
            setTitle={setNewsTitle}
            setContent={setNewsContent}
            onCreate={createNews}
            onDelete={deleteNews}
            canManageNews={canManageNews}
          />
        )}

        {activePage === "rewards" && (
          <RewardsPage
            canUseRewards={canUseRewards}
          />
        )}

        {activePage === "profile" && (
          <ProfilePage
            profile={profile}
            isHeadAdmin={isHeadAdmin}
            onRefresh={refresh}
          />
        )}

        {activePage === "admin" && (
          <AdminPage
            members={members}
            isHeadAdmin={isHeadAdmin}
            permissions={permissions}
            onChangeRole={changeRole}
            onToggleRestriction={
              toggleRestriction
            }
            onUpdatePermission={
              updatePermission
            }
            onToggleRewards={
              toggleMemberRewards
            }
          />
        )}

        {activePage === "logs" && (
          <AdminLogsPage
            logs={adminLogs}
            members={members}
          />
        )}
      </main>
    </div>
  );
}

function HomePage({
  profile,
  forumPosts,
  newsPosts,
  onNavigate,
}) {
  return (
    <section className="page">
      <div className="hero">
        <div className="hero-content">
          <span className="eyebrow">
            ENNSTAL CONNECT
          </span>

          <h1>
            Willkommen zurück,
            <br />
            {displayName(profile)}
          </h1>

          <p>
            Deine regionale Community für
            Ennstal und Obersteiermark.
          </p>

          <div className="hero-actions">
            <button
              className="primary"
              onClick={() =>
                onNavigate("forum")
              }
            >
              Zum Forum
            </button>

            <button
              className="secondary"
              onClick={() =>
                onNavigate("members")
              }
            >
              Mitglieder entdecken
            </button>
          </div>
        </div>

        <RoleBadge role={profile?.role} />
      </div>

      <div className="dashboard-grid">
        <button
          className="dashboard-card"
          onClick={() =>
            onNavigate("members")
          }
        >
          <span className="dashboard-icon">
            👥
          </span>

          <strong>Community</strong>

          <p>
            Mitglieder entdecken und verbinden.
          </p>
        </button>

        <button
          className="dashboard-card"
          onClick={() =>
            onNavigate("forum")
          }
        >
          <span className="dashboard-icon">
            💬
          </span>

          <strong>Forum</strong>

          <p>
            {forumPosts.length} Diskussionen
            in der Community.
          </p>
        </button>

        <button
          className="dashboard-card"
          onClick={() =>
            onNavigate("news")
          }
        >
          <span className="dashboard-icon">
            📰
          </span>

          <strong>News</strong>

          <p>
            {newsPosts.length} aktuelle
            Beiträge.
          </p>
        </button>

        <button
          className="dashboard-card"
          onClick={() =>
            onNavigate("rewards")
          }
        >
          <span className="dashboard-icon">
            🎁
          </span>

          <strong>Belohnungen</strong>

          <p>
            Entdecke deine verfügbaren Extras.
          </p>
        </button>
      </div>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Aktuelle Diskussionen</h2>

            <button
              className="text-button"
              onClick={() =>
                onNavigate("forum")
              }
            >
              Alle anzeigen →
            </button>
          </div>

          {forumPosts.slice(0, 3).map((post) => (
            <article
              className="mini-post"
              key={post.id}
            >
              <h3>{post.title}</h3>

              <p>{post.content}</p>
            </article>
          ))}

          {!forumPosts.length && (
            <div className="empty-state">
              Noch keine Diskussionen vorhanden.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Neuigkeiten</h2>

            <button
              className="text-button"
              onClick={() =>
                onNavigate("news")
              }
            >
              Alle anzeigen →
            </button>
          </div>

          {newsPosts.slice(0, 3).map((post) => (
            <article
              className="mini-post"
              key={post.id}
            >
              <h3>{post.title}</h3>

              <p>{post.content}</p>
            </article>
          ))}

          {!newsPosts.length && (
            <div className="empty-state">
              Noch keine News vorhanden.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MemberCard({ member }) {
  return (
    <article
      className={`member-card member-role-${member.role}`}
    >
      <Avatar profile={member} />

      <RoleBadge role={member.role} />

      <h2>{displayName(member)}</h2>

      <p className="member-real-name">
        {[member.first_name, member.last_name]
          .filter(Boolean)
          .join(" ") ||
          "Name nicht öffentlich"}
      </p>

      {member.birth_date && (
        <small>
          {calculateAge(member.birth_date)} Jahre
        </small>
      )}
    </article>
  );
}

function ForumPage({
  profile,
  forumPosts,
  title,
  content,
  setTitle,
  setContent,
  onCreate,
  onDelete,
  onEdit,
  isHeadAdmin,
  canManageForum,
}) {
  return (
    <section className="page">
      <span className="eyebrow">
        COMMUNITY
      </span>

      <h1>Forum</h1>

      <p className="page-intro">
        Diskutiere mit der Community.
      </p>

      <form
        className="create-form panel"
        onSubmit={onCreate}
      >
        <input
          placeholder="Titel deiner Diskussion"
          value={title}
          onChange={(event) =>
            setTitle(event.target.value)
          }
        />

        <textarea
          placeholder="Was möchtest du besprechen?"
          value={content}
          onChange={(event) =>
            setContent(event.target.value)
          }
        />

        <button className="primary">
          Beitrag veröffentlichen
        </button>
      </form>

      <div className="post-list">
        {forumPosts.map((post) => {
          const isOwn =
            post.user_id === profile?.id;

          const canEdit =
            isHeadAdmin ||
            canManageForum ||
            isOwn;

          return (
            <article
              className="post-card"
              key={post.id}
            >
              <div className="post-card-header">
                <div>
                  <h2>{post.title}</h2>

                  <small>
                    {formatDate(post.created_at)}
                  </small>
                </div>

                {canEdit && (
                  <div className="post-actions">
                    <button
                      onClick={() =>
                        onEdit(post)
                      }
                    >
                      Bearbeiten
                    </button>

                    <button
                      className="danger-button"
                      onClick={() =>
                        onDelete(post)
                      }
                    >
                      Löschen
                    </button>
                  </div>
                )}
              </div>

              <p>{post.content}</p>
            </article>
          );
        })}

        {!forumPosts.length && (
          <div className="empty-state panel">
            Noch keine Beiträge vorhanden.
          </div>
        )}
      </div>
    </section>
  );
}

function NewsPage({
  newsPosts,
  title,
  content,
  setTitle,
  setContent,
  onCreate,
  onDelete,
  canManageNews,
}) {
  return (
    <section className="page">
      <span className="eyebrow">
        COMMUNITY NEWS
      </span>

      <h1>News & Beiträge</h1>

      {canManageNews && (
        <form
          className="create-form panel"
          onSubmit={onCreate}
        >
          <input
            placeholder="Titel der News"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
          />

          <textarea
            placeholder="Was gibt es Neues?"
            value={content}
            onChange={(event) =>
              setContent(event.target.value)
            }
          />

          <button className="primary">
            News veröffentlichen
          </button>
        </form>
      )}

      <div className="post-list">
        {newsPosts.map((post) => (
          <article
            className="post-card news-card"
            key={post.id}
          >
            <div className="post-card-header">
              <div>
                <span className="eyebrow">
                  NEWS
                </span>

                <h2>{post.title}</h2>

                <small>
                  {formatDate(post.created_at)}
                </small>
              </div>

              {canManageNews && (
                <button
                  className="danger-button"
                  onClick={() =>
                    onDelete(post)
                  }
                >
                  Löschen
                </button>
              )}
            </div>

            <p>{post.content}</p>
          </article>
        ))}

        {!newsPosts.length && (
          <div className="empty-state panel">
            Noch keine News vorhanden.
          </div>
        )}
      </div>
    </section>
  );
}

function RewardsPage({ canUseRewards }) {
  if (!canUseRewards) {
    return (
      <section className="page">
        <h1>Belohnungen</h1>

        <div className="panel empty-state">
          Diese Funktion wurde für dein Konto
          noch nicht freigeschaltet.
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <span className="eyebrow">
        DEINE EXTRAS
      </span>

      <h1>Belohnungen</h1>

      <div className="rewards-grid">
        <article className="reward-card">
          <span>🎨</span>
          <h2>Profilgestaltung</h2>
          <p>
            Gestalte dein Profil individueller.
          </p>
        </article>

        <article className="reward-card">
          <span>🖼</span>
          <h2>Profilbild</h2>
          <p>
            Personalisiere dein Community-Profil.
          </p>
        </article>

        <article className="reward-card">
          <span>⭐</span>
          <h2>Community Extras</h2>
          <p>
            Entdecke zusätzliche Funktionen.
          </p>
        </article>
      </div>
    </section>
  );
}

function ProfilePage({
  profile,
  isHeadAdmin,
  onRefresh,
}) {
  const [draft, setDraft] = useState(profile || {});

  useEffect(() => {
    setDraft(profile || {});
  }, [profile]);

  async function save(event) {
    event.preventDefault();

    const update = {
      nickname: draft.nickname || null,
      bio: draft.bio || null,
      avatar_url: draft.avatar_url || null,
      profile_accent:
        draft.profile_accent || "#ff6a00",
    };

    if (isHeadAdmin) {
      update.first_name = draft.first_name;
      update.last_name = draft.last_name;
      update.birth_date = draft.birth_date;
    }

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", profile.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Profil gespeichert.");

    await onRefresh();
  }

  return (
    <section className="page">
      <h1>Mein Profil</h1>

      <form
        className="profile-form panel"
        onSubmit={save}
      >
        <div className="profile-preview">
          <Avatar profile={draft} size="large" />

          <div>
            <h2>{displayName(draft)}</h2>

            <RoleBadge role={profile?.role} />
          </div>
        </div>

        {isHeadAdmin && (
          <div className="form-grid">
            <label>
              Vorname
              <input
                required
                value={draft.first_name || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    first_name:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Nachname
              <input
                required
                value={draft.last_name || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    last_name:
                      event.target.value,
                  })
                }
              />
            </label>

            <label>
              Geburtsdatum
              <input
                type="date"
                required
                value={draft.birth_date || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    birth_date:
                      event.target.value,
                  })
                }
              />
            </label>
          </div>
        )}

        {!isHeadAdmin && (
          <div className="notice">
            Vorname, Nachname und Geburtsdatum
            können nach der Registrierung nur
            vom Head Admin geändert werden.
          </div>
        )}

        <label>
          Benutzername
          <input
            value={draft.nickname || ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                nickname: event.target.value,
              })
            }
          />
        </label>

        <label>
          Über mich
          <textarea
            value={draft.bio || ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                bio: event.target.value,
              })
            }
          />
        </label>

        <label>
          Profilbild URL
          <input
            value={draft.avatar_url || ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                avatar_url: event.target.value,
              })
            }
          />
        </label>

        <label>
          Akzentfarbe
          <input
            type="color"
            value={
              draft.profile_accent ||
              "#ff6a00"
            }
            onChange={(event) =>
              setDraft({
                ...draft,
                profile_accent:
                  event.target.value,
              })
            }
          />
        </label>

        <button className="primary">
          Profil speichern
        </button>
      </form>
    </section>
  );
}

function AdminPage({
  members,
  isHeadAdmin,
  permissions,
  onChangeRole,
  onToggleRestriction,
  onUpdatePermission,
  onToggleRewards,
}) {
  const [selectedMember, setSelectedMember] =
    useState(null);

  return (
    <section className="page">
      <span className="eyebrow">
        MODERATION
      </span>

      <h1>Admin-Bereich</h1>

      <div className="admin-layout">
        <div className="panel">
          <h2>Mitglieder verwalten</h2>

          <div className="admin-member-list">
            {members.map((member) => (
              <button
                className={`admin-member ${
                  selectedMember?.id === member.id
                    ? "selected"
                    : ""
                }`}
                key={member.id}
                onClick={() =>
                  setSelectedMember(member)
                }
              >
                <Avatar
                  profile={member}
                  size="small"
                />

                <div>
                  <strong>
                    {displayName(member)}
                  </strong>

                  <RoleBadge
                    role={member.role}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel admin-control-panel">
          {!selectedMember && (
            <div className="empty-state">
              Wähle ein Mitglied aus.
            </div>
          )}

          {selectedMember && (
            <>
              <div className="selected-member">
                <Avatar
                  profile={selectedMember}
                />

                <div>
                  <h2>
                    {displayName(selectedMember)}
                  </h2>

                  <RoleBadge
                    role={selectedMember.role}
                  />
                </div>
              </div>

              {canChangeRole(
                isHeadAdmin,
                permissions
              ) && (
                <>
                  <h3>Rolle</h3>

                  <div className="role-actions">
                    <button
                      onClick={() =>
                        onChangeRole(
                          selectedMember,
                          "member"
                        )
                      }
                    >
                      Mitglied
                    </button>

                    <button
                      onClick={() =>
                        onChangeRole(
                          selectedMember,
                          "supporter"
                        )
                      }
                    >
                      ✦ Supporter
                    </button>

                    <button
                      onClick={() =>
                        onChangeRole(
                          selectedMember,
                          "admin"
                        )
                      }
                    >
                      ★ Admin
                    </button>

                    {isHeadAdmin && (
                      <button
                        onClick={() =>
                          onChangeRole(
                            selectedMember,
                            "head_admin"
                          )
                        }
                      >
                        👑 Head Admin
                      </button>
                    )}
                  </div>
                </>
              )}

              <h3>Funktionen sperren</h3>

              <div className="restriction-actions">
                {[
                  "forum",
                  "news",
                  "messages",
                  "profile",
                ].map((feature) => (
                  <button
                    key={feature}
                    onClick={() =>
                      onToggleRestriction(
                        selectedMember,
                        feature
                      )
                    }
                  >
                    🔒 {feature}
                  </button>
                ))}
              </div>

              {isHeadAdmin && (
                <>
                  <h3>
                    Admin-Berechtigungen
                  </h3>

                  <AdminPermissionPanel
                    member={selectedMember}
                    onUpdate={
                      onUpdatePermission
                    }
                  />

                  <h3>Belohnungen</h3>

                  <button
                    className="primary"
                    onClick={() =>
                      onToggleRewards(
                        selectedMember
                      )
                    }
                  >
                    {selectedMember.rewards_enabled
                      ? "Belohnungen sperren"
                      : "Belohnungen freischalten"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function AdminPermissionPanel({
  member,
  onUpdate,
}) {
  const [memberPermissions, setMemberPermissions] =
    useState(DEFAULT_PERMISSIONS);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("admin_permissions")
        .select("*")
        .eq("user_id", member.id)
        .maybeSingle();

      setMemberPermissions({
        ...DEFAULT_PERMISSIONS,
        ...(data || {}),
      });
    }

    load();
  }, [member.id]);

  return (
    <div className="permission-grid">
      {Object.keys(
        DEFAULT_PERMISSIONS
      ).map((permission) => (
        <label
          className="permission-item"
          key={permission}
        >
          <input
            type="checkbox"
            checked={
              !!memberPermissions[permission]
            }
            onChange={async (event) => {
              const value =
                event.target.checked;

              setMemberPermissions({
                ...memberPermissions,
                [permission]: value,
              });

              await onUpdate(
                member,
                permission,
                value
              );
            }}
          />

          <span>
            {permission
              .replace("manage_", "")
              .replace(
                "view_",
                ""
              )
              .replaceAll("_", " ")}
          </span>
        </label>
      ))}
    </div>
  );
}

function AdminLogsPage({
  logs,
  members,
}) {
  function getMemberName(id) {
    return displayName(
      members.find(
        (member) => member.id === id
      )
    );
  }

  return (
    <section className="page">
      <span className="eyebrow">
        SICHERHEIT
      </span>

      <h1>Admin-Logbuch</h1>

      <div className="panel log-list">
        {logs.map((log) => (
          <article
            className="log-entry"
            key={log.id}
          >
            <div>
              <strong>{log.action}</strong>

              <p>
                Ziel:{" "}
                {log.target_user_id
                  ? getMemberName(
                      log.target_user_id
                    )
                  : "System"}
              </p>
            </div>

            <small>
              {formatDate(log.created_at)}
            </small>
          </article>
        ))}

        {!logs.length && (
          <div className="empty-state">
            Noch keine Einträge vorhanden.
          </div>
        )}
      </div>
    </section>
  );
}

function calculateAge(date) {
  const birthDate = new Date(date);
  const today = new Date();

  let age =
    today.getFullYear() -
    birthDate.getFullYear();

  const monthDifference =
    today.getMonth() -
    birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 &&
      today.getDate() <
        birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

function formatDate(date) {
  if (!date) return "";

  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function canChangeRole(
  isHeadAdmin,
  permissions
) {
  return (
    isHeadAdmin ||
    permissions.manage_roles
  );
}
