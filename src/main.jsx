import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const ADMIN_EMAIL = "eggermarco@gmx.net";
const BLACK_NICKNAME_PRICE = 100;
const DEFAULT_AVATAR = "/no.pic.png";

const starterNews = [
  {
    id: 1,
    title: "Willkommen bei Ennstal Connect",
    content:
      "Die regionale Community für Ennstal und Obersteiermark ist online.",
    category: "Community",
    date: new Date().toLocaleDateString("de-AT"),
    author: "Ennstal Connect",
  },
];

const starterPosts = [
  {
    id: 1,
    userId: "system",
    name: "Ennstal Connect",
    role: "admin",
    text: "Willkommen in unserer Community! Wir freuen uns, dass du dabei bist.",
    date: new Date().toLocaleString("de-AT"),
    avatar: "",
  },
];

function App() {
  const [activePage, setActivePage] = useState("home");
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [news, setNews] = useState([]);
  const [posts, setPosts] = useState([]);

  const [selectedProfile, setSelectedProfile] = useState(null);
  const [memberSearch, setMemberSearch] = useState("");

  const [loginOpen, setLoginOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [postText, setPostText] = useState("");
  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");
  const [newsCategory, setNewsCategory] = useState("Allgemein");

  const [profileForm, setProfileForm] = useState({
    bio: "",
    location: "",
    interests: "",
    avatar: "",
  });

  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedUsers = localStorage.getItem("ennstal_users");
    const savedUser = localStorage.getItem("ennstal_current_user");
    const savedNews = localStorage.getItem("ennstal_news");
    const savedPosts = localStorage.getItem("ennstal_posts");

    let loadedUsers = [];

    if (savedUsers) {
      try {
        loadedUsers = JSON.parse(savedUsers).map((member) => ({
          ...member,
          firstName: member.firstName || "",
          lastName: member.lastName || "",
          birthDate: member.birthDate || "",
          nickname: member.nickname || "",
          email: member.email || "",
          role: member.role || "member",
          status: member.status || "approved",
          isOnline: member.isOnline || false,
          lastOnline: member.lastOnline || member.createdAt || "",
          avatar: member.avatar || "",
          bio: member.bio || "",
          location: member.location || "",
          interests: member.interests || "",
          communityPoints: Number(member.communityPoints || 0),
          buyPoints: Number(member.buyPoints || 0),
          hasBlackNickname: Boolean(member.hasBlackNickname),
          profileVisits: Number(member.profileVisits || 0),
        }));

        setUsers(loadedUsers);
      } catch {
        localStorage.removeItem("ennstal_users");
      }
    }

    if (savedUser) {
      try {
        const currentUser = JSON.parse(savedUser);

        const updatedUser = {
          ...currentUser,
          isOnline: true,
          lastOnline: new Date().toLocaleString("de-AT"),
        };

        setUser(updatedUser);

        const updatedUsers = loadedUsers.map((member) =>
          member.id === updatedUser.id
            ? { ...member, ...updatedUser }
            : member
        );

        setUsers(updatedUsers);

        localStorage.setItem(
          "ennstal_users",
          JSON.stringify(updatedUsers)
        );

        localStorage.setItem(
          "ennstal_current_user",
          JSON.stringify(updatedUser)
        );
      } catch {
        localStorage.removeItem("ennstal_current_user");
      }
    }

    if (savedNews) {
      try {
        setNews(JSON.parse(savedNews));
      } catch {
        setNews(starterNews);
      }
    } else {
      setNews(starterNews);
      localStorage.setItem(
        "ennstal_news",
        JSON.stringify(starterNews)
      );
    }

    if (savedPosts) {
      try {
        setPosts(JSON.parse(savedPosts));
      } catch {
        setPosts(starterPosts);
      }
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

  function showMessage(text) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function clearAuthFields() {
    setFirstName("");
    setLastName("");
    setNickname("");
    setBirthDate("");
    setEmail("");
    setPassword("");
  }

  function getAvatar(member) {
    return member?.avatar?.trim()
      ? member.avatar
      : DEFAULT_AVATAR;
  }

  function getNicknameColor(member) {
    if (member.role === "admin") {
      return "#d62828";
    }

    if (member.hasBlackNickname) {
      return "#111111";
    }

    return "#343434";
  }

  function roleName(role) {
    if (role === "admin") return "Administrator";
    if (role === "supporter") return "Unterstützer";

    return "Mitglied";
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

  function register() {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !nickname.trim() ||
      !birthDate ||
      !email.trim() ||
      !password.trim()
    ) {
      showMessage(
        "Bitte Vorname, Nachname, Nickname, Geburtsdatum, E-Mail und Passwort ausfüllen."
      );
      return;
    }

    const emailExists = users.some(
      (existingUser) =>
        existingUser.email.toLowerCase() ===
        email.trim().toLowerCase()
    );

    if (emailExists) {
      showMessage(
        "Diese E-Mail-Adresse ist bereits registriert."
      );
      return;
    }

    const nicknameExists = users.some(
      (existingUser) =>
        existingUser.nickname.toLowerCase() ===
        nickname.trim().toLowerCase()
    );

    if (nicknameExists) {
      showMessage(
        "Dieser Nickname ist bereits vergeben."
      );
      return;
    }

    const isMainAdmin =
      email.trim().toLowerCase() ===
      ADMIN_EMAIL.toLowerCase();

    const newUser = {
      id: Date.now(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim(),
      birthDate,
      email: email.trim().toLowerCase(),
      password,
      role: isMainAdmin ? "admin" : "member",
      status: isMainAdmin ? "approved" : "pending",
      createdAt: new Date().toLocaleDateString("de-AT"),
      isOnline: isMainAdmin,
      lastOnline: new Date().toLocaleString("de-AT"),

      avatar: "",
      bio: "",
      location: "",
      interests: "",

      communityPoints: 0,
      buyPoints: 0,
      hasBlackNickname: false,
      profileVisits: 0,
    };

    const updatedUsers = [...users, newUser];

    saveUsers(updatedUsers);

    clearAuthFields();
    setRegisterOpen(false);

    if (isMainAdmin) {
      setUser(newUser);

      localStorage.setItem(
        "ennstal_current_user",
        JSON.stringify(newUser)
      );

      showMessage(
        "Hauptadmin erfolgreich erstellt."
      );
    } else {
      showMessage(
        "Registrierung erfolgreich. Ein Admin muss dein Konto noch freigeben."
      );
    }
  }

  function login() {
    if (!email.trim() || !password.trim()) {
      showMessage(
        "Bitte E-Mail und Passwort eingeben."
      );
      return;
    }

    const foundUser = users.find(
      (member) =>
        member.email.toLowerCase() ===
          email.trim().toLowerCase() &&
        member.password === password
    );

    if (!foundUser) {
      showMessage(
        "E-Mail-Adresse oder Passwort ist falsch."
      );
      return;
    }

    if (foundUser.status !== "approved") {
      showMessage(
        "Dein Konto wurde noch nicht von einem Admin freigegeben."
      );
      return;
    }

    const updatedUser = {
      ...foundUser,
      isOnline: true,
      lastOnline: new Date().toLocaleString("de-AT"),
    };

    const updatedUsers = users.map((member) =>
      member.id === updatedUser.id
        ? updatedUser
        : member
    );

    saveUsers(updatedUsers);

    setUser(updatedUser);

    localStorage.setItem(
      "ennstal_current_user",
      JSON.stringify(updatedUser)
    );

    clearAuthFields();
    setLoginOpen(false);

    showMessage(
      `Willkommen zurück, ${updatedUser.nickname}!`
    );
  }

  function logout() {
    if (!user) return;

    const now = new Date().toLocaleString("de-AT");

    const updatedUsers = users.map((member) =>
      member.id === user.id
        ? {
            ...member,
            isOnline: false,
            lastOnline: now,
          }
        : member
    );

    saveUsers(updatedUsers);

    localStorage.removeItem(
      "ennstal_current_user"
    );

    setUser(null);
    setSelectedProfile(null);
    setActivePage("home");

    showMessage("Du wurdest abgemeldet.");
  }

  function openProfile(member) {
    if (!user) {
      showMessage(
        "Bitte melde dich an, um Mitgliederprofile zu öffnen."
      );
      return;
    }

    let profileToOpen = member;

    if (member.id !== user.id) {
      const updatedUsers = users.map((existingMember) =>
        existingMember.id === member.id
          ? {
              ...existingMember,
              profileVisits:
                Number(
                  existingMember.profileVisits || 0
                ) + 1,
            }
          : existingMember
      );

      saveUsers(updatedUsers);

      profileToOpen = updatedUsers.find(
        (existingMember) =>
          existingMember.id === member.id
      );
    }

    setSelectedProfile(profileToOpen);

    if (member.id === user.id) {
      setProfileForm({
        bio: profileToOpen.bio || "",
        location: profileToOpen.location || "",
        interests: profileToOpen.interests || "",
        avatar: profileToOpen.avatar || "",
      });
    }

    setActivePage("profile");
  }

  function openOwnProfile() {
    if (!user) return;

    setSelectedProfile(user);

    setProfileForm({
      bio: user.bio || "",
      location: user.location || "",
      interests: user.interests || "",
      avatar: user.avatar || "",
    });

    setActivePage("profile");
  }

  function handleAvatarUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMessage(
        "Bitte wähle eine gültige Bilddatei."
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setProfileForm((current) => ({
        ...current,
        avatar: reader.result,
      }));
    };

    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setProfileForm((current) => ({
      ...current,
      avatar: "",
    }));

    showMessage(
      "Profilbild entfernt. Nach dem Speichern wird wieder das Standardbild verwendet."
    );
  }

  function saveProfile() {
    if (!user) return;

    const updatedUser = {
      ...user,
      bio: profileForm.bio,
      location: profileForm.location,
      interests: profileForm.interests,
      avatar: profileForm.avatar || "",
    };

    const updatedUsers = users.map((member) =>
      member.id === user.id
        ? updatedUser
        : member
    );

    saveUsers(updatedUsers);

    setUser(updatedUser);

    localStorage.setItem(
      "ennstal_current_user",
      JSON.stringify(updatedUser)
    );

    setSelectedProfile(updatedUser);

    showMessage("Profil gespeichert.");
  }

  function createPost() {
    if (!user) {
      showMessage(
        "Bitte melde dich an, um Beiträge zu erstellen."
      );
      return;
    }

    if (!postText.trim()) {
      showMessage(
        "Bitte schreibe einen Beitrag."
      );
      return;
    }

    const newPost = {
      id: Date.now(),
      userId: user.id,
      name: user.nickname,
      role: user.role,
      hasBlackNickname: user.hasBlackNickname,
      avatar: user.avatar || "",
      text: postText.trim(),
      date: new Date().toLocaleString("de-AT"),
    };

    savePosts([newPost, ...posts]);

    setPostText("");

    showMessage(
      "Beitrag veröffentlicht."
    );
  }

  function deletePost(id) {
    savePosts(
      posts.filter(
        (post) => post.id !== id
      )
    );

    showMessage("Beitrag gelöscht.");
  }

  function createNews() {
    if (user?.role !== "admin") return;

    if (
      !newsTitle.trim() ||
      !newsContent.trim()
    ) {
      showMessage(
        "Bitte Titel und Inhalt eingeben."
      );
      return;
    }

    const newNews = {
      id: Date.now(),
      title: newsTitle.trim(),
      content: newsContent.trim(),
      category: newsCategory,
      date: new Date().toLocaleDateString("de-AT"),
      author: user.nickname,
    };

    saveNews([newNews, ...news]);

    setNewsTitle("");
    setNewsContent("");

    showMessage("News veröffentlicht.");
  }

  function deleteNews(id) {
    saveNews(
      news.filter(
        (newsItem) =>
          newsItem.id !== id
      )
    );

    showMessage("News gelöscht.");
  }

  function approveUser(id) {
    const updatedUsers = users.map((member) =>
      member.id === id
        ? {
            ...member,
            status: "approved",
          }
        : member
    );

    saveUsers(updatedUsers);

    showMessage("Mitglied freigegeben.");
  }

  function rejectUser(id) {
    const updatedUsers = users.map((member) =>
      member.id === id
        ? {
            ...member,
            status: "rejected",
            isOnline: false,
          }
        : member
    );

    saveUsers(updatedUsers);

    showMessage("Registrierung abgelehnt.");
  }

  function toggleSupporter(id) {
    const updatedUsers = users.map((member) => {
      if (member.id !== id) return member;

      if (member.role === "admin") {
        return member;
      }

      return {
        ...member,
        role:
          member.role === "supporter"
            ? "member"
            : "supporter",
      };
    });

    saveUsers(updatedUsers);

    showMessage(
      "Unterstützerstatus geändert."
    );
  }

  function changePoints(id, type, value) {
    const amount = Number(value);

    if (Number.isNaN(amount)) {
      showMessage("Bitte eine gültige Zahl eingeben.");
      return;
    }

    const updatedUsers = users.map((member) =>
      member.id === id
        ? {
            ...member,
            communityPoints:
              type === "community"
                ? amount
                : member.communityPoints,
            buyPoints:
              type === "buy"
                ? amount
                : member.buyPoints,
          }
        : member
    );

    saveUsers(updatedUsers);

    if (user?.id === id) {
      const updatedCurrentUser =
        updatedUsers.find(
          (member) => member.id === id
        );

      setUser(updatedCurrentUser);

      localStorage.setItem(
        "ennstal_current_user",
        JSON.stringify(updatedCurrentUser)
      );
    }

    showMessage("Punkte aktualisiert.");
  }

  function buyBlackNickname() {
    if (!user) {
      showMessage(
        "Bitte melde dich an."
      );
      return;
    }

    if (user.role === "admin") {
      showMessage(
        "Als Admin bleibt dein Nickname rot."
      );
      return;
    }

    if (user.hasBlackNickname) {
      showMessage(
        "Du besitzt bereits den schwarzen Nickname."
      );
      return;
    }

    if (
      Number(user.buyPoints || 0) <
      BLACK_NICKNAME_PRICE
    ) {
      showMessage(
        `Du benötigst ${BLACK_NICKNAME_PRICE} Kaufpunkte.`
      );
      return;
    }

    const updatedUser = {
      ...user,
      buyPoints:
        Number(user.buyPoints) -
        BLACK_NICKNAME_PRICE,
      hasBlackNickname: true,
    };

    const updatedUsers = users.map((member) =>
      member.id === user.id
        ? updatedUser
        : member
    );

    saveUsers(updatedUsers);

    setUser(updatedUser);

    localStorage.setItem(
      "ennstal_current_user",
      JSON.stringify(updatedUser)
    );

    showMessage(
      "Schwarze Nickname-Farbe erfolgreich gekauft!"
    );
  }

  const approvedUsers = useMemo(
    () =>
      users.filter(
        (member) =>
          member.status === "approved"
      ),
    [users]
  );

  const onlineUsers = useMemo(
    () =>
      approvedUsers.filter(
        (member) => member.isOnline
      ),
    [approvedUsers]
  );

  const filteredUsers = useMemo(() => {
    const search =
      memberSearch.toLowerCase().trim();

    if (!search) return approvedUsers;

    return approvedUsers.filter((member) =>
      [
        member.nickname,
        member.firstName,
        member.lastName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [approvedUsers, memberSearch]);

  function Nickname({
    member,
    clickable = true,
  }) {
    const canOpen =
      Boolean(user) && clickable;

    return (
      <span
        className={
          canOpen
            ? "clickable-nickname"
            : "nickname"
        }
        style={{
          color: getNicknameColor(member),
        }}
        onClick={() => {
          if (canOpen) {
            openProfile(member);
          }
        }}
      >
        {member.nickname}
        {renderStar(member.role)}
      </span>
    );
  }

  function MemberCard({ member, adminMode = false }) {
    return (
      <article
        className={`member-card ${member.role}`}
      >
        <div
          className="member-card-top"
          onClick={() => {
            if (!adminMode) {
              openProfile(member);
            }
          }}
        >
          <div className="avatar-wrap">
            <img
              src={getAvatar(member)}
              alt={member.nickname}
              className="member-avatar"
              onError={(event) => {
                event.currentTarget.src =
                  DEFAULT_AVATAR;
              }}
            />

            <span
              className={`status-dot ${
                member.isOnline
                  ? "online-dot"
                  : "offline-dot"
              }`}
            />
          </div>

          <div className="member-info">
            <h3>
              <Nickname member={member} />
            </h3>

            <p className="member-real-name">
              {member.firstName}{" "}
              {member.lastName}
            </p>

            <p>
              {roleName(member.role)}
            </p>

            <div className="member-points">
              <span>
                ⭐ {member.communityPoints || 0}
              </span>

              <span>
                🛒 {member.buyPoints || 0}
              </span>
            </div>

            {member.isOnline ? (
              <span className="online-status">
                🟢 Online
              </span>
            ) : (
              <span className="offline-status">
                ⚪ Zuletzt online:{" "}
                {member.lastOnline ||
                  "nicht verfügbar"}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="app">
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

            <button
              className={
                activePage === "members"
                  ? "nav-link active"
                  : "nav-link"
              }
              onClick={() =>
                setActivePage("members")
              }
            >
              Mitglieder
            </button>

            {user && (
              <button
                className={
                  activePage === "market"
                    ? "nav-link active"
                    : "nav-link"
                }
                onClick={() =>
                  setActivePage("market")
                }
              >
                Marktplatz
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
                  Mitglied werden
                </button>
              </>
            ) : (
              <>
                <button
                  className="user-badge"
                  onClick={openOwnProfile}
                >
                  <Nickname
                    member={user}
                    clickable={false}
                  />
                </button>

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
                  <p className="eyebrow">
                    DEINE REGION. DEINE COMMUNITY.
                  </p>

                  <h1>
                    Willkommen bei
                    <span>
                      Ennstal Connect
                    </span>
                  </h1>

                  <p>
                    Verbinde dich mit Menschen aus
                    deiner Region. Entdecke
                    Neuigkeiten, tausche dich aus
                    und finde spannende Angebote.
                  </p>

                  <button
                    className="hero-button"
                    onClick={() =>
                      setActivePage("members")
                    }
                  >
                    Community entdecken →
                  </button>
                </div>
              </div>
            </section>

            <section className="section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    LIVE
                  </p>

                  <h2>
                    Gerade online
                  </h2>
                </div>

                <span className="online-counter">
                  {onlineUsers.length} online
                </span>
              </div>

              <div className="members-grid">
                {onlineUsers.length === 0 ? (
                  <p className="empty-state">
                    Derzeit ist kein Mitglied online.
                  </p>
                ) : (
                  onlineUsers.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                    />
                  ))
                )}
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
            </div>

            {user?.role === "admin" && (
              <div className="admin-news-form">
                <h2>
                  Neue News veröffentlichen
                </h2>

                <input
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
                  <option>Allgemein</option>
                  <option>Veranstaltung</option>
                  <option>Wichtig</option>
                  <option>Community</option>
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
                          deleteNews(
                            newsItem.id
                          )
                        }
                      >
                        Löschen
                      </button>
                    )}
                  </div>

                  <h2>{newsItem.title}</h2>

                  <p>
                    {newsItem.content}
                  </p>

                  <div className="card-footer">
                    <span>
                      {newsItem.date}
                    </span>

                    <span>
                      von {newsItem.author}
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
            </div>

            {!user ? (
              <div className="restricted-box">
                <h2>
                  Community-Bereich
                </h2>

                <p>
                  Bitte melde dich an, um Beiträge
                  zu erstellen und Profile zu öffnen.
                </p>

                <button
                  className="primary-button"
                  onClick={() =>
                    setLoginOpen(true)
                  }
                >
                  Jetzt anmelden
                </button>
              </div>
            ) : (
              <>
                <div className="create-post">
                  <h2>
                    Neuen Beitrag erstellen
                  </h2>

                  <textarea
                    placeholder="Was möchtest du mit der Community teilen?"
                    value={postText}
                    onChange={(event) =>
                      setPostText(
                        event.target.value
                      )
                    }
                  />

                  <button
                    className="primary-button"
                    onClick={createPost}
                  >
                    Beitrag veröffentlichen
                  </button>
                </div>

                <div className="posts-list">
                  {posts.map((post) => (
                    <article
                      className="post-card"
                      key={post.id}
                    >
                      <div className="post-header">
                        <img
                          className="post-avatar"
                          src={
                            post.avatar ||
                            DEFAULT_AVATAR
                          }
                          alt={post.name}
                        />

                        <div className="post-user-info">
                          <strong>
                            {post.name}
                            {renderStar(post.role)}
                          </strong>

                          <span>
                            {roleName(post.role)} ·{" "}
                            {post.date}
                          </span>
                        </div>

                        {user &&
                          (user.role === "admin" ||
                            user.id ===
                              post.userId) && (
                            <button
                              className="delete-button"
                              onClick={() =>
                                deletePost(
                                  post.id
                                )
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
              </>
            )}
          </section>
        )}

        {activePage === "members" && (
          <section className="section page-section">
            <div className="page-title">
              <p className="eyebrow">
                COMMUNITY
              </p>

              <h1>
                Mitglieder
              </h1>

              <p>
                Finde Menschen aus deiner Region.
              </p>
            </div>

            <div className="member-search">
              <input
                type="text"
                placeholder="Vorname, Nachname oder Nickname suchen..."
                value={memberSearch}
                onChange={(event) =>
                  setMemberSearch(
                    event.target.value
                  )
                }
              />

              <span>
                {filteredUsers.length} Mitglieder
              </span>
            </div>

            <div className="members-grid">
              {(user
                ? filteredUsers
                : filteredUsers.filter(
                    (member) =>
                      member.isOnline
                  )
              ).map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                />
              ))}
            </div>

            {user?.role === "admin" && (
              <section className="admin-member-management">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">
                      VERWALTUNG
                    </p>

                    <h2>
                      Mitglieder verwalten
                    </h2>
                  </div>
                </div>

                <div className="admin-members-grid">
                  {users.map((member) => (
                    <article
                      className={`member-card admin-management-card ${member.role}`}
                      key={member.id}
                    >
                      <div className="member-card-top">
                        <div className="avatar-wrap">
                          <img
                            src={getAvatar(member)}
                            alt={member.nickname}
                            className="member-avatar"
                          />
                        </div>

                        <div className="member-info">
                          <h3>
                            <Nickname
                              member={member}
                            />
                          </h3>

                          <p>
                            {member.firstName}{" "}
                            {member.lastName}
                          </p>

                          <p>
                            Status: {member.status}
                          </p>

                          <p>
                            Profilbesuche:{" "}
                            {member.profileVisits ||
                              0}
                          </p>
                        </div>
                      </div>

                      <div className="admin-card-actions">
                        {member.status ===
                          "pending" && (
                          <>
                            <button
                              className="approve-button"
                              onClick={() =>
                                approveUser(
                                  member.id
                                )
                              }
                            >
                              Freigeben
                            </button>

                            <button
                              className="reject-button"
                              onClick={() =>
                                rejectUser(
                                  member.id
                                )
                              }
                            >
                              Ablehnen
                            </button>
                          </>
                        )}

                        {member.role !==
                          "admin" && (
                          <button
                            className="supporter-button"
                            onClick={() =>
                              toggleSupporter(
                                member.id
                              )
                            }
                          >
                            {member.role ===
                            "supporter"
                              ? "Unterstützer entfernen"
                              : "Als Unterstützer markieren"}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const value =
                              prompt(
                                "Neue Community-Punkte:",
                                member.communityPoints ||
                                  0
                              );

                            if (value !== null) {
                              changePoints(
                                member.id,
                                "community",
                                value
                              );
                            }
                          }}
                        >
                          Community-Punkte
                        </button>

                        <button
                          onClick={() => {
                            const value =
                              prompt(
                                "Neue Kaufpunkte:",
                                member.buyPoints ||
                                  0
                              );

                            if (value !== null) {
                              changePoints(
                                member.id,
                                "buy",
                                value
                              );
                            }
                          }}
                        >
                          Kaufpunkte
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>
        )}

        {activePage === "profile" &&
          selectedProfile && (
            <section className="section page-section profile-page">
              <button
                className="back-button"
                onClick={() =>
                  setActivePage("members")
                }
              >
                ← Zurück
              </button>

              <div
                className={`profile-card ${selectedProfile.role}`}
              >
                <div className="profile-header">
                  <div className="profile-avatar">
                    <img
                      src={getAvatar(
                        selectedProfile
                      )}
                      alt={
                        selectedProfile.nickname
                      }
                    />
                  </div>

                  <div>
                    <h1>
                      <Nickname
                        member={
                          selectedProfile
                        }
                        clickable={false}
                      />
                    </h1>

                    <p>
                      {roleName(
                        selectedProfile.role
                      )}
                    </p>

                    <div className="profile-points">
                      <span>
                        ⭐ Community-Punkte:{" "}
                        {selectedProfile.communityPoints ||
                          0}
                      </span>

                      <span>
                        🛒 Kaufpunkte:{" "}
                        {selectedProfile.buyPoints ||
                          0}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="profile-content">
                  <div className="profile-info-box">
                    <h3>
                      Name
                    </h3>

                    <p>
                      {selectedProfile.firstName}{" "}
                      {selectedProfile.lastName}
                    </p>
                  </div>

                  {selectedProfile.bio && (
                    <div className="profile-info-box">
                      <h3>
                        Über mich
                      </h3>

                      <p>
                        {selectedProfile.bio}
                      </p>
                    </div>
                  )}

                  {selectedProfile.location && (
                    <div className="profile-info-box">
                      <h3>
                        Wohnort / Region
                      </h3>

                      <p>
                        {selectedProfile.location}
                      </p>
                    </div>
                  )}

                  {selectedProfile.interests && (
                    <div className="profile-info-box">
                      <h3>
                        Interessen
                      </h3>

                      <p>
                        {selectedProfile.interests}
                      </p>
                    </div>
                  )}

                  <div className="profile-info-box">
                    <h3>
                      Mitglied seit
                    </h3>

                    <p>
                      {selectedProfile.createdAt}
                    </p>
                  </div>

                  <div className="profile-info-box">
                    <h3>
                      Profilbesuche
                    </h3>

                    <p>
                      {selectedProfile.profileVisits ||
                        0}
                    </p>
                  </div>

                  {user?.role === "admin" && (
                    <div className="admin-private-info">
                      <h3>
                        🔒 Admin-Informationen
                      </h3>

                      <p>
                        <strong>
                          E-Mail-Adresse:
                        </strong>

                        <br />

                        {selectedProfile.email}
                      </p>

                      <p>
                        <strong>
                          Geburtsdatum:
                        </strong>

                        <br />

                        {selectedProfile.birthDate ||
                          "Nicht vorhanden"}
                      </p>
                    </div>
                  )}
                </div>

                {user?.id ===
                  selectedProfile.id && (
                  <div className="profile-editor">
                    <h2>
                      Mein Profil bearbeiten
                    </h2>

                    <label>
                      Profilbild
                    </label>

                    <div className="profile-image-preview">
                      <img
                        src={
                          profileForm.avatar ||
                          DEFAULT_AVATAR
                        }
                        alt="Vorschau"
                      />
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={
                        handleAvatarUpload
                      }
                    />

                    <button
                      type="button"
                      className="delete-button"
                      onClick={removeAvatar}
                    >
                      Profilbild löschen
                    </button>

                    <p className="small-text">
                      Wenn du dein Profilbild löschst,
                      wird automatisch wieder dein
                      Standardbild angezeigt.
                    </p>

                    <label>
                      Über mich
                    </label>

                    <textarea
                      value={profileForm.bio}
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          bio:
                            event.target.value,
                        })
                      }
                    />

                    <label>
                      Wohnort / Region
                    </label>

                    <input
                      value={
                        profileForm.location
                      }
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          location:
                            event.target.value,
                        })
                      }
                    />

                    <label>
                      Interessen
                    </label>

                    <input
                      value={
                        profileForm.interests
                      }
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          interests:
                            event.target.value,
                        })
                      }
                    />

                    <button
                      className="primary-button"
                      onClick={saveProfile}
                    >
                      Profil speichern
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

        {activePage === "market" &&
          user && (
            <section className="section page-section">
              <div className="page-title">
                <p className="eyebrow">
                  MARKTPLATZ
                </p>

                <h1>
                  Persönliche Extras
                </h1>

                <p>
                  Verfügbare Kaufpunkte:{" "}
                  <strong>
                    {user.buyPoints || 0}
                  </strong>
                </p>
              </div>

              <div className="market-grid">
                <article className="market-card">
                  <div className="market-icon">
                    🎨
                  </div>

                  <h2>
                    Schwarzer Nickname
                  </h2>

                  <p>
                    Dein Nickname wird dauerhaft
                    schwarz angezeigt.
                  </p>

                  <strong className="market-price">
                    {BLACK_NICKNAME_PRICE} Kaufpunkte
                  </strong>

                  {user.role === "admin" ? (
                    <div className="owned-item">
                      Admins haben alle Extras.
                    </div>
                  ) : user.hasBlackNickname ? (
                    <div className="owned-item">
                      Bereits gekauft ✓
                    </div>
                  ) : (
                    <button
                      className="primary-button"
                      onClick={
                        buyBlackNickname
                      }
                    >
                      Kaufen
                    </button>
                  )}
                </article>
              </div>
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
              onClick={() =>
                setLoginOpen(false)
              }
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
                setEmail(
                  event.target.value
                )
              }
            />

            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
            />

            <button
              className="primary-button full-button"
              onClick={login}
            >
              Anmelden
            </button>
          </div>
        </div>
      )}

      {registerOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <button
              className="close-button"
              onClick={() =>
                setRegisterOpen(false)
              }
            >
              ×
            </button>

            <h2>
              Mitglied werden
            </h2>

            <input
              type="text"
              placeholder="Vorname *"
              value={firstName}
              required
              onChange={(event) =>
                setFirstName(
                  event.target.value
                )
              }
            />

            <input
              type="text"
              placeholder="Nachname *"
              value={lastName}
              required
              onChange={(event) =>
                setLastName(
                  event.target.value
                )
              }
            />

            <input
              type="text"
              placeholder="Nickname *"
              value={nickname}
              required
              onChange={(event) =>
                setNickname(
                  event.target.value
                )
              }
            />

            <label className="date-label">
              Geburtsdatum *
            </label>

            <input
              type="date"
              value={birthDate}
              required
              onChange={(event) =>
                setBirthDate(
                  event.target.value
                )
              }
            />

            <input
              type="email"
              placeholder="E-Mail-Adresse *"
              value={email}
              required
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
            />

            <input
              type="password"
              placeholder="Passwort *"
              value={password}
              required
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
            />

            <button
              className="primary-button full-button"
              onClick={register}
            >
              Konto erstellen
            </button>

            <p className="small-text">
              * Pflichtfelder. Neue Mitglieder
              müssen zuerst von einem Admin
              freigegeben werden.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
