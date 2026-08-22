import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

/* =====================================================
   ENNSTAL CONNECT
===================================================== */

const ROLE_LABELS = {
  member: "Mitglied",
  supporter: "Unterstützer",
  admin: "Admin",
  mainadmin: "Hauptadmin",
};

function getRole(profile) {
  return profile?.role || "member";
}

function RoleBadge({ profile }) {
  const role = getRole(profile);

  const stars =
    role === "mainadmin"
      ? "★★★"
      : role === "admin"
      ? "★★"
      : role === "supporter"
      ? "★"
      : "";

  return (
    <span className={`roleBadge role-${role}`}>
      {stars && <span className="roleStars">{stars}</span>}
      {ROLE_LABELS[role] || "Mitglied"}
    </span>
  );
}

function Avatar({ profile, size = "normal" }) {
  const name =
    profile?.nickname ||
    profile?.first_name ||
    profile?.email ||
    "?";

  if (profile?.avatar_url) {
    return (
      <img
        className={`avatar ${size}`}
        src={profile.avatar_url}
        alt={name}
      />
    );
  }

  return (
    <div className={`avatar avatarFallback ${size}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* =====================================================
   AUTH
===================================================== */

function Auth({ onSuccess }) {
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    email: "",
    password: "",
  });

  function updateField(field, value) {
    setForm((old) => ({
      ...old,
      [field]: value,
    }));
  }

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (mode === "register") {
        if (
          !form.first_name ||
          !form.last_name ||
          !form.nickname ||
          !form.email ||
          !form.password
        ) {
          setMessage("Bitte alle Felder ausfüllen.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              first_name: form.first_name,
              last_name: form.last_name,
              nickname: form.nickname,
            },
          },
        });

        if (error) {
          setMessage(error.message);
          setLoading(false);
          return;
        }

        if (data?.user) {
          /*
             Das Profil wird hier zusätzlich erstellt,
             falls kein Trigger in Supabase vorhanden ist.
          */

          await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              auth_id: data.user.id,
              first_name: form.first_name,
              last_name: form.last_name,
              nickname: form.nickname,
              email: form.email,
              role: "member",
              approved: false,
            },
            {
              onConflict: "id",
            }
          );
        }

        setMessage(
          "Registrierung erfolgreich. Dein Konto wartet jetzt auf die Freigabe durch einen Administrator."
        );

        setMode("login");
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.password,
          });

        if (error) {
          setMessage(error.message);
          setLoading(false);
          return;
        }

        if (data?.user) {
          onSuccess(data.user);
        }
      }
    } catch (error) {
      console.error(error);
      setMessage("Es ist ein Fehler aufgetreten.");
    }

    setLoading(false);
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authLogo">
          <img src="/logo.png" alt="Ennstal Connect" />
        </div>

        <h1>Ennstal Connect</h1>

        <p className="muted">
          Menschen aus der Region verbinden.
        </p>

        <div className="authTabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
          >
            Anmelden
          </button>

          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <input
                placeholder="Vorname"
                value={form.first_name}
                onChange={(e) =>
                  updateField("first_name", e.target.value)
                }
              />

              <input
                placeholder="Nachname"
                value={form.last_name}
                onChange={(e) =>
                  updateField("last_name", e.target.value)
                }
              />

              <input
                placeholder="Spitzname"
                value={form.nickname}
                onChange={(e) =>
                  updateField("nickname", e.target.value)
                }
              />
            </>
          )}

          <input
            type="email"
            placeholder="E-Mail"
            value={form.email}
            onChange={(e) =>
              updateField("email", e.target.value)
            }
          />

          <input
            type="password"
            placeholder="Passwort"
            value={form.password}
            onChange={(e) =>
              updateField("password", e.target.value)
            }
          />

          <button
            className="primaryButton fullButton"
            disabled={loading}
          >
            {loading
              ? "Bitte warten..."
              : mode === "login"
              ? "Anmelden"
              : "Konto beantragen"}
          </button>
        </form>

        {message && (
          <div className="authMessage">
            {message}
          </div>
        )}

        {mode === "register" && (
          <p className="approvalInfo">
            Neue Mitglieder können die Community erst nach
            erfolgreicher Freigabe durch einen Administrator
            vollständig nutzen.
          </p>
        )}
      </div>
    </div>
  );
}

/* =====================================================
   PROFILE
===================================================== */

function ProfileEditor({ profile, onSaved }) {
  const [form, setForm] = useState({
    first_name: profile?.first_name || "",
    last_name: profile?.last_name || "",
    nickname: profile?.nickname || "",
    bio: profile?.bio || "",
    avatar_url: profile?.avatar_url || "",
  });

  const [message, setMessage] = useState("");

  function update(field, value) {
    setForm((old) => ({
      ...old,
      [field]: value,
    }));
  }

  async function save(e) {
    e.preventDefault();

    const { data, error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        nickname: form.nickname,
        bio: form.bio,
        avatar_url: form.avatar_url,
      })
      .eq("id", profile.id)
      .select()
      .single();

    if (error) {
      console.error(error);
      setMessage("Profil konnte nicht gespeichert werden.");
      return;
    }

    setMessage("Profil gespeichert.");
    onSaved(data);
  }

  return (
    <div className="contentCard">
      <h2>Mein Profil bearbeiten</h2>

      <form className="profileForm" onSubmit={save}>
        <input
          placeholder="Vorname"
          value={form.first_name}
          onChange={(e) =>
            update("first_name", e.target.value)
          }
        />

        <input
          placeholder="Nachname"
          value={form.last_name}
          onChange={(e) =>
            update("last_name", e.target.value)
          }
        />

        <input
          placeholder="Spitzname"
          value={form.nickname}
          onChange={(e) =>
            update("nickname", e.target.value)
          }
        />

        <input
          placeholder="Profilbild URL"
          value={form.avatar_url}
          onChange={(e) =>
            update("avatar_url", e.target.value)
          }
        />

        <textarea
          placeholder="Über mich..."
          value={form.bio}
          onChange={(e) =>
            update("bio", e.target.value)
          }
        />

        <button className="primaryButton">
          Änderungen speichern
        </button>
      </form>

      {message && (
        <p className="successMessage">
          {message}
        </p>
      )}
    </div>
  );
}

/* =====================================================
   POSTS
===================================================== */

function CommunityFeed({ profile, posts, reloadPosts }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  async function createPost() {
    if (!content.trim()) return;

    setLoading(true);

    const { error } = await supabase
      .from("posts")
      .insert({
        author_id: profile.id,
        content: content.trim(),
      });

    if (error) {
      console.error(error);
      alert("Beitrag konnte nicht erstellt werden.");
    } else {
      setContent("");
      reloadPosts();
    }

    setLoading(false);
  }

  return (
    <div>
      <div className="contentCard createPost">
        <div className="createPostHeader">
          <Avatar profile={profile} />

          <textarea
            placeholder="Was möchtest du mit der Community teilen?"
            value={content}
            onChange={(e) =>
              setContent(e.target.value)
            }
          />
        </div>

        <button
          className="primaryButton"
          onClick={createPost}
          disabled={loading}
        >
          {loading ? "Wird veröffentlicht..." : "Beitrag veröffentlichen"}
        </button>
      </div>

      <div className="sectionTitle">
        Community Beiträge
      </div>

      {posts.length === 0 && (
        <div className="contentCard emptyState">
          Noch keine Beiträge vorhanden.
          Sei der Erste und starte die Community!
        </div>
      )}

      {posts.map((post) => (
        <article className="contentCard postCard" key={post.id}>
          <div className="postHeader">
            <Avatar profile={post.profiles} />

            <div>
              <strong>
                {post.profiles?.nickname ||
                  post.profiles?.first_name ||
                  "Mitglied"}
              </strong>

              <div>
                <RoleBadge profile={post.profiles} />
              </div>
            </div>
          </div>

          <p className="postContent">
            {post.content}
          </p>

          <small className="muted">
            {post.created_at
              ? new Date(post.created_at).toLocaleString(
                  "de-DE"
                )
              : ""}
          </small>
        </article>
      ))}
    </div>
  );
}

/* =====================================================
   MEMBERS
===================================================== */

function Members({ members, currentProfile, reload }) {
  async function sendFriendRequest(member) {
    if (member.id === currentProfile.id) return;

    const { error } = await supabase
      .from("friend_requests")
      .insert({
        sender_id: currentProfile.id,
        receiver_id: member.id,
        status: "pending",
      });

    if (error) {
      console.error(error);
      alert(
        "Freundschaftsanfrage konnte nicht gesendet werden."
      );
    } else {
      alert("Freundschaftsanfrage gesendet.");
      reload();
    }
  }

  return (
    <div>
      <h2 className="pageTitle">
        Mitglieder
      </h2>

      <div className="memberGrid">
        {members.map((member) => (
          <div className="contentCard memberCard" key={member.id}>
            <Avatar profile={member} size="large" />

            <h3>
              {member.nickname ||
                `${member.first_name || ""} ${
                  member.last_name || ""
                }`}
            </h3>

            <RoleBadge profile={member} />

            {member.bio && (
              <p className="memberBio">
                {member.bio}
              </p>
            )}

            {member.id !== currentProfile.id && (
              <button
                className="secondaryButton"
                onClick={() =>
                  sendFriendRequest(member)
                }
              >
                Freundschaft anfragen
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================
   FRIENDS
===================================================== */

function Friends({ profile, members, reload }) {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    loadRequests();
  }, [profile]);

  async function loadRequests() {
    const { data, error } = await supabase
      .from("friend_requests")
      .select(`
        *,
        sender:profiles!friend_requests_sender_id_fkey(*),
        receiver:profiles!friend_requests_receiver_id_fkey(*)
      `)
      .or(
        `sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`
      );

    if (!error) {
      setRequests(data || []);
    }
  }

  async function accept(id) {
    await supabase
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", id);

    loadRequests();
    reload();
  }

  const incoming = requests.filter(
    (request) =>
      request.receiver_id === profile.id &&
      request.status === "pending"
  );

  const friends = requests.filter(
    (request) =>
      request.status === "accepted"
  );

  return (
    <div>
      <h2 className="pageTitle">
        Freunde
      </h2>

      <div className="contentCard">
        <h3>Freundschaftsanfragen</h3>

        {incoming.length === 0 && (
          <p className="muted">
            Keine neuen Freundschaftsanfragen.
          </p>
        )}

        {incoming.map((request) => (
          <div
            className="friendRow"
            key={request.id}
          >
            <div className="rowUser">
              <Avatar profile={request.sender} />

              <strong>
                {request.sender?.nickname}
              </strong>
            </div>

            <button
              className="primaryButton"
              onClick={() => accept(request.id)}
            >
              Annehmen
            </button>
          </div>
        ))}
      </div>

      <div className="contentCard">
        <h3>Meine Freunde</h3>

        {friends.length === 0 && (
          <p className="muted">
            Du hast noch keine bestätigten Freunde.
          </p>
        )}

        {friends.map((request) => {
          const friend =
            request.sender_id === profile.id
              ? request.receiver
              : request.sender;

          return (
            <div
              className="friendRow"
              key={request.id}
            >
              <div className="rowUser">
                <Avatar profile={friend} />

                <div>
                  <strong>
                    {friend?.nickname}
                  </strong>

                  <div>
                    <RoleBadge profile={friend} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================
   NEWS
===================================================== */

function News({ profile, news, reload }) {
  const role = getRole(profile);

  const canCreate =
    role === "admin" ||
    role === "mainadmin";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function createNews() {
    if (!title.trim() || !content.trim()) return;

    const { error } = await supabase
      .from("news")
      .insert({
        author_id: profile.id,
        title,
        content,
      });

    if (error) {
      console.error(error);
      alert("News konnte nicht erstellt werden.");
    } else {
      setTitle("");
      setContent("");
      reload();
    }
  }

  return (
    <div>
      <h2 className="pageTitle">
        News aus dem Ennstal
      </h2>

      {canCreate && (
        <div className="contentCard">
          <h3>News veröffentlichen</h3>

          <input
            placeholder="Titel"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
          />

          <textarea
            placeholder="Was gibt es Neues?"
            value={content}
            onChange={(e) =>
              setContent(e.target.value)
            }
          />

          <button
            className="primaryButton"
            onClick={createNews}
          >
            News veröffentlichen
          </button>
        </div>
      )}

      {news.map((item) => (
        <article
          className="contentCard"
          key={item.id}
        >
          <h2>{item.title}</h2>

          <p>{item.content}</p>

          <small className="muted">
            {item.created_at
              ? new Date(
                  item.created_at
                ).toLocaleString("de-DE")
              : ""}
          </small>
        </article>
      ))}
    </div>
  );
}

/* =====================================================
   MARKETPLACE
===================================================== */

function Marketplace({ profile, items, reload }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] =
    useState("");
  const [price, setPrice] = useState("");

  async function createItem() {
    if (!title.trim()) return;

    const { error } = await supabase
      .from("marketplace_items")
      .insert({
        seller_id: profile.id,
        title,
        description,
        price: price || null,
      });

    if (error) {
      console.error(error);
      alert("Anzeige konnte nicht erstellt werden.");
    } else {
      setTitle("");
      setDescription("");
      setPrice("");
      reload();
    }
  }

  return (
    <div>
      <h2 className="pageTitle">
        Community Marktplatz
      </h2>

      <div className="contentCard">
        <h3>Etwas anbieten</h3>

        <input
          placeholder="Titel"
          value={title}
          onChange={(e) =>
            setTitle(e.target.value)
          }
        />

        <textarea
          placeholder="Beschreibung"
          value={description}
          onChange={(e) =>
            setDescription(e.target.value)
          }
        />

        <input
          placeholder="Preis"
          value={price}
          onChange={(e) =>
            setPrice(e.target.value)
          }
        />

        <button
          className="primaryButton"
          onClick={createItem}
        >
          Anzeige erstellen
        </button>
      </div>

      <div className="marketGrid">
        {items.map((item) => (
          <div
            className="contentCard marketItem"
            key={item.id}
          >
            <h3>{item.title}</h3>

            <p>{item.description}</p>

            {item.price && (
              <strong>
                {item.price} €
              </strong>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================
   MESSAGES
===================================================== */

function Messages({ profile, members }) {
  const [selected, setSelected] =
    useState(null);

  const [messages, setMessages] =
    useState([]);

  const [text, setText] = useState("");

  async function loadMessages(member) {
    setSelected(member);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${profile.id},receiver_id.eq.${member.id}),and(sender_id.eq.${member.id},receiver_id.eq.${profile.id})`
      )
      .order("created_at", {
        ascending: true,
      });

    if (!error) {
      setMessages(data || []);
    }
  }

  async function sendMessage() {
    if (!selected || !text.trim()) return;

    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: profile.id,
        receiver_id: selected.id,
        content: text.trim(),
      });

    if (!error) {
      setText("");
      loadMessages(selected);
    }
  }

  return (
    <div className="messagesLayout">
      <div className="contentCard conversationList">
        <h3>Mitglieder</h3>

        {members
          .filter((member) => member.id !== profile.id)
          .map((member) => (
            <button
              className="conversationButton"
              key={member.id}
              onClick={() =>
                loadMessages(member)
              }
            >
              <Avatar profile={member} />

              {member.nickname ||
                member.first_name}
            </button>
          ))}
      </div>

      <div className="contentCard conversation">
        {!selected && (
          <div className="emptyState">
            Wähle ein Mitglied aus, um eine
            Nachricht zu schreiben.
          </div>
        )}

        {selected && (
          <>
            <div className="conversationHeader">
              <Avatar profile={selected} />

              <div>
                <strong>
                  {selected.nickname}
                </strong>

                <RoleBadge
                  profile={selected}
                />
              </div>
            </div>

            <div className="messageList">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.sender_id === profile.id
                      ? "message own"
                      : "message"
                  }
                >
                  {message.content}
                </div>
              ))}
            </div>

            <div className="messageInput">
              <input
                value={text}
                placeholder="Nachricht schreiben..."
                onChange={(e) =>
                  setText(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendMessage();
                  }
                }}
              />

              <button
                className="primaryButton"
                onClick={sendMessage}
              >
                Senden
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =====================================================
   ADMIN PANEL
===================================================== */

function AdminPanel({
  profile,
  members,
  reload,
}) {
  const role = getRole(profile);

  if (
    role !== "admin" &&
    role !== "mainadmin"
  ) {
    return (
      <div className="contentCard">
        Du hast keine Berechtigung für
        diesen Bereich.
      </div>
    );
  }

  async function approve(member) {
    const { error } = await supabase
      .from("profiles")
      .update({
        approved: true,
      })
      .eq("id", member.id);

    if (error) {
      console.error(error);
      alert("Freigabe fehlgeschlagen.");
    } else {
      reload();
    }
  }

  async function changeRole(member, role) {
    if (
      getRole(profile) !== "mainadmin"
    ) {
      alert(
        "Nur der Hauptadmin kann Rollen ändern."
      );
      return;
    }

    await supabase
      .from("profiles")
      .update({
        role,
      })
      .eq("id", member.id);

    reload();
  }

  const pending = members.filter(
    (member) => !member.approved
  );

  return (
    <div>
      <h2 className="pageTitle">
        Admin Bereich
      </h2>

      <div className="contentCard">
        <h3>
          Wartende Registrierungen
        </h3>

        {pending.length === 0 && (
          <p className="muted">
            Keine Mitglieder warten auf
            Freigabe.
          </p>
        )}

        {pending.map((member) => (
          <div
            className="adminMember"
            key={member.id}
          >
            <div className="rowUser">
              <Avatar profile={member} />

              <div>
                <strong>
                  {member.nickname}
                </strong>

                <div className="muted">
                  {member.first_name}{" "}
                  {member.last_name}
                </div>
              </div>
            </div>

            <button
              className="primaryButton"
              onClick={() =>
                approve(member)
              }
            >
              Freigeben
            </button>
          </div>
        ))}
      </div>

      {role === "mainadmin" && (
        <div className="contentCard">
          <h3>
            Rollen verwalten
          </h3>

          {members
            .filter((member) => member.approved)
            .map((member) => (
              <div
                className="adminMember"
                key={member.id}
              >
                <div className="rowUser">
                  <Avatar profile={member} />

                  <div>
                    <strong>
                      {member.nickname}
                    </strong>

                    <div>
                      <RoleBadge
                        profile={member}
                      />
                    </div>
                  </div>
                </div>

                <select
                  value={getRole(member)}
                  onChange={(e) =>
                    changeRole(
                      member,
                      e.target.value
                    )
                  }
                >
                  <option value="member">
                    Mitglied
                  </option>

                  <option value="supporter">
                    Unterstützer
                  </option>

                  <option value="admin">
                    Admin
                  </option>

                  <option value="mainadmin">
                    Hauptadmin
                  </option>
                </select>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* =====================================================
   RIGHT SIDEBAR
===================================================== */

function RightSidebar({
  profile,
  members,
  setPage,
  logout,
}) {
  const onlineMembers = members.filter(
    (member) => member.approved
  );

  const admins = members.filter(
    (member) =>
      member.role === "admin" ||
      member.role === "mainadmin"
  );

  const isAdmin =
    profile.role === "admin" ||
    profile.role === "mainadmin";

  return (
    <aside className="rightSidebar">
      <div className="sidebarSection myArea">
        <div className="myProfile">
          <Avatar profile={profile} />

          <div>
            <strong>
              {profile.nickname ||
                profile.first_name}
            </strong>

            <RoleBadge profile={profile} />
          </div>
        </div>

        <button
          onClick={() =>
            setPage("profile")
          }
        >
          Mein Profil
        </button>

        <button
          onClick={() =>
            setPage("friends")
          }
        >
          Meine Freunde
        </button>

        <button
          onClick={() =>
            setPage("messages")
          }
        >
          Nachrichten
        </button>

        {isAdmin && (
          <button
            onClick={() =>
              setPage("admin")
            }
          >
            Admin Tools
          </button>
        )}

        <button
          className="logoutButton"
          onClick={logout}
        >
          Abmelden
        </button>
      </div>

      <div className="sidebarSection">
        <h3>
          Online Mitglieder
        </h3>

        {onlineMembers.slice(0, 8).map(
          (member) => (
            <div
              className="onlineMember"
              key={member.id}
            >
              <Avatar
                profile={member}
                size="small"
              />

              <span className="onlineDot" />

              <div>
                <strong>
                  {member.nickname ||
                    member.first_name}
                </strong>

                <RoleBadge
                  profile={member}
                />
              </div>
            </div>
          )
        )}
      </div>

      <div className="sidebarSection">
        <h3>
          Admins
        </h3>

        {admins.map((admin) => (
          <div
            className="onlineMember"
            key={admin.id}
          >
            <Avatar
              profile={admin}
              size="small"
            />

            <div>
              <strong>
                {admin.nickname ||
                  admin.first_name}
              </strong>

              <RoleBadge
                profile={admin}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* =====================================================
   MAIN APP
===================================================== */

function App() {
  const [user, setUser] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  const [members, setMembers] =
    useState([]);

  const [posts, setPosts] =
    useState([]);

  const [news, setNews] =
    useState([]);

  const [marketItems, setMarketItems] =
    useState([]);

  const [page, setPage] =
    useState("home");

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function initialize() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      setUser(session.user);
      await loadEverything(session.user);
    }

    setLoading(false);
  }

  async function loadEverything(currentUser) {
    const userId =
      currentUser?.id || user?.id;

    if (!userId) return;

    const { data: currentProfile } =
      await supabase
        .from("profiles")
        .select("*")
        .or(
          `id.eq.${userId},auth_id.eq.${userId}`
        )
        .maybeSingle();

    if (currentProfile) {
      setProfile(currentProfile);
    }

    await Promise.all([
      loadMembers(),
      loadPosts(),
      loadNews(),
      loadMarketplace(),
    ]);
  }

  async function loadMembers() {
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (!error) {
      setMembers(data || []);
    }
  }

  async function loadPosts() {
    const { data, error } =
      await supabase
        .from("posts")
        .select(`
          *,
          profiles:author_id (*)
        `)
        .order("created_at", {
          ascending: false,
        });

    if (!error) {
      setPosts(data || []);
    }
  }

  async function loadNews() {
    const { data, error } =
      await supabase
        .from("news")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (!error) {
      setNews(data || []);
    }
  }

  async function loadMarketplace() {
    const { data, error } =
      await supabase
        .from("marketplace_items")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

    if (!error) {
      setMarketItems(data || []);
    }
  }

  async function logout() {
    await supabase.auth.signOut();

    setUser(null);
    setProfile(null);
    setPage("home");
  }

  function renderPage() {
    if (!profile) {
      return (
        <div className="contentCard">
          Profil wird geladen...
        </div>
      );
    }

    /*
      Wichtig:
      Ein nicht freigegebenes Mitglied kann
      sich anmelden, aber noch nicht die
      Community benutzen.
    */

    if (!profile.approved) {
      return (
        <div className="contentCard approvalScreen">
          <h1>
            Willkommen bei Ennstal Connect
          </h1>

          <p>
            Dein Konto wurde erfolgreich
            erstellt.
          </p>

          <p>
            Ein Administrator muss deine
            Mitgliedschaft noch freigeben.
          </p>

          <button
            className="secondaryButton"
            onClick={logout}
          >
            Abmelden
          </button>
        </div>
      );
    }

    switch (page) {
      case "members":
        return (
          <Members
            members={members.filter(
              (member) => member.approved
            )}
            currentProfile={profile}
            reload={loadMembers}
          />
        );

      case "friends":
        return (
          <Friends
            profile={profile}
            members={members}
            reload={loadMembers}
          />
        );

      case "messages":
        return (
          <Messages
            profile={profile}
            members={members.filter(
              (member) => member.approved
            )}
          />
        );

      case "news":
        return (
          <News
            profile={profile}
            news={news}
            reload={loadNews}
          />
        );

      case "marketplace":
        return (
          <Marketplace
            profile={profile}
            items={marketItems}
            reload={loadMarketplace}
          />
        );

      case "profile":
        return (
          <ProfileEditor
            profile={profile}
            onSaved={(updated) => {
              setProfile(updated);
              loadMembers();
            }}
          />
        );

      case "admin":
        return (
          <AdminPanel
            profile={profile}
            members={members}
            reload={() =>
              loadEverything(user)
            }
          />
        );

      default:
        return (
          <CommunityFeed
            profile={profile}
            posts={posts}
            reloadPosts={loadPosts}
          />
        );
    }
  }

  if (loading) {
    return (
      <div className="loadingScreen">
        Ennstal Connect wird geladen...
      </div>
    );
  }

  if (!user) {
    return (
      <Auth
        onSuccess={async (loggedUser) => {
          setUser(loggedUser);
          await loadEverything(loggedUser);
        }}
      />
    );
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() =>
            setPage("home")
          }
        >
          <img
            src="/logo.png"
            alt="Ennstal Connect"
          />

          <span>
            Ennstal Connect
          </span>
        </button>

        <nav>
          <button
            onClick={() =>
              setPage("home")
            }
          >
            Start
          </button>

          <button
            onClick={() =>
              setPage("news")
            }
          >
            News
          </button>

          <button
            onClick={() =>
              setPage("members")
            }
          >
            Mitglieder
          </button>

          <button
            onClick={() =>
              setPage("marketplace")
            }
          >
            Marktplatz
          </button>

          <button
            onClick={() =>
              setPage("messages")
            }
          >
            Nachrichten
          </button>
        </nav>
      </header>

      <main className="mainLayout">
        <section className="mainContent">
          {renderPage()}
        </section>

        {profile?.approved && (
          <RightSidebar
            profile={profile}
            members={members}
            setPage={setPage}
            logout={logout}
          />
        )}
      </main>
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(<App />);
