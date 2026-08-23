import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const ROLES = ["MEMBER", "SUPPORTER", "ADMIN", "HEAD_ADMIN"];

const isAdmin = (role) =>
  role === "ADMIN" || role === "HEAD_ADMIN";

const isHeadAdmin = (role) =>
  role === "HEAD_ADMIN";

const getAge = (birthDate) => {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  const monthDifference =
    today.getMonth() - birth.getMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      today.getDate() < birth.getDate()
    )
  ) {
    age--;
  }

  return age;
};

const getName = (member) => {
  if (!member) return "";

  return (
    member.nickname ||
    [member.first_name, member.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Mitglied"
  );
};

const DEFAULT_AVATAR = "/default-avatar.svg";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [members, setMembers] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [profileVisits, setProfileVisits] = useState([]);
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);

  const [history, setHistory] = useState([]);
  const [messages, setMessages] = useState([]);

  const [selectedMember, setSelectedMember] =
    useState(null);

  const [chatMember, setChatMember] =
    useState(null);

  const [search, setSearch] = useState("");

  const [page, setPage] =
    useState("home");

  const [loading, setLoading] =
    useState(true);

  const [messageText, setMessageText] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const showNotice = (text) => {
    setNotice(text);

    window.clearTimeout(
      window.__ennstalNoticeTimer
    );

    window.__ennstalNoticeTimer =
      window.setTimeout(() => {
        setNotice("");
      }, 4000);
  };

  /* =========================================================
     ALLES LADEN
     ========================================================= */

  async function loadAll() {
    setLoading(true);

    const {
      data: { user: currentUser }
    } = await supabase.auth.getUser();

    setUser(currentUser || null);

    if (!currentUser) {
      setProfile(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const [
      profileResult,
      membersResult,
      newsResult,
      eventsResult,
      groupsResult,
      historyResult,
      messagesResult,
      friendshipsResult,
      visitsResult
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single(),

      supabase
        .from("profiles")
        .select("*"),

      supabase
        .from("community_news")
        .select("*")
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("events")
        .select("*")
        .order("starts_at", {
          ascending: true
        }),

      supabase
        .from("groups")
        .select("*")
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("point_history")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("messages")
        .select("*")
        .or(
          `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
        )
        .order("created_at", {
          ascending: false
        }),

      supabase
        .from("friendships")
        .select("*")
        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`),

      supabase
        .from("profile_visits")
        .select("*")
        .eq("profile_id", currentUser.id)
        .order("visited_at", { ascending: false })
    ]);

    setProfile(
      profileResult.data || null
    );

    setMembers(
      membersResult.data || []
    );

    setNews(
      newsResult.data || []
    );

    setEvents(
      eventsResult.data || []
    );

    setGroups(
      groupsResult.data || []
    );

    setHistory(
      historyResult.data || []
    );

    setMessages(
      messagesResult.data || []
    );

    setFriendships(friendshipsResult.data || []);
    setProfileVisits(visitsResult.data || []);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();

    const {
      data: { subscription }
    } =
      supabase.auth.onAuthStateChange(() => {
        loadAll();
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /* =========================================================
     ONLINE STATUS
     ========================================================= */

  useEffect(() => {
    if (!user) return;

    const interval =
      window.setInterval(async () => {
        await supabase
          .from("profiles")
          .update({
            is_online: true
          })
          .eq("id", user.id);
      }, 60000);

    return () => {
      window.clearInterval(interval);
    };
  }, [user]);

  /* =========================================================
     SORTIERTE MITGLIEDER
     ADMINS -> SUPPORTER -> NORMALE
     JEWEILS ALPHABETISCH
     ========================================================= */

  const sortedMembers = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    const filtered = members.filter((member) => {
      const text = [
        member.nickname,
        member.first_name,
        member.last_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });

    const admins = filtered
      .filter((member) =>
        isAdmin(member.role)
      )
      .sort((a, b) =>
        getName(a).localeCompare(
          getName(b),
          "de"
        )
      );

    const supporters = filtered
      .filter((member) =>
        member.role === "SUPPORTER"
      )
      .sort((a, b) =>
        getName(a).localeCompare(
          getName(b),
          "de"
        )
      );

    const normalMembers = filtered
      .filter(
        (member) =>
          !isAdmin(member.role) &&
          member.role !== "SUPPORTER"
      )
      .sort((a, b) =>
        getName(a).localeCompare(
          getName(b),
          "de"
        )
      );

    return {
      admins,
      supporters,
      normalMembers
    };
  }, [members, search]);

  const onlineMembers = useMemo(
    () => members.filter((member) => member.is_online),
    [members]
  );

  const friendshipWith = (memberId) =>
    friendships.find((item) =>
      (item.requester_id === user?.id && item.receiver_id === memberId) ||
      (item.receiver_id === user?.id && item.requester_id === memberId)
    );

  const acceptedFriendIds = useMemo(() =>
    friendships
      .filter((item) => item.status === "ACCEPTED")
      .map((item) => item.requester_id === user?.id ? item.receiver_id : item.requester_id),
    [friendships, user?.id]
  );

  const onlineFriends = useMemo(
    () => onlineMembers.filter((member) => acceptedFriendIds.includes(member.id)),
    [onlineMembers, acceptedFriendIds]
  );

  async function requestFriend(member) {
    if (!user || member.id === user.id) return;
    const existing = friendshipWith(member.id);
    if (existing) {
      showNotice(existing.status === "ACCEPTED" ? "Ihr seid bereits Freunde." : "Freundschaftsanfrage ist bereits vorhanden.");
      return;
    }
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      receiver_id: member.id,
      status: "PENDING"
    });
    if (error) return showNotice(error.message);
    showNotice("Freundschaftsanfrage gesendet.");
    await loadAll();
  }

  async function openMember(member) {
    setSelectedMember(member);
    if (user && member.id !== user.id) {
      const { error } = await supabase.rpc("record_profile_visit", { target_profile: member.id });
      if (error) {
        await supabase.from("profile_visits").insert({ visitor_id: user.id, profile_id: member.id });
      }
    }
  }

  /* =========================================================
     LOGIN
     ========================================================= */

  async function login(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase.auth.signInWithPassword({
        email: form.get("email"),
        password: form.get("password")
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Erfolgreich angemeldet.");

    await loadAll();
  }

  /* =========================================================
     REGISTRIEREN
     ========================================================= */

  async function register(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase.auth.signUp({
        email: form.get("email"),
        password: form.get("password"),

        options: {
          data: {
            nickname:
              form.get("nickname"),

            first_name:
              form.get("first_name"),

            last_name:
              form.get("last_name"),

            birth_date:
              form.get("birth_date"),

            gender:
              form.get("gender")
          }
        }
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Registrierung erfolgreich."
    );
  }

  /* =========================================================
     LOGOUT
     ========================================================= */

  async function logout() {
    if (user) {
      await supabase
        .from("profiles")
        .update({
          is_online: false
        })
        .eq("id", user.id);
    }

    await supabase.auth.signOut();

    setUser(null);
    setProfile(null);
    setPage("home");
  }

  /* =========================================================
     PROFIL SPEICHERN
     ========================================================= */
async function uploadProfileImage(file) {
  if (!user || !file) return;

  if (!file.type.startsWith("image/")) {
    showNotice("Bitte eine Bilddatei auswählen.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showNotice("Das Profilbild darf maximal 5 MB groß sein.");
    return;
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase() || "jpg";

  const filePath =
    `${user.id}/${crypto.randomUUID()}.${extension}`;

  showNotice("Profilbild wird hochgeladen...");

  const { error: uploadError } =
    await supabase.storage
      .from("profile-avatars")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

  if (uploadError) {
    showNotice(
      "Profilbild konnte nicht hochgeladen werden: " +
      uploadError.message
    );
    return;
  }

  const { data } =
    supabase.storage
      .from("profile-avatars")
      .getPublicUrl(filePath);

  const avatarUrl = data?.publicUrl;

  if (!avatarUrl) {
    showNotice(
      "Bildadresse konnte nicht erstellt werden."
    );
    return;
  }

  const { error: profileError } =
    await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
      })
      .eq("id", user.id);

  if (profileError) {
    showNotice(
      "Profilbild konnte nicht gespeichert werden: " +
      profileError.message
    );
    return;
  }

  showNotice(
    "Profilbild erfolgreich gespeichert."
  );

  await loadAll();
}
  async function saveProfile(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    let avatarUrl = form.get("avatar_url")?.trim() || profile?.avatar_url || null;
    const avatarFile = form.get("avatar_file");

    if (avatarFile && avatarFile.size > 0) {
      const extension = avatarFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
      if (uploadError) {
        showNotice(`Profilbild konnte nicht hochgeladen werden: ${uploadError.message}`);
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrl = data.publicUrl;
    }

    const firstName = form.get("first_name")?.trim();
    const lastName = form.get("last_name")?.trim();
    const birthDate = form.get("birth_date");
    const gender = form.get("gender");

    if (!firstName || !lastName || !birthDate || !gender) {
      showNotice("Vorname, Nachname, Geburtsdatum und Geschlecht sind Pflichtfelder.");
      return;
    }

    const updateData = {
      nickname: form.get("nickname")?.trim(),
      nickname_color: form.get("nickname_color"),
      avatar_url: avatarUrl,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      gender,
      bio: form.get("bio")?.trim(),
      location: form.get("location")?.trim(),
      interests: form.get("interests")?.trim(),
      website: form.get("website")?.trim()
    };

    const { error } =
      await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Profil wurde gespeichert."
    );

    await loadAll();
  }

  /* =========================================================
     NEWS
     ========================================================= */

  async function createNews(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("community_news")
        .insert({
          title:
            form.get("title"),

          content:
            form.get("content"),

          created_by:
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
  }

  /* =========================================================
     EVENT
     ========================================================= */

  async function createEvent(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("events")
        .insert({
          title:
            form.get("title"),

          description:
            form.get("description"),

          location:
            form.get("location"),

          starts_at:
            form.get("starts_at"),

          created_by:
            user.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Event erstellt."
    );

    await loadAll();
  }

  /* =========================================================
     GRUPPE
     ========================================================= */

  async function createGroup(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase
        .from("groups")
        .insert({
          name:
            form.get("name"),

          description:
            form.get("description"),

          image_url:
            form.get("image_url"),

          created_by:
            user.id
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Gruppe erstellt."
    );

    await loadAll();
  }

  /* =========================================================
     CHAT LADEN
     ========================================================= */

  async function openChat(member) {
    setChatMember(member);

    const { data, error } =
      await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${member.id}),and(sender_id.eq.${member.id},receiver_id.eq.${user.id})`
        )
        .order("created_at", {
          ascending: true
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    setMessages(data || []);

    setPage("messages");
  }

  /* =========================================================
     NACHRICHT SENDEN
     ========================================================= */

  async function sendMessage(event) {
    event.preventDefault();

    if (
      !chatMember ||
      !messageText.trim()
    ) {
      return;
    }

    const { error } =
      await supabase
        .from("messages")
        .insert({
          sender_id:
            user.id,

          receiver_id:
            chatMember.id,

          content:
            messageText.trim(),

          message_type:
            "PRIVATE"
        });

    if (error) {
      showNotice(error.message);
      return;
    }

    setMessageText("");

    await openChat(chatMember);
  }

  /* =========================================================
     PUNKTE ÄNDERN
     ========================================================= */

  async function changePoints(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const targetUser =
      form.get("user_id");

    const amount =
      Number(form.get("points"));

    const reason =
      form.get("reason")
        ?.trim();

    if (
      !targetUser ||
      !Number.isFinite(amount) ||
      amount === 0
    ) {
      showNotice(
        "Bitte Mitglied und Punkte angeben."
      );

      return;
    }

    if (!reason || reason.length < 3) {
      showNotice(
        "Bitte einen Grund angeben."
      );

      return;
    }

    const { error } =
      await supabase.rpc(
        "admin_change_points",
        {
          target_user:
            targetUser,

          delta:
            amount,

          change_kind:
            amount > 0
              ? "ADD"
              : "REMOVE",

          reason_text:
            reason
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();

    showNotice(
      "Punkte erfolgreich geändert."
    );

    await loadAll();
  }

  /* =========================================================
     ADMIN MITGLIED SPEICHERN
     ========================================================= */

  async function adminSaveMember(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const { error } =
      await supabase.rpc(
        "admin_update_member",
        {
          p_user_id:
            form.get("user_id"),

          p_nickname:
            form.get("nickname"),

          p_first_name:
            form.get("first_name"),

          p_last_name:
            form.get("last_name"),

          p_birth_date:
            form.get("birth_date"),

          p_gender:
            form.get("gender"),

          p_role:
            form.get("role"),

          p_account_status:
            form.get("account_status")
        }
      );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      "Mitglied gespeichert."
    );

    await loadAll();
  }

  /* =========================================================
     LADEN
     ========================================================= */

  if (loading) {
    return (
      <div className="loading-screen">
        <img
          src="/banner.png"
          alt="Ennstal Connect"
        />

        <p>
          Ennstal Connect wird geladen …
        </p>
      </div>
    );
  }

  /* =========================================================
     LOGIN / REGISTER
     ========================================================= */

  if (!user) {
    return (
      <>
        <GlobalStyle />

        <div className="auth-page">

          <div className="auth-brand">
            <img
              src="/banner.png"
              alt="Ennstal Connect"
            />
          </div>

          <Auth
            login={login}
            register={register}
          />

          {notice && (
            <div className="toast">
              {notice}
            </div>
          )}

        </div>
      </>
    );
  }

  /* =========================================================
     GESPERRT
     ========================================================= */

  if (
    profile?.account_status ===
    "SUSPENDED"
  ) {
    return (
      <>
        <GlobalStyle />

        <div className="suspended-page">

          <div className="suspended-box">

            <img
              src="/banner.png"
              alt="Ennstal Connect"
            />

            <h1>
              Konto gesperrt
            </h1>

            <p>
              Dein Konto ist derzeit
              gesperrt.
            </p>

            <div className="suspension-reason">

              <strong>
                Sperrgrund
              </strong>

              <p>
                {
                  profile.suspension_reason ||
                  "Kein Sperrgrund hinterlegt."
                }
              </p>

            </div>

            <div className="suspended-points">

              <span>
                Aktueller Punktestand
              </span>

              <strong>
                {
                  profile.community_points ||
                  0
                }
              </strong>

            </div>

            <h2>
              Dein Punkteverlauf
            </h2>

            <div className="point-list">

              {history.map((item) => {

                const delta =
                  item.delta ??
                  item.community_points_change ??
                  0;

                return (
                  <div
                    className={
                      `point-row ${
                        delta < 0
                          ? "negative"
                          : "positive"
                      }`
                    }
                    key={item.id}
                  >

                    <strong>
                      {delta > 0
                        ? "+"
                        : ""}
                      {delta}
                      {" "}
                      Punkte
                    </strong>

                    <span>
                      {item.reason}
                    </span>

                    <small>
                      {
                        new Date(
                          item.created_at
                        ).toLocaleString(
                          "de-AT"
                        )
                      }
                    </small>

                  </div>
                );
              })}

            </div>

            <button
              className="danger-button"
              onClick={logout}
            >
              Abmelden
            </button>

          </div>

        </div>
      </>
    );
  }

  const inboxMessages =
    messages.filter(
      (message) =>
        message.receiver_id === user.id
    );

  return (
    <>
      <GlobalStyle />

      <div className="app">

        {/* HEADER */}

        <header className="topbar">

          <div
            className="brand"
            onClick={() =>
              setPage("home")
            }
          >
            <img
              src="/banner.png"
              alt="Ennstal Connect"
            />
          </div>

          <nav>

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
              Startseite
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
              Mitglieder
            </button>

            <button
              className={page === "online" ? "active" : ""}
              onClick={() => setPage("online")}
            >
              ● Online ({onlineMembers.length})
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
              Gruppen
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
              Events
            </button>

           

           

          </nav>

          <div className="top-profile">

            <button
              className={
                `top-profile-button ${
                  isAdmin(profile?.role)
                    ? "admin-border"
                    : profile?.role ===
                      "SUPPORTER"
                    ? "supporter-border"
                    : ""
                }`
              }
              onClick={() =>
                setPage("profile")
              }
            >
              {isAdmin(profile?.role) && (
                <span className="small-admin-star">
                  ★
                </span>
              )}

              <span
                style={{
                  color:
                    profile?.nickname_color ||
                    undefined
                }}
              >
                {getName(profile)}
              </span>
            </button>

            <button
              className="logout-button"
              onClick={logout}
            >
              Abmelden
            </button>

          </div>

        </header>

        {notice && (
          <div className="toast">
            {notice}
          </div>
        )}

        <main>

          {/* =================================================
              STARTSEITE
              ================================================= */}

          {page === "home" && (
            <section>

              <div className="hero">

                <img
                  src="/banner.png"
                  alt="Ennstal Connect"
                />

              </div>

              <div className="page-heading">

                <div>
                  <span className="eyebrow">
                    ENNSTAL & OBERSTEIERMARK
                  </span>

                  <h1>
                    Willkommen,
                    {" "}
                    {getName(profile)}
                  </h1>

                  <p>
                    Deine regionale Community.
                  </p>
                </div>

                {isAdmin(profile?.role) && (
                  <div className="admin-home-badge">
                    ★ ADMIN
                  </div>
                )}

              </div>

              {isAdmin(profile?.role) && (
                <section className="admin-home-tools">

                  <h2>
                    Deine Admin-Übersicht
                  </h2>

                  <div className="admin-tool-grid">

                    <button
                      onClick={() =>
                        setPage("admin")
                      }
                    >
                      <span>👥</span>
                      Mitglieder verwalten
                    </button>

                    <button
                      onClick={() =>
                        setPage("admin")
                      }
                    >
                      <span>⭐</span>
                      Punkte verwalten
                    </button>

                    <button
                      onClick={() =>
                        setPage("admin")
                      }
                    >
                      <span>📰</span>
                      Startseite bearbeiten
                    </button>

                    <button
                      onClick={() =>
                        setPage("events")
                      }
                    >
                      <span>📅</span>
                      Events bearbeiten
                    </button>

                  </div>

                </section>
              )}

              <section>

                <h2>
                  Neuigkeiten
                </h2>

                {isAdmin(profile?.role) && (

                  <form
                    className="panel"
                    onSubmit={createNews}
                  >

                    <h3>
                      Neue Neuigkeit
                    </h3>

                    <input
                      name="title"
                      placeholder="Überschrift"
                      required
                    />

                    <textarea
                      name="content"
                      placeholder="Text"
                      required
                    />

                    <button className="primary-button">
                      Veröffentlichen
                    </button>

                  </form>
                )}

                <div className="news-grid">

                  {news.map((item) => (

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
                        {
                          new Date(
                            item.created_at
                          ).toLocaleString(
                            "de-AT"
                          )
                        }
                      </small>

                    </article>
                  ))}

                  {!news.length && (
                    <div className="empty-card">
                      Noch keine Neuigkeiten.
                    </div>
                  )}

                </div>

              </section>

            </section>
          )}

          {/* =================================================
              MITGLIEDER
              ================================================= */}

          {page === "members" && (
            <section>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">
                    COMMUNITY
                  </span>

                  <h1>
                    Mitgliederübersicht
                  </h1>

                  <p>
                    Admins zuerst,
                    danach Supporter
                    und anschließend alle
                    weiteren Mitglieder
                    alphabetisch.
                  </p>

                </div>

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

              </div>

              {/* ADMINS */}

              {sortedMembers.admins.length > 0 && (
                <MemberSection
                  title="Admins"
                  members={
                    sortedMembers.admins
                  }
                  profile={profile}
                  onOpen={openMember}
                  onMessage={openChat}
                  friendships={friendships}
                  onFriend={requestFriend}
                />
              )}

              {/* SUPPORTER */}

              {sortedMembers.supporters.length > 0 && (
                <MemberSection
                  title="Supporter"
                  members={
                    sortedMembers.supporters
                  }
                  profile={profile}
                  onOpen={openMember}
                  onMessage={openChat}
                  friendships={friendships}
                  onFriend={requestFriend}
                />
              )}

              {/* NORMALE */}

              <MemberSection
                title="Mitglieder"
                members={
                  sortedMembers.normalMembers
                }
                profile={profile}
                onOpen={openMember}
                onMessage={openChat}
                friendships={friendships}
                onFriend={requestFriend}
              />

            </section>
          )}

          {page === "online" && (
            <section>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">JETZT AKTIV</span>
                  <h1>Online ({onlineMembers.length})</h1>
                  <p>Alle Mitglieder, die aktuell online sind.</p>
                </div>
              </div>
              <MemberSection
                title={`Online-Mitglieder (${onlineMembers.length})`}
                members={onlineMembers.sort((a,b) => getName(a).localeCompare(getName(b), "de"))}
                profile={profile}
                onOpen={openMember}
                onMessage={openChat}
                friendships={friendships}
                onFriend={requestFriend}
              />
            </section>
          )}

          {/* =================================================
              GRUPPEN
              ================================================= */}

          {page === "groups" && (
            <section>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">
                    GEMEINSCHAFT
                  </span>

                  <h1>
                    Gruppen
                  </h1>

                </div>

              </div>

              {isAdmin(profile?.role) && (
                <form
                  className="panel"
                  onSubmit={createGroup}
                >

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
              )}

              <div className="cards">

                {groups.map((group) => (

                  <article
                    className="group-card"
                    key={group.id}
                  >

                    {group.image_url && (
                      <img
                        src={group.image_url}
                        alt={group.name}
                      />
                    )}

                    <div>

                      <h2>
                        {group.name}
                      </h2>

                      <p>
                        {group.description}
                      </p>

                    </div>

                  </article>
                ))}

              </div>

            </section>
          )}

          {/* =================================================
              EVENTS
              ================================================= */}

          {page === "events" && (
            <section>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">
                    COMMUNITY
                  </span>

                  <h1>
                    Events
                  </h1>

                </div>

              </div>

              {isAdmin(profile?.role) && (
                <form
                  className="panel"
                  onSubmit={createEvent}
                >

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
                    name="starts_at"
                    required
                  />

                  <button className="primary-button">
                    Event erstellen
                  </button>

                </form>
              )}

              <div className="news-grid">

                {events.map((event) => (

                  <article
                    className="news-card"
                    key={event.id}
                  >

                    <h2>
                      {event.title}
                    </h2>

                    <p>
                      {event.description}
                    </p>

                    <strong>
                      {event.location ||
                        "Ort offen"}
                    </strong>

                    <small>
                      {
                        new Date(
                          event.starts_at
                        ).toLocaleString(
                          "de-AT"
                        )
                      }
                    </small>

                  </article>
                ))}

              </div>

            </section>
          )}

          {/* =================================================
              NACHRICHTEN
              ================================================= */}

          {page === "messages" && (
            <section className="messages-page">

              <div className="page-heading">

                <div>

                  <span className="eyebrow">
                    DEINE COMMUNITY
                  </span>

                  <h1>
                    Nachrichten
                  </h1>

                </div>

              </div>

              {!chatMember && (

                <div className="message-overview">

                  <h2>
                    Deine Nachrichten
                  </h2>

                  {messages
                    .filter(
                      (message) =>
                        message.receiver_id ===
                        user.id
                    )
                    .map((message) => {

                      const sender =
                        members.find(
                          (member) =>
                            member.id ===
                            message.sender_id
                        );

                      return (
                        <button
                          key={message.id}
                          className="message-preview"
                          onClick={() => {
                            if (sender) {
                              openChat(sender);
                            }
                          }}
                        >

                          <strong>
                            {sender
                              ? getName(sender)
                              : "System"}
                          </strong>

                          <span>
                            {message.title ||
                              message.content}
                          </span>

                        </button>
                      );
                    })}

                  {!messages.length && (
                    <div className="empty-card">
                      Noch keine Nachrichten.
                    </div>
                  )}

                </div>
              )}

              {chatMember && (

                <div className="chat-box">

                  <div className="chat-header">

                    <button
                      className="back-button"
                      onClick={() => {
                        setChatMember(null);
                      }}
                    >
                      ←
                    </button>

                    <MemberMini
                      member={chatMember}
                    />

                  </div>

                  <div className="chat-messages">

                    {messages
                      .filter(
                        (message) =>
                          (
                            message.sender_id ===
                            user.id &&
                            message.receiver_id ===
                            chatMember.id
                          ) ||
                          (
                            message.sender_id ===
                            chatMember.id &&
                            message.receiver_id ===
                            user.id
                          )
                      )
                      .map((message) => {

                        const mine =
                          message.sender_id ===
                          user.id;

                        return (
                          <div
                            key={message.id}
                            className={
                              `chat-message ${
                                mine
                                  ? "mine"
                                  : ""
                              }`
                            }
                          >

                            {message.title && (
                              <strong>
                                {message.title}
                              </strong>
                            )}

                            <p>
                              {message.content}
                            </p>

                            <small>
                              {
                                new Date(
                                  message.created_at
                                ).toLocaleString(
                                  "de-AT"
                                )
                              }
                            </small>

                          </div>
                        );
                      })}

                  </div>

                  <form
                    className="message-form"
                    onSubmit={sendMessage}
                  >

                    <textarea
                      placeholder="Nachricht schreiben..."
                      value={messageText}
                      onChange={(event) =>
                        setMessageText(
                          event.target.value
                        )
                      }
                    />

                    <button className="primary-button">
                      Senden
                    </button>

                  </form>

                </div>
              )}

            </section>
          )}

          {/* =================================================
              MEIN BEREICH
              ================================================= */}

          {page === "profile" && (
            <section>

              <div className="my-area-layout">

                {/* LINKER BEREICH */}

                <div
                  className={
                    `my-profile-card ${
                      isAdmin(profile?.role)
                        ? "admin-profile"
                        : profile?.role ===
                          "SUPPORTER"
                        ? "supporter-profile"
                        : ""
                    }`
                  }
                >

                  <div className="my-profile-top">

                    {isAdmin(profile?.role) && (
                      <img className="role-symbol role-symbol-large" src="/Admin-star.png" alt="Admin" />
                    )}

                    <h1
                      style={{
                        color:
                          profile?.nickname_color ||
                          undefined
                      }}
                    >
                      {getName(profile)}
                    </h1>

                  </div>

                  <img
                    className="my-avatar"
                    src={
                      profile?.avatar_url ||
                      DEFAULT_AVATAR
                    }
                    alt="Profil"
                    onError={(event) => {
                      event.currentTarget.src =
                        DEFAULT_AVATAR;
                    }}
                  />

                  <h2>
                    {
                      [
                        profile?.first_name,
                        profile?.last_name
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }

                    {getAge(
                      profile?.birth_date
                    ) !== null && (
                      <>
                        {" · "}
                        {
                          getAge(
                            profile?.birth_date
                          )
                        }
                        {" Jahre"}
                      </>
                    )}

                  </h2>

                  <div className="profile-status online">
                    <span />
                    Online
                  </div>

                  <div className="profile-points">

                    <button
                      onClick={() =>
                        setPage("points")
                      }
                    >
                      <span>⭐</span>
                      <strong>
                        {
                          profile?.community_points ||
                          0
                        }
                      </strong>
                      Punkte
                    </button>

                  </div>

                </div>

                {/* RECHTER BEREICH */}

                <form
                  className="panel profile-form"
                  onSubmit={saveProfile}
                >

                  <h2>
                    Profil bearbeiten
                  </h2>

                  <label>
                    Nickname
                  </label>

                  <input
                    name="nickname"
                    defaultValue={
                      profile?.nickname || ""
                    }
                    required
                  />

                <label>
  Nickname *
</label>

<input
  name="nickname"
  defaultValue={profile?.nickname || ""}
  required
/>

<label>
  Nickname-Farbe
</label>

<input
  type="color"
  name="nickname_color"
  defaultValue={
    profile?.nickname_color || "#263238"
  }
/>

<label>
  Profilbild hochladen
</label>

<div className="profile-upload-box">

  <div className="profile-upload-preview">
    <img
      src={
        profile?.avatar_url ||
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='160' height='160' fill='%23e9edf1'/%3E%3Ctext x='80' y='90' text-anchor='middle' font-size='55' fill='%23818a94'%3E?%3C/text%3E%3C/svg%3E"
      }
      alt="Profilbild"
    />
  </div>

  <label className="upload-button">
    📷 Bild auswählen

    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      hidden
      onChange={async (event) => {
        const file = event.target.files?.[0];

        if (file) {
          await uploadProfileImage(file);
        }

        event.target.value = "";
      }}
    />
  </label>

  <small className="form-help">
    JPG, PNG, WEBP oder GIF · maximal 5 MB
  </small>

</div>

<label>
  Vorname *
</label>

<input
  name="first_name"
  defaultValue={
    profile?.first_name || ""
  }
  required
/>

<label>
  Nachname *
</label>

<input
  name="last_name"
  defaultValue={
    profile?.last_name || ""
  }
  required
/>

<label>
  Geburtsdatum *
</label>

<input
  type="date"
  name="birth_date"
  defaultValue={
    profile?.birth_date || ""
  }
  required
/>

<label>
  Geschlecht *
</label>

<select
  name="gender"
  defaultValue={
    profile?.gender || ""
  }
  required
>
  <option value="">
    Bitte auswählen
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

<label>
  Über mich
</label>

<textarea
  name="bio"
  defaultValue={
    profile?.bio || ""
  }
/>

<label>
  Interessen
</label>

<input
  name="interests"
  defaultValue={
    profile?.interests || ""
  }
/>

<label>
  Wohnort
</label>

<input
  name="location"
  defaultValue={
    profile?.location || ""
  }
/>

<label>
  Website
</label>

<input
  name="website"
  defaultValue={
    profile?.website || ""
  }
/>

<button
  type="submit"
  className="primary-button"
>
  Änderungen speichern
</button>
                </form>

              </div>

            </section>
          )}

          {/* =================================================
              PUNKTE
              ================================================= */}

          {page === "points" && (
            <section>

              <div className="page-heading">

                <div>

                  <button
                    className="back-button"
                    onClick={() =>
                      setPage("profile")
                    }
                  >
                    ← Zurück
                  </button>

                  <h1>
                    Meine Punkte
                  </h1>

                  <p>
                    Dein vollständiger
                    Punkteverlauf.
                  </p>

                </div>

              </div>

              <div className="points-overview">

                <div>

                  <span>
                    Aktueller Punktestand
                  </span>

                  <strong>
                    {
                      profile?.community_points ||
                      0
                    }
                  </strong>

                </div>

              </div>

              <div className="point-list">

                {history.map((item) => {

                  const delta =
                    item.delta ??
                    item.community_points_change ??
                    0;

                  return (
                    <article
                      className={
                        `point-row ${
                          delta < 0
                            ? "negative"
                            : "positive"
                        }`
                      }
                      key={item.id}
                    >

                      <strong>
                        {delta > 0
                          ? "+"
                          : ""}
                        {delta}
                        {" "}
                        Punkte
                      </strong>

                      <span>
                        {item.reason}
                      </span>

                      <small>
                        {
                          new Date(
                            item.created_at
                          ).toLocaleString(
                            "de-AT"
                          )
                        }
                      </small>

                    </article>
                  );
                })}

                {!history.length && (
                  <div className="empty-card">
                    Noch keine
                    Punkteänderungen.
                  </div>
                )}

              </div>

            </section>
          )}

          {/* =================================================
              ADMIN
              ================================================= */}

          {page === "admin" &&
            isAdmin(profile?.role) && (
              <section className="admin-page">

                <div className="page-heading">

                  <div>

                    <span className="eyebrow">
                      ★ VERWALTUNG
                    </span>

                    <h1>
                      Admin-Übersicht
                    </h1>

                    <p>
                      Alle wichtigen Funktionen
                      übersichtlich an einem Ort.
                    </p>

                  </div>

                </div>

                <div className="admin-dashboard">

                  <div className="admin-stat">

                    <span>
                      Mitglieder
                    </span>

                    <strong>
                      {members.length}
                    </strong>

                  </div>

                  <div className="admin-stat">

                    <span>
                      Admins
                    </span>

                    <strong>
                      {
                        members.filter(
                          (member) =>
                            isAdmin(
                              member.role
                            )
                        ).length
                      }
                    </strong>

                  </div>

                  <div className="admin-stat">

                    <span>
                      Supporter
                    </span>

                    <strong>
                      {
                        members.filter(
                          (member) =>
                            member.role ===
                            "SUPPORTER"
                        ).length
                      }
                    </strong>

                  </div>

                </div>

                <form
                  className="panel"
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

                    {members.map((member) => (

                      <option
                        key={member.id}
                        value={member.id}
                      >
                        {getName(member)}
                      </option>
                    ))}

                  </select>

                  <input
                    type="number"
                    name="points"
                    placeholder="+ Punkte oder - Punkte"
                    required
                  />

                  <textarea
                    name="reason"
                    placeholder="Grund für die Punkteänderung"
                    required
                  />

                  <button className="primary-button">
                    Punkte ändern
                  </button>

                  <small>
                    Der Grund wird im
                    Punkteverlauf gespeichert.
                    Bei -10 Gesamtpunkten
                    wird das Konto automatisch
                    gesperrt.
                  </small>

                </form>

                <h2 className="admin-member-title">
                  Mitglieder verwalten
                </h2>

                <div className="admin-members">

                  {members
                    .slice()
                    .sort((a, b) => {
                      const rank = (member) => {
                        if (
                          isAdmin(
                            member.role
                          )
                        ) {
                          return 1;
                        }

                        if (
                          member.role ===
                          "SUPPORTER"
                        ) {
                          return 2;
                        }

                        return 3;
                      };

                      const rankDifference =
                        rank(a) - rank(b);

                      if (
                        rankDifference !== 0
                      ) {
                        return rankDifference;
                      }

                      return getName(a)
                        .localeCompare(
                          getName(b),
                          "de"
                        );
                    })
                    .map((member) => (

                      <form
                        className={
                          `admin-member-row ${
                            isAdmin(member.role)
                              ? "admin-row"
                              : member.role ===
                                "SUPPORTER"
                              ? "supporter-row"
                              : ""
                          }`
                        }
                        key={member.id}
                        onSubmit={
                          adminSaveMember
                        }
                      >

                        <input
                          type="hidden"
                          name="user_id"
                          value={member.id}
                        />

                        <div className="admin-member-user">

                          {isAdmin(member.role) && (
                            <span className="admin-star">
                              ★
                            </span>
                          )}

                          {member.role ===
                            "SUPPORTER" && (
                            <span className="supporter-star">
                              ★
                            </span>
                          )}

                          <strong>
                            {getName(member)}
                          </strong>

                        </div>

                        <input
                          name="nickname"
                          defaultValue={
                            member.nickname || ""
                          }
                          placeholder="Nickname"
                        />

                        <input
                          name="first_name"
                          defaultValue={
                            member.first_name ||
                            ""
                          }
                          placeholder="Vorname"
                        />

                        <input
                          name="last_name"
                          defaultValue={
                            member.last_name ||
                            ""
                          }
                          placeholder="Nachname"
                        />

                        <input
                          type="date"
                          name="birth_date"
                          defaultValue={
                            member.birth_date ||
                            ""
                          }
                        />

                        <select
                          name="gender"
                          defaultValue={member.gender || ""}
                          required
                        >
                          <option value="männlich">Männlich</option>
                          <option value="weiblich">Weiblich</option>
                          <option value="divers">Divers</option>
                        </select>

                        <select
                          name="role"
                          defaultValue={
                            member.role ||
                            "MEMBER"
                          }
                        >

                          {ROLES.filter(
                            (role) =>
                              isHeadAdmin(
                                profile?.role
                              ) ||
                              role !==
                                "HEAD_ADMIN"
                          ).map((role) => (
                            <option
                              key={role}
                              value={role}
                            >
                              {role}
                            </option>
                          ))}

                        </select>

                        <select
                          name="account_status"
                          defaultValue={
                            member.account_status ||
                            "ACTIVE"
                          }
                        >

                          <option value="ACTIVE">
                            Aktiv
                          </option>

                          <option value="SUSPENDED">
                            Gesperrt
                          </option>

                        </select>

                        <button>
                          Speichern
                        </button>

                      </form>
                    ))}

                </div>

              </section>
            )}

        </main>

        <aside className="quick-rail">
          <button className="quick-profile" onClick={() => setPage("profile")}>
            <img src={profile?.avatar_url || DEFAULT_AVATAR} alt="" onError={(e)=>{e.currentTarget.src=DEFAULT_AVATAR;}} />
            <span>
              <strong style={{color: profile?.nickname_color || undefined}}>
                {isAdmin(profile?.role) && <img className="inline-role-symbol" src="/Admin-star.png" alt="" />}
                {profile?.role === "SUPPORTER" && <img className="inline-role-symbol" src="/supporter-star.png" alt="" />}
                {getName(profile)}
              </strong>
              <small>Mein Bereich</small>
            </span>
          </button>
          <div className="quick-actions">
            <button onClick={() => setPage("messages")}>💬 Nachrichten</button>
            <button onClick={() => setPage("online")}>● Freunde online ({onlineFriends.length})</button>
            <button onClick={() => setPage("profile")}>♡ Freunde ({friendships.filter(f=>f.status==="ACCEPTED").length})</button>
            <button onClick={() => setPage("profile")}>👁 Besucher ({profileVisits.length})</button>
            <button onClick={() => setPage("points")}>⭐ Punkte</button>
            <button onClick={() => setPage("profile")}>⚙ Einstellungen</button>
            {isAdmin(profile?.role) && <button className="quick-admin" onClick={() => setPage("admin")}><img className="inline-role-symbol" src="/Admin-star.png" alt="" /> Admin-Tools</button>}
          </div>
        </aside>

        {/* =====================================================
            PROFIL MODAL
            ===================================================== */}

        {selectedMember && (

          <div
            className="modal-overlay"
            onClick={() =>
              setSelectedMember(null)
            }
          >

            <div
              className="profile-modal"
              onClick={(event) =>
                event.stopPropagation()
              }
            >

              <button
                className="modal-close"
                onClick={() =>
                  setSelectedMember(null)
                }
              >
                ×
              </button>

              <div
                className={
                  `modal-profile-header ${
                    isAdmin(
                      selectedMember.role
                    )
                      ? "admin"
                      : selectedMember.role ===
                        "SUPPORTER"
                      ? "supporter"
                      : ""
                  }`
                }
              >

                <div className="member-title-line">

                  {isAdmin(
                    selectedMember.role
                  ) && (
                    <img className="role-symbol" src="/Admin-star.png" alt="Admin" />
                  )}

                  {selectedMember.role ===
                    "SUPPORTER" && (
                    <img className="role-symbol" src="/supporter-star.png" alt="Supporter" />
                  )}

                  <h1
                    style={{
                      color:
                        selectedMember.nickname_color ||
                        undefined
                    }}
                  >
                    {getName(selectedMember)}
                  </h1>

                </div>

                <img
                  src={
                    selectedMember.avatar_url ||
                    DEFAULT_AVATAR
                  }
                  alt={
                    getName(selectedMember)
                  }
                  className="modal-avatar"
                  onError={(event) => {
                    event.currentTarget.src =
                      DEFAULT_AVATAR;
                  }}
                />

                <h2>
                  {
                    [
                      selectedMember.first_name,
                      selectedMember.last_name
                    ]
                    .filter(Boolean)
                    .join(" ")
                  }

                  {getAge(
                    selectedMember.birth_date
                  ) !== null && (
                    <>
                      {" · "}
                      {
                        getAge(
                          selectedMember.birth_date
                        )
                      }
                      {" Jahre"}
                    </>
                  )}

                </h2>

                <div
                  className={
                    `profile-status ${
                      selectedMember.is_online
                        ? "online"
                        : "offline"
                    }`
                  }
                >
                  <span />

                  {selectedMember.is_online
                    ? "Online"
                    : "Offline"}
                </div>

              </div>

              <div className="modal-content">

                {selectedMember.bio && (
                  <>
                    <h3>
                      Über mich
                    </h3>

                    <p>
                      {selectedMember.bio}
                    </p>
                  </>
                )}

                <div className="profile-info-grid">

                  {selectedMember.location && (
                    <div>
                      <span>
                        📍 Wohnort
                      </span>

                      <strong>
                        {
                          selectedMember.location
                        }
                      </strong>
                    </div>
                  )}

                  {selectedMember.interests && (
                    <div>
                      <span>
                        ❤️ Interessen
                      </span>

                      <strong>
                        {
                          selectedMember.interests
                        }
                      </strong>
                    </div>
                  )}

                </div>

                {selectedMember.id !==
                  user.id && (
                  <button
                    className="primary-button message-button"
                    onClick={() => {
                      setSelectedMember(null);
                      openChat(
                        selectedMember
                      );
                    }}
                  >
                    💬 Nachricht schreiben
                  </button>
                )}

              </div>

            </div>

          </div>
        )}

      </div>
    </>
  );
}


/* =========================================================
   MITGLIEDER SEKTION
   ========================================================= */

function MemberSection({
  title,
  members,
  profile,
  onOpen,
  onMessage,
  friendships = [],
  onFriend
}) {
  return (
    <section className="member-section">

      <h2>
        {title}
      </h2>

      <div className="member-grid">

        {members.map((member) => (

          <MemberCard
            key={member.id}
            member={member}
            profile={profile}
            onOpen={onOpen}
            onMessage={onMessage}
            friendships={friendships}
            onFriend={onFriend}
          />

        ))}

      </div>

      {!members.length && (
        <div className="empty-card">
          Keine Mitglieder gefunden.
        </div>
      )}

    </section>
  );
}


/* =========================================================
   MITGLIED KARTE
   ========================================================= */

function MemberCard({
  member,
  profile,
  onOpen,
  onMessage,
  friendships = [],
  onFriend
}) {
  const age =
    getAge(member.birth_date);

  const admin =
    isAdmin(member.role);

  const supporter =
    member.role === "SUPPORTER";

  const friendship = friendships.find((item) =>
    (item.requester_id === profile?.id && item.receiver_id === member.id) ||
    (item.receiver_id === profile?.id && item.requester_id === member.id)
  );
  const isFriend = friendship?.status === "ACCEPTED";

  return (
    <article
      className={
        `member-card ${
          admin
            ? "admin"
            : supporter
            ? "supporter"
            : ""
        }`
      }
      onClick={() =>
        onOpen(member)
      }
    >

      <div className="member-nickname-row">

        <div className="member-left">

          {admin && <img className="role-symbol" src="/Admin-star.png" alt="Admin" />}
          {supporter && <img className="role-symbol" src="/supporter-star.png" alt="Supporter" />}

        </div>

        <strong
          className="member-nickname"
          style={{
            color:
              member.nickname_color ||
              undefined
          }}
        >
          {getName(member)}
        </strong>

        <div className="member-right">

          {member.id !==
            profile?.id && (
            <button
              className="friend-button"
              title="Freundschaft"
              onClick={(event) => {
                event.stopPropagation();

                onFriend?.(member);
              }}
            >
              {isFriend ? <img src="/friend.png" alt="Freund" /> : "♡"}
            </button>
          )}

        </div>

      </div>

      <img
        src={
          member.avatar_url ||
          DEFAULT_AVATAR
        }
        alt={getName(member)}
        className="member-avatar"
        onError={(event) => {
          event.currentTarget.src =
            DEFAULT_AVATAR;
        }}
      />

      <div className="member-name">

        {
          [
            member.first_name,
            member.last_name
          ]
          .filter(Boolean)
          .join(" ")
        }

        {age !== null && (
          <>
            {" · "}
            {age}
          </>
        )}

      </div>

      <div
        className={
          `member-status ${
            member.is_online
              ? "online"
              : "offline"
          }`
        }
      >
        <span />

        {member.is_online
          ? "Online"
          : "Offline"}
      </div>

      {member.id !==
        profile?.id && (
        <button
          className="member-message"
          onClick={(event) => {
            event.stopPropagation();

            onMessage(member);
          }}
        >
          💬 Nachricht
        </button>
      )}

    </article>
  );
}

function showFriendMessage() {
  alert(
    "Die Freundesfunktion wird über deine bestehende Freundschaftstabelle verbunden. Die Nachrichtenfunktion ist bereits aktiv."
  );
}


/* =========================================================
   MINI MEMBER
   ========================================================= */

function MemberMini({
  member
}) {
  return (
    <div className="member-mini">

      <img
        src={
          member.avatar_url ||
          DEFAULT_AVATAR
        }
        alt=""
        onError={(event) => {
          event.currentTarget.src =
            DEFAULT_AVATAR;
        }}
      />

      <strong
        style={{
          color:
            member.nickname_color ||
            undefined
        }}
      >
        {getName(member)}
      </strong>

    </div>
  );
}


/* =========================================================
   LOGIN
   ========================================================= */

function Auth({
  login,
  register
}) {
  const [mode, setMode] =
    useState("login");

  return (
    <div className="auth-box">

      {mode === "login" ? (

        <form
          className="panel"
          onSubmit={login}
        >

          <h1>
            Anmelden
          </h1>

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
            Noch kein Konto?
            Jetzt registrieren
          </button>

        </form>

      ) : (

        <form
          className="panel"
          onSubmit={register}
        >

          <h1>
            Registrieren
          </h1>

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
          <label>
  Geschlecht *
</label>

<select
  name="gender"
  defaultValue=""
  required
>
  <option value="" disabled>
    Bitte auswählen
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

          <select name="gender" required defaultValue="">
            <option value="" disabled>Geschlecht auswählen</option>
            <option value="männlich">Männlich</option>
            <option value="weiblich">Weiblich</option>
            <option value="divers">Divers</option>
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
  );
}


/* =========================================================
   KOMPLETTES DESIGN DIREKT IN APP
   ========================================================= */

function GlobalStyle() {
  return (
    <style>{`

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family:
          Arial,
          Helvetica,
          sans-serif;
        background:
          #111318;
        color:
          #f5f7fa;
      }

      button,
      input,
      textarea,
      select {
        font: inherit;
      }

      button {
        cursor: pointer;
      }

      .loading-screen,
      .auth-page,
      .suspended-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 30px;
      }

      .loading-screen img,
      .auth-brand img,
      .suspended-box img {
        max-width: 600px;
        width: 100%;
        margin-bottom: 30px;
      }

      .auth-box {
        width: 100%;
        max-width: 500px;
      }

      .app {
        min-height: 100vh;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        min-height: 76px;
        padding: 8px 24px;
        background:
          rgba(20,22,28,.96);
        border-bottom:
          1px solid #303641;
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .brand {
        width: 170px;
        cursor: pointer;
      }

      .brand img {
        width: 100%;
        display: block;
      }

      nav {
        display: flex;
        gap: 6px;
        flex: 1;
        flex-wrap: wrap;
      }

      nav button,
      .logout-button,
      .top-profile-button {
        background:
          transparent;
        border:
          1px solid transparent;
        color:
          #d8dde5;
        padding:
          9px 12px;
        border-radius:
          10px;
      }

      nav button:hover,
      nav button.active {
        background:
          #292f38;
        border-color:
          #424a57;
        color: white;
      }

      .top-profile {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .top-profile-button {
        border:
          2px solid #59616d;
        font-weight: 700;
      }

      .top-profile-button.admin-border {
        border-color:
          #f2c94c;
        background:
          rgba(242,201,76,.08);
      }

      .top-profile-button.supporter-border {
        border-color:
          #42d878;
        background:
          rgba(66,216,120,.08);
      }

      .small-admin-star {
        color:
          #ffd633;
        margin-right: 5px;
      }

      .logout-button {
        color:
          #ff8181;
      }

      main {
        width: min(1450px, 100%);
        margin: auto;
        padding:
          36px 24px 80px;
      }

      .hero {
        border-radius: 22px;
        overflow: hidden;
        border:
          1px solid #343b47;
        margin-bottom: 30px;
      }

      .hero img {
        width: 100%;
        display: block;
      }

      .page-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 30px;
      }

      .page-heading h1 {
        font-size: clamp(32px,5vw,54px);
        margin: 4px 0 8px;
      }

      .page-heading p {
        margin: 0;
        color:
          #aeb7c4;
        font-size: 17px;
      }

      .eyebrow {
        color:
          #ff6b25;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 2px;
      }

      .search-input {
        width: min(360px,100%);
      }

      input,
      textarea,
      select {
        width: 100%;
        border:
          1px solid #424a57;
        background:
          #171a20;
        color:
          white;
        padding:
          13px 14px;
        border-radius:
          10px;
        outline: none;
      }

      textarea {
        min-height: 110px;
        resize: vertical;
      }

      input:focus,
      textarea:focus,
      select:focus {
        border-color:
          #ff6b25;
      }

      .panel {
        background:
          #1b1f26;
        border:
          1px solid #343b47;
        border-radius:
          18px;
        padding:
          22px;
        display: grid;
        gap: 13px;
        margin-bottom: 25px;
      }

      .primary-button {
        border: 0;
        background:
          linear-gradient(
            135deg,
            #ff5b1f,
            #ff8a28
          );
        color:
          white;
        padding:
          13px 18px;
        border-radius:
          10px;
        font-weight: 800;
      }

      .text-button,
      .back-button {
        border: 0;
        background: transparent;
        color:
          #ff7a36;
        padding: 8px 0;
      }

      .admin-home-tools {
        margin:
          30px 0 40px;
        padding:
          22px;
        border:
          1px solid #5d4d16;
        background:
          linear-gradient(
            135deg,
            rgba(242,201,76,.10),
            rgba(0,0,0,0)
          );
        border-radius:
          18px;
      }

      .admin-tool-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit,minmax(170px,1fr));
        gap: 12px;
      }

      .admin-tool-grid button {
        min-height: 105px;
        border:
          1px solid #51461d;
        background:
          #211f19;
        color: white;
        border-radius:
          14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .admin-tool-grid span {
        font-size: 28px;
      }

      .admin-home-badge {
        color:
          #ffd633;
        font-weight: 900;
        border:
          1px solid #806a18;
        padding:
          12px 16px;
        border-radius:
          12px;
        background:
          #2c2612;
      }

      .news-grid,
      .cards {
        display: grid;
        grid-template-columns:
          repeat(auto-fill,minmax(260px,1fr));
        gap: 16px;
      }

      .news-card,
      .group-card,
      .empty-card {
        background:
          #1b1f26;
        border:
          1px solid #343b47;
        border-radius:
          16px;
        padding:
          20px;
      }

      .news-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .news-card p {
        color:
          #b9c0ca;
        line-height: 1.55;
      }

      .group-card {
        padding: 0;
        overflow: hidden;
      }

      .group-card img {
        width: 100%;
        height: 170px;
        object-fit: cover;
      }

      .group-card > div {
        padding: 18px;
      }

      .member-section {
        margin-bottom: 42px;
      }

      .member-section h2 {
        margin-bottom: 16px;
      }

      .member-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fill,minmax(185px,1fr));
        gap: 14px;
      }

      .member-card {
        min-height: 280px;
        background:
          #1d2128;
        border:
          2px solid #515966;
        border-radius:
          16px;
        padding:
          12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        transition:
          transform .2s,
          box-shadow .2s;
        cursor: pointer;
      }

      .member-card:hover {
        transform:
          translateY(-4px);
        box-shadow:
          0 15px 30px rgba(0,0,0,.28);
      }

      .member-card.admin {
        border-color:
          #e5bf31;
        background:
          linear-gradient(
            145deg,
            #403719,
            #242114
          );
      }

      .member-card.supporter {
        border-color:
          #38c96b;
        background:
          linear-gradient(
            145deg,
            #173d26,
            #14251a
          );
      }

      .member-nickname-row {
        width: 100%;
        min-height: 30px;
        display: grid;
        grid-template-columns:
          30px 1fr 30px;
        align-items: center;
        margin-bottom: 8px;
      }

      .member-left,
      .member-right {
        min-width: 30px;
      }

      .member-nickname {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 17px;
      }

      .admin-star {
        color:
          #ffd633;
        font-size: 23px;
        text-shadow:
          0 0 9px rgba(255,214,51,.45);
      }

      .supporter-star {
        color:
          #3ce278;
        font-size: 22px;
        text-shadow:
          0 0 9px rgba(60,226,120,.45);
      }

      .friend-button {
        background: transparent;
        border: 0;
        color:
          white;
        font-size: 20px;
      }

      .member-avatar {
        width: 86px;
        height: 86px;
        object-fit: cover;
        border-radius: 50%;
        border:
          3px solid #68717d;
        background:
          #252b34;
        margin:
          4px 0 12px;
      }

      .member-card.admin .member-avatar {
        border-color:
          #f2c94c;
      }

      .member-card.supporter .member-avatar {
        border-color:
          #3ce278;
      }

      .member-name {
        min-height: 24px;
        font-size: 14px;
        font-weight: 600;
        color:
          #d9dee5;
      }

      .member-status,
      .profile-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        margin-top: 10px;
        font-size: 13px;
      }

      .member-status span,
      .profile-status span {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }

      .online {
        color:
          #49db7d;
      }

      .online span {
        background:
          #49db7d;
      }

      .offline {
        color:
          #9da6b1;
      }

      .offline span {
        background:
          #9da6b1;
      }

      .member-message {
        width: 100%;
        margin-top: auto;
        padding:
          8px 10px;
        border-radius:
          9px;
        border:
          1px solid #4b5563;
        background:
          #292e37;
        color:
          white;
      }

      .my-area-layout {
        display: grid;
        grid-template-columns:
          minmax(260px,340px) 1fr;
        gap: 24px;
        align-items: start;
      }

      .my-profile-card {
        background:
          #1b1f26;
        border:
          3px solid #58616d;
        border-radius:
          20px;
        padding:
          24px;
        text-align: center;
      }

      .my-profile-card.admin-profile {
        border-color:
          #f2c94c;
        background:
          linear-gradient(
            145deg,
            #332d17,
            #1b1d21
          );
      }

      .my-profile-card.supporter-profile {
        border-color:
          #3ce278;
      }

      .my-profile-top {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
      }

      .my-profile-top h1 {
        margin: 0;
      }

      .admin-star-large {
        color:
          #ffd633;
        font-size: 28px;
      }

      .my-avatar {
        width: 145px;
        height: 145px;
        border-radius: 50%;
        object-fit: cover;
        border:
          4px solid #626b78;
        margin:
          24px 0 10px;
      }

      .admin-profile .my-avatar {
        border-color:
          #f2c94c;
      }

      .supporter-profile .my-avatar {
        border-color:
          #3ce278;
      }

      .profile-points {
        margin-top: 24px;
      }

      .profile-points button {
        width: 100%;
        padding:
          16px;
        border:
          1px solid #4b5563;
        border-radius:
          13px;
        background:
          #272c34;
        color:
          white;
      }

      .profile-points strong {
        font-size: 22px;
        margin:
          0 5px;
      }

      .points-overview {
        margin-bottom: 24px;
      }

      .points-overview > div {
        background:
          #222831;
        border:
          1px solid #3c4552;
        border-radius:
          18px;
        padding:
          28px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .points-overview strong {
        font-size: 48px;
        color:
          #ffd633;
      }

      .point-list {
        display: grid;
        gap: 10px;
      }

      .point-row {
        padding:
          16px;
        border-radius:
          12px;
        background:
          #20252d;
        border-left:
          4px solid #667080;
        display: grid;
        gap: 5px;
      }

      .point-row.positive {
        border-left-color:
          #3ce278;
      }

      .point-row.negative {
        border-left-color:
          #ff5555;
      }

      .point-row small {
        color:
          #8d97a4;
      }

      .messages-page {
        max-width: 1000px;
      }

      .message-overview {
        display: grid;
        gap: 10px;
      }

      .message-preview {
        text-align: left;
        display: grid;
        gap: 5px;
        padding:
          16px;
        border-radius:
          12px;
        background:
          #20252d;
        border:
          1px solid #39414c;
        color:
          white;
      }

      .message-preview span {
        color:
          #abb4bf;
      }

      .message-count {
        margin-left: 5px;
        min-width: 19px;
        height: 19px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background:
          #ff5b1f;
        font-size: 11px;
      }

      .chat-box {
        background:
          #181c22;
        border:
          1px solid #343c47;
        border-radius:
          18px;
        overflow: hidden;
      }

      .chat-header {
        padding:
          15px;
        display: flex;
        align-items: center;
        gap: 15px;
        border-bottom:
          1px solid #343c47;
      }

      .member-mini {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .member-mini img {
        width: 42px;
        height: 42px;
        object-fit: cover;
        border-radius: 50%;
      }

      .chat-messages {
        min-height: 430px;
        max-height: 60vh;
        overflow-y: auto;
        padding:
          20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .chat-message {
        max-width: 75%;
        padding:
          12px 15px;
        background:
          #2b313b;
        border-radius:
          14px 14px 14px 4px;
      }

      .chat-message.mine {
        align-self: flex-end;
        background:
          #164b2a;
        border-radius:
          14px 14px 4px 14px;
      }

      .chat-message p {
        margin: 6px 0;
      }

      .chat-message small {
        color:
          #a9b2bc;
      }

      .message-form {
        padding:
          15px;
        border-top:
          1px solid #343c47;
        display: flex;
        gap: 10px;
      }

      .message-form textarea {
        min-height: 60px;
      }

      .admin-dashboard {
        display: grid;
        grid-template-columns:
          repeat(auto-fit,minmax(180px,1fr));
        gap: 14px;
        margin-bottom: 25px;
      }

      .admin-stat {
        background:
          #201e16;
        border:
          1px solid #64521b;
        border-radius:
          16px;
        padding:
          22px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .admin-stat strong {
        font-size: 36px;
        color:
          #ffd633;
      }

      .admin-member-title {
        margin:
          40px 0 15px;
      }

      .admin-members {
        display: grid;
        gap: 10px;
      }

      .admin-member-row {
        background:
          #1c2128;
        border:
          1px solid #353e4a;
        border-radius:
          14px;
        padding:
          12px;
        display: grid;
        grid-template-columns:
          170px repeat(6,minmax(110px,1fr)) auto;
        gap: 8px;
        align-items: center;
      }

      .admin-member-row.admin-row {
        background:
          #332c16;
        border-color:
          #c9a92b;
      }

      .admin-member-row.supporter-row {
        background:
          #173d25;
        border-color:
          #37bd69;
      }

      .admin-member-user {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .admin-member-row button {
        padding:
          10px 13px;
        border: 0;
        border-radius:
          9px;
        background:
          #ff6b25;
        color:
          white;
        font-weight: 700;
      }

      .modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background:
          rgba(0,0,0,.72);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }

      .profile-modal {
        width:
          min(650px,100%);
        max-height:
          90vh;
        overflow-y: auto;
        position: relative;
        background:
          #1a1e25;
        border-radius:
          22px;
        border:
          1px solid #414a57;
      }

      .modal-close {
        position: absolute;
        top: 12px;
        right: 14px;
        z-index: 2;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 0;
        background:
          rgba(0,0,0,.35);
        color:
          white;
        font-size: 25px;
      }

      .modal-profile-header {
        text-align: center;
        padding:
          35px 25px 25px;
        border-bottom:
          1px solid #363e49;
      }

      .modal-profile-header.admin {
        background:
          linear-gradient(
            135deg,
            #443916,
            #1a1e25
          );
      }

      .modal-profile-header.supporter {
        background:
          linear-gradient(
            135deg,
            #174329,
            #1a1e25
          );
      }

      .member-title-line {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .modal-avatar {
        width: 120px;
        height: 120px;
        object-fit: cover;
        border-radius: 50%;
        border:
          4px solid #626b78;
        margin: 18px 0 5px;
      }

      .modal-content {
        padding:
          25px;
      }

      .profile-info-grid {
        display: grid;
        grid-template-columns:
          repeat(auto-fit,minmax(180px,1fr));
        gap: 10px;
        margin:
          20px 0;
      }

      .profile-info-grid > div {
        padding:
          13px;
        background:
          #232832;
        border-radius:
          11px;
        display: grid;
        gap: 5px;
      }

      .profile-info-grid span {
        color:
          #9da7b3;
        font-size: 13px;
      }

      .message-button {
        width: 100%;
      }

      .toast {
        position: fixed;
        z-index: 200;
        right: 24px;
        bottom: 24px;
        max-width: 400px;
        padding:
          14px 18px;
        background:
          #252c35;
        border:
          1px solid #4a5665;
        border-radius:
          12px;
        box-shadow:
          0 15px 40px rgba(0,0,0,.4);
      }

      .suspended-box {
        width:
          min(750px,100%);
        background:
          #1b1f26;
        border:
          1px solid #763737;
        border-radius:
          22px;
        padding:
          35px;
        text-align: center;
      }

      .suspension-reason {
        margin:
          20px 0;
        padding:
          18px;
        background:
          #311c20;
        border-left:
          4px solid #ff5555;
        text-align: left;
        border-radius:
          10px;
      }

      .suspended-points {
        padding:
          20px;
        background:
          #222831;
        border-radius:
          14px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        margin-bottom: 25px;
      }

      .suspended-points strong {
        color:
          #ff6b6b;
        font-size: 40px;
      }

      .danger-button {
        margin-top: 25px;
        border: 0;
        background:
          #a93434;
        color:
          white;
        padding:
          12px 18px;
        border-radius:
          10px;
      }


      .role-symbol { width: 23px; height: 23px; object-fit: contain; vertical-align: middle; flex: 0 0 auto; }
      .role-symbol-large { width: 30px; height: 30px; object-fit: contain; }
      .inline-role-symbol { width: 17px; height: 17px; object-fit: contain; vertical-align: -3px; margin-right: 4px; }
      .friend-button img { width: 20px; height: 20px; object-fit: contain; display:block; }
      .form-help { display:block; color:#9da6b1; margin:-4px 0 4px; }
      .quick-rail { position:fixed; right:16px; top:94px; width:210px; z-index:15; background:rgba(24,27,34,.97); border:1px solid #3a424f; border-radius:16px; padding:10px; box-shadow:0 16px 40px rgba(0,0,0,.28); }
      .quick-profile { width:100%; display:flex; align-items:center; gap:9px; background:#20252d; color:#fff; border:1px solid #414956; border-radius:12px; padding:9px; text-align:left; }
      .quick-profile img { width:38px; height:38px; border-radius:50%; object-fit:cover; border:2px solid #68717d; }
      .quick-profile strong,.quick-profile small { display:block; }
      .quick-profile small { color:#aeb7c3; margin-top:2px; }
      .quick-actions { display:grid; gap:5px; margin-top:9px; }
      .quick-actions button { width:100%; text-align:left; background:#171b21; color:#dce2e9; border:1px solid #303844; border-radius:9px; padding:8px 9px; font-size:13px; }
      .quick-actions button:hover { background:#292f38; color:#fff; }
      .quick-actions .quick-admin { border-color:#e5bf31; background:rgba(229,191,49,.08); }
      @media (min-width: 1280px) { main { margin-right:250px; width:auto; max-width:1450px; } }
      @media (max-width: 1279px) { .quick-rail { position:static; width:auto; margin:0 24px 24px; } .quick-actions { grid-template-columns:repeat(2,minmax(0,1fr)); } }

      @media (max-width: 1100px) {

        .topbar {
          flex-wrap: wrap;
        }

        .brand {
          width: 150px;
        }

        .top-profile {
          margin-left: auto;
        }

        .admin-member-row {
          grid-template-columns:
            1fr 1fr;
        }

      }

      @media (max-width: 800px) {

        .topbar {
          padding:
            10px 14px;
        }

        nav {
          order: 3;
          width: 100%;
          overflow-x: auto;
          flex-wrap: nowrap;
        }

        nav button {
          white-space: nowrap;
        }

        main {
          padding:
            24px 14px 60px;
        }

        .page-heading {
          flex-direction: column;
          align-items: stretch;
        }

        .my-area-layout {
          grid-template-columns:
            1fr;
        }

        .message-form {
          flex-direction: column;
        }

        .admin-member-row {
          grid-template-columns:
            1fr;
        }

      }

    `}</style>
  );
}
