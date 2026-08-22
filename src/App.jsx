import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigError } from "./supabase";

const ADMIN_ROLES = ["ADMIN", "HEAD_ADMIN"];

function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

function getAge(birthDate) {
  if (!birthDate) return null;
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const month = today.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

function initials(member) {
  return (
    member?.nickname?.trim()?.slice(0, 1)?.toUpperCase() ||
    member?.first_name?.trim()?.slice(0, 1)?.toUpperCase() ||
    "?"
  );
}

function roleClass(role) {
  if (isAdmin(role)) return "admin";
  if (role === "SUPPORTER") return "supporter";
  return "member";
}

function Avatar({ member, size = "" }) {
  return (
    <div className={`avatar ${size}`}>
      {member?.avatar_url ? (
        <img src={member.avatar_url} alt={member.nickname || "Profilbild"} />
      ) : (
        initials(member)
      )}
    </div>
  );
}

function RoleStar({ member }) {
  if (!member || (!isAdmin(member.role) && member.role !== "SUPPORTER")) return null;
  return (
    <span
      className={`role-star ${isAdmin(member.role) ? "red" : "green"}`}
      title={isAdmin(member.role) ? "Admin" : "Supporter"}
    >
      ★
    </span>
  );
}

function Status({ member }) {
  return (
    <span className={`status ${member?.is_online ? "online" : "offline"}`}>
      <i /> {member?.is_online ? "Online" : "Offline"}
    </span>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("members");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [adminOpen, setAdminOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editingOwnProfile, setEditingOwnProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});

  const user = session?.user;
  const admin = isAdmin(profile?.role);

  function showNotice(message) {
    setNotice(message || "");
    if (message) window.setTimeout(() => setNotice(""), 5000);
  }

  async function loadProfile(userId) {
    if (!userId) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    setProfile(data || null);
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("community_points", { ascending: false });
    if (error) throw error;
    setMembers(data || []);
  }

  async function loadFriends(userId) {
    if (!userId) {
      setFriends([]);
      return;
    }
    const { data, error } = await supabase
      .from("friendships")
      .select("id, requester_id, receiver_id, status")
      .eq("status", "ACCEPTED")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);
    if (error) throw error;

    const ids = [...new Set((data || []).map((row) =>
      row.requester_id === userId ? row.receiver_id : row.requester_id
    ))];

    if (!ids.length) {
      setFriends([]);
      return;
    }

    const { data: friendProfiles, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    if (profileError) throw profileError;
    setFriends(friendProfiles || []);
  }

  async function loadPending() {
    if (!admin) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("status", "PENDING_ADMIN")
      .order("created_at", { ascending: true });
    if (!error) setPending(data || []);
  }

  async function loadVisitors() {
    if (!user) return;
    const { data, error } = await supabase
      .from("profile_visits")
      .select("visitor_id, visited_at")
      .eq("profile_id", user.id)
      .order("visited_at", { ascending: false })
      .limit(20);

    if (error || !data?.length) {
      setVisitors([]);
      return;
    }

    const ids = [...new Set(data.map((row) => row.visitor_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids);

    const map = new Map((profiles || []).map((p) => [p.id, p]));
    setVisitors(data.map((row) => ({ ...map.get(row.visitor_id), visited_at: row.visited_at })).filter(Boolean));
  }

  async function refreshAll(userId = user?.id) {
    setLoading(true);
    try {
      await Promise.all([loadMembers(), loadProfile(userId), loadFriends(userId)]);
    } catch (error) {
      showNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabase || supabaseConfigError) {
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      if (session?.user) await refreshAll(session.user.id);
      else {
        await loadMembers().catch((error) => showNotice(error.message));
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        window.setTimeout(() => refreshAll(nextSession.user.id), 0);
      } else {
        setProfile(null);
        setFriends([]);
        setPending([]);
        setVisitors([]);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !profile) return;

    supabase
      .from("profiles")
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq("id", user.id)
      .then(() => {});

    const timer = window.setInterval(() => {
      supabase
        .from("profiles")
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq("id", user.id)
        .then(() => {});
    }, 60000);

    return () => window.clearInterval(timer);
  }, [user?.id, profile?.id]);

  useEffect(() => {
    if (!admin) {
      setPending([]);
      return;
    }
    loadPending();
  }, [admin, members.length]);

  useEffect(() => {
    loadVisitors();
  }, [user?.id]);

  const filteredMembers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return members.filter((m) => m.status !== "REJECTED");
    return members.filter((m) =>
      `${m.nickname || ""} ${m.first_name || ""} ${m.last_name || ""}`
        .toLowerCase()
        .includes(value)
    );
  }, [members, search]);

  async function openMember(member) {
    setSelectedMember(member);
    setProfileOpen(true);
    setEditingOwnProfile(Boolean(user && member?.id === user.id));
    if (user && member?.id === user.id) {
      setProfileForm({
        nickname: member.nickname || "",
        first_name: member.first_name || "",
        last_name: member.last_name || "",
        birth_date: member.birth_date || "",
        bio: member.bio || "",
        location: member.location || "",
        website: member.website || "",
        interests: member.interests || "",
      });
    }

    if (user && member?.id && member.id !== user.id) {
      await supabase.from("profile_visits").insert({
        profile_id: member.id,
        visitor_id: user.id,
        visited_at: new Date().toISOString(),
      }).then(() => {});
    }
  }

  async function toggleFriend(member) {
    if (!user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    if (member.id === user.id) return;

    const existing = friends.find((friend) => friend.id === member.id);

    if (existing) {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .or(
          `and(requester_id.eq.${user.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${user.id})`
        );
      if (error) return showNotice(error.message);
      showNotice("Freundschaft entfernt.");
    } else {
      const { data: relation } = await supabase
        .from("friendships")
        .select("id,status")
        .or(
          `and(requester_id.eq.${user.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${user.id})`
        )
        .maybeSingle();

      if (relation?.status === "PENDING") {
        return showNotice("Eine Freundschaftsanfrage ist bereits offen.");
      }

      const { error } = await supabase.from("friendships").insert({
        requester_id: user.id,
        receiver_id: member.id,
        status: "ACCEPTED",
      });
      if (error) return showNotice(error.message);
      showNotice(`${member.nickname} wurde zu deinen Freunden hinzugefügt.`);
    }

    await refreshAll(user.id);
  }

  async function updateRole(member, role) {
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", member.id);
    if (error) return showNotice(error.message);
    showNotice("Rolle gespeichert.");
    await loadMembers();
  }

  async function changePoints(member) {
    const value = window.prompt(`Punkte für ${member.nickname}:`, member.community_points || 0);
    if (value === null) return;
    const points = Number(value);
    if (!Number.isFinite(points) || points < 0) {
      return showNotice("Bitte eine gültige Punktezahl eingeben.");
    }
    const { error } = await supabase
      .from("profiles")
      .update({ community_points: points })
      .eq("id", member.id);
    if (error) return showNotice(error.message);
    await loadMembers();
  }

  async function approveMember(memberId, approved) {
    const { error } = await supabase
      .from("profiles")
      .update({ status: approved ? "APPROVED" : "REJECTED" })
      .eq("id", memberId);
    if (error) return showNotice(error.message);
    showNotice(approved ? "Mitglied freigegeben." : "Registrierung abgelehnt.");
    await Promise.all([loadMembers(), loadPending()]);
  }

  async function saveOwnProfile(event) {
    event.preventDefault();
    if (!user || !profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({
        nickname: String(profileForm.nickname || "").trim(),
        first_name: String(profileForm.first_name || "").trim(),
        last_name: String(profileForm.last_name || "").trim(),
        birth_date: profileForm.birth_date || null,
        bio: String(profileForm.bio || "").trim(),
        location: String(profileForm.location || "").trim(),
        website: String(profileForm.website || "").trim(),
        interests: String(profileForm.interests || "").trim(),
      })
      .eq("id", user.id);

    if (error) return showNotice(error.message);

    await refreshAll(user.id);
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) {
      setSelectedMember(data);
      setProfile(data);
    }
    setEditingOwnProfile(false);
    showNotice("Profil gespeichert.");
  }

  async function signOut() {
    if (user) {
      await supabase
        .from("profiles")
        .update({ is_online: false, last_seen: new Date().toISOString() })
        .eq("id", user.id);
    }
    const { error } = await supabase.auth.signOut();
    if (error) return showNotice(error.message);
    setPage("members");
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const nickname = String(form.get("nickname") || "").trim();
    const first_name = String(form.get("first_name") || "").trim();
    const last_name = String(form.get("last_name") || "").trim();
    const birth_date = String(form.get("birth_date") || "").trim();

    if (!email || !password) return showNotice("Bitte E-Mail und Passwort eingeben.");

    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return showNotice(error.message);
      setAuthOpen(false);
      return;
    }

    if (!nickname || !first_name || !last_name || !birth_date) {
      return showNotice("Bitte alle Pflichtfelder inklusive Geburtsdatum ausfüllen.");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname, first_name, last_name, birth_date },
      },
    });

    if (error) return showNotice(error.message);

    if (data.user && !data.session) {
      showNotice("Registrierung gespeichert. Falls E-Mail-Bestätigung aktiviert ist, bestätige deine E-Mail.");
    } else {
      showNotice("Registrierung erfolgreich.");
      setAuthOpen(false);
    }
  }

  if (supabaseConfigError) {
    return <div className="fatal-error">Supabase-Konfiguration fehlt: {supabaseConfigError}</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("members")}>
          <img src="/logo.png" alt="Ennstal Connect" onError={(e) => (e.currentTarget.style.display = "none")} />
          <span><b>ennstal</b><strong>connect</strong><small>DIE REGIONALE COMMUNITY FÜR ENNSTAL & OBERSTEIERMARK</small></span>
        </button>

        <nav className="main-nav">
          <button onClick={() => setPage("start")} className={page === "start" ? "active" : ""}>⌂ <span>Start</span></button>
          <button onClick={() => setPage("members")} className={page === "members" ? "active" : ""}>♙ <span>Mitglieder</span></button>
          <button onClick={() => setPage("groups")} className={page === "groups" ? "active" : ""}>♧ <span>Gruppen</span></button>
          <button onClick={() => setPage("events")} className={page === "events" ? "active" : ""}>▣ <span>Events</span></button>
        </nav>

        <div className="top-actions">
          <button className="icon-button" onClick={() => setPage("members")} title="Suche">⌕</button>
          {user ? (
            <>
              <button className="icon-button notification" title="Benachrichtigungen">♧<b>{pending.length || 0}</b></button>
              <button className="user-button" onClick={() => openMember(profile)}>
                <Avatar member={profile} size="tiny" />⌄
              </button>
            </>
          ) : (
            <>
              <button className="ghost" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Anmelden</button>
              <button className="primary" onClick={() => { setAuthMode("register"); setAuthOpen(true); }}>Registrieren</button>
            </>
          )}
        </div>
      </header>

      <main className="dashboard">
        <section className="content-column">
          {page === "members" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Mitglieder</h1>
                  <p>Entdecke Menschen aus deiner Region und vernetze dich mit ihnen.</p>
                </div>
              </div>

              <div className="search-row">
                <div className="search-box">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mitglieder oder Nickname suchen ..." />
                  <span>⌕</span>
                </div>
                <button className="filter-button">⚱ Filter</button>
              </div>

              {loading ? <p className="loading">Mitglieder werden geladen …</p> : (
                <section className="member-grid">
                  {filteredMembers.map((member) => {
                    const friend = friends.some((item) => item.id === member.id);
                    return (
                      <article className={`member-card ${roleClass(member.role)}`} key={member.id}>
                        <div className="card-corner">
                          <RoleStar member={member} />
                          {user && member.id !== user.id && (
                            <button
                              className={`friend-badge ${friend ? "is-friend" : ""}`}
                              onClick={() => toggleFriend(member)}
                              title={friend ? "Freundschaft entfernen" : "Zu Freunden hinzufügen"}
                            >
                              {friend ? "♣" : "♧"}
                            </button>
                          )}
                        </div>

                        <button className="member-main" onClick={() => openMember(member)}>
                          <Avatar member={member} />
                          <h2>{member.nickname || "Mitglied"}{getAge(member.birth_date) !== null ? ` (${getAge(member.birth_date)})` : ""}</h2>
                          <p>{[member.first_name, member.last_name].filter(Boolean).join(" ") || "Community-Mitglied"}</p>
                          <strong className="points">{Number(member.community_points || 0).toLocaleString("de-AT")} Punkte</strong>
                          <Status member={member} />
                        </button>

                        {admin && member.id !== user.id && (
                          <div className="card-admin-actions">
                            <button onClick={() => changePoints(member)}>Punkte</button>
                            <button onClick={() => updateRole(member, member.role === "SUPPORTER" ? "MEMBER" : "SUPPORTER")}>Supporter</button>
                            <button onClick={() => updateRole(member, isAdmin(member.role) ? "MEMBER" : "ADMIN")}>Admin</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              )}

              <section className="legend">
                <span><RoleStar member={{ role: "ADMIN" }} /> Admins</span>
                <span><RoleStar member={{ role: "SUPPORTER" }} /> Supporter</span>
                <span><i className="legend-dot" /> Mitglieder</span>
                <span><i className="legend-dot online-dot" /> Online</span>
                <span><i className="legend-dot" /> Offline</span>
              </section>

              {user && (
                <section className="friends-panel">
                  <div className="section-title">
                    <h2>Deine Freunde ({friends.length})</h2>
                    <button onClick={() => setSearch("")}>Alle anzeigen →</button>
                  </div>
                  <div className="friend-strip">
                    {friends.length ? friends.map((friend) => (
                      <button className="friend-tile" key={friend.id} onClick={() => openMember(friend)}>
                        <Avatar member={friend} size="small" />
                        <span>{friend.nickname}</span>
                        <b>♣</b>
                      </button>
                    )) : <p>Noch keine Freunde hinzugefügt.</p>}
                  </div>
                </section>
              )}

              {page === "start" && <section className="empty-page"><h2>Willkommen bei Ennstal Connect</h2></section>}
            </>
          )}

          {page === "groups" && <section className="empty-page"><h1>Gruppen</h1><p>Deine Gruppenübersicht ist bereit für deine bestehenden Gruppendaten.</p></section>}
          {page === "events" && <section className="empty-page"><h1>Events</h1><p>Hier können regionale Veranstaltungen angezeigt werden.</p></section>}
          {page === "start" && <section className="empty-page"><h1>Willkommen bei Ennstal Connect</h1></section>}
          {page === "privacy" && <section className="empty-page legal-page"><h1>Datenschutz</h1><p>Diese Datenschutzerklärung informiert über die Verarbeitung personenbezogener Daten innerhalb von Ennstal Connect. Personenbezogene Daten werden nur verarbeitet, soweit dies für Registrierung, Profil, Community-Funktionen und den Betrieb der Plattform erforderlich ist.</p><p>Mitglieder können ihre Profildaten im eigenen Profil bearbeiten. Für Auskunfts-, Berichtigungs- oder Löschanfragen kann der Kontaktbereich verwendet werden.</p></section>}
          {page === "imprint" && <section className="empty-page legal-page"><h1>Impressum</h1><p><strong>Ennstal Connect</strong><br />8700 Leoben</p><p><strong>Verantwortlich für den Inhalt:</strong><br />Marco Egger</p></section>}
          {page === "about" && <section className="empty-page"><h1>Über uns</h1><p>Ennstal Connect ist die regionale Community für Ennstal und Obersteiermark.</p></section>}
          {page === "rules" && <section className="empty-page"><h1>Community Regeln</h1><p>Respektvoller Umgang, keine beleidigenden Inhalte und keine missbräuchliche Nutzung der Community.</p></section>}
          {page === "contact" && <section className="empty-page"><h1>Kontakt</h1><p>Kontaktmöglichkeiten können hier von der Administration ergänzt werden.</p></section>}
        </section>

        <aside className="right-sidebar">
          {user && profile && (
            <section className="side-card my-area">
              <div className="side-title">
                <h2>⌂ Mein Bereich</h2>
              </div>
              <button onClick={() => openMember(profile)}>◉ Mein Profil</button>
              <button onClick={() => setPage("members")}>♧ Freunde</button>
              <button onClick={() => showNotice("Nachrichten können über deine bestehende Nachrichten-Tabelle verbunden werden.")}>✉ Nachrichten</button>
              <button onClick={loadVisitors}>◌ Besucher ({visitors.length})</button>
              <button className="logout" onClick={signOut}>↪ Abmelden</button>
            </section>
          )}

          {admin && (
            <section className="side-card admin-area">
              <div className="side-title">
                <h2>♜ Admin Bereich</h2>
                <button className="admin-chip" onClick={() => setAdminOpen(!adminOpen)}>ADMIN</button>
              </div>
              <button onClick={() => setAdminOpen(!adminOpen)}>♙ Mitglieder verwalten</button>
              <button onClick={loadPending}>♧ Freigaben <b>{pending.length}</b></button>
              <button onClick={() => showNotice("Punkte können direkt über die Mitgliederkarten geändert werden.")}>★ Punkteverlauf</button>
              <button onClick={() => setPage("members")}>⌕ Profilsuche</button>
              <button onClick={() => showNotice("Meldungen sind für deine vorhandene Meldungsfunktion reserviert.")}>⚑ Meldungen</button>

              {adminOpen && (
                <div className="admin-list">
                  <h3>Offene Registrierungen</h3>
                  {!pending.length && <p>Keine offenen Registrierungen.</p>}
                  {pending.map((member) => (
                    <div className="pending-row" key={member.id}>
                      <Avatar member={member} size="tiny" />
                      <span>{member.nickname}</span>
                      <button onClick={() => approveMember(member.id, true)}>✓</button>
                      <button onClick={() => approveMember(member.id, false)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="side-card friends-side">
            <div className="side-title">
              <h2>♧ Freunde ({friends.length})</h2>
            </div>
            {friends.length ? friends.slice(0, 8).map((friend) => (
              <button className="side-friend" key={friend.id} onClick={() => openMember(friend)}>
                <Avatar member={friend} size="tiny" />
                <span>{friend.nickname}<Status member={friend} /></span>
                <b>▢</b>
              </button>
            )) : <p>Deine Freundesliste ist noch leer.</p>}
          </section>

          {user && (
            <section className="side-card visitors-side">
              <div className="side-title"><h2>◌ Besucher</h2></div>
              {visitors.length ? visitors.slice(0, 6).map((visitor, index) => (
                <button className="side-friend" key={`${visitor.id}-${index}`} onClick={() => openMember(visitor)}>
                  <Avatar member={visitor} size="tiny" />
                  <span>{visitor.nickname}</span>
                </button>
              )) : <p>Noch keine Besucher gespeichert.</p>}
            </section>
          )}
        </aside>
      </main>

      <footer>
        <button onClick={() => setPage("about")}>ⓘ Über uns</button>
        <button onClick={() => setPage("rules")}>♢ Community Regeln</button>
        <button onClick={() => setPage("privacy")}>▣ Datenschutz</button>
        <button onClick={() => setPage("imprint")}>⚖ Impressum</button>
        <button onClick={() => setPage("contact")}>✉ Kontakt</button>
        <p>© 2026 <b>Ennstal Connect</b> – Die Regionale Community für Ennstal & Obersteiermark</p>
      </footer>

      {notice && <div className="toast">{notice}</div>}

      {authOpen && (
        <div className="modal-backdrop" onMouseDown={() => setAuthOpen(false)}>
          <form className="auth-modal" onSubmit={submitAuth} onMouseDown={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setAuthOpen(false)}>×</button>
            <h2>{authMode === "login" ? "Anmelden" : "Registrieren"}</h2>

            {authMode === "register" && (
              <div className="two-cols">
                <input name="first_name" placeholder="Vorname" required />
                <input name="last_name" placeholder="Nachname" required />
                <input name="nickname" placeholder="Nickname" required />
                <input type="date" name="birth_date" aria-label="Geburtsdatum" required />
              </div>
            )}

            <input type="email" name="email" placeholder="E-Mail-Adresse" required />
            <input type="password" name="password" minLength="6" placeholder="Passwort" required />
            <button className="primary submit" type="submit">
              {authMode === "login" ? "Jetzt anmelden" : "Konto erstellen"}
            </button>
            <button
              type="button"
              className="switch-auth"
              onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
            >
              {authMode === "login" ? "Noch kein Konto? Registrieren" : "Bereits registriert? Anmelden"}
            </button>
          </form>
        </div>
      )}

      {profileOpen && selectedMember && (
        <div className="modal-backdrop" onMouseDown={() => setProfileOpen(false)}>
          <section className="profile-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setProfileOpen(false)}>×</button>
            <div className={`profile-cover ${roleClass(selectedMember.role)}`}>
              <Avatar member={selectedMember} />
              <RoleStar member={selectedMember} />
            </div>
            {editingOwnProfile ? (
              <form className="profile-edit-form" onSubmit={saveOwnProfile}>
                <h2>Mein Profil bearbeiten</h2>
                <div className="two-cols">
                  <input value={profileForm.first_name || ""} onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })} placeholder="Vorname" required />
                  <input value={profileForm.last_name || ""} onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })} placeholder="Nachname" required />
                </div>
                <input value={profileForm.nickname || ""} onChange={(e) => setProfileForm({ ...profileForm, nickname: e.target.value })} placeholder="Nickname" required />
                <label>Geburtsdatum *</label>
                <input type="date" value={profileForm.birth_date || ""} onChange={(e) => setProfileForm({ ...profileForm, birth_date: e.target.value })} required />
                <textarea value={profileForm.bio || ""} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} placeholder="Über mich" rows="4" />
                <input value={profileForm.location || ""} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="Wohnort" />
                <input value={profileForm.interests || ""} onChange={(e) => setProfileForm({ ...profileForm, interests: e.target.value })} placeholder="Interessen" />
                <input value={profileForm.website || ""} onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} placeholder="Website / Link" />
                <button className="primary submit" type="submit">Profil speichern</button>
                <button type="button" className="switch-auth" onClick={() => setEditingOwnProfile(false)}>Abbrechen</button>
              </form>
            ) : (
              <>
                <h2>{selectedMember.nickname}{getAge(selectedMember.birth_date) !== null ? ` (${getAge(selectedMember.birth_date)})` : ""}</h2>
                <p>{[selectedMember.first_name, selectedMember.last_name].filter(Boolean).join(" ")}</p>
                <strong className="points">{Number(selectedMember.community_points || 0).toLocaleString("de-AT")} Punkte</strong>
                <Status member={selectedMember} />
                {selectedMember.id === user?.id && (
                  <button className="primary submit" onClick={() => {
                    setEditingOwnProfile(true);
                    setProfileForm({
                      nickname: selectedMember.nickname || "",
                      first_name: selectedMember.first_name || "",
                      last_name: selectedMember.last_name || "",
                      birth_date: selectedMember.birth_date || "",
                      bio: selectedMember.bio || "",
                      location: selectedMember.location || "",
                      website: selectedMember.website || "",
                      interests: selectedMember.interests || "",
                    });
                  }}>Profil bearbeiten</button>
                )}
              </>
            )}
            {user && selectedMember.id !== user.id && (
              <button className="primary submit" onClick={() => toggleFriend(selectedMember)}>
                {friends.some((friend) => friend.id === selectedMember.id) ? "♣ Freund entfernen" : "♧ Freund hinzufügen"}
              </button>
            )}
            {admin && selectedMember.id !== user?.id && (
              <div className="modal-admin-tools">
                <button onClick={() => changePoints(selectedMember)}>Punkte ändern</button>
                <button onClick={() => updateRole(selectedMember, "MEMBER")}>Mitglied</button>
                <button onClick={() => updateRole(selectedMember, "SUPPORTER")}>Supporter</button>
                <button onClick={() => updateRole(selectedMember, "ADMIN")}>Admin</button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
