import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const ADMIN_EMAIL = "eggermarco@gmx.net";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const starterNews = [
  {
    id: 1,
    title: "Willkommen bei Ennstal Connect",
    content:
      "Die regionale Community für Ennstal und Obersteiermark ist online. Hier findest du News, Beiträge, Veranstaltungen und vieles mehr.",
    category: "Community",
    date: new Date().toLocaleDateString("de-AT"),
    author: "Ennstal Connect",
  },
];

const starterPosts = [
  {
    id: 1,
    name: "Ennstal Connect",
    role: "admin",
    profileImage: "",
    text: "Willkommen in unserer Community! Wir freuen uns, dass du dabei bist.",
    date: new Date().toLocaleDateString("de-AT"),
  },
];

function App() {
  const [activePage, setActivePage] = useState("home");

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [news, setNews] = useState([]);
  const [posts, setPosts] = useState([]);

  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const [profileImage, setProfileImage] = useState("");
  const [profileImagePreview, setProfileImagePreview] = useState("");

  const [postText, setPostText] = useState("");

  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");
  const [newsCategory, setNewsCategory] = useState("Allgemein");

  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedUsers = localStorage.getItem("ennstal_users");
    const savedUser = localStorage.getItem("ennstal_current_user");
    const savedNews = localStorage.getItem("ennstal_news");
    const savedPosts = localStorage.getItem("ennstal_posts");

    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }

    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    if (savedNews) {
      setNews(JSON.parse(savedNews));
    } else {
      setNews(starterNews);
      localStorage.setItem(
        "ennstal_news",
        JSON.stringify(starterNews)
      );
    }

    if (savedPosts) {
      setPosts(JSON.parse(savedPosts));
    } else {
      setPosts(starterPosts);
      localStorage.setItem(
        "ennstal_posts",
        JSON.stringify(starterPosts)
      );
    }
  }, []);

  function saveUsers(newUsers) {
    setUsers(newUsers);

    localStorage.setItem(
      "ennstal_users",
      JSON.stringify(newUsers)
    );
  }

  function saveNews(newNews) {
    setNews(newNews);

    localStorage.setItem(
      "ennstal_news",
      JSON.stringify(newNews)
    );
  }

  function savePosts(newPosts) {
    setPosts(newPosts);

    localStorage.setItem(
      "ennstal_posts",
      JSON.stringify(newPosts)
    );
  }

  function saveCurrentUser(updatedUser) {
    setUser(updatedUser);

    localStorage.setItem(
      "ennstal_current_user",
      JSON.stringify(updatedUser)
    );
  }

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function resetForm() {
    setEmail("");
    setPassword("");
    setNickname("");
    setProfileImage("");
    setProfileImagePreview("");
  }

  function handleProfileImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      showMessage(
        "Bitte nur JPG, PNG oder WEBP Bilder hochladen."
      );

      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      showMessage(
        "Das Profilbild darf maximal 5 MB groß sein."
      );

      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const imageData = reader.result;

      setProfileImage(imageData);
      setProfileImagePreview(imageData);
    };

    reader.readAsDataURL(file);
  }

  function register() {
    if (
      !nickname.trim() ||
      !email.trim() ||
      !password.trim()
    ) {
      showMessage("Bitte alle Felder ausfüllen.");
      return;
    }

    const emailExists = users.some(
      (existingUser) =>
        existingUser.email.toLowerCase() ===
        email.toLowerCase()
    );

    if (emailExists) {
      showMessage(
        "Diese E-Mail-Adresse ist bereits registriert."
      );
      return;
    }

    const isMainAdmin =
      email.toLowerCase() ===
      ADMIN_EMAIL.toLowerCase();

    const newUser = {
      id: Date.now(),
      nickname: nickname.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: isMainAdmin ? "admin" : "member",
      profileImage: profileImage || "",
      createdAt: new Date().toLocaleDateString("de-AT"),
    };

    const updatedUsers = [
      ...users,
      newUser,
    ];

    saveUsers(updatedUsers);
    saveCurrentUser(newUser);

    setRegisterOpen(false);
    resetForm();

    showMessage(
      isMainAdmin
        ? "Hauptadmin erfolgreich erstellt."
        : "Dein Konto wurde erfolgreich erstellt."
    );
  }

  function login() {
    if (!email.trim() || !password.trim()) {
      showMessage(
        "Bitte E-Mail-Adresse und Passwort eingeben."
      );
      return;
    }

    const foundUser = users.find(
      (existingUser) =>
        existingUser.email.toLowerCase() ===
          email.toLowerCase() &&
        existingUser.password === password
    );

    if (!foundUser) {
      showMessage(
        "E-Mail-Adresse oder Passwort ist falsch."
      );
      return;
    }

    saveCurrentUser(foundUser);

    setLoginOpen(false);

    setEmail("");
    setPassword("");

    showMessage(
      `Willkommen zurück, ${foundUser.nickname}!`
    );
  }

  function logout() {
    setUser(null);

    localStorage.removeItem(
      "ennstal_current_user"
    );

    setActivePage("home");

    showMessage(
      "Du wurdest erfolgreich abgemeldet."
    );
  }

  function createNews() {
    if (
      user?.role !== "admin" ||
      !newsTitle.trim() ||
      !newsContent.trim()
    ) {
      showMessage(
        "Bitte Titel und Inhalt der News ausfüllen."
      );
      return;
    }

    const newNewsItem = {
      id: Date.now(),
      title: newsTitle.trim(),
      content: newsContent.trim(),
      category: newsCategory,
      date: new Date().toLocaleDateString("de-AT"),
      author: user.nickname,
    };

    const updatedNews = [
      newNewsItem,
      ...news,
    ];

    saveNews(updatedNews);

    setNewsTitle("");
    setNewsContent("");
    setNewsCategory("Allgemein");

    showMessage(
      "News wurde erfolgreich veröffentlicht."
    );
  }

  function deleteNews(id) {
    if (user?.role !== "admin") {
      return;
    }

    const updatedNews = news.filter(
      (newsItem) => newsItem.id !== id
    );

    saveNews(updatedNews);

    showMessage("News wurde gelöscht.");
  }

  function createPost() {
    if (!user) {
      showMessage(
        "Bitte melde dich zuerst an."
      );
      return;
    }

    if (!postText.trim()) {
      showMessage(
        "Bitte schreibe zuerst einen Beitrag."
      );
      return;
    }

    const newPost = {
      id: Date.now(),
      name: user.nickname,
      role: user.role,
      profileImage: user.profileImage || "",
      text: postText.trim(),
      date: new Date().toLocaleDateString("de-AT"),
    };

    const updatedPosts = [
      newPost,
      ...posts,
    ];

    savePosts(updatedPosts);

    setPostText("");

    showMessage(
      "Dein Beitrag wurde veröffentlicht."
    );
  }

  function deletePost(id) {
    const postToDelete = posts.find(
      (post) => post.id === id
    );

    if (!postToDelete) {
      return;
    }

    if (
      user?.role !== "admin" &&
      user?.nickname !== postToDelete.name
    ) {
      showMessage(
        "Du darfst diesen Beitrag nicht löschen."
      );
      return;
    }

    const updatedPosts = posts.filter(
      (post) => post.id !== id
    );

    savePosts(updatedPosts);

    showMessage("Beitrag wurde gelöscht.");
  }

  function makeSupporter(userId) {
    if (user?.role !== "admin") {
      return;
    }

    const updatedUsers = users.map(
      (communityUser) => {
        if (communityUser.id !== userId) {
          return communityUser;
        }

        return {
          ...communityUser,
          role:
            communityUser.role === "supporter"
              ? "member"
              : "supporter",
        };
      }
    );

    saveUsers(updatedUsers);

    if (user?.id === userId) {
      const updatedCurrentUser =
        updatedUsers.find(
          (communityUser) =>
            communityUser.id === userId
        );

      saveCurrentUser(updatedCurrentUser);
    }

    showMessage(
      "Mitgliederstatus wurde aktualisiert."
    );
  }

  function renderStar(role) {
    if (role === "admin") {
      return (
        <img
          src="/Admin-star.png"
          alt="Admin"
          className="role-star"
        />
      );
    }

    if (role === "supporter") {
      return (
        <img
          src="/supporter-star.png"
          alt="Unterstützer"
          className="role-star"
        />
      );
    }

    return null;
  }

  function roleName(role) {
    if (role === "admin") {
      return "Administrator";
    }

    if (role === "supporter") {
      return "Unterstützer";
    }

    return "Mitglied";
  }

  function ProfileAvatar({
    image,
    name,
    role,
    className = "",
  }) {
    return (
      <div
        className={`user-avatar ${role || ""} ${className}`}
      >
        {image ? (
          <img
            src={image}
            alt={`${name} Profilbild`}
            className="profile-image"
          />
        ) : (
          <span>
            {name
              ? name.charAt(0).toUpperCase()
              : "?"}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <header className="site-header">
        <div className="header-container">

          <button
            className="brand"
            onClick={() =>
              setActivePage("home")
            }
          >
            <img
              src="/logo.png"
              alt="Ennstal Connect"
              className="logo"
            />
          </button>

          <nav className="main-nav">

            <button
              className={
                activePage === "home"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() =>
                setActivePage("home")
              }
            >
              Startseite
            </button>

            <button
              className={
                activePage === "news"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() =>
                setActivePage("news")
              }
            >
              News
            </button>

            <button
              className={
                activePage === "community"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() =>
                setActivePage("community")
              }
            >
              Community
            </button>

            {user?.role === "admin" && (
              <button
                className={
                  activePage === "admin"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() =>
                  setActivePage("admin")
                }
              >
                Admin
              </button>
            )}

          </nav>

          <div className="header-user">

            {!user ? (
              <>
                <button
                  className="login-button"
                  onClick={() =>
                    setLoginOpen(true)
                  }
                >
                  Anmelden
                </button>

                <button
                  className="register-button"
                  onClick={() =>
                    setRegisterOpen(true)
                  }
                >
                  Registrieren
                </button>
              </>
            ) : (
              <>
                <div
                  className={`user-badge ${user.role}`}
                >
                  <ProfileAvatar
                    image={user.profileImage}
                    name={user.nickname}
                    role={user.role}
                    className="header-avatar"
                  />

                  <span>
                    {user.nickname}
                  </span>

                  {renderStar(user.role)}
                </div>

                <button
                  className="logout-button"
                  onClick={logout}
                >
                  Abmelden
                </button>
              </>
            )}

          </div>

        </div>
      </header>

      {message && (
        <div className="toast">
          {message}
        </div>
      )}

      <main>

        {activePage === "home" && (
          <>
            <section className="hero">
              <div className="hero-overlay">
                <div className="hero-content">

                  <h1>
                    Willkommen bei
                    <span>
                      Ennstal Connect
                    </span>
                  </h1>

                  <p>
                    Die regionale Community für
                    Ennstal und Obersteiermark.
                  </p>

                  <button
                    className="hero-button"
                    onClick={() =>
                      setActivePage("community")
                    }
                  >
                    Community entdecken
                  </button>

                </div>
              </div>
            </section>

            <section className="section home-news">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    AKTUELL
                  </p>

                  <h2>
                    Neuigkeiten aus der Community
                  </h2>
                </div>

                <button
                  className="text-button"
                  onClick={() =>
                    setActivePage("news")
                  }
                >
                  Alle News ansehen
                </button>
              </div>

              <div className="news-grid">
                {news.slice(0, 3).map(
                  (newsItem) => (
                    <article
                      className="news-card"
                      key={newsItem.id}
                    >
                      <div className="news-category">
                        {newsItem.category}
                      </div>

                      <h3>
                        {newsItem.title}
                      </h3>

                      <p>
                        {newsItem.content}
                      </p>

                      <small>
                        {newsItem.date}
                      </small>
                    </article>
                  )
                )}
              </div>
            </section>

            <section className="section features">
              <div className="feature-card">
                <div className="feature-icon">
                  🌄
                </div>

                <h3>
                  Region entdecken
                </h3>

                <p>
                  Entdecke Menschen, Orte,
                  Veranstaltungen und Neuigkeiten
                  aus deiner Region.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  💬
                </div>

                <h3>
                  Gemeinsam austauschen
                </h3>

                <p>
                  Tausche dich mit anderen
                  Mitgliedern aus und teile
                  deine Beiträge.
                </p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  ⭐
                </div>

                <h3>
                  Unterstützen
                </h3>

                <p>
                  Unterstützer erhalten einen
                  eigenen grünen Stern neben
                  ihrem Namen.
                </p>
              </div>
            </section>
          </>
        )}

        {activePage === "news" && (
          <section className="section page-section">

            <div className="page-title">
              <p className="eyebrow">
                ENNSTAL CONNECT
              </p>

              <h1>
                News & Neuigkeiten
              </h1>

              <p>
                Alle öffentlich veröffentlichten
                Informationen aus unserer Community.
              </p>
            </div>

            {user?.role === "admin" && (
              <div className="admin-news-form">

                <h2>
                  Neue News veröffentlichen
                </h2>

                <input
                  type="text"
                  placeholder="Titel der News"
                  value={newsTitle}
                  onChange={(event) =>
                    setNewsTitle(
                      event.target.value
                    )
                  }
                />

                <select
                  value={newsCategory}
                  onChange={(event) =>
                    setNewsCategory(
                      event.target.value
                    )
                  }
                >
                  <option>
                    Allgemein
                  </option>

                  <option>
                    Veranstaltung
                  </option>

                  <option>
                    Wichtig
                  </option>

                  <option>
                    Community
                  </option>
                </select>

                <textarea
                  placeholder="Was möchtest du veröffentlichen?"
                  value={newsContent}
                  onChange={(event) =>
                    setNewsContent(
                      event.target.value
                    )
                  }
                />

                <button
                  className="primary-button"
                  onClick={createNews}
                >
                  News veröffentlichen
                </button>

              </div>
            )}

            <div className="news-list">

              {news.map((newsItem) => (
                <article
                  className="large-news-card"
                  key={newsItem.id}
                >

                  <div className="news-card-top">

                    <div className="news-category">
                      {newsItem.category}
                    </div>

                    {user?.role === "admin" && (
                      <button
                        className="delete-button"
                        onClick={() =>
                          deleteNews(newsItem.id)
                        }
                      >
                        Löschen
                      </button>
                    )}

                  </div>

                  <h2>
                    {newsItem.title}
                  </h2>

                  <p>
                    {newsItem.content}
                  </p>

                  <div className="card-footer">
                    <span>
                      {newsItem.date}
                    </span>

                    <span>
                      Veröffentlicht von{" "}
                      {newsItem.author}
                    </span>
                  </div>

                </article>
              ))}

            </div>

          </section>
        )}

        {activePage === "community" && (
          <section className="section page-section">

            <div className="page-title">

              <p className="eyebrow">
                COMMUNITY
              </p>

              <h1>
                Austausch mit der Region
              </h1>

              <p>
                Teile deine Gedanken,
                Informationen und Beiträge mit
                der Ennstal Connect Community.
              </p>

            </div>

            {user ? (
              <div className="create-post">

                <div className="create-post-user">
                  <ProfileAvatar
                    image={user.profileImage}
                    name={user.nickname}
                    role={user.role}
                  />

                  <div>
                    <strong>
                      {user.nickname}
                    </strong>

                    {renderStar(user.role)}
                  </div>
                </div>

                <textarea
                  placeholder="Was möchtest du mit der Community teilen?"
                  value={postText}
                  onChange={(event) =>
                    setPostText(event.target.value)
                  }
                />

                <button
                  className="primary-button"
                  onClick={createPost}
                >
                  Beitrag veröffentlichen
                </button>

              </div>
            ) : (
              <div className="login-hint">

                <h2>
                  Werde Teil der Community
                </h2>

                <p>
                  Melde dich an oder registriere
                  dich, um eigene Beiträge zu
                  veröffentlichen.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    setRegisterOpen(true)
                  }
                >
                  Jetzt registrieren
                </button>

              </div>
            )}

            <div className="posts-list">

              {posts.map((post) => (
                <article
                  className={`post-card ${post.role}`}
                  key={post.id}
                >

                  <div className="post-header">

                    <ProfileAvatar
                      image={post.profileImage}
                      name={post.name}
                      role={post.role}
                    />

                    <div className="post-user-info">

                      <div className="post-name">

                        <strong>
                          {post.name}
                        </strong>

                        {renderStar(post.role)}

                      </div>

                      <span>
                        {roleName(post.role)} ·{" "}
                        {post.date}
                      </span>

                    </div>

                    {user &&
                      (user.role === "admin" ||
                        user.nickname === post.name) && (
                        <button
                          className="delete-button"
                          onClick={() =>
                            deletePost(post.id)
                          }
                        >
                          Löschen
                        </button>
                      )}

                  </div>

                  <p className="post-text">
                    {post.text}
                  </p>

                </article>
              ))}

            </div>

          </section>
        )}

        {activePage === "admin" &&
          user?.role === "admin" && (
            <section className="section page-section">

              <div className="page-title">

                <p className="eyebrow">
                  VERWALTUNG
                </p>

                <h1>
                  Admin-Dashboard
                </h1>

                <p>
                  Verwalte Mitglieder, Unterstützer
                  und Inhalte deiner Community.
                </p>

              </div>

              <div className="admin-stats">

                <div className="stat-card">
                  <span>
                    Mitglieder
                  </span>

                  <strong>
                    {users.length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    News
                  </span>

                  <strong>
                    {news.length}
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    Beiträge
                  </span>

                  <strong>
                    {posts.length}
                  </strong>
                </div>

              </div>

              <div className="admin-users">

                <h2>
                  Mitglieder verwalten
                </h2>

                {users.length === 0 ? (
                  <p className="empty-state">
                    Noch keine registrierten Mitglieder.
                  </p>
                ) : (
                  users.map(
                    (communityUser) => (
                      <div
                        className={`admin-user-row ${communityUser.role}`}
                        key={communityUser.id}
                      >

                        <div className="admin-user-profile">

                          <ProfileAvatar
                            image={
                              communityUser.profileImage
                            }
                            name={
                              communityUser.nickname
                            }
                            role={
                              communityUser.role
                            }
                            className="admin-avatar"
                          />

                          <div>

                            <div className="admin-user-name">

                              <strong>
                                {
                                  communityUser.nickname
                                }
                              </strong>

                              {renderStar(
                                communityUser.role
                              )}

                            </div>

                            <span>
                              {
                                communityUser.email
                              }
                            </span>

                          </div>

                        </div>

                        {communityUser.role !==
                          "admin" && (
                          <button
                            className="supporter-button"
                            onClick={() =>
                              makeSupporter(
                                communityUser.id
                              )
                            }
                          >
                            {communityUser.role ===
                            "supporter"
                              ? "Unterstützer entfernen"
                              : "Als Unterstützer markieren"}
                          </button>
                        )}

                      </div>
                    )
                  )
                )}

              </div>

            </section>
          )}

        {activePage === "impressum" && (
          <section className="legal-page">

            <h1>
              Impressum
            </h1>

            <h2>
              Angaben gemäß § 5 ECG
            </h2>

            <p>
              Marco Egger
              <br />
              Waidbachstrasse
              <br />
              8700 Leoben
              <br />
              Österreich
            </p>

            <h2>
              Kontakt
            </h2>

            <p>
              E-Mail:
              <br />
              eggermarco@gmx.net
            </p>

            <h2>
              Verantwortlich für den Inhalt
            </h2>

            <p>
              Marco Egger
            </p>

            <h2>
              Haftung für Inhalte
            </h2>

            <p>
              Die Inhalte dieser Website werden
              mit größtmöglicher Sorgfalt erstellt.
              Für die Richtigkeit, Vollständigkeit
              und Aktualität der Inhalte kann jedoch
              keine Gewähr übernommen werden.
            </p>

            <h2>
              Urheberrecht
            </h2>

            <p>
              Die auf dieser Website erstellten
              Inhalte und Werke unterliegen dem
              Urheberrecht. Eine Verwendung außerhalb
              der gesetzlichen Grenzen bedarf der
              Zustimmung des jeweiligen Rechteinhabers.
            </p>

          </section>
        )}

        {activePage === "privacy" && (
          <section className="legal-page">

            <h1>
              Datenschutzerklärung
            </h1>

            <h2>
              Allgemeine Informationen
            </h2>

            <p>
              Der Schutz deiner persönlichen Daten
              ist uns wichtig. Personenbezogene Daten
              werden nur im Rahmen der gesetzlichen
              Bestimmungen verarbeitet.
            </p>

            <h2>
              Registrierung
            </h2>

            <p>
              Bei der Registrierung werden die von dir
              angegebenen Daten wie Nickname,
              E-Mail-Adresse und optional dein
              Profilbild zur Nutzung der Community
              verarbeitet.
            </p>

            <h2>
              Community-Inhalte
            </h2>

            <p>
              Beiträge, die du innerhalb der Community
              veröffentlichst, können für andere
              Besucher und Mitglieder sichtbar sein.
            </p>

            <h2>
              Deine Rechte
            </h2>

            <p>
              Du hast grundsätzlich das Recht auf
              Auskunft, Berichtigung, Löschung,
              Einschränkung, Datenübertragbarkeit
              und Widerspruch im Rahmen der geltenden
              Datenschutzbestimmungen.
            </p>

            <h2>
              Kontakt
            </h2>

            <p>
              Bei Fragen zum Datenschutz:
              <br />
              eggermarco@gmx.net
            </p>

          </section>
        )}

      </main>

      <footer className="site-footer">

        <div className="footer-content">

          <div>
            <img
              src="/logo.png"
              alt="Ennstal Connect"
              className="footer-logo"
            />

            <p>
              Die regionale Community für
              Ennstal und Obersteiermark.
            </p>
          </div>

          <div className="footer-links">

            <button
              onClick={() =>
                setActivePage("impressum")
              }
            >
              Impressum
            </button>

            <button
              onClick={() =>
                setActivePage("privacy")
              }
            >
              Datenschutz
            </button>

          </div>

        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()} Ennstal Connect
        </div>

      </footer>

      {loginOpen && (
        <div className="modal-overlay">

          <div className="modal">

            <button
              className="close-button"
              onClick={() => {
                setLoginOpen(false);
                setEmail("");
                setPassword("");
              }}
            >
              ×
            </button>

            <h2>
              Anmelden
            </h2>

            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button
              className="primary-button full-button"
              onClick={login}
            >
              Anmelden
            </button>

            <p>
              Noch kein Konto?
            </p>

            <button
              className="text-button"
              onClick={() => {
                setLoginOpen(false);
                setRegisterOpen(true);
              }}
            >
              Jetzt registrieren
            </button>

          </div>

        </div>
      )}

      {registerOpen && (
        <div className="modal-overlay">

          <div className="modal">

            <button
              className="close-button"
              onClick={() => {
                setRegisterOpen(false);
                resetForm();
              }}
            >
              ×
            </button>

            <h2>
              Registrieren
            </h2>

            <div className="profile-upload">

              <div className="profile-preview">

                {profileImagePreview ? (
                  <img
                    src={profileImagePreview}
                    alt="Profilbild Vorschau"
                    className="profile-image"
                  />
                ) : (
                  <span>
                    {nickname
                      ? nickname
                          .charAt(0)
                          .toUpperCase()
                      : "?"}
                  </span>
                )}

              </div>

              <label
                htmlFor="profile-image"
                className="profile-upload-label"
              >
                Profilbild auswählen
              </label>

              <input
                id="profile-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleProfileImageChange}
              />

              <small>
                JPG, PNG oder WEBP · maximal 5 MB
              </small>

            </div>

            <input
              type="text"
              placeholder="Dein Nickname"
              value={nickname}
              onChange={(event) =>
                setNickname(event.target.value)
              }
            />

            <input
              type="email"
              placeholder="E-Mail-Adresse"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button
              className="primary-button full-button"
              onClick={register}
            >
              Konto erstellen
            </button>

            <p className="small-text">
              Bei der Registrierung mit{" "}
              <strong>
                {ADMIN_EMAIL}
              </strong>{" "}
              wird automatisch der
              Hauptadmin-Account erstellt.
            </p>

          </div>

        </div>
      )}

    </>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
