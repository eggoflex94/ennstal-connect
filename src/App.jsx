import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const emptyRegister = { first_name: "", last_name: "", nickname: "", birth_date: "", email: "", password: "" };
const emptyLogin = { email: "", password: "" };
const emptyGroup = { name: "", description: "", image_url: "" };
const emptyEvent = { title: "", description: "", location: "", event_date: "", image_url: "" };
const emptyNews = { title: "", content: "" };

function nameOf(member) {
  if (!member) return "Mitglied";
  return member.nickname || `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Mitglied";
}

function roleOf(role) {
  return String(role || "member").toLowerCase();
}

function isAdmin(role) {
  const value = roleOf(role);
  return value === "admin" || value === "head_admin" || value === "head-admin";
}

function roleLabel(role) {
  if (isAdmin(role)) return "Admin";
  if (roleOf(role) === "supporter") return "Supporter";
  return "Mitglied";
}

function roleClass(role) {
  if (isAdmin(role)) return "admin";
  if (roleOf(role) === "supporter") return "supporter";
  return "member";
}

function Avatar({ member, large = false }) {
  const label = nameOf(member);
  return (
    <div className={`avatar ${large ? "avatar-large" : ""}`}>
      {member?.avatar_url ? <img src={member.avatar_url} alt={label} /> : <span>{label.charAt(0).toUpperCase()}</span>}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: value.includes?.("T") ? "short" : undefined }).format(date);
}

export default function App() {
  const [page, setPage] = useState("home");
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [events, setEvents] = useState([]);
  const [news, setNews] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState(null);
  const [notice, setNotice] = useState("");
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [newsForm, setNewsForm] = useState(emptyNews);

  function showNotice(text) {
    setNotice(text);
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => setNotice(""), 5000);
  }

  async function loadAll(userId) {
    setLoading(true);
    const [membersResult, groupsResult, eventsResult, newsResult, profileResult] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("groups").select("*").order("created_at", { ascending: false }),
      supabase.from("events").select("*").order("event_date", { ascending: true }),
      supabase.from("news").select("*").order("created_at", { ascending: false }),
      userId ? supabase.from("profiles").select("*").eq("id", userId).maybeSingle() : Promise.resolve({ data: null })
    ]);

    if (membersResult.error) console.error("Mitglieder:", membersResult.error);
    if (groupsResult.error) console.error("Gruppen:", groupsResult.error);
    if (eventsResult.error) console.error("Events:", eventsResult.error);
    if (newsResult.error) console.error("News:", newsResult.error);
    if (profileResult.error) console.error("Profil:", profileResult.error);

    setMembers(membersResult.data || []);
    setGroups(groupsResult.data || []);
    setEvents(eventsResult.data || []);
    setNews(newsResult.data || []);
    setProfile(profileResult.data || null);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      await loadAll(data.session?.user?.id);
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadAll(nextSession?.user?.id);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const sortedMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const priority = (role) => isAdmin(role) ? 0 : roleOf(role) === "supporter" ? 1 : 2;
    return members
      .filter((member) => {
        if (!query) return true;
        return [nameOf(member), member.first_name, member.last_name, member.nickname]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => priority(a.role) - priority(b.role) || nameOf(a).localeCompare(nameOf(b), "de"));
  }, [members, search]);

  const admins = sortedMembers.filter((m) => isAdmin(m.role));
  const supporters = sortedMembers.filter((m) => roleOf(m.role) === "supporter");
  const regularMembers = sortedMembers.filter((m) => !isAdmin(m.role) && roleOf(m.role) !== "supporter");

  async function register(event) {
    event.preventDefault();
    const { error } = await supabase.auth.signUp({
      email: registerForm.email.trim(),
      password: registerForm.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: registerForm.first_name.trim(),
          last_name: registerForm.last_name.trim(),
          nickname: registerForm.nickname.trim(),
          birth_date: registerForm.birth_date || null
        }
      }
    });
    if (error) return showNotice(error.message);
    setRegisterForm(emptyRegister);
    setAuthMode(null);
    showNotice("Registrierung erfolgreich. Bitte bestätige deine E-Mail, falls die Bestätigung aktiviert ist.");
  }

  async function login(event) {
    event.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email: loginForm.email.trim(), password: loginForm.password });
    if (error) return showNotice(error.message);
    setLoginForm(emptyLogin);
    setAuthMode(null);
    showNotice("Du bist angemeldet.");
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) return showNotice(error.message);
    setPage("home");
    showNotice("Du wurdest abgemeldet.");
  }

  async function createGroup(event) {
    event.preventDefault();
    if (!session?.user) return showNotice("Bitte zuerst anmelden.");
    const { error } = await supabase.from("groups").insert({ owner_id: session.user.id, name: groupForm.name.trim(), description: groupForm.description.trim(), image_url: groupForm.image_url.trim() || null });
    if (error) return showNotice(error.message);
    setGroupForm(emptyGroup);
    await loadAll(session.user.id);
    showNotice("Gruppe wurde erstellt.");
  }

  async function createEvent(event) {
    event.preventDefault();
    if (!session?.user) return showNotice("Bitte zuerst anmelden.");
    const { error } = await supabase.from("events").insert({ creator_id: session.user.id, title: eventForm.title.trim(), description: eventForm.description.trim(), location: eventForm.location.trim(), event_date: eventForm.event_date, image_url: eventForm.image_url.trim() || null });
    if (error) return showNotice(error.message);
    setEventForm(emptyEvent);
    await loadAll(session.user.id);
    showNotice("Event wurde erstellt.");
  }

  async function createNews(event) {
    event.preventDefault();
    if (!session?.user || !isAdmin(profile?.role)) return showNotice("Nur Admins können News veröffentlichen.");
    const { error } = await supabase.from("news").insert({ author_id: session.user.id, title: newsForm.title.trim(), content: newsForm.content.trim() });
    if (error) return showNotice(error.message);
    setNewsForm(emptyNews);
    await loadAll(session.user.id);
    showNotice("News wurde veröffentlicht.");
  }

  const setPageAndClose = (next) => { setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  if (loading) return <div className="app-loading">Community wird geladen…</div>;

  return (
    <div className="app">
      <header className="site-header">
        <button className="brand" onClick={() => setPageAndClose("home")}>ENNSTAL <span>CONNECT</span></button>
        <nav className="navigation" aria-label="Hauptnavigation">
          {[ ["home", "Start"], ["members", "Mitglieder"], ["groups", "Gruppen"], ["events", "Events"] ].map(([id, label]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPageAndClose(id)}>{label}</button>
          ))}
        </nav>
        <div className="header-user">
          {session ? <><span className="signed-in">{nameOf(profile)}</span><button onClick={logout}>Abmelden</button></> : <><button onClick={() => setAuthMode("login")}>Anmelden</button><button className="primary-button" onClick={() => setAuthMode("register")}>Mitglied werden</button></>}
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <main className="main-content">
        {page === "home" && <>
          <section className="hero">
            <span className="eyebrow">WILLKOMMEN</span>
            <h1>Deine Community.<br />Deine Region.</h1>
            <p>Verbinde dich mit Menschen, entdecke Gruppen und bleibe über Events und Neuigkeiten informiert.</p>
            <button className="primary-button" onClick={() => setPageAndClose("members")}>Mitglieder entdecken</button>
          </section>

          <section className="content-section">
            <div className="section-heading"><div><span className="eyebrow">AKTUELLES</span><h2>Neuigkeiten</h2></div></div>
            {isAdmin(profile?.role) && <form className="create-form" onSubmit={createNews}>
              <h3>News erstellen</h3>
              <input required placeholder="Titel" value={newsForm.title} onChange={(e) => setNewsForm({ ...newsForm, title: e.target.value })} />
              <textarea required placeholder="Neuigkeit schreiben…" value={newsForm.content} onChange={(e) => setNewsForm({ ...newsForm, content: e.target.value })} />
              <button className="primary-button">Veröffentlichen</button>
            </form>}
            <div className="news-list">
              {news.length ? news.map((item) => <article className="news-card" key={item.id}><div className="card-meta">NEWS · {formatDate(item.created_at)}</div><h3>{item.title}</h3><p>{item.content}</p></article>) : <div className="empty-state">Noch keine Neuigkeiten vorhanden.</div>}
            </div>
          </section>
        </>}

        {page === "members" && <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Mitgliederübersicht</h1><p>Admins zuerst, danach Supporter und anschließend alle weiteren Mitglieder alphabetisch.</p></div><div className="member-count">{sortedMembers.length} Mitglieder</div></div>
          <input className="member-search" placeholder="Mitglied suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <MemberSection title="Admins" members={admins} empty="Keine Admins gefunden." />
          <MemberSection title="Supporter" members={supporters} empty="Keine Supporter gefunden." />
          <MemberSection title="Mitglieder" members={regularMembers} empty="Keine Mitglieder gefunden." />
        </section>}

        {page === "groups" && <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">GEMEINSAM</span><h1>Gruppen</h1><p>Finde oder erstelle eine Gruppe für gemeinsame Interessen.</p></div></div>
          {session && <form className="create-form" onSubmit={createGroup}><h3>Neue Gruppe erstellen</h3><input required placeholder="Gruppenname" value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} /><textarea placeholder="Beschreibung" value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} /><input placeholder="Bild-URL (optional)" value={groupForm.image_url} onChange={(e) => setGroupForm({ ...groupForm, image_url: e.target.value })} /><button className="primary-button">Gruppe erstellen</button></form>}
          <div className="content-grid">{groups.length ? groups.map((group) => <article className="content-card" key={group.id}>{group.image_url && <img src={group.image_url} alt="" />}<h3>{group.name}</h3><p>{group.description || "Noch keine Beschreibung."}</p></article>) : <div className="empty-state">Noch keine Gruppen vorhanden.</div>}</div>
        </section>}

        {page === "events" && <section className="content-section">
          <div className="section-heading"><div><span className="eyebrow">KALENDER</span><h1>Events</h1><p>Was ist in der Community als Nächstes geplant?</p></div></div>
          {session && <form className="create-form" onSubmit={createEvent}><h3>Neues Event erstellen</h3><input required placeholder="Titel" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} /><textarea placeholder="Beschreibung" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} /><input placeholder="Ort" value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} /><input required type="datetime-local" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} /><input placeholder="Bild-URL (optional)" value={eventForm.image_url} onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })} /><button className="primary-button">Event erstellen</button></form>}
          <div className="content-grid">{events.length ? events.map((item) => <article className="content-card" key={item.id}>{item.image_url && <img src={item.image_url} alt="" />}<div className="card-meta">{formatDate(item.event_date)}</div><h3>{item.title}</h3>{item.location && <div className="event-location">📍 {item.location}</div>}<p>{item.description || "Noch keine Beschreibung."}</p></article>) : <div className="empty-state">Noch keine Events vorhanden.</div>}</div>
        </section>}
      </main>

      {authMode && <div className="modal-backdrop" onMouseDown={() => setAuthMode(null)}><div className="auth-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthMode(null)} aria-label="Schließen">×</button>
        {authMode === "login" ? <form onSubmit={login}><h2>Anmelden</h2><p>Schön, dass du wieder da bist.</p><input required type="email" placeholder="E-Mail" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /><input required type="password" placeholder="Passwort" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /><button className="primary-button full">Anmelden</button><button type="button" className="text-button" onClick={() => setAuthMode("register")}>Noch kein Konto? Jetzt registrieren</button></form> : <form onSubmit={register}><h2>Mitglied werden</h2><p>Erstelle dein Konto für EnnStal Connect.</p><div className="two-inputs"><input required placeholder="Vorname" value={registerForm.first_name} onChange={(e) => setRegisterForm({ ...registerForm, first_name: e.target.value })} /><input required placeholder="Nachname" value={registerForm.last_name} onChange={(e) => setRegisterForm({ ...registerForm, last_name: e.target.value })} /></div><input placeholder="Nickname (optional)" value={registerForm.nickname} onChange={(e) => setRegisterForm({ ...registerForm, nickname: e.target.value })} /><label className="input-label">Geburtsdatum<input type="date" value={registerForm.birth_date} onChange={(e) => setRegisterForm({ ...registerForm, birth_date: e.target.value })} /></label><input required type="email" placeholder="E-Mail" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} /><input required minLength="6" type="password" placeholder="Passwort (mindestens 6 Zeichen)" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} /><button className="primary-button full">Konto erstellen</button><button type="button" className="text-button" onClick={() => setAuthMode("login")}>Bereits Mitglied? Anmelden</button></form>}
      </div></div>}

      <footer>ENNSTAL CONNECT · Deine Community. Deine Region.</footer>
    </div>
  );
}

function MemberSection({ title, members, empty }) {
  return <section className="member-section"><h2>{title}</h2>{members.length ? <div className="members-grid">{members.map((member) => <article className={`member-card ${roleClass(member.role)}`} key={member.id}><div className="member-role">{roleLabel(member.role)}</div><Avatar member={member} large /><h3 title={nameOf(member)}>{nameOf(member)}</h3>{member.nickname && member.first_name && <p className="member-real-name">{`${member.first_name} ${member.last_name || ""}`.trim()}</p>}<div className="member-divider" /><span>{roleLabel(member.role)}</span></article>)}</div> : <div className="empty-state small">{empty}</div>}</section>;
}
