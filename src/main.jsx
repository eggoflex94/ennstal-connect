import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

const logo = "/logo.png";

function getInitials(profile) {
  const name =
    profile?.nickname ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

  return name ? name.slice(0, 2).toUpperCase() : "EC";
}

function displayName(profile) {
  if (!profile) return "Mitglied";

  return (
    profile.nickname ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    "Mitglied"
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState("start");

  const [posts, setPosts] = useState([]);
  const [members, setMembers] = useState([]);
  const [marketplace, setMarketplace] = useState([]);
  const [messages, setMessages] = useState([]);

  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState(null);
  const [message, setMessage] = useState("");

  const [newPost, setNewPost] = useState("");
  const [marketTitle, setMarketTitle] = useState("");
  const [marketDescription, setMarketDescription] = useState("");
  const [marketPrice, setMarketPrice] = useState("");

  const [profileForm, setProfileForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    bio: "",
  });

  const isAdmin =
    profile?.role === "admin" || profile?.role === "hauptadmin";

  const isMainAdmin = profile?.role === "hauptadmin";

  useEffect(() => {
    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadCommunityData();
    }
  }, [session]);

  async function loadSession() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    setSession(session);

    if (session?.user) {
      await loadProfile(session.user.id);
      await loadCommunityData();
    }

    setLoading(false);
  }

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!error && data) {
      setProfile(data);

      setProfileForm({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        nickname: data.nickname || "",
        bio: data.bio || "",
      });
    }
  }

  async function loadCommunityData() {
    await Promise.all([
      loadPosts(),
      loadMembers(),
      loadMarketplace(),
      loadMessages(),
    ]);
  }

  async function loadPosts() {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setPosts(data);
  }

  async function loadMembers() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setMembers(data);
  }

  async function loadMarketplace() {
    const { data } = await supabase
      .from("marketplace_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setMarketplace(data);
  }

  async function loadMessages() {
    if (!session?.user) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) setMessages(data);
  }

  async function createPost() {
    if (!newPost.trim()) return;

    const { error } = await supabase.from("posts").insert({
      author_id: session.user.id,
      content: newPost.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewPost("");
    await loadPosts();
    setMessage("Dein Beitrag wurde veröffentlicht.");
  }

  async function createMarketplaceItem() {
    if (!marketTitle.trim()) return;

    const { error } = await supabase
      .from("marketplace_items")
      .insert({
        author_id: session.user.id,
        title: marketTitle,
        description: marketDescription,
        price: marketPrice,
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMarketTitle("");
    setMarketDescription("");
    setMarketPrice("");

    await loadMarketplace();

    setMessage("Dein Angebot wurde im Marketplace veröffentlicht.");
  }

  async function saveProfile() {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        nickname: profileForm.nickname,
        bio: profileForm.bio,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadProfile(profile.id);
    await loadMembers();

    setMessage("Dein Profil wurde gespeichert.");
  }

  async function approveMember(member) {
    const { error } = await supabase
      .from("profiles")
      .update({
        approved: true,
        status: "approved",
      })
      .eq("id", member.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadMembers();
    setMessage(`${displayName(member)} wurde freigegeben.`);
  }

  async function rejectMember(member) {
    const { error } = await supabase
      .from("profiles")
      .update({
        approved: false,
        status: "rejected",
      })
      .eq("id", member.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadMembers();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPage("start");
  }

  const pendingMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.approved === false ||
          member.status === "pending" ||
          member.status === null
      ),
    [members]
  );

  const approvedMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.approved === true ||
          member.status === "approved"
      ),
    [members]
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          <img src={logo} alt="Ennstal Connect" />
        </div>
        <p>Ennstal Connect wird geladen ...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <PublicHome
        authMode={authMode}
        setAuthMode={setAuthMode}
        message={message}
        setMessage={setMessage}
      />
    );
  }

  if (
    profile &&
    profile.approved !== true &&
    profile.status !== "approved" &&
    !isAdmin
  ) {
    return (
      <div className="pending-page">
        <img src={logo} alt="Ennstal Connect" className="pending-logo" />

        <div className="pending-card">
          <span className="eyebrow">ENNSTAL CONNECT</span>

          <h1>Dein Konto wartet auf Freigabe.</h1>

          <p>
            Willkommen {displayName(profile)}. Deine Registrierung war
            erfolgreich. Ein Administrator muss dein Konto noch freigeben.
          </p>

          <p className="muted">
            Danach kannst du alle Funktionen der Community nutzen.
          </p>

          <button className="secondary-button" onClick={signOut}>
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("start")}>
          <img src={logo} alt="Ennstal Connect Logo" className="brand-logo" />
          <span>Ennstal Connect</span>
        </button>

        <nav className="main-nav">
          <button
            className={page === "start" ? "active" : ""}
            onClick={() => setPage("start")}
          >
            Start
          </button>

          <button
            className={page === "news" ? "active" : ""}
            onClick={() => setPage("news")}
          >
            News
          </button>

          <button
            className={page === "marketplace" ? "active" : ""}
            onClick={() => setPage("marketplace")}
          >
            Marktplatz
          </button>

          <button
            className={page === "messages" ? "active" : ""}
            onClick={() => setPage("messages")}
          >
            Nachrichten
          </button>

          <button
            className={page === "profile" ? "active" : ""}
            onClick={() => setPage("profile")}
          >
            Profil
          </button>
        </nav>
      </header>

      <main className="community-layout">
        <section className="main-content">
          {message && (
            <div className="success-message">
              {message}
              <button onClick={() => setMessage("")}>×</button>
            </div>
          )}

          {page === "start" && (
            <StartPage
              profile={profile}
              setPage={setPage}
              posts={posts}
              members={approvedMembers}
            />
          )}

          {page === "news" && (
            <NewsPage
              newPost={newPost}
              setNewPost={setNewPost}
              createPost={createPost}
              posts={posts}
              members={members}
              currentUser={session.user}
            />
          )}

          {page === "marketplace" && (
            <MarketplacePage
              marketplace={marketplace}
              marketTitle={marketTitle}
              setMarketTitle={setMarketTitle}
              marketDescription={marketDescription}
              setMarketDescription={setMarketDescription}
              marketPrice={marketPrice}
              setMarketPrice={setMarketPrice}
              createMarketplaceItem={createMarketplaceItem}
              members={members}
            />
          )}

          {page === "messages" && (
            <MessagesPage messages={messages} />
          )}

          {page === "profile" && (
            <ProfilePage
              profile={profile}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              saveProfile={saveProfile}
            />
          )}

          {page === "admin" && isAdmin && (
            <AdminPage
              pendingMembers={pendingMembers}
              approvedMembers={approvedMembers}
              approveMember={approveMember}
              rejectMember={rejectMember}
              isMainAdmin={isMainAdmin}
            />
          )}
        </section>

        <aside className="right-sidebar">
          <div className="sidebar-profile">
            <div className="avatar large">
              {getInitials(profile)}
            </div>

            <div>
              <strong>{displayName(profile)}</strong>

              <div className="role-line">
                <span className="online-dot"></span>

                {profile?.role === "hauptadmin" && (
                  <span className="role-badge main-admin">
                    ★ Hauptadmin
                  </span>
                )}

                {profile?.role === "admin" && (
                  <span className="role-badge admin">
                    ★ Admin
                  </span>
                )}

                {profile?.role === "supporter" && (
                  <span className="role-badge supporter">
                    ★ Unterstützer
                  </span>
                )}

                {!profile?.role && (
                  <span className="role-badge member">
                    Mitglied
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="sidebar-card">
            <div className="sidebar-title">
              <h3>Online</h3>
              <span>{approvedMembers.length}</span>
            </div>

            <div className="online-list">
              {approvedMembers.slice(0, 8).map((member) => (
                <button
                  key={member.id}
                  className="online-member"
                  onClick={() => setPage("profile")}
                >
                  <div className="avatar small">
                    {getInitials(member)}
                  </div>

                  <div>
                    <strong>{displayName(member)}</strong>

                    <small>
                      {member.role === "hauptadmin"
                        ? "★ Hauptadmin"
                        : member.role === "admin"
                        ? "★ Admin"
                        : member.role === "supporter"
                        ? "★ Unterstützer"
                        : "Mitglied"}
                    </small>
                  </div>

                  <span className="online-dot"></span>
                </button>
              ))}

              {approvedMembers.length === 0 && (
                <p className="empty-text">
                  Noch keine Mitglieder sichtbar.
                </p>
              )}
            </div>
          </div>

          <div className="sidebar-card">
            <div className="sidebar-title">
              <h3>Mein Bereich</h3>
            </div>

            <div className="sidebar-menu">
              <button onClick={() => setPage("profile")}>
                👤 Mein Profil
              </button>

              <button onClick={() => setPage("messages")}>
                💬 Nachrichten
              </button>

              <button onClick={() => setPage("news")}>
                📰 Meine Community
              </button>

              <button onClick={() => setPage("marketplace")}>
                🛍️ Meine Angebote
              </button>

              {isAdmin && (
                <button onClick={() => setPage("admin")}>
                  🛠️ Admin Tools
                  {pendingMembers.length > 0 && (
                    <span className="notification-badge">
                      {pendingMembers.length}
                    </span>
                  )}
                </button>
              )}

              <button className="logout-button" onClick={signOut}>
                ↪ Abmelden
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer>
        <span>© {new Date().getFullYear()} Ennstal Connect</span>

        <div>
          <button>Impressum</button>
          <button>Datenschutz</button>
          <button>Community-Regeln</button>
        </div>
      </footer>
    </div>
  );
}

function PublicHome({ authMode, setAuthMode, message, setMessage }) {
  return (
    <div className="public-home">
      <header className="topbar public-bar">
        <div className="brand">
          <img src={logo} alt="Ennstal Connect Logo" className="brand-logo" />
          <span>Ennstal Connect</span>
        </div>

        <div className="public-actions">
          <button
            className="secondary-button"
            onClick={() => setAuthMode("login")}
          >
            Anmelden
          </button>

          <button
            className="primary-button"
            onClick={() => setAuthMode("register")}
          >
            Mitglied werden
          </button>
        </div>
      </header>

      <main className="public-main">
        <section className="public-hero">
          <span className="eyebrow">DEINE REGION. DEINE COMMUNITY.</span>

          <h1>
            Willkommen bei
            <br />
            Ennstal Connect
          </h1>

          <p>
            Verbinde dich mit Menschen aus deiner Region.
            Entdecke Neuigkeiten, tausche dich aus und finde spannende Angebote.
          </p>

          <button
            className="primary-button large-button"
            onClick={() => setAuthMode("register")}
          >
            Community entdecken →
          </button>

          <div className="hero-info">
            <div className="hero-icon">🏔️</div>

            <div>
              <h2>Das Ennstal verbindet.</h2>
              <p>
                Menschen, Neuigkeiten, Veranstaltungen und lokale Angebote
                an einem Ort.
              </p>
            </div>
          </div>
        </section>
      </main>

      {authMode && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthMode(null)}
          setMessage={setMessage}
        />
      )}

      {message && <div className="floating-message">{message}</div>}
    </div>
  );
}

function AuthModal({ mode, setMode, onClose, setMessage }) {
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    birth_date: "",
    nickname: "",
    email: "",
    password: "",
  });

  function update(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function submit(e) {
    e.preventDefault();

    setLoading(true);

    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: form.first_name,
            last_name: form.last_name,
            birth_date: form.birth_date,
            nickname: form.nickname,
          },
        },
      });

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage(
        "Registrierung erfolgreich. Nach der Bestätigung und Freigabe durch einen Administrator kannst du die Community nutzen."
      );

      onClose();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
    } else {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="auth-modal">
        <button className="close-button" onClick={onClose}>
          ×
        </button>

        <span className="eyebrow">ENNSTAL CONNECT</span>

        <h2>
          {mode === "login"
            ? "Willkommen zurück"
            : "Werde Teil der Community"}
        </h2>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <div className="form-grid">
                <label>
                  Vorname
                  <input
                    required
                    value={form.first_name}
                    onChange={(e) =>
                      update("first_name", e.target.value)
                    }
                  />
                </label>

                <label>
                  Nachname
                  <input
                    required
                    value={form.last_name}
                    onChange={(e) =>
                      update("last_name", e.target.value)
                    }
                  />
                </label>
              </div>

              <label>
                Spitzname
                <input
                  value={form.nickname}
                  onChange={(e) =>
                    update("nickname", e.target.value)
                  }
                />
              </label>

              <label>
                Geburtsdatum
                <input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) =>
                    update("birth_date", e.target.value)
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
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              required
              minLength="6"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </label>

          <button
            className="primary-button full-width"
            disabled={loading}
          >
            {loading
              ? "Bitte warten ..."
              : mode === "login"
              ? "Anmelden"
              : "Registrieren"}
          </button>
        </form>

        <button
          className="switch-auth"
          onClick={() =>
            setMode(mode === "login" ? "register" : "login")
          }
        >
          {mode === "login"
            ? "Noch kein Konto? Jetzt registrieren"
            : "Bereits Mitglied? Jetzt anmelden"}
        </button>
      </div>
    </div>
  );
}

function StartPage({ profile, setPage, posts, members }) {
  return (
    <>
      <section className="welcome-card">
        <span className="eyebrow">WILLKOMMEN ZURÜCK</span>

        <h1>Hallo, {displayName(profile)} 👋</h1>

        <p>
          Schön, dass du wieder bei Ennstal Connect bist.
          Entdecke, was in deiner Community passiert.
        </p>

        <div className="action-row">
          <button
            className="primary-button"
            onClick={() => setPage("news")}
          >
            Beiträge entdecken
          </button>

          <button
            className="secondary-button"
            onClick={() => setPage("marketplace")}
          >
            Zum Marktplatz
          </button>
        </div>
      </section>

      <section className="section-grid">
        <div className="stat-card">
          <span>👥</span>
          <strong>{members.length}</strong>
          <p>Mitglieder</p>
        </div>

        <div className="stat-card">
          <span>📰</span>
          <strong>{posts.length}</strong>
          <p>Beiträge</p>
        </div>

        <div className="stat-card">
          <span>💬</span>
          <strong>Community</strong>
          <p>Bleib verbunden</p>
        </div>
      </section>

      <section className="content-card">
        <div className="section-header">
          <h2>Neu in der Community</h2>

          <button onClick={() => setPage("news")}>
            Alle Beiträge →
          </button>
        </div>

        {posts.slice(0, 3).map((post) => (
          <div className="mini-post" key={post.id}>
            <div className="avatar small">EC</div>

            <div>
              <strong>Community Mitglied</strong>
              <p>{post.content}</p>
            </div>
          </div>
        ))}

        {posts.length === 0 && (
          <p className="empty-text">
            Noch keine Beiträge vorhanden. Starte die Community!
          </p>
        )}
      </section>
    </>
  );
}

function NewsPage({
  newPost,
  setNewPost,
  createPost,
  posts,
  members,
}) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">COMMUNITY</span>
        <h1>News & Beiträge</h1>
        <p>Teile, was gerade im Ennstal passiert.</p>
      </div>

      <div className="editor-card">
        <h3>Was möchtest du teilen?</h3>

        <textarea
          placeholder="Schreibe etwas für die Community ..."
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
        />

        <div className="editor-actions">
          <button
            className="primary-button"
            onClick={createPost}
          >
            Beitrag veröffentlichen
          </button>
        </div>
      </div>

      <div className="posts">
        {posts.map((post) => {
          const author = members.find(
            (member) => member.id === post.author_id
          );

          return (
            <article className="post-card" key={post.id}>
              <div className="post-header">
                <div className="avatar">
                  {getInitials(author)}
                </div>

                <div>
                  <strong>{displayName(author)}</strong>
                  <small>
                    {new Date(post.created_at).toLocaleString("de-AT")}
                  </small>
                </div>
              </div>

              <p className="post-text">{post.content}</p>
            </article>
          );
        })}

        {posts.length === 0 && (
          <div className="empty-state">
            Noch keine Beiträge. Sei der Erste!
          </div>
        )}
      </div>
    </>
  );
}

function MarketplacePage({
  marketplace,
  marketTitle,
  setMarketTitle,
  marketDescription,
  setMarketDescription,
  marketPrice,
  setMarketPrice,
  createMarketplaceItem,
  members,
}) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">REGIONAL</span>
        <h1>Marktplatz</h1>
        <p>Kaufen, verkaufen und tauschen – direkt in der Community.</p>
      </div>

      <div className="editor-card">
        <h3>Neues Angebot erstellen</h3>

        <input
          placeholder="Titel"
          value={marketTitle}
          onChange={(e) => setMarketTitle(e.target.value)}
        />

        <textarea
          placeholder="Beschreibung"
          value={marketDescription}
          onChange={(e) =>
            setMarketDescription(e.target.value)
          }
        />

        <input
          placeholder="Preis, z. B. 50 €"
          value={marketPrice}
          onChange={(e) => setMarketPrice(e.target.value)}
        />

        <button
          className="primary-button"
          onClick={createMarketplaceItem}
        >
          Angebot veröffentlichen
        </button>
      </div>

      <div className="market-grid">
        {marketplace.map((item) => {
          const author = members.find(
            (member) => member.id === item.author_id
          );

          return (
            <article className="market-card" key={item.id}>
              <div className="market-image">🏔️</div>

              <div className="market-content">
                <span className="price">{item.price || "Preis auf Anfrage"}</span>

                <h3>{item.title}</h3>

                <p>{item.description}</p>

                <small>
                  Angebot von {displayName(author)}
                </small>
              </div>
            </article>
          );
        })}

        {marketplace.length === 0 && (
          <div className="empty-state">
            Noch keine Angebote vorhanden.
          </div>
        )}
      </div>
    </>
  );
}

function MessagesPage({ messages }) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">KONTAKT</span>
        <h1>Nachrichten</h1>
        <p>Bleib mit deinen Freunden und Community-Mitgliedern verbunden.</p>
      </div>

      <div className="content-card">
        {messages.map((message) => (
          <div className="message-row" key={message.id}>
            <div className="avatar small">EC</div>

            <div>
              <strong>Nachricht</strong>
              <p>{message.content}</p>
            </div>
          </div>
        ))}

        {messages.length === 0 && (
          <div className="empty-state">
            Noch keine Nachrichten vorhanden.
          </div>
        )}
      </div>
    </>
  );
}

function ProfilePage({
  profile,
  profileForm,
  setProfileForm,
  saveProfile,
}) {
  function update(key, value) {
    setProfileForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">MEIN BEREICH</span>
        <h1>Mein Profil</h1>
        <p>Hier kannst du dein persönliches Profil bearbeiten.</p>
      </div>

      <div className="profile-editor">
        <div className="profile-preview">
          <div className="avatar profile-avatar">
            {getInitials(profileForm)}
          </div>

          <h2>
            {profileForm.nickname ||
              `${profileForm.first_name} ${profileForm.last_name}`}
          </h2>

          <div className="role-badge member">
            {profile?.role || "Mitglied"}
          </div>
        </div>

        <div className="profile-form">
          <div className="form-grid">
            <label>
              Vorname
              <input
                value={profileForm.first_name}
                onChange={(e) =>
                  update("first_name", e.target.value)
                }
              />
            </label>

            <label>
              Nachname
              <input
                value={profileForm.last_name}
                onChange={(e) =>
                  update("last_name", e.target.value)
                }
              />
            </label>
          </div>

          <label>
            Spitzname
            <input
              value={profileForm.nickname}
              onChange={(e) =>
                update("nickname", e.target.value)
              }
            />
          </label>

          <label>
            Über mich
            <textarea
              value={profileForm.bio}
              onChange={(e) => update("bio", e.target.value)}
              placeholder="Erzähl der Community etwas über dich ..."
            />
          </label>

          <button
            className="primary-button"
            onClick={saveProfile}
          >
            Änderungen speichern
          </button>
        </div>
      </div>
    </>
  );
}

function AdminPage({
  pendingMembers,
  approvedMembers,
  approveMember,
  rejectMember,
  isMainAdmin,
}) {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">VERWALTUNG</span>
        <h1>Admin Tools</h1>

        <p>
          Mitglieder freigeben und deine Community verwalten.
        </p>
      </div>

      <section className="admin-section">
        <div className="section-header">
          <h2>
            Registrierungen zur Freigabe
            <span className="notification-badge">
              {pendingMembers.length}
            </span>
          </h2>
        </div>

        {pendingMembers.map((member) => (
          <div className="admin-member" key={member.id}>
            <div className="avatar">
              {getInitials(member)}
            </div>

            <div className="admin-member-info">
              <strong>{displayName(member)}</strong>

              <small>
                {member.email || "Neue Registrierung"}
              </small>
            </div>

            <div className="admin-actions">
              <button
                className="primary-button small-button"
                onClick={() => approveMember(member)}
              >
                Freigeben
              </button>

              <button
                className="danger-button small-button"
                onClick={() => rejectMember(member)}
              >
                Ablehnen
              </button>
            </div>
          </div>
        ))}

        {pendingMembers.length === 0 && (
          <div className="empty-state">
            Aktuell warten keine neuen Mitglieder auf Freigabe.
          </div>
        )}
      </section>

      <section className="admin-section">
        <h2>Community Übersicht</h2>

        <div className="section-grid">
          <div className="stat-card">
            <strong>{approvedMembers.length}</strong>
            <p>Freigegebene Mitglieder</p>
          </div>

          {isMainAdmin && (
            <div className="stat-card">
              <strong>★</strong>
              <p>Hauptadmin Zugriff aktiv</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
