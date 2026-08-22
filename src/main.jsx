import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

/* =========================================================
   ENNSTAL CONNECT
   Community – Main Component
========================================================= */

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [posts, setPosts] = useState([]);
  const [marketplaceItems, setMarketplaceItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const [activePage, setActivePage] = useState("home");
  const [authMode, setAuthMode] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [postContent, setPostContent] = useState("");
  const [marketForm, setMarketForm] = useState({
    title: "",
    description: "",
    price: ""
  });

  const [authForm, setAuthForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    birth_date: "",
    email: "",
    password: ""
  });

  /* =========================================================
     START
  ========================================================= */

  useEffect(() => {
    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        loadAll(session.user);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSession() {
    setLoading(true);

    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session?.user) {
      setUser(session.user);
      await loadAll(session.user);
    }

    setLoading(false);
  }

  async function loadAll(currentUser) {
    await Promise.all([
      loadProfile(currentUser),
      loadProfiles(),
      loadPosts(),
      loadMarketplace(),
      loadNotifications(currentUser),
      loadFriendRequests(currentUser),
      loadMessages(currentUser),
      loadOnlineUsers()
    ]);
  }

  /* =========================================================
     PROFILE
  ========================================================= */

  async function loadProfile(currentUser = user) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();

    if (error) {
      console.log("Profil konnte nicht geladen werden:", error.message);
      return;
    }

    setProfile(data);

    /* Online-Status aktualisieren */
    try {
      await supabase
        .from("online_sessions")
        .upsert({
          user_id: currentUser.id,
          last_seen: new Date().toISOString()
        });
    } catch (error) {
      console.log("Online Status:", error.message);
    }
  }

  async function loadProfiles() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      setProfiles(data || []);
    }
  }

  async function updateProfile(updates) {
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Profil erfolgreich gespeichert.");
    await loadProfile();
    await loadProfiles();
  }

  /* =========================================================
     POSTS / COMMUNITY
  ========================================================= */

  async function loadPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      setPosts(data || []);
    }
  }

  async function createPost(e) {
    e.preventDefault();

    if (!user) {
      setAuthMode("login");
      return;
    }

    if (!postContent.trim()) return;

    const { error } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        content: postContent.trim()
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    setPostContent("");
    showNotice("Dein Beitrag wurde veröffentlicht.");
    await loadPosts();
  }

  /* =========================================================
     MARKTPLATZ
  ========================================================= */

  async function loadMarketplace() {
    const { data, error } = await supabase
      .from("marketplace_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      setMarketplaceItems(data || []);
    }
  }

  async function createMarketplaceItem(e) {
    e.preventDefault();

    if (!user) {
      setAuthMode("login");
      return;
    }

    if (!marketForm.title.trim()) return;

    const { error } = await supabase
      .from("marketplace_items")
      .insert({
        seller_id: user.id,
        title: marketForm.title,
        description: marketForm.description,
        price: marketForm.price
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    setMarketForm({
      title: "",
      description: "",
      price: ""
    });

    showNotice("Dein Angebot wurde veröffentlicht.");
    await loadMarketplace();
  }

  /* =========================================================
     FREUNDE
  ========================================================= */

  async function loadFriendRequests(currentUser = user) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("friend_requests")
      .select("*")
      .eq("receiver_id", currentUser.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error) {
      setFriendRequests(data || []);
    }
  }

  async function sendFriendRequest(receiverId) {
    if (!user) {
      setAuthMode("login");
      return;
    }

    const { error } = await supabase
      .from("friend_requests")
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: "pending"
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Freundschaftsanfrage wurde gesendet.");
  }

  async function answerFriendRequest(request, accepted) {
    const { error } = await supabase
      .from("friend_requests")
      .update({
        status: accepted ? "accepted" : "rejected"
      })
      .eq("id", request.id);

    if (!error) {
      showNotice(
        accepted
          ? "Freundschaftsanfrage angenommen."
          : "Freundschaftsanfrage abgelehnt."
      );

      await loadFriendRequests();
    }
  }

  /* =========================================================
     NACHRICHTEN
  ========================================================= */

  async function loadMessages(currentUser = user) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
      )
      .order("created_at", { ascending: true });

    if (!error) {
      setMessages(data || []);
    }
  }

  async function sendMessage(receiverId, content) {
    if (!content.trim() || !user) return;

    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        content: content.trim()
      });

    if (!error) {
      await loadMessages();
    } else {
      showNotice(error.message);
    }
  }

  /* =========================================================
     ONLINE
  ========================================================= */

  async function loadOnlineUsers() {
    const { data, error } = await supabase
      .from("online_sessions")
      .select("*")
      .order("last_seen", { ascending: false });

    if (!error) {
      setOnlineUsers(data || []);
    }
  }

  /* =========================================================
     BENACHRICHTIGUNGEN
  ========================================================= */

  async function loadNotifications(currentUser = user) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (!error) {
      setNotifications(data || []);
    }
  }

  /* =========================================================
     ADMIN
  ========================================================= */

  function isAdmin() {
    return (
      profile?.role === "admin" ||
      profile?.role === "mainadmin" ||
      profile?.role === "superadmin"
    );
  }

  function isMainAdmin() {
    return (
      profile?.role === "mainadmin" ||
      profile?.role === "superadmin"
    );
  }

  async function approveMember(memberId) {
    const { error } = await supabase
      .from("profiles")
      .update({
        approved: true,
        status: "approved"
      })
      .eq("id", memberId);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Mitglied wurde freigegeben.");
    await loadProfiles();
  }

  async function rejectMember(memberId) {
    const { error } = await supabase
      .from("profiles")
      .update({
        approved: false,
        status: "rejected"
      })
      .eq("id", memberId);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Anfrage wurde abgelehnt.");
    await loadProfiles();
  }

  /* =========================================================
     AUTH
  ========================================================= */

  function changeAuthField(name, value) {
    setAuthForm((old) => ({
      ...old,
      [name]: value
    }));
  }

  async function register(e) {
    e.preventDefault();

    const { data, error } = await supabase.auth.signUp({
      email: authForm.email,
      password: authForm.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: authForm.first_name,
          last_name: authForm.last_name,
          nickname: authForm.nickname,
          birth_date: authForm.birth_date
        }
      }
    });

    if (error) {
      showNotice(error.message);
      return;
    }

    /*
      Profil auf "wartet auf Freigabe".
      Falls dein Trigger in Supabase das Profil bereits erstellt,
      wird upsert verwendet.
    */

    if (data?.user) {
      await supabase
        .from("profiles")
        .upsert({
          id: data.user.id,
          first_name: authForm.first_name,
          last_name: authForm.last_name,
          nickname: authForm.nickname,
          birth_date: authForm.birth_date,
          email: authForm.email,
          approved: false,
          status: "pending",
          role: "member"
        });
    }

    showNotice(
      "Registrierung erfolgreich. Dein Konto muss jetzt von einem Admin freigegeben werden."
    );

    setAuthMode(null);
  }

  async function login(e) {
    e.preventDefault();

    const { error } = await supabase.auth.signInWithPassword({
      email: authForm.email,
      password: authForm.password
    });

    if (error) {
      showNotice(error.message);
      return;
    }

    setAuthMode(null);
  }

  async function logout() {
    await supabase.auth.signOut();
    setActivePage("home");
  }

  /* =========================================================
     HILFE
  ========================================================= */

  function showNotice(text) {
    setNotice(text);

    window.setTimeout(() => {
      setNotice("");
    }, 5000);
  }

  function getProfileName(id) {
    const person = profiles.find((item) => item.id === id);

    if (!person) return "Mitglied";

    return (
      person.nickname ||
      `${person.first_name || ""} ${person.last_name || ""}`.trim() ||
      "Mitglied"
    );
  }

  function getMemberStatus(member) {
    if (member.role === "mainadmin" || member.role === "superadmin") {
      return "⭐ Hauptadmin";
    }

    if (member.role === "admin") {
      return "⭐ Admin";
    }

    if (member.role === "supporter") {
      return "★ Supporter";
    }

    return "Mitglied";
  }

  function isApproved() {
    if (!profile) return false;

    return (
      profile.approved === true ||
      profile.status === "approved" ||
      isAdmin()
    );
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="loadingScreen">
        <img src="/logo.png" alt="Ennstal Connect" />
        <h1>Ennstal Connect</h1>
        <p>Community wird geladen ...</p>
      </div>
    );
  }

  /* =========================================================
     WARTET AUF FREIGABE
  ========================================================= */

  if (user && profile && !isApproved()) {
    return (
      <div className="loadingScreen">
        <img src="/logo.png" alt="Ennstal Connect" />
        <h1>Deine Registrierung ist eingegangen</h1>

        <p className="pendingText">
          Willkommen bei Ennstal Connect, {profile.nickname || profile.first_name}.
          Dein Konto wartet noch auf die Freigabe durch einen Administrator.
        </p>

        <button className="primaryButton" onClick={logout}>
          Abmelden
        </button>
      </div>
    );
  }

  /* =========================================================
     HAUPTSEITE
  ========================================================= */

  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => setActivePage("home")}
        >
          <img src="/logo.png" alt="Ennstal Connect Logo" />
          <span>Ennstal Connect</span>
        </button>

        <nav className="mainNav">
          <button
            className={activePage === "home" ? "active" : ""}
            onClick={() => setActivePage("home")}
          >
            Start
          </button>

          <button
            className={activePage === "news" ? "active" : ""}
            onClick={() => setActivePage("news")}
          >
            News
          </button>

          <button
            className={activePage === "marketplace" ? "active" : ""}
            onClick={() => setActivePage("marketplace")}
          >
            Marktplatz
          </button>

          <button
            className={activePage === "messages" ? "active" : ""}
            onClick={() => setActivePage("messages")}
          >
            Nachrichten
          </button>

          <button
            className={activePage === "members" ? "active" : ""}
            onClick={() => setActivePage("members")}
          >
            Mitglieder
          </button>
        </nav>

        <div className="topActions">
          {user ? (
            <button
              className="profileTopButton"
              onClick={() => setActivePage("profile")}
            >
              {profile?.nickname || profile?.first_name || "Profil"}
            </button>
          ) : (
            <>
              <button onClick={() => setAuthMode("login")}>
                Anmelden
              </button>

              <button
                className="primaryButton smallButton"
                onClick={() => setAuthMode("register")}
              >
                Registrieren
              </button>
            </>
          )}
        </div>
      </header>

      {notice && (
        <div className="notice">
          {notice}
        </div>
      )}

      <main className="appLayout">

        {/* =====================================================
            HAUPTINHALT
        ====================================================== */}

        <section className="mainContent">

          {activePage === "home" && (
            <>
              <section className="hero">
                <div className="heroContent">
                  <span className="eyebrow">
                    DEINE REGION. DEINE COMMUNITY.
                  </span>

                  <h1>
                    Willkommen bei
                    <br />
                    Ennstal Connect
                  </h1>

                  <p>
                    Verbinde dich mit Menschen aus deiner Region.
                    Entdecke Neuigkeiten, tausche dich aus,
                    finde neue Freunde und spannende Angebote.
                  </p>

                  <button
                    className="primaryButton"
                    onClick={() => {
                      if (user) {
                        setActivePage("news");
                      } else {
                        setAuthMode("register");
                      }
                    }}
                  >
                    Community entdecken →
                  </button>
                </div>
              </section>

              <section className="section">
                <h2>Das Ennstal verbindet.</h2>

                <div className="featureGrid">
                  <div className="featureCard">
                    <div className="featureIcon">👥</div>
                    <h3>Menschen kennenlernen</h3>
                    <p>
                      Entdecke Mitglieder aus deiner Region und
                      verbinde dich miteinander.
                    </p>
                  </div>

                  <div className="featureCard">
                    <div className="featureIcon">💬</div>
                    <h3>Austauschen</h3>
                    <p>
                      Teile Beiträge, schreibe Nachrichten und bleibe
                      mit deiner Community verbunden.
                    </p>
                  </div>

                  <div className="featureCard">
                    <div className="featureIcon">🏔️</div>
                    <h3>Regional entdecken</h3>
                    <p>
                      Entdecke Neuigkeiten, Angebote und Menschen
                      aus dem Ennstal.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* =====================================================
              NEWS / COMMUNITY POSTS
          ====================================================== */}

          {activePage === "news" && (
            <section className="section">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">COMMUNITY</span>
                  <h1>Neuigkeiten</h1>
                  <p>Was gibt es Neues in deiner Community?</p>
                </div>
              </div>

              {user && (
                <form className="postComposer" onSubmit={createPost}>
                  <textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Was möchtest du mit der Community teilen?"
                  />

                  <button className="primaryButton">
                    Beitrag veröffentlichen
                  </button>
                </form>
              )}

              <div className="postList">
                {posts.length === 0 && (
                  <div className="emptyState">
                    Noch keine Beiträge vorhanden.
                  </div>
                )}

                {posts.map((post) => (
                  <article className="postCard" key={post.id}>
                    <div className="postAuthor">
                      <div className="avatar">
                        {getProfileName(post.author_id).charAt(0)}
                      </div>

                      <div>
                        <strong>
                          {getProfileName(post.author_id)}
                        </strong>

                        <span>
                          {post.created_at
                            ? new Date(post.created_at).toLocaleString("de-AT")
                            : ""}
                        </span>
                      </div>
                    </div>

                    <p className="postText">
                      {post.content}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* =====================================================
              MARKTPLATZ
          ====================================================== */}

          {activePage === "marketplace" && (
            <section className="section">
              <span className="eyebrow">REGIONAL</span>
              <h1>Marktplatz</h1>

              <p>
                Angebote und Dinge aus der Community.
              </p>

              {user && (
                <form
                  className="marketForm"
                  onSubmit={createMarketplaceItem}
                >
                  <input
                    placeholder="Titel deines Angebots"
                    value={marketForm.title}
                    onChange={(e) =>
                      setMarketForm({
                        ...marketForm,
                        title: e.target.value
                      })
                    }
                  />

                  <textarea
                    placeholder="Beschreibung"
                    value={marketForm.description}
                    onChange={(e) =>
                      setMarketForm({
                        ...marketForm,
                        description: e.target.value
                      })
                    }
                  />

                  <input
                    placeholder="Preis, z. B. 20 €"
                    value={marketForm.price}
                    onChange={(e) =>
                      setMarketForm({
                        ...marketForm,
                        price: e.target.value
                      })
                    }
                  />

                  <button className="primaryButton">
                    Angebot veröffentlichen
                  </button>
                </form>
              )}

              <div className="marketGrid">
                {marketplaceItems.map((item) => (
                  <article className="marketCard" key={item.id}>
                    <div className="marketImage">
                      🏔️
                    </div>

                    <h3>{item.title}</h3>

                    <p>
                      {item.description}
                    </p>

                    <div className="marketFooter">
                      <strong>
                        {item.price || "Preis auf Anfrage"}
                      </strong>

                      <span>
                        {getProfileName(item.seller_id)}
                      </span>
                    </div>

                    {user &&
                      user.id !== item.seller_id && (
                        <button
                          className="secondaryButton"
                          onClick={() => {
                            setSelectedChat(item.seller_id);
                            setActivePage("messages");
                          }}
                        >
                          Nachricht schreiben
                        </button>
                      )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* =====================================================
              MITGLIEDER
          ====================================================== */}

          {activePage === "members" && (
            <section className="section">
              <span className="eyebrow">COMMUNITY</span>
              <h1>Mitglieder</h1>

              <div className="memberGrid">
                {profiles
                  .filter(
                    (member) =>
                      member.approved === true ||
                      member.status === "approved" ||
                      member.role === "admin" ||
                      member.role === "mainadmin" ||
                      member.role === "superadmin"
                  )
                  .map((member) => (
                    <article
                      className="memberCard"
                      key={member.id}
                    >
                      <div className="memberAvatar">
                        {member.nickname?.charAt(0) ||
                          member.first_name?.charAt(0) ||
                          "M"}
                      </div>

                      <h3>
                        {member.nickname ||
                          `${member.first_name || ""} ${
                            member.last_name || ""
                          }`}
                      </h3>

                      <span
                        className={
                          member.role === "admin" ||
                          member.role === "mainadmin" ||
                          member.role === "superadmin"
                            ? "role adminRole"
                            : "role"
                        }
                      >
                        {getMemberStatus(member)}
                      </span>

                      <p>
                        {member.bio ||
                          "Mitglied der Ennstal Connect Community."}
                      </p>

                      {user &&
                        user.id !== member.id && (
                          <div className="memberActions">
                            <button
                              className="secondaryButton"
                              onClick={() =>
                                setSelectedMember(member)
                              }
                            >
                              Profil
                            </button>

                            <button
                              className="secondaryButton"
                              onClick={() =>
                                sendFriendRequest(member.id)
                              }
                            >
                              Freund hinzufügen
                            </button>
                          </div>
                        )}
                    </article>
                  ))}
              </div>
            </section>
          )}

          {/* =====================================================
              NACHRICHTEN
          ====================================================== */}

          {activePage === "messages" && (
            <MessagesPage
              user={user}
              profiles={profiles}
              messages={messages}
              selectedChat={selectedChat}
              setSelectedChat={setSelectedChat}
              sendMessage={sendMessage}
              getProfileName={getProfileName}
            />
          )}

          {/* =====================================================
              PROFIL
          ====================================================== */}

          {activePage === "profile" && user && profile && (
            <ProfilePage
              profile={profile}
              updateProfile={updateProfile}
            />
          )}

          {/* =====================================================
              ADMIN
          ====================================================== */}

          {activePage === "admin" && isAdmin() && (
            <AdminPage
              profiles={profiles}
              approveMember={approveMember}
              rejectMember={rejectMember}
              isMainAdmin={isMainAdmin()}
            />
          )}

        </section>

        {/* =====================================================
            RECHTER MEIN BEREICH
        ====================================================== */}

        <aside className="rightSidebar">

          {!user ? (
            <div className="sidebarCard">
              <h3>Willkommen</h3>
              <p>
                Melde dich an und werde Teil der Community.
              </p>

              <button
                className="primaryButton fullButton"
                onClick={() => setAuthMode("login")}
              >
                Anmelden
              </button>

              <button
                className="secondaryButton fullButton"
                onClick={() => setAuthMode("register")}
              >
                Registrieren
              </button>
            </div>
          ) : (
            <>
              <div className="sidebarCard userCard">
                <div className="userCardTop">
                  <div className="bigAvatar">
                    {profile?.nickname?.charAt(0) ||
                      profile?.first_name?.charAt(0) ||
                      "M"}
                  </div>

                  <div>
                    <h3>
                      {profile?.nickname ||
                        profile?.first_name}
                    </h3>

                    <span className="onlineLabel">
                      ● Online
                    </span>
                  </div>
                </div>

                <button
                  className="secondaryButton fullButton"
                  onClick={() => setActivePage("profile")}
                >
                  Mein Profil bearbeiten
                </button>
              </div>

              <div className="sidebarCard">
                <h3>Mein Bereich</h3>

                <button
                  className="sideLink"
                  onClick={() => setActivePage("members")}
                >
                  👥 Mitglieder
                </button>

                <button
                  className="sideLink"
                  onClick={() => setActivePage("messages")}
                >
                  💬 Nachrichten
                </button>

                <button
                  className="sideLink"
                  onClick={() => setActivePage("profile")}
                >
                  👤 Mein Profil
                </button>

                <button
                  className="sideLink"
                  onClick={() => setActivePage("notifications")}
                >
                  🔔 Benachrichtigungen
                  {notifications.length > 0 && (
                    <span className="countBadge">
                      {notifications.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="sidebarCard">
                <h3>Freundschaftsanfragen</h3>

                {friendRequests.length === 0 && (
                  <p className="smallText">
                    Keine offenen Anfragen.
                  </p>
                )}

                {friendRequests.map((request) => (
                  <div
                    className="friendRequest"
                    key={request.id}
                  >
                    <strong>
                      {getProfileName(request.sender_id)}
                    </strong>

                    <div>
                      <button
                        className="acceptButton"
                        onClick={() =>
                          answerFriendRequest(request, true)
                        }
                      >
                        ✓
                      </button>

                      <button
                        className="rejectButton"
                        onClick={() =>
                          answerFriendRequest(request, false)
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="sidebarCard">
                <h3>Online</h3>

                {onlineUsers.slice(0, 8).map((online) => (
                  <div
                    className="onlineUser"
                    key={online.user_id || online.id}
                  >
                    <span className="onlineDot" />

                    {getProfileName(online.user_id)}
                  </div>
                ))}

                {onlineUsers.length === 0 && (
                  <p className="smallText">
                    Derzeit keine weiteren Mitglieder online.
                  </p>
                )}
              </div>

              {isAdmin() && (
                <div className="sidebarCard adminBox">
                  <h3>⭐ Admin Tools</h3>

                  <button
                    className="sideLink"
                    onClick={() => setActivePage("admin")}
                  >
                    Mitglieder verwalten
                  </button>

                  <button
                    className="sideLink"
                    onClick={() => setActivePage("admin")}
                  >
                    Freigaben
                  </button>
                </div>
              )}

              <div className="sidebarCard">
                <button
                  className="logoutButton"
                  onClick={logout}
                >
                  Abmelden
                </button>
              </div>
            </>
          )}
        </aside>
      </main>

      {/* =====================================================
          FOOTER
      ====================================================== */}

      <footer className="footer">
        <div>
          <strong>Ennstal Connect</strong>
          <span>Deine Region. Deine Community.</span>
        </div>

        <div className="footerLinks">
          <button onClick={() => setActivePage("rules")}>
            Community-Regeln
          </button>

          <button onClick={() => setActivePage("privacy")}>
            Datenschutz
          </button>

          <button onClick={() => setActivePage("imprint")}>
            Impressum
          </button>
        </div>
      </footer>

      {/* =====================================================
          AUTH MODAL
      ====================================================== */}

      {authMode && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          form={authForm}
          changeField={changeAuthField}
          login={login}
          register={register}
          close={() => setAuthMode(null)}
        />
      )}

      {/* =====================================================
          MEMBER MODAL
      ====================================================== */}

      {selectedMember && (
        <div
          className="modalOverlay"
          onClick={() => setSelectedMember(null)}
        >
          <div
            className="modal memberModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="closeButton"
              onClick={() => setSelectedMember(null)}
            >
              ×
            </button>

            <div className="profilePreviewAvatar">
              {selectedMember.nickname?.charAt(0) ||
                selectedMember.first_name?.charAt(0) ||
                "M"}
            </div>

            <h2>
              {selectedMember.nickname ||
                `${selectedMember.first_name || ""} ${
                  selectedMember.last_name || ""
                }`}
            </h2>

            <span className="role">
              {getMemberStatus(selectedMember)}
            </span>

            <p>
              {selectedMember.bio ||
                "Dieses Mitglied hat noch keine Beschreibung hinzugefügt."}
            </p>

            {user && user.id !== selectedMember.id && (
              <>
                <button
                  className="primaryButton fullButton"
                  onClick={() =>
                    sendFriendRequest(selectedMember.id)
                  }
                >
                  Freundschaftsanfrage senden
                </button>

                <button
                  className="secondaryButton fullButton"
                  onClick={() => {
                    setSelectedChat(selectedMember.id);
                    setSelectedMember(null);
                    setActivePage("messages");
                  }}
                >
                  Nachricht schreiben
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          SIMPLE INFO PAGES
      ====================================================== */}

      {activePage === "rules" && (
        <InfoModal
          title="Community-Regeln"
          close={() => setActivePage("home")}
        >
          <p>1. Begegne anderen Mitgliedern respektvoll.</p>
          <p>2. Keine Beleidigungen, Diskriminierung oder Belästigung.</p>
          <p>3. Respektiere die Privatsphäre anderer Mitglieder.</p>
          <p>4. Keine illegalen Inhalte.</p>
          <p>5. Admin-Entscheidungen dienen dem Schutz der Community.</p>
        </InfoModal>
      )}

      {activePage === "privacy" && (
        <InfoModal
          title="Datenschutz"
          close={() => setActivePage("home")}
        >
          <p>
            Ennstal Connect verarbeitet Daten, die für die
            Registrierung und Nutzung der Community notwendig sind.
          </p>

          <p>
            Die technische Verarbeitung erfolgt über die für die
            Plattform verwendeten Dienste wie Supabase und Vercel.
          </p>

          <p>
            Mitglieder können ihr Profil innerhalb der Community
            bearbeiten.
          </p>
        </InfoModal>
      )}

      {activePage === "imprint" && (
        <InfoModal
          title="Impressum"
          close={() => setActivePage("home")}
        >
          <p>
            Hier kannst du deine vollständigen Impressumsdaten
            eintragen.
          </p>
        </InfoModal>
      )}
    </>
  );
}


/* =========================================================
   AUTH MODAL
========================================================= */

function AuthModal({
  mode,
  setMode,
  form,
  changeField,
  login,
  register,
  close
}) {
  const isRegister = mode === "register";

  return (
    <div className="modalOverlay">
      <div className="modal authModal">
        <button className="closeButton" onClick={close}>
          ×
        </button>

        <h2>
          {isRegister
            ? "Bei Ennstal Connect registrieren"
            : "Willkommen zurück"}
        </h2>

        <form onSubmit={isRegister ? register : login}>
          {isRegister && (
            <>
              <input
                placeholder="Vorname"
                value={form.first_name}
                onChange={(e) =>
                  changeField("first_name", e.target.value)
                }
                required
              />

              <input
                placeholder="Nachname"
                value={form.last_name}
                onChange={(e) =>
                  changeField("last_name", e.target.value)
                }
                required
              />

              <input
                placeholder="Nickname"
                value={form.nickname}
                onChange={(e) =>
                  changeField("nickname", e.target.value)
                }
                required
              />

              <label>Geburtsdatum</label>

              <input
                type="date"
                value={form.birth_date}
                onChange={(e) =>
                  changeField("birth_date", e.target.value)
                }
              />
            </>
          )}

          <input
            type="email"
            placeholder="E-Mail-Adresse"
            value={form.email}
            onChange={(e) =>
              changeField("email", e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder="Passwort"
            value={form.password}
            onChange={(e) =>
              changeField("password", e.target.value)
            }
            required
          />

          <button className="primaryButton fullButton">
            {isRegister
              ? "Registrierung beantragen"
              : "Anmelden"}
          </button>
        </form>

        <div className="authSwitch">
          {isRegister ? (
            <>
              Bereits Mitglied?
              <button onClick={() => setMode("login")}>
                Jetzt anmelden
              </button>
            </>
          ) : (
            <>
              Noch nicht registriert?
              <button onClick={() => setMode("register")}>
                Mitglied werden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   PROFILE PAGE
========================================================= */

function ProfilePage({ profile, updateProfile }) {
  const [form, setForm] = useState({
    nickname: profile.nickname || "",
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
    bio: profile.bio || "",
    location: profile.location || ""
  });

  function change(name, value) {
    setForm({
      ...form,
      [name]: value
    });
  }

  function submit(e) {
    e.preventDefault();
    updateProfile(form);
  }

  return (
    <section className="section profilePage">
      <span className="eyebrow">MEIN BEREICH</span>
      <h1>Mein Profil</h1>

      <form className="profileForm" onSubmit={submit}>
        <div className="formGrid">
          <div>
            <label>Vorname</label>
            <input
              value={form.first_name}
              onChange={(e) =>
                change("first_name", e.target.value)
              }
            />
          </div>

          <div>
            <label>Nachname</label>
            <input
              value={form.last_name}
              onChange={(e) =>
                change("last_name", e.target.value)
              }
            />
          </div>
        </div>

        <label>Nickname</label>

        <input
          value={form.nickname}
          onChange={(e) =>
            change("nickname", e.target.value)
          }
        />

        <label>Wohnort / Region</label>

        <input
          value={form.location}
          onChange={(e) =>
            change("location", e.target.value)
          }
        />

        <label>Über mich</label>

        <textarea
          value={form.bio}
          onChange={(e) =>
            change("bio", e.target.value)
          }
          placeholder="Erzähl der Community etwas über dich ..."
        />

        <button className="primaryButton">
          Profil speichern
        </button>
      </form>
    </section>
  );
}


/* =========================================================
   MESSAGES
========================================================= */

function MessagesPage({
  user,
  profiles,
  messages,
  selectedChat,
  setSelectedChat,
  sendMessage,
  getProfileName
}) {
  const [text, setText] = useState("");

  const chats = profiles.filter(
    (profile) => profile.id !== user?.id
  );

  const currentMessages = selectedChat
    ? messages.filter(
        (message) =>
          (message.sender_id === user.id &&
            message.receiver_id === selectedChat) ||
          (message.receiver_id === user.id &&
            message.sender_id === selectedChat)
      )
    : [];

  function submit(e) {
    e.preventDefault();

    if (!selectedChat) return;

    sendMessage(selectedChat, text);
    setText("");
  }

  return (
    <section className="section messagesPage">
      <span className="eyebrow">COMMUNITY</span>
      <h1>Nachrichten</h1>

      <div className="messagesLayout">

        <aside className="chatList">
          {chats.map((person) => (
            <button
              key={person.id}
              className={
                selectedChat === person.id
                  ? "chatPerson activeChat"
                  : "chatPerson"
              }
              onClick={() => setSelectedChat(person.id)}
            >
              <div className="smallAvatar">
                {getProfileName(person.id).charAt(0)}
              </div>

              <span>
                {getProfileName(person.id)}
              </span>
            </button>
          ))}
        </aside>

        <div className="chatWindow">
          {!selectedChat ? (
            <div className="emptyState">
              Wähle ein Mitglied aus, um eine Unterhaltung zu starten.
            </div>
          ) : (
            <>
              <div className="chatHeader">
                <strong>
                  {getProfileName(selectedChat)}
                </strong>
              </div>

              <div className="messageArea">
                {currentMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.sender_id === user.id
                        ? "message ownMessage"
                        : "message"
                    }
                  >
                    {message.content}
                  </div>
                ))}
              </div>

              <form
                className="messageForm"
                onSubmit={submit}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nachricht schreiben ..."
                />

                <button className="primaryButton">
                  Senden
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}


/* =========================================================
   ADMIN
========================================================= */

function AdminPage({
  profiles,
  approveMember,
  rejectMember,
  isMainAdmin
}) {
  const pendingMembers = profiles.filter(
    (member) =>
      member.approved !== true &&
      member.status !== "approved"
  );

  return (
    <section className="section">
      <span className="eyebrow">VERWALTUNG</span>
      <h1>⭐ Admin Bereich</h1>

      <div className="adminPanel">
        <h2>Offene Registrierungen</h2>

        {pendingMembers.length === 0 && (
          <div className="emptyState">
            Keine offenen Registrierungen.
          </div>
        )}

        {pendingMembers.map((member) => (
          <div
            className="adminMember"
            key={member.id}
          >
            <div>
              <strong>
                {member.nickname ||
                  `${member.first_name || ""} ${
                    member.last_name || ""
                  }`}
              </strong>

              <span>{member.email}</span>
            </div>

            <div className="adminActions">
              <button
                className="acceptButton large"
                onClick={() => approveMember(member.id)}
              >
                Freigeben
              </button>

              <button
                className="rejectButton large"
                onClick={() => rejectMember(member.id)}
              >
                Ablehnen
              </button>
            </div>
          </div>
        ))}
      </div>

      {isMainAdmin && (
        <div className="adminPanel">
          <h2>⭐ Hauptadmin</h2>

          <p>
            Du hast Zugriff auf die erweiterten Verwaltungsfunktionen
            deiner Community.
          </p>
        </div>
      )}
    </section>
  );
}


/* =========================================================
   INFO MODAL
========================================================= */

function InfoModal({ title, children, close }) {
  return (
    <div className="modalOverlay">
      <div className="modal infoModal">
        <button className="closeButton" onClick={close}>
          ×
        </button>

        <h2>{title}</h2>

        <div className="infoContent">
          {children}
        </div>
      </div>
    </div>
  );
}


createRoot(document.getElementById("root")).render(<App />);
