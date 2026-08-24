import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const DEFAULT_AVATAR = "/default-avatar.png";

const getName = (member) =>
  member?.nickname ||
  [member?.first_name, member?.last_name]
    .filter(Boolean)
    .join(" ") ||
  "Mitglied";

const isAdmin = (role) =>
  role === "ADMIN" || role === "HEAD_ADMIN";

const isHeadAdmin = (role) =>
  role === "HEAD_ADMIN";

const getAge = (birthDate) => {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  const monthDiff =
    today.getMonth() - birth.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 &&
      today.getDate() < birth.getDate())
  ) {
    age--;
  }

  return age;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [page, setPage] = useState("home");

  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [messages, setMessages] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [history, setHistory] = useState([]);

  const [selectedMember, setSelectedMember] =
    useState(null);

  const [chatMember, setChatMember] =
    useState(null);

  const [messageText, setMessageText] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const showNotice = (text) => {
    setNotice(text);

    window.setTimeout(() => {
      setNotice("");
    }, 3500);
  };

  useEffect(() => {
    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user || null);

        if (session?.user) {
          await loadAll(session.user.id);
        } else {
          clearData();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const clearData = () => {
    setProfile(null);
    setMembers([]);
    setGroups([]);
    setEvents([]);
    setNews([]);
    setMessages([]);
    setFriendships([]);
    setHistory([]);
  };

  const loadSession = async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    setUser(session?.user || null);

    if (session?.user) {
      await loadAll(session.user.id);
    }
  };

  const loadAll = async (userId = user?.id) => {
    if (!userId) return;

    const [
      profileResult,
      membersResult,
      groupsResult,
      eventsResult,
      newsResult,
      messagesResult,
      friendshipsResult,
      historyResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("profiles")
        .select("*")
        .order("nickname"),

      supabase
        .from("groups")
        .select("*")
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("events")
        .select("*")
        .order("event_date", {
          ascending: true
        }),

      supabase
        .from("community_news")
        .select("*")
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("messages")
        .select("*")
        .or(
          `sender_id.eq.${userId},receiver_id.eq.${userId}`
        )
        .order("created_at", {
          ascending: true
        }),

      supabase
        .from("friendships")
        .select("*")
        .or(
          `requester_id.eq.${userId},receiver_id.eq.${userId}`
        ),

      supabase
        .from("point_history")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false
        })
    ]);

    if (!profileResult.error) {
      setProfile(profileResult.data);
    }

    if (!membersResult.error) {
      setMembers(membersResult.data || []);
    }

    if (!groupsResult.error) {
      setGroups(groupsResult.data || []);
    }

    if (!eventsResult.error) {
      setEvents(eventsResult.data || []);
    }

    if (!newsResult.error) {
      setNews(newsResult.data || []);
    }

    if (!messagesResult.error) {
      setMessages(messagesResult.data || []);
    }

    if (!friendshipsResult.error) {
      setFriendships(
        friendshipsResult.data || []
      );
    }

    if (!historyResult.error) {
      setHistory(historyResult.data || []);
    }
  };

  const memberById = (id) =>
    members.find(
      (member) => member.id === id
    );

  const friendshipWith = (memberId) =>
    friendships.find(
      (item) =>
        (item.requester_id === user?.id &&
          item.receiver_id === memberId) ||
        (item.receiver_id === user?.id &&
          item.requester_id === memberId)
    );

  const acceptedFriendIds = useMemo(
    () =>
      friendships
        .filter(
          (item) =>
            item.status === "ACCEPTED"
        )
        .map((item) =>
          item.requester_id === user?.id
            ? item.receiver_id
            : item.requester_id
        ),
    [friendships, user]
  );

  const friends = members.filter((member) =>
    acceptedFriendIds.includes(member.id)
  );

  const onlineMembers = members.filter(
    (member) => member.is_online
  );

  const login = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const email =
      formData.get("email");

    const password =
      formData.get("password");

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Erfolgreich angemeldet.");
  };

  const register = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const email =
      formData.get("email");

    const password =
      formData.get("password");

    const {
      data,
      error
    } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nickname:
              formData.get("nickname"),
            first_name:
              formData.get("first_name"),
            last_name:
              formData.get("last_name"),
            birth_date:
              formData.get("birth_date"),
            gender:
              formData.get("gender")
          }
        }
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    if (data.user) {
      showNotice(
        "Konto wurde erstellt."
      );
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const openMember = (member) => {
    if (!member) return;

    setSelectedMember(member);
  };

  const openChat = (member) => {
    if (!member) return;

    setChatMember(member);
    setPage("messages");
    setSelectedMember(null);
  };

  const requestFriend = async (member) => {
    if (!user || !member) return;

    const friendship =
      friendshipWith(member.id);

    if (
      friendship?.status === "ACCEPTED"
    ) {
      showNotice(
        "Ihr seid bereits Freunde."
      );
      return;
    }

    if (
      friendship?.status === "PENDING"
    ) {
      showNotice(
        "Eine Anfrage existiert bereits."
      );
      return;
    }

    const { error } =
      await supabase.rpc(
        "send_friend_request",
        {
          target_user: member.id
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Freundschaftsanfrage gesendet."
    );

    await loadAll();
  };

  const acceptFriend = async (friendship) => {
    const { error } =
      await supabase.rpc(
        "accept_friend_request",
        {
          friendship_id: friendship.id
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Freundschaft angenommen."
    );

    await loadAll();
  };

  const removeFriend = async (member) => {
    const friendship =
      friendshipWith(member.id);

    if (!friendship) return;

    if (
      !window.confirm(
        `Freundschaft mit ${getName(
          member
        )} entfernen?`
      )
    ) {
      return;
    }

    const { error } =
      await supabase
        .from("friendships")
        .delete()
        .eq("id", friendship.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Freundschaft wurde entfernt."
    );

    await loadAll();
  };

  const sendMessage = async (event) => {
    event.preventDefault();

    if (
      !chatMember ||
      !messageText.trim()
    ) {
      return;
    }

    const { error } =
      await supabase.rpc(
        "send_private_message",
        {
          target_user:
            chatMember.id,
          message_text:
            messageText.trim()
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    setMessageText("");

    await loadAll();
  };

  const createGroup = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("groups")
        .insert({
          name:
            formData.get("name"),
          description:
            formData.get("description"),
          image_url:
            formData.get("image_url"),
          created_by:
            user.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Gruppe wurde erstellt."
    );

    await loadAll();
  };

  const createEvent = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("events")
        .insert({
          title:
            formData.get("title"),
          description:
            formData.get("description"),
          location:
            formData.get("location"),
          event_date:
            formData.get("event_date"),
          creator_id:
            user.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Event wurde erstellt."
    );

    await loadAll();
  };

  const createNews = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("community_news")
        .insert({
          title:
            formData.get("title"),
          content:
            formData.get("content"),
          author_id:
            user.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Neuigkeit veröffentlicht."
    );

    await loadAll();
  };

  const changeRole = async (
    member,
    newRole
  ) => {
    if (
      !isHeadAdmin(profile?.role)
    ) {
      showNotice(
        "Nur der Hauptadmin darf Rollen ändern."
      );
      return;
    }

    const { error } =
      await supabase.rpc(
        "admin_set_role",
        {
          target_user: member.id,
          new_role: newRole
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      `${getName(
        member
      )} ist jetzt ${newRole}.`
    );

    await loadAll();

    setSelectedMember((current) =>
      current
        ? {
            ...current,
            role: newRole
          }
        : current
    );
  };

  const changePoints = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const targetUser =
      formData.get("user_id");

    const amount = Number(
      formData.get("points")
    );

    const reason =
      formData.get("reason");

    if (
      !targetUser ||
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      showNotice(
        "Bitte gültige Daten eingeben."
      );
      return;
    }

    const { error } =
      await supabase.rpc(
        "admin_change_points",
        {
          target_user: targetUser,
          delta: Math.trunc(amount),
          change_kind:
            amount > 0
              ? "ADD"
              : "REMOVE",
          reason_text: reason
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Punkte wurden geändert."
    );

    event.currentTarget.reset();

    await loadAll();
  };

  const updateProfile = async (event) => {
    event.preventDefault();

    const formData =
      new FormData(event.currentTarget);

    const payload = {
      nickname:
        formData.get("nickname"),
      first_name:
        formData.get("first_name"),
      last_name:
        formData.get("last_name"),
      location:
        formData.get("location"),
      interests:
        formData.get("interests"),
      bio:
        formData.get("bio"),
      website:
        formData.get("website")
    };

    const { error } =
      await supabase.rpc(
        "update_my_profile",
        payload
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Profil gespeichert."
    );

    await loadAll();
  };

  const filteredMembers =
    members.filter((member) =>
      getName(member)
        .toLowerCase()
        .includes(
          search.toLowerCase()
        )
    );

  if (!user) {
    return (
      <Auth
        login={login}
        register={register}
      />
    );
  }

  return (
    <div className="app-shell">

      {notice && (
        <div className="notice">
          {notice}
        </div>
      )}

      <aside className="sidebar">

        <div className="brand">
          <img
            src="/banner.png"
            alt="Ennstal Connect"
          />

          <div>
            <strong>
              Ennstal Connect
            </strong>

            <small>
              Deine Community
            </small>
          </div>
        </div>

        <nav className="main-nav">

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
            🏠
            <span>
              Startseite
            </span>
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
            👥
            <span>
              Mitglieder
            </span>
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
            👥
            <span>
              Gruppen
            </span>
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
            📅
            <span>
              Events
            </span>
          </button>

          <button
            className={
              page === "messages"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("messages")
            }
          >
            💬
            <span>
              Nachrichten
            </span>
          </button>

        </nav>

        <div className="sidebar-label">
          MEIN BEREICH
        </div>

        <nav className="main-nav">

          <button
            onClick={() =>
              setPage("profile")
            }
          >
            👤
            <span>
              Mein Profil
            </span>
          </button>

          <button
            onClick={() =>
              setPage("friends")
            }
          >
            🤝
            <span>
              Freunde
            </span>

            <b>
              {friends.length}
            </b>
          </button>

          <button
            onClick={() =>
              setPage("points")
            }
          >
            ⭐
            <span>
              Punkte
            </span>

            <b>
              {profile?.community_points || 0}
            </b>
          </button>

        </nav>

        {isAdmin(profile?.role) && (
          <>
            <div className="sidebar-label">
              ADMIN
            </div>

            <nav className="main-nav">
              <button
                onClick={() =>
                  setPage("admin")
                }
              >
                🛡️
                <span>
                  Verwaltung
                </span>
              </button>
            </nav>
          </>
        )}

        <div className="sidebar-profile">

          <button
            onClick={() =>
              setPage("profile")
            }
          >
            <img
              src={
                profile?.avatar_url ||
                DEFAULT_AVATAR
              }
              alt=""
            />

            <span>
              <strong>
                {getName(profile)}
              </strong>

              <small>
                ● Online
              </small>
            </span>
          </button>

          <button
            className="logout-button"
            onClick={logout}
          >
            ↪
          </button>

        </div>

      </aside>

      <main className="main-content">

        {page === "home" && (
          <Home
            profile={profile}
            friends={friends}
            onlineMembers={onlineMembers}
            news={news}
            groups={groups}
            events={events}
            setPage={setPage}
            createNews={createNews}
          />
        )}

        {page === "members" && (
          <section className="page">

            <PageHeading
              eyebrow="COMMUNITY"
              title="Mitglieder"
              text="Entdecke Mitglieder deiner Community."
            />

            <input
              className="search-input"
              placeholder="Mitglied suchen..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />

            <div className="member-grid">

              {filteredMembers.map(
                (member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    profile={profile}
                    friendship={
                      friendshipWith(member.id)
                    }
                    onOpen={openMember}
                    onMessage={openChat}
                    onFriend={requestFriend}
                  />
                )
              )}

            </div>

          </section>
        )}

        {page === "friends" && (
          <section className="page">

            <PageHeading
              eyebrow="DEINE COMMUNITY"
              title="Meine Freunde"
              text={`${friends.length} Freundschaften`}
            />

            <div className="member-grid">

              {friends.map((member) => (
                <article
                  className="member-card"
                  key={member.id}
                >

                  <button
                    className="card-profile-button"
                    onClick={() =>
                      openMember(member)
                    }
                  >

                    <img
                      src={
                        member.avatar_url ||
                        DEFAULT_AVATAR
                      }
                      alt=""
                      className="member-avatar"
                    />

                    <strong>
                      {getName(member)}
                    </strong>

                    <small>
                      {member.is_online
                        ? "● Online"
                        : "● Offline"}
                    </small>

                  </button>

                  <div className="card-actions">

                    <button
                      onClick={() =>
                        openChat(member)
                      }
                    >
                      💬 Nachricht
                    </button>

                    <button
                      className="danger-outline"
                      onClick={() =>
                        removeFriend(member)
                      }
                    >
                      ✕ Freund entfernen
                    </button>

                  </div>

                </article>
              ))}

              {!friends.length && (
                <div className="empty-card">
                  Du hast noch keine Freunde.
                </div>
              )}

            </div>

          </section>
        )}

        {page === "groups" && (
          <section className="page">

            <PageHeading
              eyebrow="GEMEINSCHAFT"
              title="Gruppen"
              text="Finde deine Gemeinschaft."
            />

            <form
              className="form-card"
              onSubmit={createGroup}
            >

              <h2>
                Neue Gruppe
              </h2>

              <input
                name="name"
                placeholder="Gruppenname"
                required
              />

              <textarea
                name="description"
                placeholder="Beschreibung"
              />

              <input
                name="image_url"
                placeholder="Bild URL"
              />

              <button className="primary-button">
                Gruppe erstellen
              </button>

            </form>

            <div className="content-grid">

              {groups.map((group) => (
                <article
                  className="content-card"
                  key={group.id}
                >

                  <img
                    className="content-image"
                    src={
                      group.image_url ||
                      DEFAULT_AVATAR
                    }
                    alt=""
                  />

                  <div>

                    <h2>
                      {group.name}
                    </h2>

                    <p>
                      {group.description ||
                        "Keine Beschreibung vorhanden."}
                    </p>

                    <button className="secondary-button">
                      👥 Gruppe ansehen
                    </button>

                  </div>

                </article>
              ))}

            </div>

          </section>
        )}

        {page === "events" && (
          <section className="page">

            <PageHeading
              eyebrow="COMMUNITY"
              title="Events"
              text="Gemeinsam etwas erleben."
            />

            {isAdmin(profile?.role) && (
              <form
                className="form-card"
                onSubmit={createEvent}
              >

                <h2>
                  Neues Event
                </h2>

                <input
                  name="title"
                  placeholder="Titel"
                  required
                />

                <textarea
                  name="description"
                  placeholder="Beschreibung"
                />

                <input
                  name="location"
                  placeholder="Ort"
                />

                <input
                  type="datetime-local"
                  name="event_date"
                  required
                />

                <button className="primary-button">
                  Event erstellen
                </button>

              </form>
            )}

            <div className="content-grid">

              {events.map((event) => (
                <article
                  className="content-card"
                  key={event.id}
                >

                  <div className="event-icon">
                    📅
                  </div>

                  <div>

                    <h2>
                      {event.title}
                    </h2>

                    <p>
                      {event.description}
                    </p>

                    <small>
                      📍{" "}
                      {event.location ||
                        "Ort offen"}

                      <br />

                      🕒{" "}

                      {new Date(
                        event.event_date ||
                          event.starts_at
                      ).toLocaleString(
                        "de-AT"
                      )}
                    </small>

                  </div>

                </article>
              ))}

            </div>

          </section>
        )}

        {page === "messages" && (
          <section className="page messages-page">

            <PageHeading
              eyebrow="DEINE COMMUNITY"
              title="Nachrichten"
              text="Bleib mit deiner Community in Kontakt."
            />

            {!chatMember && (
              <div className="message-list">

                {messages
                  .filter(
                    (message) =>
                      message.receiver_id ===
                      user.id
                  )
                  .map((message) => {
                    const sender =
                      memberById(
                        message.sender_id
                      );

                    return (
                      <button
                        className="message-preview"
                        key={message.id}
                        onClick={() =>
                          sender &&
                          openChat(sender)
                        }
                      >

                        <img
                          src={
                            sender?.avatar_url ||
                            DEFAULT_AVATAR
                          }
                          alt=""
                        />

                        <span>

                          <strong>
                            {sender
                              ? getName(sender)
                              : "Mitglied"}
                          </strong>

                          <small>
                            {message.content}
                          </small>

                        </span>

                      </button>
                    );
                  })}

              </div>
            )}

            {chatMember && (
              <div className="chat-layout">

                <div className="chat-header">

                  <button
                    onClick={() =>
                      setChatMember(null)
                    }
                  >
                    ←
                  </button>

                  <img
                    src={
                      chatMember.avatar_url ||
                      DEFAULT_AVATAR
                    }
                    alt=""
                  />

                  <strong>
                    {getName(chatMember)}
                  </strong>

                </div>

                <div className="chat-messages">

                  {messages
                    .filter(
                      (message) =>
                        (message.sender_id ===
                          user.id &&
                          message.receiver_id ===
                            chatMember.id) ||
                        (message.sender_id ===
                          chatMember.id &&
                          message.receiver_id ===
                            user.id)
                    )
                    .map((message) => (
                      <div
                        key={message.id}
                        className={
                          `chat-bubble ${
                            message.sender_id ===
                            user.id
                              ? "mine"
                              : ""
                          }`
                        }
                      >
                        {message.content}
                      </div>
                    ))}

                </div>

                <form
                  className="chat-form"
                  onSubmit={sendMessage}
                >

                  <textarea
                    value={messageText}
                    onChange={(event) =>
                      setMessageText(
                        event.target.value
                      )
                    }
                    placeholder="Nachricht schreiben..."
                  />

                  <button className="primary-button">
                    Senden
                  </button>

                </form>

              </div>
            )}

          </section>
        )}

        {page === "profile" && (
          <section className="page">

            <PageHeading
              eyebrow="MEIN BEREICH"
              title="Mein Profil"
              text="Gestalte dein persönliches Profil."
            />

            <div className="profile-page-layout">

              <article className="profile-showcase">

                <img
                  className="profile-large-avatar"
                  src={
                    profile?.avatar_url ||
                    DEFAULT_AVATAR
                  }
                  alt=""
                />

                <div>

                  <span className="role-badge">
                    {profile?.role ===
                    "HEAD_ADMIN"
                      ? "★ Hauptadmin"
                      : profile?.role ===
                        "ADMIN"
                      ? "★ Admin"
                      : profile?.role ===
                        "SUPPORTER"
                      ? "★ Supporter"
                      : "Mitglied"}
                  </span>

                  <h1>
                    {getName(profile)}
                  </h1>

                  <p>
                    {profile?.bio ||
                      "Noch keine Beschreibung."}
                  </p>

                </div>

              </article>

              <form
                className="form-card"
                onSubmit={updateProfile}
              >

                <h2>
                  Profil bearbeiten
                </h2>

                <input
                  name="nickname"
                  defaultValue={
                    profile?.nickname || ""
                  }
                  placeholder="Nickname"
                />

                <input
                  name="first_name"
                  defaultValue={
                    profile?.first_name || ""
                  }
                  placeholder="Vorname"
                />

                <input
                  name="last_name"
                  defaultValue={
                    profile?.last_name || ""
                  }
                  placeholder="Nachname"
                />

                <input
                  name="location"
                  defaultValue={
                    profile?.location || ""
                  }
                  placeholder="Wohnort"
                />

                <input
                  name="interests"
                  defaultValue={
                    profile?.interests || ""
                  }
                  placeholder="Interessen"
                />

                <textarea
                  name="bio"
                  defaultValue={
                    profile?.bio || ""
                  }
                  placeholder="Über mich"
                />

                <input
                  name="website"
                  defaultValue={
                    profile?.website || ""
                  }
                  placeholder="Website"
                />

                <button className="primary-button">
                  Änderungen speichern
                </button>

              </form>

            </div>

          </section>
        )}

        {page === "points" && (
          <section className="page">

            <PageHeading
              eyebrow="MEINE COMMUNITY"
              title="Meine Punkte"
              text="Dein Punkteverlauf."
            />

            <div className="points-total">

              <span>
                Aktueller Punktestand
              </span>

              <strong>
                {profile?.community_points ||
                  0}
              </strong>

              <small>
                Punkte
              </small>

            </div>

            <div className="point-list">

              {history.map((item) => {
                const delta =
                  item.delta ??
                  item.community_points_change ??
                  0;

                return (
                  <article
                    key={item.id}
                    className={
                      `point-row ${
                        delta >= 0
                          ? "positive"
                          : "negative"
                      }`
                    }
                  >

                    <strong>
                      {delta > 0
                        ? "+"
                        : ""}
                      {delta}
                    </strong>

                    <span>
                      {item.reason}
                    </span>

                    <small>
                      {new Date(
                        item.created_at
                      ).toLocaleString(
                        "de-AT"
                      )}
                    </small>

                  </article>
                );
              })}

            </div>

          </section>
        )}

        {page === "admin" &&
          isAdmin(profile?.role) && (
            <section className="page">

              <PageHeading
                eyebrow="★ VERWALTUNG"
                title="Admin-Bereich"
                text="Mitglieder und Community verwalten."
              />

              <div className="admin-stats">

                <StatCard
                  label="Mitglieder"
                  value={members.length}
                />

                <StatCard
                  label="Online"
                  value={onlineMembers.length}
                />

                <StatCard
                  label="Supporter"
                  value={
                    members.filter(
                      (member) =>
                        member.role ===
                        "SUPPORTER"
                    ).length
                  }
                />

              </div>

              <form
                className="form-card"
                onSubmit={changePoints}
              >

                <h2>
                  ⭐ Punkte verwalten
                </h2>

                <select
                  name="user_id"
                  required
                >

                  <option value="">
                    Mitglied auswählen
                  </option>

                  {members.map(
                    (member) => (
                      <option
                        key={member.id}
                        value={member.id}
                      >
                        {getName(member)}
                      </option>
                    )
                  )}

                </select>

                <input
                  type="number"
                  name="points"
                  placeholder="+10 oder -10"
                  required
                />

                <textarea
                  name="reason"
                  placeholder="Begründung"
                  required
                />

                <button className="primary-button">
                  Punkte ändern
                </button>

              </form>

              <div className="admin-members">

                <h2>
                  Mitglieder verwalten
                </h2>

                {members.map(
                  (member) => (
                    <article
                      className="admin-member"
                      key={member.id}
                    >

                      <img
                        src={
                          member.avatar_url ||
                          DEFAULT_AVATAR
                        }
                        alt=""
                      />

                      <div className="admin-member-info">

                        <strong>
                          {getName(member)}
                        </strong>

                        <small>
                          {member.role ||
                            "MEMBER"}
                        </small>

                      </div>

                      {isHeadAdmin(
                        profile?.role
                      ) &&
                        member.id !==
                          profile.id && (
                          <select
                            value={
                              member.role ===
                              "HEAD_ADMIN"
                                ? "HEAD_ADMIN"
                                : member.role ||
                                  "MEMBER"
                            }
                            onChange={(event) =>
                              changeRole(
                                member,
                                event.target.value
                              )
                            }
                          >

                            <option value="MEMBER">
                              Mitglied
                            </option>

                            <option value="SUPPORTER">
                              Supporter
                            </option>

                            <option value="ADMIN">
                              Admin
                            </option>

                          </select>
                        )}

                      <button
                        onClick={() =>
                          openMember(member)
                        }
                      >
                        👤 Profil
                      </button>

                    </article>
                  )
                )}

              </div>

            </section>
          )}

      </main>

      {selectedMember && (
        <MemberModal
          member={selectedMember}
          profile={profile}
          friendship={
            friendshipWith(
              selectedMember.id
            )
          }
          onClose={() =>
            setSelectedMember(null)
          }
          onMessage={() =>
            openChat(selectedMember)
          }
          onFriend={() =>
            requestFriend(selectedMember)
          }
          onRemoveFriend={() =>
            removeFriend(selectedMember)
          }
          onAcceptFriend={(friendship) =>
            acceptFriend(friendship)
          }
          onChangeRole={changeRole}
        />
      )}

    </div>
  );
}

function Home({
  profile,
  friends,
  onlineMembers,
  news,
  groups,
  events,
  setPage,
  createNews
}) {
  return (
    <section className="page home-page">

      <div className="hero-card">

        <div>

          <span className="eyebrow">
            ENNSTAL CONNECT
          </span>

          <h1>
            Willkommen,{" "}
            {getName(profile)}
          </h1>

          <p>
            Deine regionale Community auf
            einen Blick.
          </p>

        </div>

        <img
          src={
            profile?.avatar_url ||
            DEFAULT_AVATAR
          }
          alt=""
        />

      </div>

      <div className="quick-grid">

        <button
          onClick={() =>
            setPage("friends")
          }
        >
          <span>🤝</span>
          <strong>
            {friends.length}
          </strong>
          Freunde
        </button>

        <button
          onClick={() =>
            setPage("members")
          }
        >
          <span>🟢</span>
          <strong>
            {onlineMembers.length}
          </strong>
          Online
        </button>

        <button
          onClick={() =>
            setPage("groups")
          }
        >
          <span>👥</span>
          <strong>
            {groups.length}
          </strong>
          Gruppen
        </button>

        <button
          onClick={() =>
            setPage("events")
          }
        >
          <span>📅</span>
          <strong>
            {events.length}
          </strong>
          Events
        </button>

      </div>

      <section className="home-section">

        <div className="section-title">

          <div>
            <span className="eyebrow">
              AKTUELL
            </span>

            <h2>
              Neuigkeiten
            </h2>
          </div>

        </div>

        {isAdmin(profile?.role) && (
          <form
            className="form-card compact"
            onSubmit={createNews}
          >

            <input
              name="title"
              placeholder="Überschrift"
              required
            />

            <textarea
              name="content"
              placeholder="Neuigkeit"
              required
            />

            <button className="primary-button">
              Veröffentlichen
            </button>

          </form>
        )}

        <div className="news-grid">

          {news.slice(0, 6).map(
            (item) => (
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

                <small>
                  {new Date(
                    item.created_at
                  ).toLocaleString(
                    "de-AT"
                  )}
                </small>

              </article>
            )
          )}

          {!news.length && (
            <div className="empty-card">
              Noch keine Neuigkeiten.
            </div>
          )}

        </div>

      </section>

    </section>
  );
}

function PageHeading({
  eyebrow,
  title,
  text
}) {
  return (
    <div className="page-heading">

      <span className="eyebrow">
        {eyebrow}
      </span>

      <h1>
        {title}
      </h1>

      {text && (
        <p>
          {text}
        </p>
      )}

    </div>
  );
}

function StatCard({
  label,
  value
}) {
  return (
    <div className="stat-card">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}

function MemberCard({
  member,
  profile,
  friendship,
  onOpen,
  onMessage,
  onFriend
}) {
  const isFriend =
    friendship?.status === "ACCEPTED";

  return (
    <article className="member-card">

      <button
        className="card-profile-button"
        onClick={() =>
          onOpen(member)
        }
      >

        <div className="member-avatar-wrap">

          <img
            src={
              member.avatar_url ||
              DEFAULT_AVATAR
            }
            alt=""
            className="member-avatar"
          />

          <span
            className={
              member.is_online
                ? "online-dot"
                : "offline-dot"
            }
          />

        </div>

        <strong>
          {isAdmin(member.role) &&
            "★ "}
          {member.role ===
            "SUPPORTER" && "✦ "}
          {getName(member)}
        </strong>

        <small>
          {[
            member.first_name,
            member.last_name
          ]
            .filter(Boolean)
            .join(" ")}

          {getAge(member.birth_date) !==
            null &&
            ` · ${getAge(
              member.birth_date
            )}`}
        </small>

      </button>

      {member.id !== profile?.id && (
        <div className="card-actions">

          <button
            onClick={() =>
              onMessage(member)
            }
          >
            💬
          </button>

          <button
            className={
              isFriend
                ? "friend-active"
                : ""
            }
            onClick={() =>
              onFriend(member)
            }
          >
            {isFriend
              ? "♥ Freund"
              : "♡ Freund"}
          </button>

        </div>
      )}

    </article>
  );
}

function MemberModal({
  member,
  profile,
  friendship,
  onClose,
  onMessage,
  onFriend,
  onRemoveFriend,
  onAcceptFriend,
  onChangeRole
}) {
  const isFriend =
    friendship?.status === "ACCEPTED";

  const pendingIncoming =
    friendship?.status === "PENDING" &&
    friendship.receiver_id === profile?.id;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >

      <div
        className="profile-modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >

        <button
          className="modal-close"
          onClick={onClose}
        >
          ×
        </button>

        <div className="modal-profile-header">

          <img
            src={
              member.avatar_url ||
              DEFAULT_AVATAR
            }
            alt=""
            className="modal-avatar"
          />

          <div>

            <span className="role-badge">

              {member.role ===
              "HEAD_ADMIN"
                ? "★ Hauptadmin"
                : member.role ===
                  "ADMIN"
                ? "★ Admin"
                : member.role ===
                  "SUPPORTER"
                ? "✦ Supporter"
                : "Mitglied"}

            </span>

            <h1>
              {getName(member)}
            </h1>

            <p>
              {member.is_online
                ? "● Online"
                : "● Offline"}
            </p>

          </div>

        </div>

        <div className="modal-content">

          <div className="profile-data">

            <div>
              <span>
                Wohnort
              </span>

              <strong>
                {member.location ||
                  "—"}
              </strong>
            </div>

            <div>
              <span>
                Alter
              </span>

              <strong>
                {getAge(
                  member.birth_date
                ) ?? "—"}
              </strong>
            </div>

            <div>
              <span>
                Interessen
              </span>

              <strong>
                {member.interests ||
                  "—"}
              </strong>
            </div>

          </div>

          {member.bio && (
            <section>

              <h2>
                Über mich
              </h2>

              <p>
                {member.bio}
              </p>

            </section>
          )}

          {member.id !== profile?.id && (
            <div className="profile-actions">

              <button
                className="primary-button"
                onClick={onMessage}
              >
                💬 Nachricht
              </button>

              {!isFriend &&
                !pendingIncoming && (
                  <button
                    className="secondary-button"
                    onClick={onFriend}
                  >
                    ♡ Freundschaftsanfrage
                  </button>
                )}

              {pendingIncoming && (
                <button
                  className="primary-button"
                  onClick={() =>
                    onAcceptFriend(friendship)
                  }
                >
                  ✓ Anfrage annehmen
                </button>
              )}

              {isFriend && (
                <button
                  className="danger-outline"
                  onClick={
                    onRemoveFriend
                  }
                >
                  ✕ Freund entfernen
                </button>
              )}

            </div>
          )}

          {isHeadAdmin(profile?.role) &&
            member.id !== profile?.id &&
            member.role !==
              "HEAD_ADMIN" && (
              <section className="role-management">

                <h2>
                  Rolle verwalten
                </h2>

                <select
                  value={
                    member.role ||
                    "MEMBER"
                  }
                  onChange={(event) =>
                    onChangeRole(
                      member,
                      event.target.value
                    )
                  }
                >

                  <option value="MEMBER">
                    Mitglied
                  </option>

                  <option value="SUPPORTER">
                    Supporter
                  </option>

                  <option value="ADMIN">
                    Admin
                  </option>

                </select>

              </section>
            )}

        </div>

      </div>

    </div>
  );
}

function Auth({
  login,
  register
}) {
  const [mode, setMode] =
    useState("login");

  return (
    <div className="auth-page">

      <div className="auth-brand">

        <img
          src="/banner.png"
          alt="Ennstal Connect"
        />

        <h1>
          Ennstal Connect
        </h1>

        <p>
          Deine regionale Community.
        </p>

      </div>

      <div className="auth-box">

        {mode === "login" ? (
          <form
            className="form-card"
            onSubmit={login}
          >

            <h2>
              Willkommen zurück
            </h2>

            <input
              name="email"
              type="email"
              placeholder="E-Mail"
              required
            />

            <input
              name="password"
              type="password"
              placeholder="Passwort"
              required
            />

            <button className="primary-button">
              Anmelden
            </button>

            <button
              type="button"
              className="text-button"
              onClick={() =>
                setMode("register")
              }
            >
              Konto erstellen
            </button>

          </form>
        ) : (
          <form
            className="form-card"
            onSubmit={register}
          >

            <h2>
              Community beitreten
            </h2>

            <input
              name="nickname"
              placeholder="Nickname"
              required
            />

            <input
              name="first_name"
              placeholder="Vorname"
              required
            />

            <input
              name="last_name"
              placeholder="Nachname"
              required
            />

            <input
              name="birth_date"
              type="date"
              required
            />

            <select
              name="gender"
              required
              defaultValue=""
            >

              <option
                value=""
                disabled
              >
                Geschlecht auswählen
              </option>

              <option value="männlich">
                Männlich
              </option>

              <option value="weiblich">
                Weiblich
              </option>

              <option value="divers">
                Divers
              </option>

            </select>

            <input
              name="email"
              type="email"
              placeholder="E-Mail"
              required
            />

            <input
              name="password"
              type="password"
              minLength="6"
              placeholder="Passwort"
              required
            />

            <button className="primary-button">
              Konto erstellen
            </button>

            <button
              type="button"
              className="text-button"
              onClick={() =>
                setMode("login")
              }
            >
              Zur Anmeldung
            </button>

          </form>
        )}

      </div>

    </div>
  );
}
