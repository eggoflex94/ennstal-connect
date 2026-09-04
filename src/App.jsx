import React, { useEffect, useMemo, useState } from "react";
import { supabase, supabaseUnavailableMessage } from "./supabaseClient";

// A friendly community image is shown until a member uploads a personal photo.
const DEFAULT_AVATAR = "/community-default-avatar.png";
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
const roleMark = (role) => role === "HEAD_ADMIN" ? "♛" : role === "ADMIN" || role === "SUPPORTER" ? "★" : "";
const roleClass = (role) => String(role || "MEMBER").toLowerCase().replace("_", "-");
const isAdmin = (role) => role === "ADMIN" || role === "HEAD_ADMIN";
const isHeadAdmin = (role) => role === "HEAD_ADMIN";
const getName = (m) => m ? (m.nickname || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Mitglied") : "";
const formatInterests = (interests) => {
  if (Array.isArray(interests)) return interests.join(", ");
  if (typeof interests !== "string") return "";
  try {
    const parsed = JSON.parse(interests);
    return Array.isArray(parsed) ? parsed.join(", ") : interests;
  } catch { return interests; }
};
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
  const [forumPosts, setForumPosts] = useState([]);
  const [featureLocks, setFeatureLocks] = useState([]);
  const [profileActivities, setProfileActivities] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  const [viewingFriends, setViewingFriends] = useState([]);
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
  const isFeatureLocked = (feature) => featureLocks.some((lock) => lock.feature_key === feature && lock.is_locked);
  // The public list hides suspended accounts, while the Global/Community Admin
  // must still see them to manage test accounts and restore access.
  const visibleMembers = useMemo(() => members.filter((m) => isAdmin(profile?.role) || (!blockedIds.has(m.id) && m.account_status !== "SUSPENDED")), [members, blockedIds, profile?.role]);
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
      const [p, ms, fs, msgs, hs, rs, bs, ns, es, gs, visits, posts, locks, activities] = await Promise.all([
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
        safe(supabase.from("profile_visits").select("*").eq("profile_id", currentUser.id).order("visited_at", { ascending: false })),
        safe(supabase.from("forum_posts").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("user_feature_locks").select("*").eq("user_id", currentUser.id)),
        safe(supabase.from("profile_activity").select("*").eq("profile_id", currentUser.id).order("created_at", { ascending: false }).limit(20))
      ]);
      setProfile(p); setMembers(ms); setFriendships(fs); setMessages(msgs); setHomepageSections(hs); setReports(rs); setBlockedUsers(bs); setNews(ns); setEvents(es); setGroups(gs); setProfileVisits(visits); setForumPosts(posts); setFeatureLocks(locks); setProfileActivities(activities);
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
      const { data, error } = await withTimeout(supabase.auth.signUp({ email: f.get("email"), password: f.get("password"), options: { emailRedirectTo: `${location.origin}/`, data: { nickname: f.get("nickname"), first_name: f.get("first_name"), last_name: f.get("last_name"), birth_date: f.get("birth_date"), gender: f.get("gender") } } }), supabaseUnavailableMessage);
      if (error) return showNotice(error.message);
      // When confirmations are disabled, create the matching profile immediately.
      if (data.session?.user) { setUser(data.session.user); void supabase.rpc("ensure_current_profile").finally(loadAll); }
      showNotice("Registrierung erfolgreich. Bitte E-Mail bestätigen.");
    } catch (error) { showNotice(error?.message || supabaseUnavailableMessage); }
  }
  async function logout() { if (user) await supabase.from("profiles").update({ is_online: false }).eq("id", user.id); await supabase.auth.signOut(); setUser(null); setProfile(null); }

  async function requestFriend(m) {
    if (!m?.id || m.id === user?.id) return;
    if (isFeatureLocked("FRIEND_REQUESTS")) return showNotice("Deine Freundschaftsanfragen sind derzeit vorübergehend gesperrt.");
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
  async function blockUser(m) { if (!m?.id || isAdmin(m.role)) return showNotice("Admins können nicht blockiert werden."); if (blockedIds.has(m.id)) return showNotice("Dieses Mitglied ist bereits blockiert."); const { error } = await supabase.rpc("create_user_block", { target_user: m.id }); if (error) return showNotice(error.message); showNotice("Mitglied wurde blockiert."); setSelectedMember(null); await loadAll(); }
  async function unblockUser(id) { const { error } = await supabase.rpc("remove_user_block", { target_user: id }); if (error) return showNotice(error.message); await loadAll(); }
  async function reportUser(m) { if (!m?.id || m.id === user?.id) return; const reason = prompt(`Warum möchtest du ${getName(m)} melden?`, "Verstoß gegen die Community-Regeln"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Meldegrund angeben."); const { error } = await supabase.rpc("submit_user_report", { target_user: m.id, reason_text: reason.trim() }); if (error) return showNotice(error.message); setSelectedMember(null); showNotice("Meldung wurde gesendet."); await loadAll(); }
  async function warnMember(m) { if (!isAdmin(profile?.role) || !m?.id || m.id === user?.id || m.role === "HEAD_ADMIN") return showNotice("Keine Berechtigung."); const warning = prompt(`Verwarnung für ${getName(m)}:`, "Bitte beachte die Community-Regeln."); if (warning === null || warning.trim().length < 3) return showNotice("Bitte einen Verwarnungstext angeben."); const { error } = await supabase.rpc("admin_warn_user", { target_user: m.id, warning_text: warning.trim() }); if (error) return showNotice(error.message); showNotice("Die Verwarnung wurde als Nachricht gesendet."); }
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
    const payload = { nickname: String(f.get("nickname") || "").trim(), gender: f.get("gender") || null, bio: String(f.get("bio") || "").trim(), location: String(f.get("location") || "").trim(), interests: String(f.get("interests") || "").split(",").map((interest) => interest.trim()).filter(Boolean), website: String(f.get("website") || "").trim(), profile_accent: f.get("profile_accent") || "#ff6b25", profile_background: f.get("profile_background_image") || f.get("profile_background_color") || "#f6f9fc", profile_layout: f.get("profile_layout") || "standard", bio_font: f.get("bio_font") || "modern", bio_size: f.get("bio_size") || "normal" };
    let { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    // Older live databases may not yet include the optional presentation fields.
    // Save the rest of the profile instead of blocking the whole form.
    if (error && /bio_(font|size)|bio_image_url.*column|column.*bio_/i.test(error.message || "")) { delete payload.bio_font; delete payload.bio_size; ({ error } = await supabase.from("profiles").update(payload).eq("id", user.id)); }
    if (error) return showNotice(error.message); await logProfileActivity("Profil aktualisiert"); showNotice("Profil wurde gespeichert."); await loadAll();
  }
  async function logProfileActivity(label) { if (!user?.id) return; const { error } = await supabase.from("profile_activity").insert({ profile_id: user.id, actor_id: user.id, activity_type: label }); if (error) console.warn(error.message); }
  async function uploadProfileImage(file) {
    if (!file || !user) return; if (!file.type.startsWith("image/")) return showNotice("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) return showNotice("Maximal 5 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type }); if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path); const { error: updateError } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id); if (updateError) return showNotice(updateError.message); await logProfileActivity("Profilbild geändert"); await loadAll();
  }
  async function uploadProfileBackground(file) {
    if (!file || !user) return; if (!file.type.startsWith("image/")) return showNotice("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) return showNotice("Maximal 5 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/backgrounds/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type }); if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path); const { error: updateError } = await supabase.from("profiles").update({ profile_background: data.publicUrl }).eq("id", user.id); if (updateError) return showNotice(updateError.message); await logProfileActivity("Hintergrundfoto geändert"); setProfile((current) => current ? { ...current, profile_background: data.publicUrl } : current); await loadAll();
  }
  async function uploadProfileBioImage(file) {
    if (!file || !user) return; if (!file.type.startsWith("image/")) return showNotice("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) return showNotice("Maximal 5 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/bio/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type }); if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path); const { error: updateError } = await supabase.from("profiles").update({ bio_image_url: data.publicUrl }).eq("id", user.id); if (updateError) return showNotice(updateError.message); await logProfileActivity("Über-mich-Bild geändert"); setProfile((current) => current ? { ...current, bio_image_url: data.publicUrl } : current); await loadAll();
  }
  async function uploadHomepageImage(file) {
    if (!file || !user) throw new Error("Bitte zuerst anmelden."); if (!file.type.startsWith("image/")) throw new Error("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) throw new Error("Das Bild darf höchstens 5 MB groß sein.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/homepage/${crypto.randomUUID()}.${ext}`;
    let bucket = "community-media";
    let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
    // Existing projects may not have the optional community-media bucket yet.
    // Profile avatars already use this bucket, so it is a safe immediate fallback.
    if (error && /bucket not found/i.test(error.message || "")) { bucket = "profile-avatars"; ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })); }
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path); if (!data?.publicUrl) throw new Error("Für das Bild konnte keine öffentliche URL erstellt werden."); return data.publicUrl;
  }
  async function createHomepageSection(e) {
    e.preventDefault(); if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf die Startseite gestalten.");
    const f = new FormData(e.currentTarget); const { error } = await supabase.from("homepage_sections").insert({ title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), image_url: String(f.get("image_url") || "").trim() || null, frame_style: f.get("frame_style") || "standard", created_by: user.id, updated_by: user.id, sort_order: homepageSections.length, is_visible: true });
    if (error) { showNotice(error.message); return false; } e.currentTarget.reset(); showNotice("Rahmen veröffentlicht."); await loadAll(); return true;
  }
  async function editHomepageSection(x) {
    if (!isHeadAdmin(profile?.role)) return; const title = prompt("Überschrift:", x.title || ""); if (title === null) return; const content = prompt("Text:", x.content || ""); if (content === null) return; const image = prompt("Bild-URL:", x.image_url || ""); if (image === null) return;
    const { error } = await supabase.from("homepage_sections").update({ title: title.trim(), content: content.trim(), image_url: image.trim() || null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", x.id); if (error) return showNotice(error.message); await loadAll();
  }
  async function deleteHomepageSection(x) { if (!isHeadAdmin(profile?.role)) return; if (!confirm("Rahmen wirklich löschen?")) return; const { error } = await supabase.from("homepage_sections").delete().eq("id", x.id); if (error) return showNotice(error.message); await loadAll(); }
  async function sendMessage(e) { e.preventDefault(); if (isFeatureLocked("MESSAGING")) return showNotice("Deine Nachrichtenfunktion ist derzeit vorübergehend gesperrt."); if (!chatMember || !messageText.trim()) return; const { error } = await supabase.rpc("send_private_message", { target_user: chatMember.id, message_text: messageText.trim() }); if (error) return showNotice(error.message); setMessageText(""); await openChat(chatMember); }
  async function createForumPost(e, scope) { e.preventDefault(); if (scope === "COMMUNITY" && isFeatureLocked("FORUM_POSTING")) return showNotice("Deine Forums-Schreibfunktion ist derzeit vorübergehend gesperrt."); const form = new FormData(e.currentTarget); const payload = { scope, title: String(form.get("title") || "").trim(), content: String(form.get("content") || "").trim(), font_family: form.get("font_family") || "modern", font_size: form.get("font_size") || "normal", emphasis: form.get("emphasis") || "normal", author_id: user.id }; if (payload.title.length < 3 || payload.content.length < 3) return showNotice("Bitte Überschrift und Beitrag ausfüllen."); const { error } = await supabase.from("forum_posts").insert(payload); if (error) return showNotice(error.message); e.currentTarget.reset(); showNotice("Beitrag veröffentlicht."); await loadAll(); }
  async function editForumPost(post) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Forumsbeiträge bearbeiten."); const title = prompt("Überschrift:", post.title); if (title === null) return; const content = prompt("Beitrag:", post.content); if (content === null) return; const reason = prompt("Grund der Bearbeitung:", "Regelverstoß / Beleidigung entfernt"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Bearbeitungsgrund angeben."); const { error } = await supabase.rpc("admin_edit_forum_post", { p_post_id: post.id, p_title: title.trim(), p_content: content.trim(), p_reason: reason.trim() }); if (error) return showNotice(error.message); showNotice("Beitrag wurde mit Bearbeitungsvermerk gespeichert."); await loadAll(); }
  async function setMemberFeatureLock(member, feature, locked) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Funktionen sperren."); const label = feature === "FORUM_POSTING" ? "Forum schreiben" : feature === "MESSAGING" ? "Nachrichten" : "Freundschaftsanfragen"; const reason = locked ? prompt(`Grund für die Sperre „${label}" bei ${getName(member)}:`, "Verstoß gegen die Community-Regeln") : prompt(`Grund für die Freigabe „${label}" bei ${getName(member)}:`, "Funktion wieder freigegeben"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Grund angeben."); const { error } = await supabase.rpc("admin_set_feature_lock", { p_target_user: member.id, p_feature_key: feature, p_is_locked: locked, p_reason: reason.trim() }); if (error) return showNotice(error.message); showNotice(`${label} wurde ${locked ? "gesperrt" : "freigegeben"}; die automatische Nachricht wurde versendet.`); await loadAll(); }
  async function openChat(m) { setChatMember(m); setPage("messages"); const { data, error } = await supabase.from("messages").select("*").or(`and(sender_id.eq.${user.id},receiver_id.eq.${m.id}),and(sender_id.eq.${m.id},receiver_id.eq.${user.id})`).order("created_at", { ascending: true }); if (error) return showNotice(error.message); setMessages(data || []); await supabase.rpc("mark_messages_read", { from_user: m.id }); }
  async function openMember(m) { if (!m) return; if (m.id === user.id) return setPage("profile"); setViewingMember(m); setViewingFriends([]); setPage("member-profile"); const [{ data: connections }, { error: visitError }] = await Promise.all([supabase.from("friendships").select("requester_id,receiver_id").eq("status", "ACCEPTED").or(`requester_id.eq.${m.id},receiver_id.eq.${m.id}`), supabase.from("profile_visits").insert({ profile_id: m.id, visitor_id: user.id, visited_at: new Date().toISOString() })]); if (connections) { const ids = connections.map((connection) => connection.requester_id === m.id ? connection.receiver_id : connection.requester_id); setViewingFriends(members.filter((member) => ids.includes(member.id))); } if (visitError) console.warn(visitError.message); }

  if (!user) return <div className="auth-page"><div className="text-logo">ENNSTAL CONNECT</div><Auth login={login} register={register}/>{notice && <div className="toast">{notice}</div>}</div>;

  const unread = messages.filter((m) => m.receiver_id === user.id && !m.is_read).length;
  const myRole = roleLabel(profile?.role);
  return <div className="app">
    <header className="topbar modern-topbar">
      <div className="topbar-brand" onClick={() => setPage("home")}><img src="/ennstal-connect-community-logo.png" alt="Ennstal Connect Community-Logo" className="topbar-logo"/></div>
      <div className="breadcrumb">ENNSTAL.CONNECT <span>›</span> {page}</div>
      <button className={`topbar-user ${roleClass(profile?.role)}`} onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(profile)}{profile?.role === "HEAD_ADMIN" && <b className="nickname-crown" aria-label="Global Admin">♛</b>}</strong></span></button>
    </header>
    <div className="dashboard-layout">
      <aside className="modern-sidebar">
        <div className="sidebar-profile" onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(profile)}</strong><span className={`role-badge ${roleClass(profile?.role)}`}>{profile?.role === "HEAD_ADMIN" ? "♛" : profile?.role === "ADMIN" ? "★ Community Admin" : profile?.role === "SUPPORTER" ? "★ Supporter" : "Mitglied"}</span></div></div>
        <nav className="modern-nav">
          <button onClick={() => setPage("home")}>⌂ <span>Startseite</span></button>
          <button onClick={() => setPage("members")}>♙ <span>Mitglieder</span></button>
          <button onClick={() => setPage("friends")}>♥ <span>Freunde</span></button>
          <button onClick={() => setPage("friend-requests")}>♢ <span>Anfragen</span>{incomingRequests.length > 0 && <em>{incomingRequests.length}</em>}</button>
          <button onClick={() => setPage("blocked")}>⊘ <span>Blockiert</span></button>
          <button onClick={() => setPage("messages")}>☏ <span>Nachrichten</span>{unread > 0 && <em>{unread}</em>}</button>
          <button onClick={() => setPage("forum")}>▤ <span>Forum</span></button>
          {isAdmin(profile?.role) && <button onClick={() => setPage("admin-forum")}>♛ <span>Admin-Forum</span></button>}
          <button onClick={() => setPage("profile")}>⚙ <span>Mein Profil</span></button>
          {isAdmin(profile?.role) && <><button onClick={() => setPage("admin")}>♛ <span>Verwaltung</span></button><button onClick={() => setPage("reports")}>⚑ <span>Meldungen</span></button></>}
        </nav>
        <button className="sidebar-logout" onClick={logout}>⇥ <span>Abmelden</span></button>
      </aside>
      <main className="modern-main"><div className="content-root">{notice && <div className="toast">{notice}</div>}
        {page === "home" && <Home profile={profile} isHeadAdmin={isHeadAdmin} homepageSections={homepageSections} canEdit={isHeadAdmin(profile?.role)} createHomepageSection={createHomepageSection} editHomepageSection={editHomepageSection} deleteHomepageSection={deleteHomepageSection} uploadHomepageImage={uploadHomepageImage}/>}
        {page === "members" && <section><div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1></div><input className="search-input" placeholder="Mitglied suchen …" value={search} onChange={(e) => setSearch(e.target.value)}/></div><MemberGrid members={sortedMembers} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friends" && <section><div className="page-heading"><h1>Freunde</h1><p>Nur bestätigte Freundschaften werden hier angezeigt.</p></div><MemberGrid members={members.filter((m) => acceptedFriendIds.includes(m.id))} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friend-requests" && <FriendRequests incoming={incomingRequests} sent={sentRequests} memberById={memberById} respond={respondToFriendRequest} cancel={cancelFriendRequest}/>} 
        {page === "blocked" && <Blocked blockedUsers={blockedUsers} memberById={memberById} unblock={unblockUser}/>} 
        {page === "messages" && <Messages user={user} messages={messages} chatMember={chatMember} setChatMember={setChatMember} memberById={memberById} openChat={openChat} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage}/>} 
        {page === "forum" && <Forum title="Community-Forum" intro="Austausch für alle Mitglieder von Ennstal Connect." scope="COMMUNITY" posts={forumPosts} members={members} profile={profile} createPost={createForumPost} editPost={editForumPost} locked={isFeatureLocked("FORUM_POSTING")}/>}
        {page === "admin-forum" && isAdmin(profile?.role) && <Forum title="Admin-Forum" intro="Interner Bereich für Moderation und Administration." scope="ADMIN" posts={forumPosts} members={members} profile={profile} createPost={createForumPost} editPost={editForumPost} locked={false}/>}
        {page === "profile" && <><Profile profile={profile} user={user} isHeadAdmin={isHeadAdmin} saveProfile={saveProfile} uploadProfileImage={uploadProfileImage} uploadProfileBackground={uploadProfileBackground} uploadProfileBioImage={uploadProfileBioImage}/><ProfileTimeline visits={profileVisits} activities={profileActivities} members={members}/></>}
        {page === "member-profile" && viewingMember && <MemberProfile member={viewingMember} friends={viewingFriends} user={user} viewerProfile={profile} friendship={friendshipWith(viewingMember.id)} back={() => { setViewingMember(null); setViewingFriends([]); setPage("members"); }} onOpen={openMember} requestFriend={requestFriend} respond={respondToFriendRequest} removeFriend={removeFriend} blockUser={blockUser} reportUser={reportUser} warnMember={warnMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} loadPermissions={loadPermissions} setMemberFeatureLock={setMemberFeatureLock} openChat={openChat}/>}
        {page === "reports" && isAdmin(profile?.role) && <Reports reports={reports} memberById={memberById} resolveReport={resolveReport}/>} 
        {page === "admin" && isAdmin(profile?.role) && <AdminPanel members={members} profile={profile} user={user} onOpen={openMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} editingMember={editingMember} setEditingMember={setEditingMember} saveMemberData={saveMemberData} adminTarget={adminTarget} loadPermissions={loadPermissions} permissionDraft={permissionDraft} setPermissionDraft={setPermissionDraft} savePermissions={savePermissions} savingPermissions={savingPermissions}/>} 
        {page === "impressum" && <LegalPage type="impressum"/>}
        {page === "privacy" && <LegalPage type="privacy"/>}
      </div></main>
    </div>
    <footer className="site-footer"><strong>Ennstal Connect</strong><div><button onClick={() => setPage("impressum")}>Impressum</button><button onClick={() => setPage("privacy")}>Datenschutz</button></div></footer>
  </div>;
}

function Home({ profile, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection, uploadHomepageImage }) {
  const [frames, setFrames] = useState([{ imageUrl: "", status: "" }, { imageUrl: "", status: "" }]);
  const updateFrame = (index, changes) => setFrames((current) => current.map((frame, i) => i === index ? { ...frame, ...changes } : frame));
  const chooseImage = async (index, event) => { const file = event.target.files?.[0]; if (!file) return; updateFrame(index, { status: "Bild wird hochgeladen …" }); try { const imageUrl = await uploadHomepageImage(file); updateFrame(index, { imageUrl, status: "✓ Bild bereit – Rahmen jetzt veröffentlichen." }); } catch (error) { updateFrame(index, { status: `Upload fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}` }); } };
  const saveFrame = async (index, event) => { const saved = await createHomepageSection(event); if (saved) updateFrame(index, { imageUrl: "", status: "" }); };
  const frameForm = (label, index) => <section className="homepage-builder panel"><span className="eyebrow">{label}</span><h2>Rahmen gestalten</h2><form onSubmit={(event) => saveFrame(index, event)} className="homepage-form"><input name="title" placeholder="Rahmen-Überschrift" required/><textarea name="content" placeholder="Text für den Rahmen" required/><input name="image_url" value={frames[index].imageUrl} onChange={(event) => updateFrame(index, { imageUrl: event.target.value })} placeholder="Bild-URL (optional)"/><label className="homepage-image-picker">Foto hochladen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => chooseImage(index, event)}/></label>{frames[index].imageUrl && <img className="homepage-upload-preview" src={frames[index].imageUrl} alt="Bildvorschau"/>}{frames[index].status && <p className="homepage-upload-status" aria-live="polite">{frames[index].status}</p>}<select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select><button className="primary-button">Rahmen veröffentlichen</button></form></section>;
  return <section className="home-page"><div className="hero community-logo-hero"><img src="/ennstal-connect-community-logo.png" alt="Ennstal Connect Community-Logo"/></div><div className="page-heading"><div><span className="eyebrow">ENNSTAL & OBERSTEIERMARK</span><h1>Willkommen, {getName(profile)}</h1><p>Eine lebendige regionale Community für Menschen aus dem Ennstal und Umgebung.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}</div>{canEdit && <div className="homepage-builder-grid">{frameForm("RAHMEN 1", 0)}{frameForm("RAHMEN 2", 1)}</div>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={`homepage-frame ${x.frame_style || "standard"}`} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">ENNSTAL CONNECT</span><h2>{x.title}</h2><p>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;
}

function MemberGrid({ members, profile, friendships, onOpen, onMessage }) { return <div className="member-grid">{members.map((m) => <MemberCard key={m.id} member={m} profile={profile} friendships={friendships} onOpen={onOpen} onMessage={onMessage}/>)}</div>; }
function MemberCard({ member, profile, friendships, onOpen, onMessage }) {
  const r = member.role || "MEMBER";
  const friendship = friendships.find((x) => (x.requester_id === profile?.id && x.receiver_id === member.id) || (x.receiver_id === profile?.id && x.requester_id === member.id));
  const friend = friendship?.status === "ACCEPTED";
  return <article className={`member-card ${roleClass(r)}`} onClick={() => onOpen(member)}>
    <div className="member-role-line"><span className={`role-chip ${roleClass(r)}`}>{r === "HEAD_ADMIN" ? "♛ Global Admin" : r === "ADMIN" ? "★ Community Admin" : r === "SUPPORTER" ? "★ Supporter" : "Mitglied"}</span>{friend && <span className="friend-indicator" title="Befreundet">♥</span>}</div>
    <strong className="member-nickname">{getName(member)}</strong>
    <img className="member-avatar" src={member.avatar_url || DEFAULT_AVATAR} alt=""/>
    <div className="member-name">{[member.first_name, member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date) !== null && ` · ${getAge(member.birth_date)} Jahre`}</div>
    <div className={`member-status ${member.is_online ? "online" : "offline"}`}><span/>{member.is_online ? "Online" : "Offline"}</div>
    {member.id !== profile?.id && <button className="member-message" onClick={(e) => { e.stopPropagation(); onMessage(member); }}>💬 Nachricht</button>}
  </article>;
}

function FriendRequests({ incoming, sent, memberById, respond, cancel }) { return <section><div className="page-heading"><div><span className="eyebrow">VERBINDUNGEN</span><h1>Freundschaftsanfragen</h1><p>Anfragen werden erst nach Annahme zu Freunden.</p></div></div><h2>Eingehend</h2><div className="cards">{incoming.map((r) => { const m = memberById(r.requester_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>{roleLabel(m.role)}</span></div><div className="request-actions"><button className="primary-button" onClick={() => respond(r, true)}>✓ Annehmen</button><button className="danger-button" onClick={() => respond(r, false)}>Ablehnen</button></div></>}</article>; })}{!incoming.length && <div className="empty-card">Keine eingehenden Anfragen.</div>}</div><h2>Gesendet</h2><div className="cards">{sent.map((r) => { const m = memberById(r.receiver_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>Wartet auf Antwort</span></div><button className="danger-button" onClick={() => cancel(r)}>Anfrage abbrechen</button></>}</article>; })}{!sent.length && <div className="empty-card">Keine offenen gesendeten Anfragen.</div>}</div></section>; }
function Blocked({ blockedUsers, memberById, unblock }) { return <section><div className="page-heading"><h1>Blockierliste</h1><p>Blockierte Nutzer sehen dich nicht in deinen normalen Community-Listen.</p></div><div className="member-grid">{blockedUsers.map((b) => { const m = memberById(b.blocked_id); return m && <article className="member-card member" key={b.id}><img className="member-avatar" src={m.avatar_url || DEFAULT_AVATAR} alt=""/><strong className="member-nickname">{getName(m)}</strong><button className="secondary-button" onClick={() => unblock(m.id)}>Entsperren</button></article>; })}{!blockedUsers.length && <div className="empty-card">Keine blockierten Nutzer.</div>}</div></section>; }
function Messages({ user, messages, chatMember, setChatMember, memberById, openChat, messageText, setMessageText, sendMessage }) { return <section><div className="page-heading"><h1>Nachrichten</h1></div>{!chatMember ? <div className="message-overview">{messages.filter((m) => m.receiver_id === user.id || m.sender_id === user.id).map((m) => { const other = memberById(m.sender_id === user.id ? m.receiver_id : m.sender_id); return other && <button className="message-preview" key={m.id} onClick={() => openChat(other)}><img src={other.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(other)}</strong><small>{m.content}</small></span></button>; })}{!messages.length && <div className="empty-card">Noch keine Nachrichten.</div>}</div> : <div className="chat-box"><div className="chat-header"><button className="back-button" onClick={() => setChatMember(null)}>← Zurück</button><MemberMini member={chatMember}/></div><div className="chat-messages">{messages.filter((m) => (m.sender_id === user.id && m.receiver_id === chatMember.id) || (m.sender_id === chatMember.id && m.receiver_id === user.id)).map((m) => <div className={`chat-message ${m.sender_id === user.id ? "mine" : ""}`} key={m.id}><p>{m.content}</p><small>{new Date(m.created_at).toLocaleString("de-AT")}</small></div>)}</div><form className="message-form" onSubmit={sendMessage}><textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Nachricht schreiben …"/><button className="primary-button">Senden</button></form></div>}</section>; }
function MemberMini({ member }) { return <div className="member-mini"><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><strong>{getName(member)}</strong></div>; }

function Profile({ profile, user, isHeadAdmin, saveProfile, uploadProfileImage, uploadProfileBackground, uploadProfileBioImage }) { const background = profile?.profile_background || "#1b1f26"; const isImage = background.startsWith("http"); const cardStyle = isImage ? { "--profile-background-image": `linear-gradient(rgba(18,25,34,.42), rgba(18,25,34,.76)), url(${background})` } : { backgroundColor: background }; return <section><div className="my-area-layout"><div className={`my-profile-card ${roleClass(profile?.role)}`} style={cardStyle}><div className="profile-role-mark">{profile?.role === "HEAD_ADMIN" ? "♛" : "★"}</div><img className="my-avatar" src={profile?.avatar_url || DEFAULT_AVATAR} alt="Profil"/><h1>{getName(profile)}</h1><div className={`profile-role-label ${roleClass(profile?.role)}`}>{roleLabel(profile?.role)}</div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}<h2>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}{getAge(profile?.birth_date) !== null && ` · ${getAge(profile.birth_date)} Jahre`}</h2>{profile?.bio_image_url && <img className="profile-bio-image" src={profile.bio_image_url} alt=""/>}<p className={`profile-bio ${profile?.bio_font || "modern"} ${profile?.bio_size || "normal"}`}>{profile?.bio || "Noch kein Über-mich-Text."}</p></div><form className="panel profile-form" onSubmit={saveProfile}><span className="eyebrow">DEIN PROFIL</span><h2>Profil gestalten</h2><label>Nickname *</label><input name="nickname" defaultValue={profile?.nickname || ""} required/><input type="hidden" name="profile_background_image" value={isImage ? background : ""}/><div className="form-grid"><div><label>Profil-Akzent</label><input type="color" name="profile_accent" defaultValue={profile?.profile_accent || "#ff6b25"}/></div><div><label>Profil-Hintergrundfarbe</label><input type="color" name="profile_background_color" defaultValue={isImage ? "#1b1f26" : background}/></div></div><label>Profilbild</label><input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadProfileImage(e.target.files[0])}/><label>Hintergrundfoto</label><input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadProfileBackground(e.target.files[0])}/><label>Geschlecht *</label><select name="gender" defaultValue={profile?.gender || ""} required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><label>Über mich</label><textarea name="bio" defaultValue={profile?.bio || ""} placeholder="Erzähl der Community etwas über dich …"/><div className="form-grid"><label>Schriftart<select name="bio_font" defaultValue={profile?.bio_font || "modern"}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="bio_size" defaultValue={profile?.bio_size || "normal"}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label></div><label>Bild zu „Über mich“</label><input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadProfileBioImage(e.target.files[0])}/><label>Interessen</label><input name="interests" defaultValue={formatInterests(profile?.interests)} placeholder="z. B. Wandern, Fußball"/><label>Wohnort</label><input name="location" defaultValue={profile?.location || ""}/><label>Website</label><input name="website" defaultValue={profile?.website || ""}/><button className="primary-button">Änderungen speichern</button></form></div></section>; }

function ProfileTimeline({ visits, activities, members }) { const memberFor = (id) => members.find((member) => member.id === id); const roleName = (member) => member ? `${roleMark(member.role)} ${getName(member)}`.trim() : "Mitglied"; return <section className="profile-timeline panel"><span className="eyebrow">PROFIL-AKTIVITÄT</span><h2>Besuche & Änderungen</h2><div>{visits.slice(0,10).map((visit) => <p key={`visit-${visit.id || visit.visited_at}`}><strong>{roleName(memberFor(visit.visitor_id))}</strong> hat dein Profil besucht <time>{new Date(visit.visited_at).toLocaleString("de-AT")}</time></p>)}{activities.slice(0,10).map((activity) => <p key={activity.id}><strong>{roleName(memberFor(activity.actor_id))}</strong> · {activity.activity_type} <time>{new Date(activity.created_at).toLocaleString("de-AT")}</time></p>)}{!visits.length && !activities.length && <p>Noch keine Profilaktivitäten.</p>}</div></section>; }

function Reports({ reports, memberById, resolveReport }) { return <section><div className="page-heading"><div><span className="eyebrow">MODERATION</span><h1>Meldungen</h1><p>Gemeldete Mitglieder prüfen und bearbeiten.</p></div></div><div className="report-list">{reports.map((r) => <article className="report-card" key={r.id}><div className="report-top"><strong>🚩 {r.status}</strong><span>{new Date(r.created_at).toLocaleString("de-AT")}</span></div><p><b>Gemeldet von:</b> {getName(memberById(r.reporter_id))}</p><p><b>Gemeldetes Mitglied:</b> {getName(memberById(r.reported_user_id))}</p><p>{r.reason}</p>{r.status === "PENDING" && <div className="content-manage-actions"><button className="primary-button" onClick={() => resolveReport(r.id, "CONFIRMED")}>Meldung bestätigen</button><button className="danger-button" onClick={() => resolveReport(r.id, "UNFOUNDED")}>Unbegründet</button></div>}</article>)}{!reports.length && <div className="empty-card">Keine Meldungen vorhanden.</div>}</div></section>; }

function AdminPanel({ members, profile, user, onOpen, updateMemberRole, toggleSuspension, editingMember, setEditingMember, saveMemberData, adminTarget, loadPermissions, permissionDraft, setPermissionDraft, savePermissions, savingPermissions }) {
  const admins = members.filter((m) => isAdmin(m.role));
  return <section className="admin-page"><div className="page-heading"><div><span className="eyebrow">VERWALTUNG</span><h1>Admin-Zentrale</h1><p>Global Admin und Community Admin werden klar unterschieden. Berechtigungen sind einzeln steuerbar.</p></div></div>
    <div className="admin-member-cards">{members.slice().sort((a,b) => (a.role === "HEAD_ADMIN" ? 1 : a.role === "ADMIN" ? 2 : a.role === "SUPPORTER" ? 3 : 4) - (b.role === "HEAD_ADMIN" ? 1 : b.role === "ADMIN" ? 2 : b.role === "SUPPORTER" ? 3 : 4) || getName(a).localeCompare(getName(b), "de")).map((m) => <article className={`admin-member-card ${roleClass(m.role)}`} key={m.id}><button className="admin-member-person-button" onClick={() => onOpen(m)}><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(m)}</strong><small>{roleLabel(m.role)}</small></span></button><div className="admin-member-card-info"><div><span>Rolle</span><strong>{roleLabel(m.role)}</strong></div><div><span>Alter</span><strong>{getAge(m.birth_date) ?? "—"}</strong></div></div>{isHeadAdmin(profile?.role) && m.role !== "HEAD_ADMIN" && <div className="admin-member-card-actions"><button className="profile-admin-button supporter" onClick={() => updateMemberRole(m, "SUPPORTER")}>🟢 Supporter</button><button className="profile-admin-button admin" onClick={() => updateMemberRole(m, m.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{m.role === "ADMIN" ? "✕ Community Admin entfernen" : "★ Community Admin"}</button>{m.role !== "MEMBER" && <button className="profile-admin-button remove-role" onClick={() => updateMemberRole(m, "MEMBER")}>↩ Rolle entfernen</button>}<button className="profile-admin-button" onClick={() => setEditingMember(m)}>✎ Name / Geburtsdatum</button><button className="profile-admin-button" onClick={() => loadPermissions(m.id)}>⚙ Rechte</button><button className="profile-admin-button danger" onClick={() => toggleSuspension(m)}>{m.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button></div>}</article>)}</div>
    {editingMember && <section className="profile-admin-edit-form panel"><div className="panel-title-row"><h2>Mitgliedsdaten ändern</h2><button className="modal-close-inline" onClick={() => setEditingMember(null)}>×</button></div><form onSubmit={saveMemberData} className="profile-admin-edit-grid"><label>Nickname<input name="nickname" defaultValue={editingMember.nickname || ""}/></label><label>Vorname<input name="first_name" defaultValue={editingMember.first_name || ""} required/></label><label>Nachname<input name="last_name" defaultValue={editingMember.last_name || ""} required/></label><label>Geburtsdatum<input type="date" name="birth_date" defaultValue={editingMember.birth_date || ""} required/></label><label>Geschlecht<select name="gender" defaultValue={editingMember.gender || ""}><option value="">Nicht angegeben</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label><div className="edit-actions"><button className="primary-button">💾 Speichern</button></div></form></section>}
    {isHeadAdmin(profile?.role) && adminTarget && <section className="permissions-panel panel"><div className="panel-title-row"><div><span className="eyebrow">RECHTE</span><h2>Einzelne Berechtigungen</h2><p>{getName(members.find((m) => m.id === adminTarget))} – jede Berechtigung kann unabhängig aktiviert werden.</p></div><button className="modal-close-inline" onClick={() => setAdminTarget?.("")}>×</button></div><div className="permissions-grid">{PERMISSIONS.map(([key,label]) => <label className="permission-row" key={key}><input type="checkbox" checked={!!permissionDraft[key]} onChange={(e) => setPermissionDraft((x) => ({...x, [key]: e.target.checked}))}/><span>{label}</span></label>)}</div><button className="primary-button" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Speichere …" : "Berechtigungen speichern"}</button></section>}
  </section>;
}

function Forum({ title, intro, scope, posts, members, profile, createPost, editPost, locked }) {
  const visiblePosts = posts.filter((post) => post.scope === scope);
  const nameFor = (id) => getName(members.find((member) => member.id === id));
  return <section className="forum-page"><div className="page-heading"><div><span className="eyebrow">{scope === "ADMIN" ? "INTERN" : "COMMUNITY"}</span><h1>{title}</h1><p>{intro}</p></div></div><form className="forum-composer panel" onSubmit={(event) => createPost(event, scope)}><h2>Neuen Beitrag schreiben</h2>{locked && <p className="forum-locked">Deine Schreibfunktion im Forum ist momentan gesperrt.</p>}<input name="title" placeholder="Überschrift" minLength="3" required disabled={locked}/><textarea name="content" placeholder="Teile deinen Beitrag mit der Community …" minLength="3" required disabled={locked}/><div className="form-grid"><label>Schriftart<select name="font_family" defaultValue="modern" disabled={locked}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="font_size" defaultValue="normal" disabled={locked}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label></div><label>Betonung<select name="emphasis" defaultValue="normal" disabled={locked}><option value="normal">Normal</option><option value="bold">Fett</option><option value="italic">Kursiv</option></select></label><button className="primary-button" disabled={locked}>Beitrag veröffentlichen</button></form><div className="forum-post-list">{visiblePosts.map((post) => <article className="forum-post panel" key={post.id}><div className="forum-post-head"><div><span className="eyebrow">{scope === "ADMIN" ? "ADMIN-FORUM" : "FORUM"}</span><h2>{post.title}</h2><p>von <strong>{nameFor(post.author_id)}</strong> · {new Date(post.created_at).toLocaleString("de-AT")}</p></div>{isHeadAdmin(profile?.role) && <button className="secondary-button" onClick={() => editPost(post)}>✎ Bearbeiten</button>}</div><p className={`forum-content ${post.font_family || "modern"} ${post.font_size || "normal"} ${post.emphasis || "normal"}`}>{post.content}</p>{post.edited_at && <small className="forum-edited">♛ Bearbeitet von Head Admin {nameFor(post.edited_by)} · {post.edit_reason}</small>}</article>)}{!visiblePosts.length && <div className="empty-card">Noch keine Beiträge. Starte die Diskussion!</div>}</div></section>;
}

function ProfileModal({ selectedMember, user, profile, friendship, setSelectedMember, requestFriend, respond, removeFriend, blockUser, reportUser, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  return <div className="modal-overlay" onClick={() => setSelectedMember(null)}><div className="profile-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedMember(null)}>×</button><div className={`modal-profile-header ${roleClass(selectedMember.role)}`}><div className="profile-modal-role">{selectedMember.role === "HEAD_ADMIN" ? "♛ GLOBAL ADMIN" : selectedMember.role === "ADMIN" ? "★ COMMUNITY ADMIN" : selectedMember.role === "SUPPORTER" ? "★ SUPPORTER" : "MITGLIED"}</div><img className="modal-avatar" src={selectedMember.avatar_url || DEFAULT_AVATAR} alt=""/><div className="modal-title"><h1>{getName(selectedMember)}</h1><span>{[selectedMember.first_name, selectedMember.last_name].filter(Boolean).join(" ")}{getAge(selectedMember.birth_date) !== null && ` · ${getAge(selectedMember.birth_date)} Jahre`}</span></div></div><div className="modal-content">{selectedMember.bio && <><h3>Über mich</h3><p>{selectedMember.bio}</p></>}{selectedMember.id !== user.id && <div className="profile-actions"><button className="primary-button" onClick={() => { setSelectedMember(null); openChat(selectedMember); }}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(selectedMember)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Anfrage ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(selectedMember)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>}{!isAdmin(selectedMember.role) && <button className="secondary-button" onClick={() => blockUser(selectedMember)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(selectedMember)}>🚩 Nutzer melden</button></div>}</div></div></div>;
}

function MemberProfile({ member, friends, user, viewerProfile, friendship, back, onOpen, requestFriend, respond, removeFriend, blockUser, reportUser, warnMember, updateMemberRole, toggleSuspension, loadPermissions, setMemberFeatureLock, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  const canModerate = isAdmin(viewerProfile?.role) && member.id !== user.id && member.role !== "HEAD_ADMIN";
  const canManageRoles = isHeadAdmin(viewerProfile?.role) && canModerate;
  return <section className="member-profile-page"><button className="back-button" onClick={back}>← Zurück zu Mitgliedern</button><article className={`member-profile-hero ${roleClass(member.role)}`}><img className={!member.avatar_url ? "member-profile-default-avatar" : ""} src={member.avatar_url || DEFAULT_AVATAR} alt="Standard-Profilbild"/><div><span>{roleLabel(member.role)}</span><h1>{getName(member)}</h1><p>{[member.first_name, member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date) !== null && ` · ${getAge(member.birth_date)} Jahre`}</p>{member.bio && <p className="member-profile-bio">{member.bio}</p>}</div></article><div className="member-profile-actions"><button className="primary-button" onClick={() => openChat(member)}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(member)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(member)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>} {!isAdmin(member.role) && <button className="secondary-button" onClick={() => blockUser(member)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(member)}>🚩 Nutzer melden</button></div>{canModerate && <section className="member-admin-tools"><span className="eyebrow">MODERATION</span><h2>Admin-Werkzeuge</h2><div><button className="danger-button" onClick={() => warnMember(member)}>⚠ Verwarnung senden</button><button className="secondary-button" onClick={() => toggleSuspension(member)}>{member.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button>{canManageRoles && <><button className="secondary-button" onClick={() => updateMemberRole(member, "SUPPORTER")}>🟢 Supporter</button><button className="secondary-button" onClick={() => updateMemberRole(member, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{member.role === "ADMIN" ? "✕ Admin entfernen" : "★ Community Admin"}</button>{member.role !== "MEMBER" && <button className="secondary-button" onClick={() => updateMemberRole(member, "MEMBER")}>↩ Rolle entfernen</button>}<button className="secondary-button" onClick={() => loadPermissions(member.id)}>⚙ Rechte verwalten</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", true)}>Forum sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "MESSAGING", true)}>Nachrichten sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FRIEND_REQUESTS", true)}>Anfragen sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", false)}>Forum freigeben</button></>}</div></section>}{friends.length > 0 && <section className="public-friends"><span className="eyebrow">FREUNDE</span><h2>Mit {getName(member)} verbunden</h2><div>{friends.map((friend) => <button key={friend.id} onClick={() => onOpen(friend)}><img src={friend.avatar_url || DEFAULT_AVATAR} alt=""/><span>{getName(friend)}</span></button>)}</div></section>}</section>;
}

function Auth({ login, register }) { const [mode,setMode] = useState("login"); return <div className="auth-box">{mode === "login" ? <form className="panel" onSubmit={login}><h1>Anmelden</h1><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" placeholder="Passwort *" required/><button className="primary-button">Anmelden</button><button type="button" className="text-button" onClick={() => setMode("register")}>Noch kein Konto? Jetzt registrieren</button></form> : <form className="panel" onSubmit={register}><h1>Registrieren</h1><input name="nickname" placeholder="Nickname *" required/><input name="first_name" placeholder="Vorname *" required/><input name="last_name" placeholder="Nachname *" required/><input name="birth_date" type="date" required/><select name="gender" defaultValue="" required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" minLength={6} placeholder="Passwort *" required/><button className="primary-button">Konto erstellen</button><button type="button" className="text-button" onClick={() => setMode("login")}>Bereits registriert? Anmelden</button></form>}</div>; }
function InfoPage({ title, text }) { return <section><div className="page-heading"><h1>{title}</h1></div><div className="panel"><p>{text}</p></div></section>; }
function LegalPage({ type }) { const privacy = type === "privacy"; return <section className="legal-page panel"><h1>{privacy ? "Datenschutzerklärung" : "Impressum"}</h1>{privacy ? <><h2>Verantwortlicher</h2><p>Ennstal Connect, Waidbachstraße, 8700 Leoben, Österreich. Kontakt: ennsstal.connect@gmx.at</p><h2>Verarbeitete Daten</h2><p>Für Konto, Profil, Nachrichten, Freundschaften und Moderation werden die dafür erforderlichen Registrierungs-, Profil- und Nutzungsdaten verarbeitet.</p><h2>Deine Rechte</h2><p>Du hast im gesetzlichen Rahmen insbesondere Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei der Datenschutzbehörde.</p></> : <><p><strong>Ennstal Connect</strong></p><p>Verantwortlicher Betreiber: Marco Egger<br/>Waidbachstraße<br/>8700 Leoben, Österreich<br/>E-Mail: ennsstal.connect@gmx.at</p><h2>Zweck</h2><p>Regionale Community für Vernetzung, Kommunikation und Austausch im Ennstal und Umgebung.</p><h2>Haftung für Inhalte</h2><p>Für selbst veröffentlichte Inhalte sind die jeweiligen Mitglieder verantwortlich. Rechtswidrige Inhalte können an die Moderation gemeldet werden.</p></>}</section>; }
