import React, { useEffect, useMemo, useState } from "react";
import { supabase, supabaseUnavailableMessage } from "./supabaseClient";

const DEFAULT_AVATAR = "/default-avatar.svg";
const PERMISSIONS = [
  ["manage_members", "Mitglieder verwalten"],
  ["manage_points", "Punkte verwalten"],
  ["manage_messages", "Nachrichten verwalten"],
  ["manage_media", "Medien verwalten"],
  ["manage_roles", "Rollen verwalten"],
  ["manage_admins", "Admins verwalten"],
  ["view_profile_visits", "Profilbesuche sehen"],
  ["manage_news", "Neuigkeiten verwalten"],
  ["manage_groups", "Gruppen verwalten"],
  ["manage_events", "Events verwalten"],
  ["manage_marketplace", "Marktplatz verwalten"],
  ["manage_friend_requests", "Freundschaftsanfragen verwalten"],
  ["manage_homepage", "Startseite verwalten"],
  ["manage_reports", "Meldungen verwalten"]
];

const roleLabel = (role) => role === "HEAD_ADMIN" ? "Global Admin" : role === "ADMIN" ? "Community Admin" : role === "SUPPORTER" ? "Supporter" : "Mitglied";
const roleClass = (role) => String(role || "MEMBER").toLowerCase().replace("_", "-");
const isAdmin = (role) => role === "ADMIN" || role === "HEAD_ADMIN";
const isHeadAdmin = (role) => role === "HEAD_ADMIN";
const getName = (m) => m ? (m.nickname || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Mitglied") : "";
const getAge = (date) => {
  if (!date) return null;
  const b = new Date(date), t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [messages, setMessages] = useState([]);
  const [homepageSections, setHomepageSections] = useState([]);
  const [reports, setReports] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [profileVisits, setProfileVisits] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [chatMember, setChatMember] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("home");
  const [notice, setNotice] = useState("");
  const [messageText, setMessageText] = useState("");
  const [adminTarget, setAdminTarget] = useState("");
  const [permissionDraft, setPermissionDraft] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  const showNotice = (text) => {
    setNotice(text);
    clearTimeout(window.__ecNotice);
    window.__ecNotice = setTimeout(() => setNotice(""), 4500);
  };

  const memberById = (id) => members.find((m) => m.id === id) || null;
  const friendshipWith = (id) => friendships.find((x) => (x.requester_id === user?.id && x.receiver_id === id) || (x.receiver_id === user?.id && x.requester_id === id));
  const blockedIds = useMemo(() => new Set(blockedUsers.map((x) => x.blocked_id)), [blockedUsers]);
  const incomingRequests = useMemo(() => friendships.filter((x) => x.status === "PENDING" && x.receiver_id === user?.id), [friendships, user?.id]);
  const sentRequests = useMemo(() => friendships.filter((x) => x.status === "PENDING" && x.requester_id === user?.id), [friendships, user?.id]);
  const acceptedFriendIds = useMemo(() => friendships.filter((x) => x.status === "ACCEPTED").map((x) => x.requester_id === user?.id ? x.receiver_id : x.requester_id), [friendships, user?.id]);
  const visibleMembers = useMemo(() => members.filter((m) => !blockedIds.has(m.id) && m.account_status !== "SUSPENDED"), [members, blockedIds]);
  const sortedMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = visibleMembers.filter((m) => [m.nickname, m.first_name, m.last_name].filter(Boolean).join(" ").toLowerCase().includes(q));
    const rank = (m) => m.role === "HEAD_ADMIN" ? 1 : m.role === "ADMIN" ? 2 : m.role === "SUPPORTER" ? 3 : 4;
    return [...filtered].sort((a, b) => rank(a) - rank(b) || getName(a).localeCompare(getName(b), "de"));
  }, [visibleMembers, search]);

  const withTimeout = (promise, message) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), 5000);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });

  const loadAll = async () => {
    if (!supabase) {
      setUser(null); setProfile(null); setMembers([]); setFriendships([]);
      return;
    }
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        supabaseUnavailableMessage
      );
      const currentUser = session?.user || null;
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null); setMembers([]); setFriendships([]); return;
      }
      await supabase.rpc("ensure_current_profile");
      await supabase.rpc("claim_initial_head_admin");
      const safe = async (query, fallback = []) => {
        const { data, error } = await query;
        if (error) { console.warn(error.message); return fallback; }
        return data ?? fallback;
      };
      const [p, ms, fs, msgs, hs, rs, bs, ns, es, gs, visits] = await Promise.all([
        safe(supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(), null),
        safe(supabase.from("profiles").select("*")),
        safe(supabase.from("friendships").select("*").or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)),
        safe(supabase.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: false })),
        safe(supabase.from("homepage_sections").select("*").eq("is_visible", true).order("sort_order", { ascending: true })),
        safe(supabase.from("user_reports").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("user_blocks").select("*").eq("blocker_id", currentUser.id)),
        safe(supabase.from("news").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("events").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("groups").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("profile_visits").select("*").eq("profile_id", currentUser.id).order("visited_at", { ascending: false }))
      ]);
      setProfile(p); setMembers(ms); setFriendships(fs); setMessages(msgs); setHomepageSections(hs); setReports(rs); setBlockedUsers(bs); setNews(ns); setEvents(es); setGroups(gs); setProfileVisits(visits);
    } catch (e) { console.error(e); showNotice(e?.message || "Fehler beim Laden"); }
  };

  useEffect(() => {
    if (!supabase) return undefined;
    loadAll();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadAll());
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    const messageChannel = supabase.channel(`ec-messages-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, loadAll).subscribe();
    const friendChannel = supabase.channel(`ec-friends-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `receiver_id=eq.${user.id}` }, loadAll).subscribe();
    return () => { supabase.removeChannel(messageChannel); supabase.removeChannel(friendChannel); };
  }, [user?.id]);

  async function login(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage); const f = new FormData(e.currentTarget);
    try {
      const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") }), supabaseUnavailableMessage);
      if (error) return showNotice(error.message);
      // Render the signed-in shell immediately. Profile and community data are
      // refreshed separately so a slow database request cannot block login.
      setUser(data?.user || data?.session?.user || null);
      void loadAll();
    } catch (error) { showNotice(error?.message || supabaseUnavailableMessage); }
  }
  async function register(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage); const f = new FormData(e.currentTarget);
    try {
      const { error } = await withTimeout(supabase.auth.signUp({ email: f.get("email"), password: f.get("password"), options: { emailRedirectTo: `${location.origin}/`, data: { nickname: f.get("nickname"), first_name: f.get("first_name"), last_name: f.get("last_name"), birth_date: f.get("birth_date"), gender: f.get("gender") } } }), supabaseUnavailableMessage);
      if (error) return showNotice(error.message); showNotice("Registrierung erfolgreich. Bitte E-Mail bestätigen.");
    } catch (error) { showNotice(error?.message || supabaseUnavailableMessage); }
  }
  async function logout() { if (user) await supabase.from("profiles").update({ is_online: false }).eq("id", user.id); await supabase.auth.signOut(); setUser(null); setProfile(null); }

  async function requestFriend(m) {
    if (!m?.id || m.id === user?.id) return;
    if (blockedIds.has(m.id)) return showNotice("Dieser Nutzer ist blockiert.");
    const current = friendshipWith(m.id);
    if (current?.status === "ACCEPTED") return showNotice("Ihr seid bereits befreundet.");
    if (current?.status === "PENDING") return showNotice(current.requester_id === user.id ? "Anfrage wurde bereits gesendet." : "Bitte die eingehende Anfrage beantworten.");
    const { error } = await supabase.rpc("send_friend_request", { target_user: m.id });
    if (error) return showNotice(error.message); showNotice("Freundschaftsanfrage gesendet."); await loadAll();
  }
  async function respondToFriendRequest(r, accept) {
    if (!r?.id || r.receiver_id !== user?.id) return;
    if (accept) { const { error } = await supabase.rpc("accept_friend_request", { friendship_id: r.id }); if (error) return showNotice(error.message); showNotice("Freundschaft angenommen."); }
    else { const { error } = await supabase.from("friendships").delete().eq("id", r.id).eq("receiver_id", user.id); if (error) return showNotice(error.message); showNotice("Anfrage abgelehnt."); }
    await loadAll();
  }
  async function removeFriend(m) { const r = friendshipWith(m.id); if (!r) return; if (!confirm(`Freundschaft mit ${getName(m)} entfernen?`)) return; const { error } = await supabase.from("friendships").delete().eq("id", r.id); if (error) return showNotice(error.message); await loadAll(); }
  async function cancelFriendRequest(r) { const { error } = await supabase.from("friendships").delete().eq("id", r.id).eq("requester_id", user.id); if (error) return showNotice(error.message); await loadAll(); }
  async function blockUser(m) { if (!m?.id || isAdmin(m.role)) return showNotice("Admins können nicht blockiert werden."); const { error } = await supabase.rpc("create_user_block", { target_user: m.id }); if (error) return showNotice(error.message); setSelectedMember(null); await loadAll(); }
  async function unblockUser(id) { const { error } = await supabase.rpc("remove_user_block", { target_user: id }); if (error) return showNotice(error.message); await loadAll(); }
  async function reportUser(m) { if (!m?.id || m.id === user?.id) return; const reason = prompt(`Warum möchtest du ${getName(m)} melden?`, "Verstoß gegen die Community-Regeln"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Meldegrund angeben."); const { error } = await supabase.rpc("submit_user_report", { target_user: m.id, reason_text: reason.trim() }); if (error) return showNotice(error.message); setSelectedMember(null); showNotice("Meldung wurde gesendet."); await loadAll(); }
  async function resolveReport(id, status) { const { error } = await supabase.from("user_reports").update({ status, admin_id: user.id, admin_note: status === "CONFIRMED" ? "Meldung bestätigt." : "Unbegründet geschlossen.", resolved_at: new Date().toISOString() }).eq("id", id); if (error) return showNotice(error.message); await loadAll(); }

  async function updateMemberRole(m, newRole) {
    if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf Rollen ändern.");
    if (!m?.id || m.id === user.id || m.role === "HEAD_ADMIN") return showNotice("Der Global Admin kann nicht verändert werden.");
    const { error } = await supabase.rpc("admin_set_role", { target_user: m.id, new_role: newRole });
    if (error) return showNotice(error.message);
    showNotice(`${getName(m)} ist jetzt ${roleLabel(newRole)}.`); await loadAll();
  }

  async function toggleSuspension(m) {
    if (!isAdmin(profile?.role) || m.role === "HEAD_ADMIN") return showNotice("Keine Berechtigung.");
    const next = m.account_status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (!confirm(`${getName(m)} ${next === "ACTIVE" ? "freischalten" : "sperren"}?`)) return;
    const { error } = await supabase.rpc("admin_set_account_status", { target_user: m.id, new_status: next });
    if (error) return showNotice(error.message); await loadAll();
  }

  async function saveMemberData(e) {
    e.preventDefault();
    if (!isHeadAdmin(profile?.role) || !editingMember) return;
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc("admin_update_member", { p_user_id: editingMember.id, p_nickname: String(f.get("nickname") || "").trim(), p_first_name: String(f.get("first_name") || "").trim(), p_last_name: String(f.get("last_name") || "").trim(), p_birth_date: f.get("birth_date") || null, p_gender: f.get("gender") || null, p_role: editingMember.role || "MEMBER", p_account_status: editingMember.account_status || "ACTIVE" });
    if (error) return showNotice(error.message);
    showNotice("Mitgliedsdaten gespeichert."); setEditingMember(null); await loadAll();
  }

  async function loadPermissions(id) {
    if (!id || !isHeadAdmin(profile?.role)) return;
    setAdminTarget(id);
    const { data, error } = await supabase.rpc("admin_get_permissions", { target_user: id });
    if (error) return showNotice(error.message);
    const draft = {}; PERMISSIONS.forEach(([key]) => draft[key] = !!data?.[key]); setPermissionDraft(draft);
  }
  async function savePermissions() {
    if (!adminTarget || !isHeadAdmin(profile?.role)) return;
    setSavingPermissions(true);
    const p = permissionDraft;
    const { error } = await supabase.rpc("admin_set_permissions", { target_user: adminTarget, p_manage_members: !!p.manage_members, p_manage_points: !!p.manage_points, p_manage_messages: !!p.manage_messages, p_manage_media: !!p.manage_media, p_manage_roles: !!p.manage_roles, p_manage_admins: !!p.manage_admins, p_view_profile_visits: !!p.view_profile_visits, p_manage_news: !!p.manage_news, p_manage_groups: !!p.manage_groups, p_manage_events: !!p.manage_events, p_manage_marketplace: !!p.manage_marketplace, p_manage_friend_requests: !!p.manage_friend_requests, p_manage_homepage: !!p.manage_homepage, p_manage_reports: !!p.manage_reports });
    setSavingPermissions(false); if (error) return showNotice(error.message); showNotice("Berechtigungen gespeichert.");
  }

  async function saveProfile(e) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const payload = { nickname: String(f.get("nickname") || "").trim(), gender: f.get("gender") || null, bio: String(f.get("bio") || "").trim(), location: String(f.get("location") || "").trim(), interests: String(f.get("interests") || "").split(",").map((interest) => interest.trim()).filter(Boolean), website: String(f.get("website") || "").trim(), profile_accent: f.get("profile_accent") || "#ff6b25", profile_background: f.get("profile_background") || "#f6f9fc", profile_layout: f.get("profile_layout") || "standard" };
    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id); if (error) return showNotice(error.message); showNotice("Profil wurde gespeichert."); await loadAll();
  }
  async function uploadProfileImage(file) {
    if (!file || !user) return; if (!file.type.startsWith("image/")) return showNotice("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) return showNotice("Maximal 5 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type }); if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path); const { error: updateError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id); if (updateError) return showNotice(updateError.message); await loadAll();
  }
  async function createHomepageSection(e) {
    e.preventDefault(); if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf die Startseite gestalten.");
    const f = new FormData(e.currentTarget); const { error } = await supabase.from("homepage_sections").insert({ title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), image_url: String(f.get("image_url") || "").trim() || null, frame_style: f.get("frame_style") || "standard", created_by: user.id, updated_by: user.id, sort_order: homepageSections.length, is_visible: true });
    if (error) return showNotice(error.message); e.currentTarget.reset(); showNotice("Rahmen veröffentlicht."); await loadAll();
  }
  async function editHomepageSection(x) {
    if (!isHeadAdmin(profile?.role)) return; const title = prompt("Überschrift:", x.title || ""); if (title === null) return; const content = prompt("Text:", x.content || ""); if (content === null) return; const image = prompt("Bild-URL:", x.image_url || ""); if (image === null) return;
    const { error } = await supabase.from("homepage_sections").update({ title: title.trim(), content: content.trim(), image_url: image.trim() || null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", x.id); if (error) return showNotice(error.message); await loadAll();
  }
  async function deleteHomepageSection(x) { if (!isHeadAdmin(profile?.role)) return; if (!confirm("Rahmen wirklich löschen?")) return; const { error } = await supabase.from("homepage_sections").delete().eq("id", x.id); if (error) return showNotice(error.message); await loadAll(); }
  async function sendMessage(e) { e.preventDefault(); if (!chatMember || !messageText.trim()) return; const { error } = await supabase.rpc("send_private_message", { target_user: chatMember.id, message_text: messageText.trim() }); if (error) return showNotice(error.message); setMessageText(""); await openChat(chatMember); }
  async function openChat(m) { setChatMember(m); setPage("messages"); const { data, error } = await supabase.from("messages").select("*").or(`and(sender_id.eq.${user.id},receiver_id.eq.${m.id}),and(sender_id.eq.${m.id},receiver_id.eq.${user.id})`).order("created_at", { ascending: true }); if (error) return showNotice(error.message); setMessages(data || []); await supabase.rpc("mark_messages_read", { from_user: m.id }); }
  async function openMember(m) { if (!m) return; setSelectedMember(m); if (m.id !== user.id) await supabase.from("profile_visits").insert({ profile_id: m.id, visitor_id: user.id, visited_at: new Date().toISOString() }); }

  if (!user) return <div className="auth-page"><div className="text-logo">ENNSTAL CONNECT</div><Auth login={login} register={register}/>{notice && <div className="toast">{notice}</div>}</div>;

  const unread = messages.filter((m) => m.receiver_id === user.id && !m.is_read).length;
  const myRole = roleLabel(profile?.role);
  return <div className="app">
    <header className="topbar modern-topbar">
      <div className="topbar-brand" onClick={() => setPage("home")}><img src="/logo.png" alt="Ennstal Connect" className="topbar-logo"/></div>
      <div className="breadcrumb">ENNSTAL.CONNECT <span>›</span> {page}</div>
      <button className={`topbar-user ${roleClass(profile?.role)}`} onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(profile)}</strong><small>{myRole}</small></span></button>
    </header>
    <div className="dashboard-layout">
      <aside className="modern-sidebar">
        <div className="sidebar-profile" onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(profile)}</strong><span className={`role-badge ${roleClass(profile?.role)}`}>{profile?.role === "HEAD_ADMIN" ? "♛ Global Admin" : profile?.role === "ADMIN" ? "★ Community Admin" : profile?.role === "SUPPORTER" ? "★ Supporter" : "Mitglied"}</span></div></div>
        <nav className="modern-nav">
          <button onClick={() => setPage("home")}>⌂ <span>Startseite</span></button>
          <button onClick={() => setPage("members")}>♙ <span>Mitglieder</span></button>
          <button onClick={() => setPage("friends")}>♥ <span>Freunde</span></button>
          <button onClick={() => setPage("friend-requests")}>♢ <span>Anfragen</span>{incomingRequests.length > 0 && <em>{incomingRequests.length}</em>}</button>
          <button onClick={() => setPage("blocked")}>⊘ <span>Blockiert</span></button>
          <button onClick={() => setPage("messages")}>☏ <span>Nachrichten</span>{unread > 0 && <em>{unread}</em>}</button>
          <button onClick={() => setPage("profile")}>⚙ <span>Mein Profil</span></button>
          {isAdmin(profile?.role) && <><button onClick={() => setPage("admin")}>♛ <span>Verwaltung</span></button><button onClick={() => setPage("reports")}>⚑ <span>Meldungen</span></button></>}
        </nav>
        <button className="sidebar-logout" onClick={logout}>⇥ <span>Abmelden</span></button>
      </aside>
      <main className="modern-main"><div className="content-root">{notice && <div className="toast">{notice}</div>}
        {page === "home" && <Home profile={profile} isHeadAdmin={isHeadAdmin} homepageSections={homepageSections} canEdit={isHeadAdmin(profile?.role)} createHomepageSection={createHomepageSection} editHomepageSection={editHomepageSection} deleteHomepageSection={deleteHomepageSection}/>} 
        {page === "members" && <section><div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Ein gemeinsames Raster – Global Admins und Community Admins zuerst, danach Supporter und Mitglieder.</p></div><input className="search-input" placeholder="Mitglied suchen …" value={search} onChange={(e) => setSearch(e.target.value)}/></div><MemberGrid members={sortedMembers} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friends" && <section><div className="page-heading"><h1>Freunde</h1><p>Nur bestätigte Freundschaften werden hier angezeigt.</p></div><MemberGrid members={members.filter((m) => acceptedFriendIds.includes(m.id))} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friend-requests" && <FriendRequests incoming={incomingRequests} sent={sentRequests} memberById={memberById} respond={respondToFriendRequest} cancel={cancelFriendRequest}/>} 
        {page === "blocked" && <Blocked blockedUsers={blockedUsers} memberById={memberById} unblock={unblockUser}/>} 
        {page === "messages" && <Messages user={user} messages={messages} chatMember={chatMember} setChatMember={setChatMember} memberById={memberById} openChat={openChat} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage}/>} 
        {page === "profile" && <Profile profile={profile} user={user} isHeadAdmin={isHeadAdmin} saveProfile={saveProfile} uploadProfileImage={uploadProfileImage}/>} 
        {page === "reports" && isAdmin(profile?.role) && <Reports reports={reports} memberById={memberById} resolveReport={resolveReport}/>} 
        {page === "admin" && isAdmin(profile?.role) && <AdminPanel members={members} profile={profile} user={user} onOpen={openMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} editingMember={editingMember} setEditingMember={setEditingMember} saveMemberData={saveMemberData} adminTarget={adminTarget} loadPermissions={loadPermissions} permissionDraft={permissionDraft} setPermissionDraft={setPermissionDraft} savePermissions={savePermissions} savingPermissions={savingPermissions}/>} 
        {page === "impressum" && <InfoPage title="Impressum" text="Ennstal Connect – regionale Community. Verantwortlicher Betreiber siehe die hinterlegten Kontaktdaten."/>}
        {page === "privacy" && <InfoPage title="Datenschutz" text="Personenbezogene Daten werden ausschließlich für die Funktionen der Community verarbeitet. Weitere Angaben werden in dieser Seite ergänzt."/>}
      </div></main>
    </div>
    <footer className="site-footer"><strong>Ennstal Connect</strong><div><button onClick={() => setPage("impressum")}>Impressum</button><button onClick={() => setPage("privacy")}>Datenschutz</button></div></footer>
    {selectedMember && <ProfileModal selectedMember={selectedMember} user={user} profile={profile} friendship={friendshipWith(selectedMember.id)} setSelectedMember={setSelectedMember} requestFriend={requestFriend} respond={respondToFriendRequest} removeFriend={removeFriend} blockUser={blockUser} reportUser={reportUser} openChat={openChat}/>} 
  </div>;
}

function Home({ profile, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection }) {
  return <section className="home-page"><div className="hero"><img src="/banner.png" alt="Ennstal Connect"/></div><div className="page-heading"><div><span className="eyebrow">ENNSTAL & OBERSTEIERMARK</span><h1>Willkommen, {getName(profile)}</h1><p>Eine lebendige regionale Community für Menschen aus dem Ennstal und Umgebung.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}</div>{canEdit && <section className="homepage-builder panel"><span className="eyebrow">STARTSEITE GESTALTEN</span><h2>Eigene Rahmen erstellen</h2><p className="builder-hint">Bilder können direkt über eine öffentliche Bild-URL eingebunden werden. So kannst du jeden Rahmen selbst gestalten.</p><form onSubmit={createHomepageSection} className="homepage-form"><input name="title" placeholder="Rahmen-Überschrift" required/><textarea name="content" placeholder="Text für den Rahmen" required/><input name="image_url" placeholder="Bild-URL (optional)"/><select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select><button className="primary-button">Rahmen veröffentlichen</button></form></section>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={`homepage-frame ${x.frame_style || "standard"}`} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">ENNSTAL CONNECT</span><h2>{x.title}</h2><p>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;
}

function MemberGrid({ members, profile, friendships, onOpen, onMessage }) { return <div className="member-grid">{members.map((m) => <MemberCard key={m.id} member={m} profile={profile} friendships={friendships} onOpen={onOpen} onMessage={onMessage}/>)}</div>; }
function MemberCard({ member, profile, friendships, onOpen, onMessage }) {
  const r = member.role || "MEMBER";
  const friendship = friendships.find((x) => (x.requester_id === profile?.id && x.receiver_id === member.id) || (x.receiver_id === profile?.id && x.requester_id === member.id));
  const friend = friendship?.status === "ACCEPTED";
  return <article className={`member-card ${roleClass(r)}`} onClick={() => onOpen(member)}>
    <div className="member-role-line"><span className={`role-chip ${roleClass(r)}`}>{r === "HEAD_ADMIN" ? "♛ Global Admin" : r === "ADMIN" ? "★ Community Admin" : r === "SUPPORTER" ? "★ Supporter" : "Mitglied"}</span>{friend && <span className="friend-indicator" title="Befreundet">♥</span>}</div>
    <img className="member-avatar" src={member.avatar_url || DEFAULT_AVATAR} alt=""/>
    <strong className="member-nickname">{getName(member)}</strong>
    <div className="member-name">{[member.first_name, member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date) !== null && ` · ${getAge(member.birth_date)} Jahre`}</div>
    <div className={`member-status ${member.is_online ? "online" : "offline"}`}><span/>{member.is_online ? "Online" : "Offline"}</div>
    {member.id !== profile?.id && <button className="member-message" onClick={(e) => { e.stopPropagation(); onMessage(member); }}>💬 Nachricht</button>}
  </article>;
}

function FriendRequests({ incoming, sent, memberById, respond, cancel }) { return <section><div className="page-heading"><div><span className="eyebrow">VERBINDUNGEN</span><h1>Freundschaftsanfragen</h1><p>Anfragen werden erst nach Annahme zu Freunden.</p></div></div><h2>Eingehend</h2><div className="cards">{incoming.map((r) => { const m = memberById(r.requester_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>{roleLabel(m.role)}</span></div><div className="request-actions"><button className="primary-button" onClick={() => respond(r, true)}>✓ Annehmen</button><button className="danger-button" onClick={() => respond(r, false)}>Ablehnen</button></div></>}</article>; })}{!incoming.length && <div className="empty-card">Keine eingehenden Anfragen.</div>}</div><h2>Gesendet</h2><div className="cards">{sent.map((r) => { const m = memberById(r.receiver_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>Wartet auf Antwort</span></div><button className="danger-button" onClick={() => cancel(r)}>Anfrage abbrechen</button></>}</article>; })}{!sent.length && <div className="empty-card">Keine offenen gesendeten Anfragen.</div>}</div></section>; }
function Blocked({ blockedUsers, memberById, unblock }) { return <section><div className="page-heading"><h1>Blockierliste</h1><p>Blockierte Nutzer sehen dich nicht in deinen normalen Community-Listen.</p></div><div className="member-grid">{blockedUsers.map((b) => { const m = memberById(b.blocked_id); return m && <article className="member-card member" key={b.id}><img className="member-avatar" src={m.avatar_url || DEFAULT_AVATAR} alt=""/><strong className="member-nickname">{getName(m)}</strong><button className="secondary-button" onClick={() => unblock(m.id)}>Entsperren</button></article>; })}{!blockedUsers.length && <div className="empty-card">Keine blockierten Nutzer.</div>}</div></section>; }
function Messages({ user, messages, chatMember, setChatMember, memberById, openChat, messageText, setMessageText, sendMessage }) { return <section><div className="page-heading"><h1>Nachrichten</h1></div>{!chatMember ? <div className="message-overview">{messages.filter((m) => m.receiver_id === user.id || m.sender_id === user.id).map((m) => { const other = memberById(m.sender_id === user.id ? m.receiver_id : m.sender_id); return other && <button className="message-preview" key={m.id} onClick={() => openChat(other)}><img src={other.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(other)}</strong><small>{m.content}</small></span></button>; })}{!messages.length && <div className="empty-card">Noch keine Nachrichten.</div>}</div> : <div className="chat-box"><div className="chat-header"><button className="back-button" onClick={() => setChatMember(null)}>← Zurück</button><MemberMini member={chatMember}/></div><div className="chat-messages">{messages.filter((m) => (m.sender_id === user.id && m.receiver_id === chatMember.id) || (m.sender_id === chatMember.id && m.receiver_id === user.id)).map((m) => <div className={`chat-message ${m.sender_id === user.id ? "mine" : ""}`} key={m.id}><p>{m.content}</p><small>{new Date(m.created_at).toLocaleString("de-AT")}</small></div>)}</div><form className="message-form" onSubmit={sendMessage}><textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Nachricht schreiben …"/><button className="primary-button">Senden</button></form></div>}</section>; }
function MemberMini({ member }) { return <div className="member-mini"><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><strong>{getName(member)}</strong></div>; }

function Profile({ profile, user, isHeadAdmin, saveProfile, uploadProfileImage }) { return <section><div className="my-area-layout"><div className={`my-profile-card ${roleClass(profile?.role)}`}><div className="profile-role-mark">{profile?.role === "HEAD_ADMIN" ? "♛" : "★"}</div><img className="my-avatar" src={profile?.avatar_url || DEFAULT_AVATAR} alt="Profil"/><h1>{getName(profile)}</h1><div className={`profile-role-label ${roleClass(profile?.role)}`}>{roleLabel(profile?.role)}</div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}<h2>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}{getAge(profile?.birth_date) !== null && ` · ${getAge(profile.birth_date)} Jahre`}</h2><p>{profile?.bio || "Noch kein Über-mich-Text."}</p></div><form className="panel profile-form" onSubmit={saveProfile}><span className="eyebrow">DEIN PROFIL</span><h2>Profil gestalten</h2><label>Nickname *</label><input name="nickname" defaultValue={profile?.nickname || ""} required/><div className="form-grid"><div><label>Profil-Akzent</label><input type="color" name="profile_accent" defaultValue={profile?.profile_accent || "#ff6b25"}/></div><div><label>Profil-Hintergrund</label><input type="color" name="profile_background" defaultValue={profile?.profile_background || "#f6f9fc"}/></div></div><label>Profilbild</label><input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadProfileImage(e.target.files[0])}/><label>Geschlecht *</label><select name="gender" defaultValue={profile?.gender || ""} required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><label>Über mich</label><textarea name="bio" defaultValue={profile?.bio || ""}/><label>Interessen</label><input name="interests" defaultValue={profile?.interests || ""}/><label>Wohnort</label><input name="location" defaultValue={profile?.location || ""}/><label>Website</label><input name="website" defaultValue={profile?.website || ""}/><button className="primary-button">Änderungen speichern</button></form></div></section>; }

function Reports({ reports, memberById, resolveReport }) { return <section><div className="page-heading"><div><span className="eyebrow">MODERATION</span><h1>Meldungen</h1><p>Gemeldete Mitglieder prüfen und bearbeiten.</p></div></div><div className="report-list">{reports.map((r) => <article className="report-card" key={r.id}><div className="report-top"><strong>🚩 {r.status}</strong><span>{new Date(r.created_at).toLocaleString("de-AT")}</span></div><p><b>Gemeldet von:</b> {getName(memberById(r.reporter_id))}</p><p><b>Gemeldetes Mitglied:</b> {getName(memberById(r.reported_user_id))}</p><p>{r.reason}</p>{r.status === "PENDING" && <div className="content-manage-actions"><button className="primary-button" onClick={() => resolveReport(r.id, "CONFIRMED")}>Meldung bestätigen</button><button className="danger-button" onClick={() => resolveReport(r.id, "UNFOUNDED")}>Unbegründet</button></div>}</article>)}{!reports.length && <div className="empty-card">Keine Meldungen vorhanden.</div>}</div></section>; }

function AdminPanel({ members, profile, user, onOpen, updateMemberRole, toggleSuspension, editingMember, setEditingMember, saveMemberData, adminTarget, loadPermissions, permissionDraft, setPermissionDraft, savePermissions, savingPermissions }) {
  const admins = members.filter((m) => isAdmin(m.role));
  return <section className="admin-page"><div className="page-heading"><div><span className="eyebrow">VERWALTUNG</span><h1>Admin-Zentrale</h1><p>Global Admin und Community Admin werden klar unterschieden. Berechtigungen sind einzeln steuerbar.</p></div></div>
    <div className="admin-member-cards">{members.slice().sort((a,b) => (a.role === "HEAD_ADMIN" ? 1 : a.role === "ADMIN" ? 2 : a.role === "SUPPORTER" ? 3 : 4) - (b.role === "HEAD_ADMIN" ? 1 : b.role === "ADMIN" ? 2 : b.role === "SUPPORTER" ? 3 : 4) || getName(a).localeCompare(getName(b), "de")).map((m) => <article className={`admin-member-card ${roleClass(m.role)}`} key={m.id}><button className="admin-member-person-button" onClick={() => onOpen(m)}><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(m)}</strong><small>{roleLabel(m.role)}</small></span></button><div className="admin-member-card-info"><div><span>Rolle</span><strong>{roleLabel(m.role)}</strong></div><div><span>Alter</span><strong>{getAge(m.birth_date) ?? "—"}</strong></div></div>{isHeadAdmin(profile?.role) && m.role !== "HEAD_ADMIN" && <div className="admin-member-card-actions"><button className="profile-admin-button supporter" onClick={() => updateMemberRole(m, "SUPPORTER")}>🟢 Supporter</button><button className="profile-admin-button admin" onClick={() => updateMemberRole(m, m.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{m.role === "ADMIN" ? "✕ Community Admin entfernen" : "★ Community Admin"}</button>{m.role !== "MEMBER" && <button className="profile-admin-button remove-role" onClick={() => updateMemberRole(m, "MEMBER")}>↩ Rolle entfernen</button>}<button className="profile-admin-button" onClick={() => setEditingMember(m)}>✎ Name / Geburtsdatum</button><button className="profile-admin-button" onClick={() => loadPermissions(m.id)}>⚙ Rechte</button><button className="profile-admin-button danger" onClick={() => toggleSuspension(m)}>{m.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button></div>}</article>)}</div>
    {editingMember && <section className="profile-admin-edit-form panel"><div className="panel-title-row"><h2>Mitgliedsdaten ändern</h2><button className="modal-close-inline" onClick={() => setEditingMember(null)}>×</button></div><form onSubmit={saveMemberData} className="profile-admin-edit-grid"><label>Nickname<input name="nickname" defaultValue={editingMember.nickname || ""}/></label><label>Vorname<input name="first_name" defaultValue={editingMember.first_name || ""} required/></label><label>Nachname<input name="last_name" defaultValue={editingMember.last_name || ""} required/></label><label>Geburtsdatum<input type="date" name="birth_date" defaultValue={editingMember.birth_date || ""} required/></label><label>Geschlecht<select name="gender" defaultValue={editingMember.gender || ""}><option value="">Nicht angegeben</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label><div className="edit-actions"><button className="primary-button">💾 Speichern</button></div></form></section>}
    {isHeadAdmin(profile?.role) && adminTarget && <section className="permissions-panel panel"><div className="panel-title-row"><div><span className="eyebrow">RECHTE</span><h2>Einzelne Berechtigungen</h2><p>{getName(members.find((m) => m.id === adminTarget))} – jede Berechtigung kann unabhängig aktiviert werden.</p></div><button className="modal-close-inline" onClick={() => setAdminTarget?.("")}>×</button></div><div className="permissions-grid">{PERMISSIONS.map(([key,label]) => <label className="permission-row" key={key}><input type="checkbox" checked={!!permissionDraft[key]} onChange={(e) => setPermissionDraft((x) => ({...x, [key]: e.target.checked}))}/><span>{label}</span></label>)}</div><button className="primary-button" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Speichere …" : "Berechtigungen speichern"}</button></section>}
  </section>;
}

function ProfileModal({ selectedMember, user, profile, friendship, setSelectedMember, requestFriend, respond, removeFriend, blockUser, reportUser, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  return <div className="modal-overlay" onClick={() => setSelectedMember(null)}><div className="profile-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedMember(null)}>×</button><div className={`modal-profile-header ${roleClass(selectedMember.role)}`}><div className="profile-modal-role">{selectedMember.role === "HEAD_ADMIN" ? "♛ GLOBAL ADMIN" : selectedMember.role === "ADMIN" ? "★ COMMUNITY ADMIN" : selectedMember.role === "SUPPORTER" ? "★ SUPPORTER" : "MITGLIED"}</div><img className="modal-avatar" src={selectedMember.avatar_url || DEFAULT_AVATAR} alt=""/><div className="modal-title"><h1>{getName(selectedMember)}</h1><span>{[selectedMember.first_name, selectedMember.last_name].filter(Boolean).join(" ")}{getAge(selectedMember.birth_date) !== null && ` · ${getAge(selectedMember.birth_date)} Jahre`}</span></div></div><div className="modal-content">{selectedMember.bio && <><h3>Über mich</h3><p>{selectedMember.bio}</p></>}{selectedMember.id !== user.id && <div className="profile-actions"><button className="primary-button" onClick={() => { setSelectedMember(null); openChat(selectedMember); }}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(selectedMember)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Anfrage ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(selectedMember)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>}{!isAdmin(selectedMember.role) && <button className="secondary-button" onClick={() => blockUser(selectedMember)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(selectedMember)}>🚩 Nutzer melden</button></div>}</div></div></div>;
}

function Auth({ login, register }) { const [mode,setMode] = useState("login"); return <div className="auth-box">{mode === "login" ? <form className="panel" onSubmit={login}><h1>Anmelden</h1><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" placeholder="Passwort *" required/><button className="primary-button">Anmelden</button><button type="button" className="text-button" onClick={() => setMode("register")}>Noch kein Konto? Jetzt registrieren</button></form> : <form className="panel" onSubmit={register}><h1>Registrieren</h1><input name="nickname" placeholder="Nickname *" required/><input name="first_name" placeholder="Vorname *" required/><input name="last_name" placeholder="Nachname *" required/><input name="birth_date" type="date" required/><select name="gender" defaultValue="" required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" minLength={6} placeholder="Passwort *" required/><button className="primary-button">Konto erstellen</button><button type="button" className="text-button" onClick={() => setMode("login")}>Bereits registriert? Anmelden</button></form>}</div>; }
function InfoPage({ title, text }) { return <section><div className="page-heading"><h1>{title}</h1></div><div className="panel"><p>{text}</p></div></section>; }
