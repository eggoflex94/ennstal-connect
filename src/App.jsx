import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { preparePrivilegedAction, supabase, supabaseUnavailableMessage } from "./supabaseClient";

// A friendly community image is shown until a member uploads a personal photo.
const DEFAULT_AVATAR = "/community-default-avatar.png";
const COMMUNITY_RULES_VERSION = "2026-09-05";
const ADMIN_LOG_LABELS = {
  ROLE_ASSIGNED: "Rolle ernannt",
  ROLE_REMOVED: "Rolle entfernt",
  ROLE_CHANGED: "Rolle geändert",
  SET_ROLE: "Rolle geändert",
  PRIVILEGED_INSERT: "Privilegierte Aktion: erstellt",
  PRIVILEGED_UPDATE: "Privilegierte Aktion: geändert",
  PRIVILEGED_DELETE: "Privilegierte Aktion: gelöscht",
  ADMIN_INSERT: "Admin-Aktion: erstellt",
  ADMIN_UPDATE: "Admin-Aktion: geändert",
  ADMIN_DELETE: "Admin-Aktion: gelöscht",
};
const ADMIN_AREA_LABELS = { profiles: "Mitgliederprofil", user_permissions: "Berechtigungen", user_feature_locks: "Funktionssperren", user_reports: "Meldungen", messages: "Moderationsnachricht", news: "Neuigkeiten", community_events: "Veranstaltungen", community_ads: "Werbeflächen", community_groups: "Gruppen", community_group_members: "Gruppenmitglieder", group_members: "Gruppenmitglieder", forum_posts: "Forumsbeiträge", forum_replies: "Forumsantworten", member_photos: "Mitgliederfotos", member_photo_comments: "Fotokommentare", homepage_sections: "Startseite", community_requests: "Community-Anfragen" };
const formatAdminLogDetails = (details = {}) => {
  const changes = Array.isArray(details.changes) ? details.changes : [];
  const areas = [...new Set(changes.map((change) => ADMIN_AREA_LABELS[change.area] || change.area).filter(Boolean))];
  const fields = [...new Set(changes.flatMap((change) => change.changed_fields || []))];
  return [details.action_name && `Funktion: ${details.action_name}`, areas.length && `Bereich: ${areas.join(", ")}`, details.reason && `Begründung: ${details.reason}`, fields.length && `Geändert: ${fields.join(", ")}`].filter(Boolean).join(" · ");
};
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
const isRecentlyActive = (member) => Boolean(member?.is_online && member?.last_active_at && Date.now() - new Date(member.last_active_at).getTime() < 5 * 60 * 1000);
const instantWelcomeBadges = (profile, groups, posts, userId) => [
  { key: "WELCOME", title: "Willkommen", description: "Dein Konto ist bereit für die Community.", icon: "✦", earned: true },
  { key: "PROFILE", title: "Profil angelegt", description: "Dein Name ist in der Community sichtbar.", icon: "◉", earned: Boolean(profile?.nickname) },
  { key: "GROUP", title: "Erste Gruppe", description: "Einer Community-Gruppe beigetreten.", icon: "◉", earned: groups.some((group) => (group.member_ids || []).includes(userId)) },
  { key: "FORUM", title: "Erster Beitrag", description: "Im Forum mitdiskutiert.", icon: "✦", earned: posts.some((post) => post.author_id === userId) }
];
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

const openContentEditor = ({ title, description, fields }) => new Promise((resolve) => {
  const overlay = document.createElement("div"); overlay.className = "content-editor-overlay";
  const dialog = document.createElement("form"); dialog.className = "content-editor-dialog";
  dialog.innerHTML = `<div class="content-editor-header"><div><span class="eyebrow">BEARBEITEN</span><h2>${title}</h2><p>${description || "Änderungen prüfen und anschließend speichern."}</p></div><button type="button" class="content-editor-close" aria-label="Schließen">×</button></div>`;
  fields.forEach((definition) => {
    const label = document.createElement("label"); label.className = "content-editor-field"; label.textContent = definition.label;
    const element = definition.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
    element.name = definition.name; element.type = definition.type === "file" ? "file" : definition.type || "text";
    if (definition.type === "file") element.accept = "image/png,image/jpeg,image/webp,image/gif";
    else element.value = definition.value || "";
    if (definition.placeholder) element.placeholder = definition.placeholder;
    if (definition.required) element.required = true;
    if (definition.type === "textarea") element.rows = definition.rows || 12;
    label.appendChild(element); dialog.appendChild(label);
  });
  const actions = document.createElement("div"); actions.className = "content-editor-actions";
  actions.innerHTML = '<button type="button" class="secondary-button">Abbrechen</button><button class="primary-button">Änderungen speichern</button>';
  dialog.appendChild(actions); overlay.appendChild(dialog); document.body.appendChild(overlay);
  const close = (result) => { overlay.remove(); resolve(result); };
  dialog.querySelector(".content-editor-close").onclick = () => close(null);
  actions.querySelector(".secondary-button").onclick = () => close(null);
  overlay.onclick = (event) => { if (event.target === overlay) close(null); };
  dialog.onsubmit = (event) => { event.preventDefault(); const data = new FormData(dialog); const values = {}; fields.forEach((field) => { values[field.name] = field.type === "file" ? data.get(field.name) : String(data.get(field.name) || ""); }); close(values); };
});

export default function App() {
  const [user, setUser] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState(null);
  const [members, setMembers] = useState([]);
  const [adminMembers, setAdminMembers] = useState([]);
  const [adminLog, setAdminLog] = useState([]);
  const [rulesAccepted, setRulesAccepted] = useState(null);
  const [acceptingRules, setAcceptingRules] = useState(false);
  const [memberEmails, setMemberEmails] = useState({});
  const [friendships, setFriendships] = useState([]);
  const [messages, setMessages] = useState([]);
  const [homepageSections, setHomepageSections] = useState([]);
  const [reports, setReports] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [news, setNews] = useState([]);
  const [events, setEvents] = useState([]);
  const [communityEvents, setCommunityEvents] = useState([]);
  const [eventRsvps, setEventRsvps] = useState([]);
  const [communityAds, setCommunityAds] = useState([]);
  const [memberPhotos, setMemberPhotos] = useState([]);
  const [photoLikes, setPhotoLikes] = useState([]);
  const [photoComments, setPhotoComments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [profileVisits, setProfileVisits] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [forumReplies, setForumReplies] = useState([]);
  const [featureLocks, setFeatureLocks] = useState([]);
  const [profileActivities, setProfileActivities] = useState([]);
  const [publicProfileUpdates, setPublicProfileUpdates] = useState([]);
  const [weeklyPoll, setWeeklyPoll] = useState(null);
  const [welcomeBadges, setWelcomeBadges] = useState([]);
  const [featuredGroup, setFeaturedGroup] = useState(null);
  const [communityRequests, setCommunityRequests] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewingMember, setViewingMember] = useState(null);
  const [viewingFriends, setViewingFriends] = useState([]);
  const [chatMember, setChatMember] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState("home");
  const [notice, setNotice] = useState("");
  const [incomingMessage, setIncomingMessage] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [adminTarget, setAdminTarget] = useState("");
  const [permissionDraft, setPermissionDraft] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [accountReviewQueue, setAccountReviewQueue] = useState([]);
  const [groupOwnerChanges, setGroupOwnerChanges] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // A profile remains open while the Head Admin changes its rights.  Keep that
  // view in sync with the refreshed directory instead of leaving stale data
  // (such as responsibilities) on screen.
  useEffect(() => {
    if (!viewingMember?.id) return;
    const refreshed = members.find((member) => member.id === viewingMember.id);
    if (refreshed) setViewingMember(refreshed);
  }, [members, viewingMember?.id]);

  useEffect(() => {
    if (!user?.id || !members.length) return;
    const sharedProfileId = new URLSearchParams(window.location.search).get("profile");
    if (!sharedProfileId) return;
    const sharedMember = members.find((member) => member.id === sharedProfileId);
    if (!sharedMember) return;
    setViewingMember(sharedMember);
    setViewingFriends([]);
    setPage(sharedMember.id === user.id ? "profile" : "member-profile");
  }, [user?.id, members]);

  const showNotice = (text) => {
    setNotice(text);
    clearTimeout(window.__ecNotice);
    window.__ecNotice = setTimeout(() => setNotice(""), 4500);
  };
  // Saving content must never appear to do nothing.  The normal notice is
  // retained, while an error is also shown in a dialog that cannot be missed.
  const showSaveError = (area, error) => {
    const detail = String(error?.message || error || "Unbekannter Fehler").trim();
    const text = `${area} konnte nicht gespeichert werden: ${detail}`;
    showNotice(text);
    window.alert(text);
  };

  const memberById = (id) => members.find((m) => m.id === id) || null;
  const friendshipWith = (id) => friendships.find((x) => (x.requester_id === user?.id && x.receiver_id === id) || (x.receiver_id === user?.id && x.requester_id === id));
  const blockedIds = useMemo(() => new Set(blockedUsers.map((x) => x.blocked_id)), [blockedUsers]);
  const incomingRequests = useMemo(() => friendships.filter((x) => x.status === "PENDING" && x.receiver_id === user?.id), [friendships, user?.id]);
  const sentRequests = useMemo(() => friendships.filter((x) => x.status === "PENDING" && x.requester_id === user?.id), [friendships, user?.id]);
  const acceptedFriendIds = useMemo(() => friendships.filter((x) => x.status === "ACCEPTED").map((x) => x.requester_id === user?.id ? x.receiver_id : x.requester_id), [friendships, user?.id]);
  const isFeatureLocked = (feature) => featureLocks.some((lock) => lock.feature_key === feature && lock.is_locked);
  // Test accounts belong exclusively in the Admin-Zentrale. They must never
  // leak into the ordinary member, friend or group views – not even for admins.
  const visibleMembers = useMemo(() => members.filter((m) => m.account_status !== "SUSPENDED" && !m.is_test_account && !blockedIds.has(m.id)), [members, blockedIds]);
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
      // A suspended account must never reach the member area, even when a
      // previously issued browser session still exists.
      const { data: accessProfile } = await supabase.from("profiles")
        .select("account_status,suspension_reason")
        .eq("id", currentUser.id)
        .maybeSingle();
      if (accessProfile?.account_status === "SUSPENDED") {
        await supabase.auth.signOut();
        setUser(null); setProfile(null); setMembers([]); setFriendships([]);
        const reason = String(accessProfile.suspension_reason || "Kein Grund wurde hinterlegt.").trim();
        showNotice(`Dein Konto ist gesperrt. Grund: ${reason}`);
        return;
      }
      void supabase.from("profiles").update({ is_online: true, last_active_at: new Date().toISOString() }).eq("id", currentUser.id);
      await supabase.rpc("claim_initial_head_admin");
      const safe = async (query, fallback = []) => {
        const { data, error } = await query;
        if (error) { console.warn(error.message); return fallback; }
        return data ?? fallback;
      };
      const safeMemberDirectory = async () => {
        const { data, error } = await supabase.rpc("community_member_directory");
        if (error) {
          console.warn(error.message);
          return safe(supabase.from("profiles").select("*").eq("account_status", "ACTIVE"));
        }
        return (data || []).map((row) => typeof row === "string" ? JSON.parse(row) : row);
      };
      const [p, ms, fs, msgs, hs, rs, bs, ns, es, gs, visits, posts, replies, locks, activities, poll, badges, featured, requests] = await Promise.all([
        safe(supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(), null),
        safeMemberDirectory(),
        safe(supabase.from("friendships").select("*").or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)),
        safe(supabase.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: false })),
        safe(supabase.from("homepage_sections").select("*").eq("is_visible", true).order("sort_order", { ascending: true })),
        safe(supabase.from("user_reports").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("user_blocks").select("*").eq("blocker_id", currentUser.id)),
        safe(supabase.from("news").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("events").select("*").order("created_at", { ascending: false })),
        safe(supabase.rpc("community_group_directory")),
        safe(supabase.from("profile_visits").select("*").eq("profile_id", currentUser.id).order("visited_at", { ascending: false })),
        safe(supabase.from("forum_posts").select("*").order("created_at", { ascending: false })),
        safe(supabase.from("forum_replies").select("*").order("created_at", { ascending: true })),
        safe(supabase.from("user_feature_locks").select("*").eq("user_id", currentUser.id)),
        safe(supabase.from("profile_activity").select("*").eq("profile_id", currentUser.id).order("created_at", { ascending: false }).limit(20)),
        safe(supabase.rpc("weekly_poll_current"), null),
        safe(supabase.rpc("my_welcome_badges")),
        safe(supabase.rpc("featured_community_group"), null),
        safe(supabase.from("community_requests").select("*").eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(8))
      ]);
      const groupData = (gs || []).map((entry) => typeof entry === "string" ? JSON.parse(entry) : entry);
      const { data: ruleAcceptance, error: ruleAcceptanceError } = await supabase.from("community_rule_acceptances").select("rules_version,accepted_at").eq("user_id", currentUser.id).eq("rules_version", COMMUNITY_RULES_VERSION).maybeSingle();
      if (ruleAcceptanceError) console.warn(ruleAcceptanceError.message);
      setRulesAccepted(Boolean(ruleAcceptance));
      setProfile(p); setMembers(ms); setFriendships(fs); setMessages(msgs); setHomepageSections(hs); setReports(rs); setBlockedUsers(bs); setNews(ns); setEvents(es); setGroups(groupData); setProfileVisits(visits); setForumPosts(posts); setForumReplies(replies); setFeatureLocks(locks); setProfileActivities(activities); setWeeklyPoll(Array.isArray(poll) ? poll[0] || null : poll); setWelcomeBadges(Array.isArray(badges) && badges.length ? badges : instantWelcomeBadges(p, groupData, posts, currentUser.id)); setFeaturedGroup(Array.isArray(featured) ? featured[0] || null : featured); setCommunityRequests(requests || []);
      if (isAdmin(p?.role)) {
        const [emailResult, memberResult, logResult] = await Promise.all([
          supabase.rpc("admin_member_directory"),
          supabase.rpc("admin_full_member_directory"),
          isHeadAdmin(p?.role) ? supabase.rpc("get_admin_log", { p_limit: 500 }) : Promise.resolve({ data: [], error: null })
        ]);
        if (!emailResult.error) setMemberEmails(Object.fromEntries((emailResult.data || []).map((entry) => [entry.id, entry.email])));
        if (!memberResult.error) setAdminMembers((memberResult.data || []).map((summary) => ({ ...(ms.find((member) => member.id === summary.id) || {}), ...summary })));
        else { console.warn(memberResult.error.message); setAdminMembers(ms); }
        if (!logResult.error) setAdminLog(logResult.data || []);
        else { console.warn(logResult.error.message); setAdminLog([]); }
      } else { setMemberEmails({}); setAdminMembers([]); setAdminLog([]); }
    } catch (e) { console.error(e); showNotice(e?.message || "Fehler beim Laden"); }
  };

  async function openAccountReview() {
    if (!isAdmin(profile?.role)) return;
    try {
      // Manual account approval no longer exists. Loading it here made the
      // complete verification view fail when an older database still had the
      // removed approval function.
      const { data, error } = await supabase.rpc("admin_verification_review_queue");
      if (error) return showNotice(/function|schema cache|does not exist|relation/i.test(error.message || "") ? "Die Verifizierungsfunktion ist in der Datenbank noch nicht aktiv. Bitte führe registration_and_forum_repair.sql einmal im Supabase SQL Editor aus." : error.message);
      const entries = Array.isArray(data) ? data : data ? [data] : [];
      setAccountReviewQueue(entries.map((entry) => ({ user_id: entry.user_id, nickname: entry.nickname || "Mitglied", due_at: entry.due_at || null, reason: entry.reason || "Keine Begründung hinterlegt." })));
      setPage("admin-account-review");
    } catch (error) { showNotice(error?.message || "Die Verifizierungsanfragen konnten nicht geladen werden."); }
  }

  useEffect(() => {
    if (!supabase) return undefined;
    loadAll();
    if (location.hash.includes("type=recovery")) setPasswordRecovery(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true); loadAll(); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    const handleIncomingMessage = (payload) => {
      if (payload.eventType === "INSERT" && payload.new?.sender_id && payload.new.sender_id !== user.id) {
        const sender = members.find((member) => member.id === payload.new.sender_id);
        setIncomingMessage({ senderId: payload.new.sender_id, senderName: getName(sender) || "Ein Mitglied", content: String(payload.new.content || "") });
      }
      loadAll();
    };
    const messageChannel = supabase.channel(`ec-messages-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, handleIncomingMessage).subscribe();
    const friendChannel = supabase.channel(`ec-friends-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `receiver_id=eq.${user.id}` }, loadAll).subscribe();
    return () => { supabase.removeChannel(messageChannel); supabase.removeChannel(friendChannel); };
  }, [user?.id, members]);

  useEffect(() => {
    if (!supabase || page !== "community") return;
    supabase.from("public_profile_updates").select("*").order("created_at", { ascending: false }).limit(12)
      .then(({ data, error }) => { if (!error) setPublicProfileUpdates(data || []); });
  }, [page]);

  useEffect(() => {
    if (!supabase || page !== "groups" || !user?.id) return;
    supabase.rpc("community_group_owner_change_queue").then(({ data, error }) => { if (!error) setGroupOwnerChanges(data || []); else setGroupOwnerChanges([]); });
  }, [page, user?.id]);

  useEffect(() => {
    if (page !== "community" || !isAdmin(profile?.role)) return;
    const eventForm = document.querySelector(".admin-community-tools form");
    if (!eventForm || eventForm.querySelector("[name='image']")) return;
    const label = document.createElement("label");
    label.className = "content-image-upload";
    label.append(document.createTextNode("Bild für die Veranstaltung (optional)"));
    const input = document.createElement("input");
    input.name = "image"; input.type = "file"; input.accept = "image/*";
    label.appendChild(input);
    eventForm.insertBefore(label, eventForm.querySelector("button"));
  }, [page, profile?.role, communityEvents.length]);

  useEffect(() => {
    const authorMarkup = (container, authorId, className = "content-author") => {
      const author = members.find((member) => member.id === authorId);
      if (!author || container.querySelector(`.${className}`)) return;
      const line = document.createElement("small");
      const business = author.account_badge === "BUSINESS";
      line.className = `${className} role-author ${business ? "business" : roleClass(author.role)}`;
      line.textContent = `Erstellt von ${business ? "★" : roleMark(author.role)} ${getName(author)}${business ? " · Unternehmenskonto" : ""}`.trim();
      container.appendChild(line);
    };
    if (page === "news") {
      document.querySelectorAll(".news-card").forEach((card, index) => {
        const entry = news[index]; if (!entry) return;
        authorMarkup(card, entry.author_id);
        if (isAdmin(profile?.role) && !card.querySelector(".content-card-actions")) {
          const actions = document.createElement("div"); actions.className = "content-card-actions";
          const edit = document.createElement("button"); edit.className = "secondary-button"; edit.textContent = "✎ Bearbeiten"; edit.onclick = () => editNews(entry);
          const remove = document.createElement("button"); remove.className = "danger-button"; remove.textContent = "Löschen"; remove.onclick = () => deleteNews(entry);
          actions.append(edit, remove); card.appendChild(actions);
        }
      });
    }
    if (page === "community") {
      const eventCard = document.querySelector(".community-hub-grid article");
      eventCard?.querySelectorAll(".hub-row").forEach((row, index) => {
        const entry = communityEvents.slice(0, 5)[index]; if (!entry) return;
        authorMarkup(row, entry.created_by, "event-author");
        if (entry.status === "CANCELLED") { row.classList.add("cancelled-event"); if (!row.querySelector(".event-cancelled-label")) { const label = document.createElement("small"); label.className = "event-cancelled-label"; label.textContent = `ABGESAGT${entry.cancellation_reason ? ` · ${entry.cancellation_reason}` : ""}`; row.querySelector("div")?.appendChild(label); } }
        if (entry.status !== "CANCELLED" && !row.querySelector(".event-rsvp-actions")) { const rsvp = document.createElement("div"); rsvp.className = "event-rsvp-actions"; const current = eventRsvps.find((item) => item.event_id === entry.id && item.user_id === user?.id)?.status; ["INTERESTED", "GOING"].forEach((status) => { const button = document.createElement("button"); button.className = current === status ? "primary-button" : "secondary-button"; button.textContent = status === "GOING" ? "✓ Ich komme" : "☆ Interessiert"; button.onclick = () => respondToCommunityEvent(entry, status); rsvp.appendChild(button); }); row.appendChild(rsvp); }
        if (isAdmin(profile?.role) && !row.querySelector(".event-actions")) {
          const actions = document.createElement("div"); actions.className = "event-actions";
          const edit = document.createElement("button"); edit.className = "secondary-button event-delete-button"; edit.textContent = entry.status === "CANCELLED" ? "Wieder aktivieren" : "✎ Bearbeiten"; edit.onclick = () => editCommunityEvent(entry); actions.appendChild(edit);
          if (entry.status !== "CANCELLED") { const cancel = document.createElement("button"); cancel.className = "danger-button event-delete-button"; cancel.textContent = "Absagen"; cancel.onclick = () => cancelCommunityEvent(entry); actions.appendChild(cancel); }
          const remove = document.createElement("button"); remove.className = "danger-button event-delete-button"; remove.textContent = "Löschen"; remove.onclick = () => deleteCommunityEvent(entry); actions.appendChild(remove); row.appendChild(actions);
        }
      });
    }
    if (page === "forum" || page === "admin-forum") {
      const scope = page === "admin-forum" ? "ADMIN" : "COMMUNITY";
      document.querySelectorAll(".forum-post").forEach((card, index) => {
        const entry = forumPosts.filter((post) => post.scope === scope)[index]; const author = members.find((member) => member.id === entry?.author_id); const name = card.querySelector(".forum-post-head p strong");
        if (author && name) { const business = author.account_badge === "BUSINESS"; const moderator = author.forum_moderator; name.className = `role-author ${business ? "business" : roleClass(author.role)}`; name.textContent = `${business ? "★" : roleMark(author.role)} ${getName(author)}${business ? " · Unternehmenskonto" : moderator ? " · Forum-Moderator" : ""}`.trim(); }
      });
    }
  }, [page, news, communityEvents, eventRsvps, forumPosts, members, profile?.role]);

  useEffect(() => {
    if (page !== "admin" || !isAdmin(profile?.role)) return;
    const root = document.querySelector(".admin-page");
    if (!root || root.querySelector(".admin-dashboard-shortcuts")) return;
    const shortcuts = document.createElement("section");
    shortcuts.className = "admin-dashboard-shortcuts panel";
    const heading = document.createElement("div");
    heading.className = "admin-dashboard-heading";
    heading.innerHTML = "<span class=\"eyebrow\">ADMIN-ZENTRALE</span><h2>Alles Wichtige auf einen Blick</h2><p>Öffne die passende Verwaltungsansicht, ohne die Navigation links zu überladen.</p>";
    shortcuts.appendChild(heading);
    const actions = document.createElement("div");
    actions.className = "admin-dashboard-actions";
    [["♙", "Mitglieder", "Mitglieder und Rollen verwalten", "admin"], ["⚑", "Meldungen", "Meldungen prüfen", "reports"], ["▤", "Admin-Forum", "Interne Moderation", "admin-forum"], ["✦", "Community", "Termine und Werbung", "community"], ["▣", "Neuigkeiten", "Beiträge verwalten", "news"], ["✓", "Kontoschutz", "Angeforderte Verifizierungen prüfen", "account-review"]].forEach(([icon, title, text, target]) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "admin-dashboard-action";
      button.innerHTML = `<strong>${icon} ${title}</strong><small>${text}</small>`;
      button.onclick = () => target === "account-review" ? openAccountReview() : setPage(target); actions.appendChild(button);
    });
    shortcuts.appendChild(actions);
    root.insertBefore(shortcuts, root.querySelector(".admin-member-cards") || root.firstChild);
  }, [page, profile?.role, members.length, reports.length]);

  useEffect(() => {
    if (page !== "profile" || !profile?.id) return;
    const form = document.querySelector(".profile-form");
    if (!form) return;
    if (!form.querySelector(".public-profile-preview-button")) {
      const previewButton = document.createElement("button"); previewButton.type = "button"; previewButton.className = "secondary-button public-profile-preview-button"; previewButton.textContent = "◉ So sehen andere mein Profil"; previewButton.onclick = () => setPage("profile-preview");
      form.querySelector(".primary-button")?.before(previewButton);
    }
    if (form.querySelector(".privacy-settings")) return;
    const settings = profile.privacy_settings || {};
    const section = document.createElement("section"); section.className = "privacy-settings";
    section.innerHTML = '<span class="eyebrow">SICHTBARKEIT</span><h3>Was andere von dir sehen</h3><p>Standardmäßig ist alles öffentlich. Du kannst jeden Bereich auf „Nur Freunde“ beschränken.</p>';
    [["name", "Name"], ["birth_date", "Geburtsdatum"], ["bio", "Über mich"], ["location", "Wohnort"], ["interests", "Interessen"], ["website", "Website"], ["photos", "Fotos"], ["activity", "Öffentliche Änderungsanzeige"]].forEach(([key, label]) => {
      const field = document.createElement("label"); field.textContent = label;
      const select = document.createElement("select"); select.name = `privacy_${key}`;
      select.innerHTML = '<option value="PUBLIC">Öffentlich</option><option value="FRIENDS">Nur Freunde</option>';
      select.value = settings[key] === "FRIENDS" ? "FRIENDS" : "PUBLIC"; field.appendChild(select); section.appendChild(field);
    });
    form.querySelector(".primary-button")?.before(section);
    const verification = document.createElement("div"); verification.className = "verification-request";
    if (profile.is_verified) {
      verification.textContent = "✓ Dieses Profil ist verifiziert.";
    } else {
      const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button";
      button.textContent = isHeadAdmin(profile.role) ? "✓ Eigenes Head-Admin-Profil verifizieren" : "✓ Verifizierung anfragen";
      button.onclick = async () => {
        if (isHeadAdmin(profile.role)) {
          const { error } = await supabase.rpc("admin_set_profile_verification", { p_user_id: user.id, p_verified: true });
          if (error) return showNotice(error.message); showNotice("Dein Head-Admin-Profil wurde verifiziert."); await loadAll(); return;
        }
        const note = prompt("Warum möchtest du dein Profil verifizieren lassen? (optional)", "");
        if (note === null) return;
        const { error } = await supabase.rpc("request_profile_verification", { p_note: note.trim() });
        if (error) return showNotice(error.message); showNotice("Verifizierungsanfrage wurde an den Head Admin gesendet.");
      };
      verification.appendChild(button);
    }
    section.appendChild(verification);
    if (isHeadAdmin(profile?.role)) {
      const responsibilities = document.createElement("label"); responsibilities.className = "head-admin-responsibilities-field";
      responsibilities.textContent = "Meine öffentliche Zuständigkeit als Head Admin";
      const textarea = document.createElement("textarea"); textarea.name = "head_admin_responsibilities"; textarea.rows = 3;
      textarea.placeholder = "z. B. Gesamtverantwortung, Sicherheit, Regeln und Eskalationen";
      textarea.value = profile.head_admin_responsibilities || ""; responsibilities.appendChild(textarea);
      form.querySelector(".primary-button")?.before(responsibilities);
    }
    form.querySelector(".profile-media-delete-actions")?.remove();
    const mediaDeleteActions = document.createElement("section"); mediaDeleteActions.className = "profile-media-delete-actions";
    [["avatar_url", "Profilbild"], ["profile_background", "Hintergrundfoto"], ["bio_image_url", "Über-mich-Bild"]].forEach(([field, label]) => {
      const value = profile?.[field]; const isStoredImage = typeof value === "string" && value.startsWith("http");
      if (!isStoredImage) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "danger-button"; button.textContent = `${label} löschen`;
      button.onclick = () => deleteProfileDesignImage(field, label, value); mediaDeleteActions.appendChild(button);
    });
    if (mediaDeleteActions.childElementCount) form.querySelector(".primary-button")?.before(mediaDeleteActions);
    const layout = document.createElement("section"); layout.className = "layout-rewards";
    const freeLayouts = isAdmin(profile?.role) || profile?.role === "SUPPORTER" || profile?.account_badge === "BUSINESS";
    const hours = Math.floor(Number(profile.total_online_seconds || 0) / 3600);
    layout.innerHTML = `<span class="eyebrow">LAYOUT & BELOHNUNGEN</span><h3>Dein Community-Design</h3><p>${freeLayouts ? "Deine Rolle erlaubt die freie Layoutwahl." : `Onlinezeit: ${hours} Stunden · Weitere Designs werden durch aktive Community-Zeit freigeschaltet.`}</p>`;
    const layoutSelect = document.createElement("select"); layoutSelect.name = "profile_layout";
    [["standard", "Standard – Ennstal", 0], ["alpine", "Alpen – Berggrün", 5], ["aurora", "Aurora – Violett", 20], ["ocean", "Ozean – Tiefblau", 35], ["slate", "Schiefer – Anthrazit", 50], ["ember", "Ember – Warmes Orange", 70], ["redwood", "Bergrot – Alpinrot", 90], ["lavender", "Lavendel – Sanftes Violett", 110], ["midnight", "Mitternacht – Nachtblau", 130], ["sunrise", "Sonnenaufgang – Goldrosa", 150], ["neon", "Neon Connect – Leuchtfarben", 180]].forEach(([value, label, requiredHours]) => { const option = document.createElement("option"); option.value = value; option.textContent = `${label}${freeLayouts || hours >= requiredHours ? "" : ` · ab ${requiredHours} Stunden`}`; option.disabled = !freeLayouts && hours < requiredHours; layoutSelect.appendChild(option); });
    layoutSelect.value = profile.profile_layout || "standard"; layout.appendChild(layoutSelect); form.querySelector(".primary-button")?.before(layout);
    document.querySelectorAll(".profile-gallery figure").forEach((figure, index) => {
      const photo = memberPhotos.filter((item) => item.owner_id === user?.id)[index]; if (!photo || figure.querySelector(".photo-visibility")) return;
      const select = document.createElement("select"); select.className = "photo-visibility"; select.value = photo.visibility === "FRIENDS" ? "FRIENDS" : "PUBLIC";
      select.innerHTML = '<option value="PUBLIC">Foto: Öffentlich</option><option value="FRIENDS">Foto: Nur Freunde</option>';
      select.onchange = async () => { const { error } = await supabase.from("member_photos").update({ visibility: select.value }).eq("id", photo.id).eq("owner_id", user.id); if (error) showNotice(error.message); else { showNotice("Foto-Sichtbarkeit gespeichert."); await loadAll(); } };
      figure.querySelector(".photo-actions")?.appendChild(select);
    });
  }, [page, profile?.id, profile?.privacy_settings, profile?.avatar_url, profile?.profile_background, profile?.bio_image_url, memberPhotos, user?.id]);

  useEffect(() => {
    if (page !== "forum" && page !== "admin-forum") return;
    const scope = page === "admin-forum" ? "ADMIN" : "COMMUNITY";
    const posts = forumPosts.filter((post) => post.scope === scope);
    const canReply = scope === "ADMIN" ? isAdmin(profile?.role) : !isFeatureLocked("FORUM_POSTING");
    document.querySelectorAll(".forum-post").forEach((card, index) => {
      const post = posts[index]; if (!post) return;
      let box = card.querySelector(".forum-replies");
      if (!box) { box = document.createElement("section"); box.className = "forum-replies"; card.appendChild(box); }
      box.replaceChildren();
      const heading = document.createElement("h3"); heading.textContent = `Antworten (${forumReplies.filter((reply) => reply.post_id === post.id).length})`; box.appendChild(heading);
      forumReplies.filter((reply) => reply.post_id === post.id).forEach((reply) => {
        const item = document.createElement("article"); item.className = "forum-reply";
        const author = members.find((member) => member.id === reply.author_id); const business = author?.account_badge === "BUSINESS";
        const moderator = author?.forum_moderator; const meta = document.createElement("small"); meta.className = `role-author ${business ? "business" : roleClass(author?.role)}`; meta.textContent = `${business ? "★" : roleMark(author?.role)} ${getName(author)}${business ? " · Unternehmenskonto" : moderator ? " · Forum-Moderator" : ""} · ${new Date(reply.created_at).toLocaleString("de-AT")}${reply.edited_at ? ` · bearbeitet${reply.edit_reason ? `: ${reply.edit_reason}` : ""}` : ""}`.trim(); item.appendChild(meta);
        const content = document.createElement("p"); content.textContent = reply.content; item.appendChild(content);
        if (reply.author_id === user?.id || isHeadAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator)) { const actions = document.createElement("div"); actions.className = "forum-reply-actions"; const edit = document.createElement("button"); edit.className = "secondary-button"; edit.textContent = "✎ Bearbeiten"; edit.onclick = () => editForumReply(reply); const remove = document.createElement("button"); remove.className = "danger-button"; remove.textContent = "Löschen"; remove.onclick = () => deleteForumReply(reply); actions.append(edit, remove); item.appendChild(actions); }
        box.appendChild(item);
      });
      if (canReply) { const form = document.createElement("form"); form.className = "forum-reply-form"; const input = document.createElement("textarea"); input.placeholder = "Auf diesen Beitrag antworten …"; input.minLength = 2; input.required = true; const send = document.createElement("button"); send.className = "primary-button"; send.textContent = "Antwort senden"; form.append(input, send); form.onsubmit = (event) => { event.preventDefault(); void createForumReply(post, input.value); }; box.appendChild(form); }
    });
  }, [page, forumPosts, forumReplies, members, profile?.role, featureLocks]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    const loadCommunityExtras = async () => {
      const [eventResult, adResult, photoResult, likeResult, commentResult, rsvpResult] = await Promise.all([
        supabase.from("community_events").select("*").order("event_at", { ascending: true }),
        supabase.from("community_ads").select("*").eq("is_active", true).order("created_at", { ascending: false }),
        supabase.from("member_photos").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("member_photo_likes").select("*"),
        supabase.from("member_photo_comments").select("*").order("created_at", { ascending: true }),
        supabase.from("community_event_rsvps").select("*")
      ]);
      if (!eventResult.error) setCommunityEvents(eventResult.data || []);
      if (!adResult.error) setCommunityAds(adResult.data || []);
      if (!photoResult.error) setMemberPhotos(photoResult.data || []);
      if (!likeResult.error) setPhotoLikes(likeResult.data || []);
      if (!commentResult.error) setPhotoComments(commentResult.data || []);
      if (!rsvpResult.error) setEventRsvps(rsvpResult.data || []);
    };
    void loadCommunityExtras();
    return undefined;
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let lastSent = 0;
    let inactiveTimer;
    const presenceDevice = window.matchMedia("(max-width: 900px)").matches ? "MOBILE" : "DESKTOP";
    const writePresence = async (online) => {
      let { error } = await supabase.rpc("record_presence", { p_online: online, p_device: presenceDevice });
      if (error && /schema cache|function|does not exist|could not find/i.test(error.message || "")) ({ error } = await supabase.rpc("record_presence", { p_online: online }));
      if (error) ({ error } = await supabase.from("profiles").update(online ? { is_online: true, last_active_at: new Date().toISOString() } : { is_online: false }).eq("id", user.id));
      if (error) console.warn("Presence could not be saved:", error.message);
    };
    const clearPresence = () => { void writePresence(false); setProfile((current) => current?.id === user.id ? { ...current, is_online: false } : current); setMembers((current) => current.map((member) => member.id === user.id ? { ...member, is_online: false } : member)); };
    const setPresence = () => {
      window.clearTimeout(inactiveTimer);
      inactiveTimer = window.setTimeout(clearPresence, 5 * 60 * 1000);
      if (Date.now() - lastSent < 45000) return;
      lastSent = Date.now();
      const lastActive = new Date().toISOString();
      void writePresence(true);
      void supabase.rpc("record_online_activity");
      setProfile((current) => current?.id === user.id ? { ...current, is_online: true, last_active_at: lastActive, presence_device: presenceDevice } : current);
      setMembers((current) => current.map((member) => member.id === user.id ? { ...member, is_online: true, last_active_at: lastActive, presence_device: presenceDevice } : member));
    };
    setPresence();
    const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, setPresence, { passive: true }));
    window.addEventListener("pagehide", clearPresence);
    return () => { window.clearTimeout(inactiveTimer); activityEvents.forEach((eventName) => window.removeEventListener(eventName, setPresence)); window.removeEventListener("pagehide", clearPresence); };
  }, [user?.id]);

  async function login(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage); const f = new FormData(e.currentTarget);
    try {
      const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") }), supabaseUnavailableMessage);
      if (error) return showNotice(error.message);
      const signedInUser = data?.user || data?.session?.user || null;
      const { data: accessProfile } = await supabase.from("profiles")
        .select("account_status,suspension_reason")
        .eq("id", signedInUser?.id || "")
        .maybeSingle();
      if (accessProfile?.account_status === "SUSPENDED") {
        await supabase.auth.signOut();
        return showNotice(`Dein Konto ist gesperrt. Grund: ${String(accessProfile.suspension_reason || "Kein Grund wurde hinterlegt.").trim()}`);
      }
      // Render the signed-in shell immediately. Profile and community data are
      // refreshed separately so a slow database request cannot block login.
      setUser(signedInUser);
      void loadAll();
    } catch (error) { showNotice(error?.message || supabaseUnavailableMessage); }
  }
  async function register(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage); const f = new FormData(e.currentTarget);
    try {
      const nickname = String(f.get("nickname") || "").trim();
      if (nickname.length < 3) return showNotice("Der Nickname muss mindestens drei Zeichen haben.");
      const { data: nicknameAvailable, error: nicknameCheckError } = await supabase.rpc("nickname_available", { p_nickname: nickname });
      if (!nicknameCheckError && nicknameAvailable === false) return showNotice("Dieser Nickname ist bereits vergeben. Bitte wähle einen anderen.");
      // Older installations may not yet have the helper function.  The
      // directory check prevents Supabase Auth from returning its vague
      // "Database error saving new user" for an already used nickname.
      if (nicknameCheckError) {
        const { data: sameNickname } = await supabase.from("profiles").select("id").ilike("nickname", nickname).limit(1);
        if (sameNickname?.length) return showNotice("Dieser Nickname ist bereits vergeben. Bitte wähle einen anderen.");
      }
      const { data, error } = await withTimeout(supabase.auth.signUp({ email: f.get("email"), password: f.get("password"), options: { emailRedirectTo: `${location.origin}/`, data: { nickname, first_name: String(f.get("first_name") || "").trim(), last_name: String(f.get("last_name") || "").trim(), birth_date: String(f.get("birth_date") || "").trim(), gender: String(f.get("gender") || "").trim() } } }), supabaseUnavailableMessage);
      if (error) return showNotice(/database error saving new user/i.test(error.message || "") ? "Die Registrierung konnte nicht angelegt werden. Der Nickname ist nicht als vergeben erkannt worden – die Datenbank-Registrierung muss einmal repariert werden. Bitte führe die Datei registration_and_forum_repair.sql in Supabase aus und versuche es danach erneut." : error.message);
      // When confirmations are disabled, create the matching profile immediately.
      if (data.session?.user) { setUser(data.session.user); void supabase.rpc("ensure_current_profile").finally(loadAll); }
      showNotice("Registrierung erfolgreich. Bestätige gegebenenfalls noch deine E-Mail und melde dich anschließend an.");
    } catch (error) { showNotice(error?.message || supabaseUnavailableMessage); }
  }
  async function requestPasswordReset() {
    if (!supabase) return showNotice(supabaseUnavailableMessage);
    const email = prompt("Bitte gib deine registrierte E-Mail-Adresse ein:", "");
    if (email === null || !email.trim()) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/` });
    if (error) return showNotice(error.message);
    showNotice("Wenn ein Konto mit dieser Adresse existiert, wurde ein Link zum Zurücksetzen versendet.");
  }
  async function finishPasswordReset(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage);
    const f = new FormData(e.currentTarget); const password = String(f.get("password") || ""); const confirmPassword = String(f.get("confirm_password") || "");
    if (password.length < 6) return showNotice("Das neue Passwort muss mindestens 6 Zeichen haben.");
    if (password !== confirmPassword) return showNotice("Die beiden Passwörter stimmen nicht überein.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return showNotice(error.message);
    history.replaceState(null, "", location.pathname); setPasswordRecovery(false); showNotice("Dein Passwort wurde geändert. Du kannst dich jetzt anmelden."); await supabase.auth.signOut(); setUser(null);
  }
  async function acceptCommunityRules() {
    if (!supabase || !user?.id || acceptingRules) return;
    setAcceptingRules(true);
    const { error } = await supabase.rpc("accept_community_rules", { p_rules_version: COMMUNITY_RULES_VERSION });
    setAcceptingRules(false);
    if (error) return showSaveError("Die Bestätigung der Community-Regeln", error);
    setRulesAccepted(true);
    showNotice("Community-Regeln bestätigt.");
    await loadAll();
  }
  async function logout() { if (user) await supabase.from("profiles").update({ is_online: false, last_active_at: new Date().toISOString() }).eq("id", user.id); await supabase.auth.signOut(); setUser(null); setProfile(null); }

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
  async function warnMember(m) { if ((!isAdmin(profile?.role) && !profile?.forum_moderator) || !m?.id || m.id === user?.id || m.role === "HEAD_ADMIN") return showNotice("Keine Berechtigung."); const warning = prompt(`Verwarnung für ${getName(m)}:`, "Bitte beachte die Community-Regeln."); if (warning === null || warning.trim().length < 3) return showNotice("Bitte einen Verwarnungstext angeben."); const { error } = await supabase.rpc(profile?.forum_moderator && !isAdmin(profile?.role) ? "forum_moderator_warn_user" : "admin_warn_user", profile?.forum_moderator && !isAdmin(profile?.role) ? { p_target_user: m.id, p_warning: warning.trim() } : { target_user: m.id, warning_text: warning.trim() }); if (error) return showNotice(error.message); showNotice("Die Verwarnung wurde als Nachricht gesendet."); }
  async function resolveReport(id, status) { const promptText = status === "CONFIRMED" ? "Was wurde aufgrund der Meldung unternommen?" : "Warum wurde die Meldung abgelehnt?"; const note = prompt(promptText, status === "CONFIRMED" ? "Die Meldung wurde geprüft und geeignete Maßnahmen wurden gesetzt." : "Nach Prüfung konnte kein Regelverstoß festgestellt werden."); if (note === null || note.trim().length < 3) return showNotice("Bitte einen nachvollziehbaren Grund angeben."); const { error } = await supabase.rpc("admin_resolve_report", { p_report_id: id, p_status: status, p_action_note: note.trim() }); if (error) return showNotice(error.message); showNotice("Meldung bearbeitet – der Melder wurde automatisch informiert."); await loadAll(); }

  async function updateMemberRole(m, newRole) {
    if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf Rollen ändern.");
    if (!m?.id || m.id === user.id || m.role === "HEAD_ADMIN") return showNotice("Der Global Admin kann nicht verändert werden.");
    const { error } = await supabase.rpc("admin_set_role", { target_user: m.id, new_role: newRole });
    if (error) return showNotice(error.message);
    const { data: changed, error: verifyError } = await supabase.from("profiles").select("id,role").eq("id", m.id).maybeSingle();
    if (verifyError || !changed || changed.role !== newRole) return showNotice("Die Rolle wurde nicht bestätigt. Bitte führe den Datenbank-Fix aus und versuche es erneut.");
    showNotice(`${getName(m)} ist jetzt ${roleLabel(newRole)}.`); await loadAll();
  }

  async function toggleSuspension(m) {
    if (!isAdmin(profile?.role) || m.role === "HEAD_ADMIN") return showNotice("Keine Berechtigung.");
    const next = m.account_status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    const reason = next === "SUSPENDED" ? prompt(`Warum wird ${getName(m)} gesperrt?`, "Verstoß gegen die Community-Regeln") : null;
    if (next === "SUSPENDED" && (reason === null || reason.trim().length < 3)) return showNotice("Bitte gib einen Sperrgrund mit mindestens 3 Zeichen an.");
    if (!confirm(`${getName(m)} ${next === "ACTIVE" ? "freischalten" : "sperren"}?`)) return;
    const { error } = await supabase.rpc("admin_set_account_status", { target_user: m.id, new_status: next, p_reason: reason?.trim() || null });
    if (error) return showNotice(error.message); showNotice(next === "SUSPENDED" ? "Konto wurde gesperrt." : "Konto wurde freigeschaltet."); await loadAll();
  }
  async function toggleTestAccount(m) {
    if (!isHeadAdmin(profile?.role) || m.role === "HEAD_ADMIN") return showNotice("Nur der Head Admin darf Testkonten verwalten.");
    const next = !m.is_test_account;
    if (!confirm(`${getName(m)} ${next ? "als Testkonto markieren und für Mitglieder ausblenden" : "wieder für alle Mitglieder sichtbar machen"}?`)) return;
    const { error } = await supabase.rpc("admin_set_test_account", { p_user_id: m.id, p_is_test: next });
    if (error) return showNotice(error.message);
    showNotice(next ? "Testkonto ist für Mitglieder und Supporter ausgeblendet." : "Konto ist wieder sichtbar."); await loadAll();
  }
  async function createGroup(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim(); const description = String(form.get("description") || "").trim();
    if (name.length < 3 || description.length < 10) return showNotice("Bitte Gruppenname und eine Beschreibung mit mindestens 10 Zeichen angeben.");
    let imageUrl = "";
    try { imageUrl = (await uploadContentImage(form.get("image"), "groups")) || ""; } catch (error) { return showSaveError("Das Gruppenbild", error); }
    const { error } = await supabase.rpc("create_community_group", { p_name: name, p_description: description, p_image_url: imageUrl || null });
    if (error) return showSaveError("Die Gruppe", error); event.currentTarget.reset(); showNotice("Gruppe wurde erstellt."); await loadAll();
  }
  async function joinGroup(group) { const { error } = await supabase.rpc("join_community_group", { p_group_id: group.id }); if (error) return showSaveError("Der Gruppenbeitritt", error); setGroups((current) => current.map((item) => item.id !== group.id || (item.member_ids || []).includes(user?.id) ? item : { ...item, member_ids: [...(item.member_ids || []), user.id], member_count: Number(item.member_count || 0) + 1 })); showNotice("Du bist der Gruppe beigetreten."); await loadAll(); }
  async function leaveGroup(group) { if (!confirm(`Gruppe „${group.name}" verlassen?`)) return; const { error } = await supabase.rpc("leave_community_group", { p_group_id: group.id }); if (error) return showSaveError("Der Gruppenaustritt", error); showNotice("Du hast die Gruppe verlassen."); await loadAll(); }
  async function editGroup(group) {
    const values = await openContentEditor({ title: "Gruppe bearbeiten", description: "Der Ersteller sowie berechtigte Moderation dürfen diese Angaben ändern.", fields: [{ name: "name", label: "Gruppenname", value: group.name, required: true }, { name: "description", label: "Beschreibung", type: "textarea", value: group.description, required: true, rows: 8 }, { name: "image", label: "Neues Gruppenbild (optional)", type: "file" }] });
    if (!values || values.name.trim().length < 3 || values.description.trim().length < 10) return;
    let imageUrl = group.image_url || null; try { const uploaded = await uploadContentImage(values.image, "groups"); if (uploaded) imageUrl = uploaded; } catch (error) { return showSaveError("Das Gruppenbild", error); }
    const { error } = await supabase.rpc("update_community_group", { p_group_id: group.id, p_name: values.name.trim(), p_description: values.description.trim(), p_image_url: imageUrl });
    if (error) return showSaveError("Die Gruppe", error); showNotice("Gruppe gespeichert."); await loadAll();
  }
  async function requestGroupOwnerChange(group) {
    const nextOwner = prompt("Nickname des neuen Gruppeninhabers:", ""); if (nextOwner === null || !nextOwner.trim()) return;
    const candidate = members.find((member) => getName(member).toLowerCase() === nextOwner.trim().toLowerCase());
    if (!candidate) return showNotice("Dieses sichtbare Mitglied wurde nicht gefunden.");
    const { error } = await supabase.rpc("request_community_group_owner_change", { p_group_id: group.id, p_new_owner_id: candidate.id });
    if (error) return showSaveError("Der Inhaberwechsel", error); showNotice("Der Inhaberwechsel wurde zur Freigabe an die Administration gesendet.");
  }
  async function reviewGroupOwnerChange(request, approve) {
    const { error } = await supabase.rpc("review_community_group_owner_change", { p_request_id: request.id, p_approve: approve });
    if (error) return showSaveError("Der Inhaberwechsel", error); showNotice(approve ? "Inhaberwechsel freigegeben." : "Inhaberwechsel abgelehnt."); setGroupOwnerChanges((current) => current.filter((item) => item.id !== request.id)); await loadAll();
  }
  async function deleteGroup(group) {
    if (!group?.id || !confirm(`Gruppe „${group.name}" endgültig löschen? Alle Mitgliedschaften werden dabei entfernt.`)) return;
    const { error } = await supabase.rpc("delete_community_group", { p_group_id: group.id });
    if (error) return showSaveError("Die Gruppe", error);
    setSelectedGroup(null); showNotice("Gruppe wurde gelöscht."); await loadAll();
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
    const draft = {}; PERMISSIONS.forEach(([key]) => draft[key] = !!data?.[key]); setPermissionDraft(draft); setPage("admin");
  }
  async function savePermissions() {
    if (!adminTarget || !isHeadAdmin(profile?.role)) return;
    setSavingPermissions(true);
    const p = permissionDraft;
    let { error } = await supabase.rpc("admin_set_permissions", { target_user: adminTarget, p_manage_members: !!p.manage_members, p_manage_points: !!p.manage_points, p_manage_messages: !!p.manage_messages, p_manage_media: !!p.manage_media, p_manage_roles: !!p.manage_roles, p_manage_admins: !!p.manage_admins, p_view_profile_visits: !!p.view_profile_visits, p_manage_news: !!p.manage_news, p_manage_groups: !!p.manage_groups, p_manage_events: !!p.manage_events, p_manage_marketplace: !!p.manage_marketplace, p_manage_friend_requests: !!p.manage_friend_requests, p_manage_homepage: !!p.manage_homepage, p_manage_reports: !!p.manage_reports });
    const responsibilities = PERMISSIONS.filter(([key]) => p[key]).map(([, label]) => label);
    if (!error) ({ error } = await supabase.rpc("admin_set_responsibilities", { p_target_user: adminTarget, p_responsibilities: responsibilities }));
    setSavingPermissions(false);
    if (error) return showSaveError("Berechtigungen und Zuständigkeiten", error);
    setViewingMember((current) => current?.id === adminTarget ? { ...current, admin_responsibilities: responsibilities } : current);
    showNotice("Berechtigungen und Zuständigkeiten gespeichert."); await loadAll();
  }

  async function saveProfile(e) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const payload = { nickname: String(f.get("nickname") || "").trim(), gender: f.get("gender") || null, bio: String(f.get("bio") || "").trim(), location: String(f.get("location") || "").trim(), interests: String(f.get("interests") || "").split(",").map((interest) => interest.trim()).filter(Boolean), website: String(f.get("website") || "").trim(), instagram_username: String(f.get("instagram_username") || "").trim().replace(/^@/, ""), snapchat_username: String(f.get("snapchat_username") || "").trim().replace(/^@/, ""), profile_accent: f.get("profile_accent") || "#ff6b25", profile_background: f.get("profile_background_image") || f.get("profile_background_color") || "#f6f9fc", profile_layout: f.get("profile_layout") || "standard", bio_font: f.get("bio_font") || "modern", bio_size: f.get("bio_size") || "normal", bio_color: f.get("bio_color") || "#f1f5f9", privacy_settings: { name: f.get("privacy_name") || "PUBLIC", birth_date: f.get("privacy_birth_date") || "PUBLIC", bio: f.get("privacy_bio") || "PUBLIC", location: f.get("privacy_location") || "PUBLIC", interests: f.get("privacy_interests") || "PUBLIC", website: f.get("privacy_website") || "PUBLIC", photos: f.get("privacy_photos") || "PUBLIC", activity: f.get("privacy_activity") || "PUBLIC" } };
    if (payload.privacy_settings.name === "FRIENDS" && !profile?.avatar_url) return showNotice("Bitte lade zuerst ein eigenes Profilbild hoch, damit Freunde dich trotz privatem Namen erkennen können.");
    if (isHeadAdmin(profile?.role)) payload.head_admin_responsibilities = String(f.get("head_admin_responsibilities") || "").trim();
    const layoutHours = { standard: 0, alpine: 5, aurora: 20, ocean: 35, slate: 50, ember: 70, redwood: 90, lavender: 110, midnight: 130, sunrise: 150, neon: 180 };
    const layoutUnlocked = isAdmin(profile?.role) || profile?.role === "SUPPORTER" || profile?.account_badge === "BUSINESS" || Number(profile?.total_online_seconds || 0) >= (layoutHours[payload.profile_layout] || 0) * 3600;
    if (!layoutUnlocked) return showNotice("Dieses Layout wird mit Onlinezeit freigeschaltet.");
    if (isAdmin(profile?.role)) payload.hide_online_status = f.get("hide_online_status") === "on";
    let { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    // Older live databases may not yet include the optional presentation fields.
    // Save the rest of the profile instead of blocking the whole form.
    if (error && /bio_(font|size|color)|bio_image_url.*column|column.*bio_/i.test(error.message || "")) { delete payload.bio_font; delete payload.bio_size; delete payload.bio_color; ({ error } = await supabase.from("profiles").update(payload).eq("id", user.id)); }
    if (error) return showNotice(error.message); await logProfileActivity("Profil aktualisiert"); showNotice("Profil wurde gespeichert."); await loadAll();
  }
  async function logProfileActivity(label) { if (!user?.id) return; let { error } = await supabase.rpc("log_profile_change", { p_activity: label }); if (error) ({ error } = await supabase.from("profile_activity").insert({ profile_id: user.id, actor_id: user.id, activity_type: label })); if (error) { console.warn(error.message); showNotice("Profil gespeichert, aber die Aktualisierung konnte nicht protokolliert werden: " + error.message); return; } setProfileActivities((current) => [{ id: `local-${Date.now()}`, profile_id: user.id, actor_id: user.id, activity_type: label, created_at: new Date().toISOString() }, ...current].slice(0, 20)); }
  async function deleteProfileDesignImage(field, label, currentUrl) {
    if (!user?.id || !["avatar_url", "profile_background", "bio_image_url"].includes(field)) return;
    if (!confirm(`${label} wirklich löschen?`)) return;
    const replacement = field === "profile_background" ? "#1b1f26" : null;
    const { error } = await supabase.from("profiles").update({ [field]: replacement }).eq("id", user.id);
    if (error) return showNotice(error.message);
    const marker = "/storage/v1/object/public/profile-avatars/";
    const markerIndex = String(currentUrl || "").indexOf(marker);
    if (markerIndex >= 0) {
      const storedPath = decodeURIComponent(String(currentUrl).slice(markerIndex + marker.length).split("?")[0]);
      if (storedPath.startsWith(`${user.id}/`)) {
        const { error: removeError } = await supabase.storage.from("profile-avatars").remove([storedPath]);
        if (removeError) console.warn(removeError.message);
      }
    }
    setProfile((current) => current ? { ...current, [field]: replacement } : current);
    await logProfileActivity(`${label} gelöscht`); showNotice(`${label} wurde gelöscht.`); await loadAll();
  }
  async function removeMemberProfileImage(member, field, label) {
    if (!isHeadAdmin(profile?.role) || !member?.id || !confirm(`${label} von ${getName(member)} wegen eines Regelverstoßes entfernen?`)) return;
    const prepared = await preparePrivilegedAction(`${label} bei Regelverstoß entfernen`, member.id);
    if (prepared.error) return showNotice(prepared.error.message);
    const { error } = await supabase.rpc("admin_remove_profile_media", { p_user_id: member.id, p_field: field });
    if (error) return showNotice(error.message);
    setViewingMember((current) => current?.id === member.id ? { ...current, [field]: field === "profile_background" ? "#1b1f26" : null } : current);
    showNotice(`${label} wurde entfernt und im Admin-Logbuch protokolliert.`); await loadAll();
  }
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
  async function uploadMemberPhoto(file, caption = "", visibility = "PUBLIC") {
    if (!file || !user) return; if (!file.type.startsWith("image/")) return showNotice("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) return showNotice("Maximal 5 MB pro Foto.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/gallery/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) return showNotice(uploadError.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const { error } = await supabase.from("member_photos").insert({ owner_id: user.id, image_url: data.publicUrl, caption: caption.trim(), visibility: visibility === "FRIENDS" ? "FRIENDS" : "PUBLIC" });
    if (error) return showNotice(error.message); showNotice("Foto wurde veröffentlicht.");
    const { data: photos } = await supabase.from("member_photos").select("*").order("created_at", { ascending: false }).limit(24); if (photos) setMemberPhotos(photos);
  }
  async function togglePhotoLike(photoId) { const mine = photoLikes.find((like) => like.photo_id === photoId && like.user_id === user.id); const { error } = mine ? await supabase.from("member_photo_likes").delete().eq("photo_id", photoId).eq("user_id", user.id) : await supabase.from("member_photo_likes").insert({ photo_id: photoId, user_id: user.id }); if (error) return showNotice(error.message); setPhotoLikes((likes) => mine ? likes.filter((like) => like !== mine) : [...likes, { photo_id: photoId, user_id: user.id }]); }
  async function addPhotoComment(photoId, text) { if (!text.trim()) return; const { data, error } = await supabase.from("member_photo_comments").insert({ photo_id: photoId, author_id: user.id, content: text.trim() }).select().single(); if (error) return showNotice(error.message); setPhotoComments((comments) => [...comments, data]); }
  async function deleteMemberPhoto(photo) { if (photo.owner_id !== user?.id || !confirm("Dieses Profilfoto wirklich löschen?")) return; const { error } = await supabase.from("member_photos").delete().eq("id", photo.id).eq("owner_id", user.id); if (error) return showNotice(error.message); setMemberPhotos((current) => current.filter((entry) => entry.id !== photo.id)); showNotice("Profilfoto gelöscht."); }
  async function uploadHomepageImage(file) {
    if (!file) return null; if (!user) throw new Error("Bitte zuerst anmelden."); if (!file.type.startsWith("image/")) throw new Error("Bitte ein Bild auswählen."); if (file.size > 5 * 1024 * 1024) throw new Error("Das Bild darf höchstens 5 MB groß sein.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/homepage/${crypto.randomUUID()}.${ext}`;
    let bucket = "community-media";
    let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
    // Existing projects may not have the optional community-media bucket yet.
    // Profile avatars already use this bucket, so it is a safe immediate fallback.
    if (error && /bucket not found/i.test(error.message || "")) { bucket = "profile-avatars"; ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type })); }
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path); if (!data?.publicUrl) throw new Error("Für das Bild konnte keine öffentliche URL erstellt werden."); return data.publicUrl;
  }
  async function uploadContentImage(file, category) {
    // FormData supplies an empty File object when an optional file input was
    // left blank. Treat that as "no image" instead of rejecting the whole
    // group/news form as an invalid image upload.
    if (!file || !user || !file.name || file.size === 0) return null;
    if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Das Bild darf höchstens 5 MB groß sein.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${category}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Für das Bild konnte keine öffentliche URL erstellt werden.");
    return data.publicUrl;
  }
  async function createHomepageSection(e) {
    e.preventDefault(); if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf die Startseite gestalten.");
    const prepared = await preparePrivilegedAction("Startseiten-Beitrag erstellen"); if (prepared.error) return showNotice(prepared.error.message);
    const f = new FormData(e.currentTarget); const { error } = await supabase.from("homepage_sections").insert({ title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), image_url: String(f.get("image_url") || "").trim() || null, frame_style: f.get("frame_style") || "standard", created_by: user.id, updated_by: user.id, sort_order: homepageSections.length, is_visible: true });
    if (error) { showNotice(error.message); return false; } e.currentTarget.reset(); showNotice("Rahmen veröffentlicht."); await loadAll(); return true;
  }
  async function editHomepageSection(x) {
    if (!isHeadAdmin(profile?.role)) return;
    const values = await openContentEditor({ title: "Startseiten-Beitrag", description: "Du hast hier ausreichend Platz für Text und kannst bei Bedarf ein neues Bild vom Computer oder Handy auswählen.", fields: [{ name: "title", label: "Überschrift", value: x.title, required: true }, { name: "content", label: "Text", type: "textarea", value: x.content, required: true, rows: 16 }, { name: "image", label: "Neues Bild auswählen (optional)", type: "file" }, { name: "image_url", label: "Oder Bild-URL", value: x.image_url || "", placeholder: "https://..." }] });
    if (!values || values.title.trim().length < 3 || values.content.trim().length < 3) return;
    const prepared = await preparePrivilegedAction("Startseiten-Beitrag bearbeiten", x.id); if (prepared.error) return showNotice(prepared.error.message);
    let imageUrl = values.image_url.trim() || null;
    try { const uploaded = await uploadHomepageImage(values.image); if (uploaded) imageUrl = uploaded; } catch (error) { return showNotice(error.message); }
    const { error } = await supabase.from("homepage_sections").update({ title: values.title.trim(), content: values.content.trim(), image_url: imageUrl, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", x.id); if (error) return showNotice(error.message); showNotice("Beitrag gespeichert."); await loadAll();
  }
  async function deleteHomepageSection(x) { if (!isHeadAdmin(profile?.role)) return; if (!confirm("Rahmen wirklich löschen?")) return; const prepared = await preparePrivilegedAction("Startseiten-Beitrag löschen", x.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("homepage_sections").delete().eq("id", x.id); if (error) return showNotice(error.message); await loadAll(); }
  async function sendMessage(e) { e.preventDefault(); if (isFeatureLocked("MESSAGING")) return showNotice("Deine Nachrichtenfunktion ist derzeit vorübergehend gesperrt."); if (!chatMember || !messageText.trim()) return; const { error } = await supabase.rpc("send_private_message", { target_user: chatMember.id, message_text: messageText.trim() }); if (error) return showNotice(error.message); setMessageText(""); await openChat(chatMember); }
  async function deleteMessage(message) { if (!message?.id || !confirm("Diese Nachricht für beide Gesprächspartner endgültig löschen?")) return; const { error } = await supabase.rpc("delete_private_message", { p_message_id: message.id }); if (error) return showSaveError("Die Nachricht", error); setMessages((current) => current.filter((item) => item.id !== message.id)); showNotice("Nachricht gelöscht."); }
  async function createNews(e) { e.preventDefault(); if (!isAdmin(profile?.role)) return showNotice("Nur die Administration darf Neuigkeiten veröffentlichen."); const f = new FormData(e.currentTarget); const payload = { title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), author_id: user.id }; if (payload.title.length < 3 || payload.content.length < 3) return showNotice("Bitte Überschrift und Text ausfüllen."); const prepared = await preparePrivilegedAction("Neuigkeit veröffentlichen"); if (prepared.error) return showNotice(prepared.error.message); try { payload.image_url = await uploadContentImage(f.get("image"), "news"); } catch (error) { return showNotice(error.message); } const { error } = await supabase.from("news").insert(payload); if (error) return showNotice(error.message); e.currentTarget.reset(); showNotice("Neuigkeit veröffentlicht."); await loadAll(); }
  async function createCommunityEvent(e) { e.preventDefault(); if (!isAdmin(profile?.role)) return showNotice("Nur die Administration darf Veranstaltungen veröffentlichen."); const f = new FormData(e.currentTarget); const prepared = await preparePrivilegedAction("Veranstaltung veröffentlichen"); if (prepared.error) return showNotice(prepared.error.message); let image_url = String(f.get("image_url") || "").trim() || null; try { const uploadedImage = await uploadContentImage(f.get("image"), "events"); if (uploadedImage) image_url = uploadedImage; } catch (error) { return showNotice(error.message); } const { data, error } = await supabase.from("community_events").insert({ title: String(f.get("title")).trim(), description: String(f.get("description") || "").trim(), event_at: f.get("event_at"), location: String(f.get("location") || "").trim() || null, image_url, created_by: user.id }).select().single(); if (error) return showNotice(error.message); if (data) setCommunityEvents((current) => [...current, data].sort((a,b) => new Date(a.event_at) - new Date(b.event_at))); e.currentTarget.reset(); showNotice("Veranstaltung veröffentlicht."); }
  async function editNews(entry) { if (!isAdmin(profile?.role)) return showNotice("Nur die Administration darf Neuigkeiten bearbeiten."); const values = await openContentEditor({ title: "Neuigkeit bearbeiten", description: "Überarbeite die Neuigkeit in Ruhe. Ein neues Bild kann direkt vom Gerät ergänzt werden.", fields: [{ name: "title", label: "Überschrift", value: entry.title, required: true }, { name: "content", label: "Text", type: "textarea", value: entry.content, required: true, rows: 16 }, { name: "image", label: "Neues Bild auswählen (optional)", type: "file" }] }); if (!values) return; if (values.title.trim().length < 3 || values.content.trim().length < 3) return showNotice("Bitte Überschrift und Text ausfüllen."); let imageUrl = entry.image_url || null; try { const uploaded = await uploadContentImage(values.image, "news"); if (uploaded) imageUrl = uploaded; } catch (error) { return showSaveError("Das Bild", error); } let { error } = await supabase.rpc("admin_update_news", { p_news_id: entry.id, p_title: values.title.trim(), p_content: values.content.trim(), p_image_url: imageUrl }); if (error && /function|schema cache|does not exist/i.test(error.message || "")) ({ error } = await supabase.from("news").update({ title: values.title.trim(), content: values.content.trim(), image_url: imageUrl }).eq("id", entry.id)); if (error) return showSaveError("Die Neuigkeit", error); showNotice("Neuigkeit gespeichert."); await loadAll(); }
  async function deleteNews(entry) { if (!isAdmin(profile?.role) || !confirm(`Neuigkeit „${entry.title}" wirklich löschen?`)) return; const { error } = await supabase.rpc("admin_delete_news", { p_news_id: entry.id }); if (error) return showNotice(error.message); showNotice("Neuigkeit gelöscht."); await loadAll(); }
  async function editCommunityEvent(event) { if (!isAdmin(profile?.role)) return; if (event.status === "CANCELLED") { const prepared = await preparePrivilegedAction("Veranstaltung wieder aktivieren", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ status: "ACTIVE", cancellation_reason: null, cancelled_at: null }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung wieder aktiviert."); return loadAll(); } const title = prompt("Titel:", event.title); if (title === null) return; const when = prompt("Datum und Uhrzeit (z. B. 2026-09-15T18:30):", new Date(event.event_at).toISOString().slice(0, 16)); if (when === null) return; const location = prompt("Ort:", event.location || ""); if (location === null) return; const description = prompt("Beschreibung:", event.description || ""); if (description === null || title.trim().length < 3 || Number.isNaN(new Date(when).getTime())) return showNotice("Bitte gültigen Titel sowie Datum und Uhrzeit eingeben."); const prepared = await preparePrivilegedAction("Veranstaltung bearbeiten", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ title: title.trim(), event_at: new Date(when).toISOString(), location: location.trim() || null, description: description.trim() }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung gespeichert."); await loadAll(); }
  async function cancelCommunityEvent(event) { if (!isAdmin(profile?.role) || !confirm(`Veranstaltung „${event.title}" wirklich absagen?`)) return; const reason = prompt("Grund der Absage (verpflichtend):", ""); if (reason === null || reason.trim().length < 5) return showNotice("Bitte eine Begründung mit mindestens 5 Zeichen eingeben."); const prepared = await preparePrivilegedAction("Veranstaltung absagen", event.id, reason); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ status: "CANCELLED", cancellation_reason: reason.trim(), cancelled_at: new Date().toISOString() }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung abgesagt."); await loadAll(); }
  async function respondToCommunityEvent(event, status) { if (event.status === "CANCELLED") return; const { error } = await supabase.from("community_event_rsvps").upsert({ event_id: event.id, user_id: user.id, status }, { onConflict: "event_id,user_id" }); if (error) return showNotice(error.message); showNotice(status === "GOING" ? "Du hast zugesagt." : "Du hast Interesse vorgemerkt."); await loadAll(); }
  async function deleteCommunityEvent(event) { if (!isAdmin(profile?.role) || !confirm(`Veranstaltung „${event.title}" wirklich löschen?`)) return; const prepared = await preparePrivilegedAction("Veranstaltung löschen", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").delete().eq("id", event.id); if (error) return showNotice(error.message); setCommunityEvents((current) => current.filter((entry) => entry.id !== event.id)); showNotice("Veranstaltung gelöscht."); }
  async function createCommunityAd(e) { e.preventDefault(); if (!isHeadAdmin(profile?.role)) return showNotice("Werbeflächen verwaltet nur der Global Admin."); const f = new FormData(e.currentTarget); const title = String(f.get("title") || "").trim(); if (title.length < 3) return showNotice("Bitte gib einen Namen für die Werbefläche ein."); let imageUrl = String(f.get("image_url") || "").trim() || null; try { const uploaded = await uploadContentImage(f.get("image"), "ads"); if (uploaded) imageUrl = uploaded; } catch (error) { return showSaveError("Das Werbebild", error); } const { error } = await supabase.rpc("admin_create_community_ad", { p_title: title, p_body: String(f.get("body") || "").trim(), p_link_url: String(f.get("link_url") || "").trim() || null, p_image_url: imageUrl }); if (error) return showSaveError("Die Werbefläche", /function|schema cache|does not exist/i.test(error.message || "") ? "Die Werbeflächen-Funktion ist noch nicht aktiv. Bitte führe registration_and_forum_repair.sql im Supabase SQL Editor aus." : error); e.currentTarget.reset(); showNotice("Werbefläche veröffentlicht."); await loadAll(); }
  async function deleteCommunityAd(ad) { if (!isHeadAdmin(profile?.role) || !confirm(`Werbefläche „${ad.title}" wirklich entfernen?`)) return; const { error } = await supabase.rpc("admin_delete_community_ad", { p_ad_id: ad.id }); if (error) return showSaveError("Die Werbefläche", error); setCommunityAds((current) => current.filter((entry) => entry.id !== ad.id)); showNotice("Werbefläche entfernt."); }
  async function setBusinessAccount(id, enabled) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf Unternehmenskonten verwalten."); const company = enabled ? prompt("Firmen- oder Vereinsname:", "") : ""; if (enabled && (company === null || !company.trim())) return; const { error } = await supabase.rpc("admin_set_business_account", { p_user_id: id, p_enabled: enabled, p_company_name: company || null, p_company_description: null }); if (error) return showNotice(error.message); showNotice(enabled ? "Unternehmenskonto vergeben." : "Unternehmenskonto entfernt."); await loadAll(); }
  async function createForumPost(e, scope) { e.preventDefault(); if (scope === "COMMUNITY" && isFeatureLocked("FORUM_POSTING")) return showNotice("Deine Forums-Schreibfunktion ist derzeit vorübergehend gesperrt."); const form = new FormData(e.currentTarget); const payload = { scope, title: String(form.get("title") || "").trim(), content: String(form.get("content") || "").trim(), font_family: form.get("font_family") || "modern", font_size: form.get("font_size") || "normal", emphasis: form.get("emphasis") || "normal" }; if (payload.title.length < 3 || payload.content.length < 3) return showNotice("Bitte Überschrift und Beitrag ausfüllen."); const { error } = await supabase.rpc("forum_create_post", { p_scope: payload.scope, p_title: payload.title, p_content: payload.content, p_font_family: payload.font_family, p_font_size: payload.font_size, p_emphasis: payload.emphasis }); if (error) return showNotice(error.message); e.currentTarget.reset(); showNotice("Beitrag veröffentlicht."); await loadAll(); }
  async function editForumPost(post) {
    const mayModerate = isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator);
    const ownsPost = post.author_id === user?.id;
    if (!ownsPost && !mayModerate) return showNotice("Du kannst nur eigene Beiträge bearbeiten.");

    // The old dynamically inserted editor was invisible in some mobile and
    // deployed layouts. Native dialogs are attached directly to the click and
    // therefore work consistently in every browser.
    const title = window.prompt("Überschrift bearbeiten:", post.title || "");
    if (title === null) return;
    const content = window.prompt("Beitrag bearbeiten:", post.content || "");
    if (content === null) return;
    if (title.trim().length < 3 || content.trim().length < 3) return showNotice("Überschrift und Beitrag müssen mindestens drei Zeichen haben.");
    const reason = ownsPost ? "Vom Autor bearbeitet" : window.prompt("Grund der Bearbeitung:", "Von der Forum-Moderation bearbeitet");
    if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Bearbeitungsgrund angeben.");

    let { error } = await supabase.rpc("forum_update_post", { p_post_id: post.id, p_title: title.trim(), p_content: content.trim(), p_reason: reason.trim() });
    if (error && ownsPost && /function|schema cache|does not exist/i.test(error.message || "")) ({ error } = await supabase.rpc("forum_update_own_post", { p_post_id: post.id, p_title: title.trim(), p_content: content.trim() }));
    if (error && isHeadAdmin(profile?.role) && /function|schema cache|does not exist/i.test(error.message || "")) ({ error } = await supabase.rpc("admin_edit_forum_post", { p_post_id: post.id, p_title: title.trim(), p_content: content.trim(), p_reason: reason.trim() }));
    if (error) return showSaveError("Der Forumsbeitrag", error);
    showNotice("Beitrag wurde gespeichert und als bearbeitet gekennzeichnet.");
    await loadAll();
  }
  async function deleteForumPost(post) { const mayModerate = isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator); if (post.author_id !== user?.id && !mayModerate) return showNotice("Du kannst nur eigene Beiträge löschen."); if (!confirm(`Beitrag „${post.title}" wirklich löschen?`)) return; const { error } = await supabase.rpc("forum_delete_post", { p_post_id: post.id }); if (error) return showNotice(error.message); showNotice("Forumsbeitrag gelöscht."); await loadAll(); }
  async function createForumReply(post, content) { const text = String(content || "").trim(); if (text.length < 2) return showNotice("Bitte schreibe eine Antwort."); const { error } = await supabase.rpc("forum_create_reply", { p_post_id: post.id, p_content: text }); if (error) return showNotice(error.message); showNotice("Antwort veröffentlicht."); await loadAll(); }
  async function editForumReply(reply) { const parent = forumPosts.find((post) => post.id === reply.post_id); const mayModerate = parent?.scope === "COMMUNITY" && profile?.forum_moderator; if (reply.author_id !== user?.id && !isHeadAdmin(profile?.role) && !mayModerate) return showNotice("Du kannst nur eigene Antworten bearbeiten."); const content = prompt("Antwort bearbeiten:", reply.content); if (content === null || content.trim().length < 2) return; const reason = reply.author_id === user?.id ? "Vom Autor bearbeitet" : prompt("Grund der Bearbeitung:", "Von der Forum-Moderation bearbeitet"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Bearbeitungsgrund angeben."); const { error } = await supabase.rpc("forum_update_reply", { p_reply_id: reply.id, p_content: content.trim(), p_reason: reason.trim() }); if (error) return showNotice(error.message); showNotice("Antwort bearbeitet und gekennzeichnet."); await loadAll(); }
  async function deleteForumReply(reply) { const parent = forumPosts.find((post) => post.id === reply.post_id); const mayModerate = parent?.scope === "COMMUNITY" && profile?.forum_moderator; if (reply.author_id !== user?.id && !isHeadAdmin(profile?.role) && !mayModerate) return showNotice("Du kannst nur eigene Antworten löschen."); if (!confirm("Antwort wirklich löschen?")) return; const { error } = await supabase.rpc("forum_delete_reply", { p_reply_id: reply.id }); if (error) return showNotice(error.message); showNotice("Antwort gelöscht."); await loadAll(); }
  async function setForumModerator(member, enabled) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Forum-Moderatoren bestimmen."); const { error } = await supabase.rpc("admin_set_forum_moderator", { p_target_user: member.id, p_enabled: enabled }); if (error) return showNotice(error.message); showNotice(enabled ? `${getName(member)} ist jetzt Forum-Moderator.` : "Forum-Moderation entfernt."); await loadAll(); }
  async function setGroupModerator(member, enabled) {
    if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Gruppenmoderation bestimmen.");
    if (member.role !== "SUPPORTER") return showNotice("Ernenne das Mitglied zuerst zum Supporter, bevor du Gruppenmoderation vergibst.");
    const { data, error: readError } = await supabase.rpc("admin_get_permissions", { target_user: member.id });
    if (readError) return showSaveError("Die Gruppenmoderation", readError);
    const p = { ...(data || {}), manage_groups: enabled };
    let { error } = await supabase.rpc("admin_set_permissions", { target_user: member.id, p_manage_members: !!p.manage_members, p_manage_points: !!p.manage_points, p_manage_messages: !!p.manage_messages, p_manage_media: !!p.manage_media, p_manage_roles: !!p.manage_roles, p_manage_admins: !!p.manage_admins, p_view_profile_visits: !!p.view_profile_visits, p_manage_news: !!p.manage_news, p_manage_groups: !!p.manage_groups, p_manage_events: !!p.manage_events, p_manage_marketplace: !!p.manage_marketplace, p_manage_friend_requests: !!p.manage_friend_requests, p_manage_homepage: !!p.manage_homepage, p_manage_reports: !!p.manage_reports });
    const responsibilities = (member.admin_responsibilities || []).filter((item) => !/gruppen verwalten/i.test(String(item)));
    if (enabled) responsibilities.push("Gruppen verwalten");
    if (!error) ({ error } = await supabase.rpc("admin_set_responsibilities", { p_target_user: member.id, p_responsibilities: responsibilities }));
    if (error) return showSaveError("Die Gruppenmoderation", error);
    showNotice(enabled ? `${getName(member)} ist jetzt Gruppenmoderator.` : "Gruppenmoderation entfernt."); await loadAll();
  }
  async function createWeeklyPoll(e) { e.preventDefault(); if (!isHeadAdmin(profile?.role)) return; const form = new FormData(e.currentTarget); const question = String(form.get("question") || "").trim(); const options = form.getAll("option").map((option) => String(option || "").trim()).filter(Boolean); if (question.length < 5 || options.length < 2) return showNotice("Bitte eine Frage und mindestens zwei Antwortmöglichkeiten eingeben."); const { error } = await supabase.rpc("create_weekly_poll", { p_question: question, p_options: options }); if (error) return showSaveError("Die Wochenfrage", error); showNotice("Wochenfrage veröffentlicht."); e.currentTarget.reset(); await loadAll(); }
  async function voteWeeklyPoll(optionIndex) { if (!weeklyPoll) return; const { error } = await supabase.rpc("vote_weekly_poll", { p_poll_id: weeklyPoll.id, p_option_index: optionIndex }); if (error) return showSaveError("Die Abstimmung", error); showNotice("Deine Stimme wurde gespeichert."); await loadAll(); }
  async function featureCommunityGroup(groupId) { if (!isHeadAdmin(profile?.role)) return; const { error } = await supabase.rpc("set_featured_community_group", { p_group_id: groupId || null }); if (error) return showSaveError("Die Gruppe der Woche", error); showNotice(groupId ? "Gruppe der Woche gespeichert." : "Gruppe der Woche entfernt."); await loadAll(); }
  async function createCommunityRequest(e) { e.preventDefault(); const form = new FormData(e.currentTarget); const title = String(form.get("title") || "").trim(); const content = String(form.get("content") || "").trim(); if (title.length < 5 || content.length < 10) return showNotice("Bitte einen Titel und eine kurze Beschreibung eingeben."); const { error } = await supabase.from("community_requests").insert({ author_id: user.id, category: form.get("category"), title, content }); if (error) return showSaveError("Der Community-Aufruf", /relation.*community_requests|does not exist/i.test(error.message || "") ? "Die neue Community-Erweiterung ist noch nicht aktiv. Bitte führe engagement_expansion.sql im Supabase SQL Editor aus." : error); e.currentTarget.reset(); showNotice("Dein Aufruf ist jetzt für die Community sichtbar."); await loadAll(); }
  async function closeCommunityRequest(request) { if (request.author_id !== user?.id || !confirm("Diesen Aufruf als erledigt schließen?")) return; const { error } = await supabase.from("community_requests").update({ status: "CLOSED" }).eq("id", request.id).eq("author_id", user.id); if (error) return showSaveError("Der Community-Aufruf", error); await loadAll(); }
  async function reviewProfileVerification(item, approved) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Verifizierungsanfragen abschließen."); if (approved && !confirm(`Die Echtheit von ${item.nickname || getName(item)} wurde geprüft und wird bestätigt?`)) return; const { error } = await supabase.rpc("admin_review_profile_verification", { p_user_id: item.user_id || item.id, p_approved: approved }); if (error) return showNotice(/function|schema cache|does not exist|relation/i.test(error.message || "") ? "Die Verifizierungsfunktion ist in der Datenbank noch nicht aktiv. Bitte führe registration_and_forum_repair.sql einmal im Supabase SQL Editor aus." : error.message); showNotice(approved ? "Profil wurde verifiziert." : "Verifizierungsanfrage wurde abgelehnt."); await openAccountReview(); await loadAll(); }
  async function setProfileVerification(member, verified) { return reviewProfileVerification({ user_id: member.id, nickname: getName(member) }, verified); }
  async function setMemberFeatureLock(member, feature, locked) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Funktionen sperren."); const label = feature === "FORUM_POSTING" ? "Forum schreiben" : feature === "MESSAGING" ? "Nachrichten" : "Freundschaftsanfragen"; const reason = locked ? prompt(`Grund für die Sperre „${label}" bei ${getName(member)}:`, "Verstoß gegen die Community-Regeln") : prompt(`Grund für die Freigabe „${label}" bei ${getName(member)}:`, "Funktion wieder freigegeben"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Grund angeben."); const { error } = await supabase.rpc("admin_set_feature_lock", { p_target_user: member.id, p_feature_key: feature, p_is_locked: locked, p_reason: reason.trim() }); if (error) return showNotice(error.message); showNotice(`${label} wurde ${locked ? "gesperrt" : "freigegeben"}; die automatische Nachricht wurde versendet.`); await loadAll(); }
  async function openChat(m) { setChatMember(m); setPage("messages"); const { data, error } = await supabase.from("messages").select("*").or(`and(sender_id.eq.${user.id},receiver_id.eq.${m.id}),and(sender_id.eq.${m.id},receiver_id.eq.${user.id})`).order("created_at", { ascending: true }); if (error) return showNotice(error.message); setMessages(data || []); await supabase.rpc("mark_messages_read", { from_user: m.id }); }
  async function openMember(m) { if (!m) return; if (m.id === user.id) return setPage("profile"); setViewingMember(m); setViewingFriends([]); setPage("member-profile"); const [{ data: connections }, { error: visitError }] = await Promise.all([supabase.from("friendships").select("requester_id,receiver_id").eq("status", "ACCEPTED").or(`requester_id.eq.${m.id},receiver_id.eq.${m.id}`), supabase.from("profile_visits").insert({ profile_id: m.id, visitor_id: user.id, visited_at: new Date().toISOString() })]); if (connections) { const ids = connections.map((connection) => connection.requester_id === m.id ? connection.receiver_id : connection.requester_id); setViewingFriends(members.filter((member) => ids.includes(member.id))); } if (visitError) console.warn(visitError.message); }

  if (passwordRecovery) return <PasswordReset finishPasswordReset={finishPasswordReset} notice={notice}/>;
  if (!user) return <div className="auth-page"><div className="text-logo">ENNSTAL CONNECT</div><Auth login={login} register={register}/><aside className="auth-online-rewards"><strong>⏱ Aktiv sein lohnt sich</strong><span>Mit deinen Online-Stunden schaltest du nach und nach besondere Profildesigns frei – vom Alpen-Layout bis zum Neon-Connect-Design ab 180 Stunden.</span><small>Supporter und offizielle Unterstützer der Community können alle Layouts sofort verwenden.</small></aside><button className="forgot-password-button" onClick={requestPasswordReset}>Passwort vergessen?</button>{notice && <div className="toast">{notice}</div>}</div>;

  const unread = messages.filter((m) => m.receiver_id === user.id && !m.is_read).length;
  const myRole = roleLabel(profile?.role);
  return <div className={`app layout-${profile?.profile_layout || "standard"}`}>
    <header className="topbar modern-topbar">
      <div className="topbar-brand" onClick={() => setPage("home")}><img src="/ennstal-connect-logo-v2.png" alt="Ennstal Connect" className="topbar-logo"/></div>
      <div className="breadcrumb">ENNSTAL.CONNECT <span>›</span> {page}</div>
      <div className="topbar-spacer" aria-hidden="true" />
    </header>
    <div className="dashboard-layout">
      <aside className="modern-sidebar">
        <div className="sidebar-profile" onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(profile)}</strong><span className={`role-badge ${profile?.account_badge === "BUSINESS" ? "business" : roleClass(profile?.role)}`}>{profile?.role === "HEAD_ADMIN" ? "♛" : profile?.role === "ADMIN" ? "★ Community Admin" : profile?.role === "SUPPORTER" ? "★ Supporter" : profile?.account_badge === "BUSINESS" ? "★ Unternehmenskonto" : "Mitglied"}</span></div></div>
        <nav className="modern-nav">
          <button onClick={() => setPage("home")}>⌂ <span>Startseite</span></button>
          <button onClick={() => setPage("members")}>♙ <span>Mitglieder</span></button>
          <button onClick={() => setPage("friends")}>♥ <span>Freunde</span></button>
          <button onClick={() => setPage("friend-requests")}>♢ <span>Anfragen</span>{incomingRequests.length > 0 && <em>{incomingRequests.length}</em>}</button>
          <button onClick={() => setPage("blocked")}>⊘ <span>Blockiert</span></button>
          <button onClick={() => setPage("messages")}>☏ <span>Nachrichten</span>{unread > 0 && <em>{unread}</em>}</button>
          <button onClick={() => setPage("news")}>▣ <span>Neuigkeiten</span></button>
          <button onClick={() => setPage("community")}>✦ <span>Community</span></button>
          <button onClick={() => setPage("groups")}>◉ <span>Gruppen</span></button>
          <button onClick={() => setPage("forum")}>▤ <span>Forum</span></button>
          <button onClick={() => setPage("profile")}>⚙ <span>Mein Profil</span></button>
          {isAdmin(profile?.role) && <button className="admin-nav-entry" onClick={() => setPage("admin")}>♛ <span>Admin-Zentrale</span></button>}
        </nav>
        <button className="sidebar-logout" onClick={logout}>⇥ <span>Abmelden</span></button>
      </aside>
      <main className="modern-main"><div className="content-root">{notice && <div className="toast">{notice}</div>}{incomingMessage && <aside className="incoming-message-popup" role="status"><strong>✉ Neue Nachricht von {incomingMessage.senderName}</strong><p>{incomingMessage.content || "Du hast eine neue private Nachricht erhalten."}</p><div><button className="primary-button" onClick={() => { const sender = members.find((member) => member.id === incomingMessage.senderId); setIncomingMessage(null); if (sender) openChat(sender); else setPage("messages"); }}>Nachricht öffnen</button><button className="secondary-button" onClick={() => setIncomingMessage(null)}>Später</button></div></aside>}
        {page === "home" && (
          <Home profile={profile} user={user} isHeadAdmin={isHeadAdmin} homepageSections={homepageSections} canEdit={isHeadAdmin(profile?.role)} createHomepageSection={createHomepageSection} editHomepageSection={editHomepageSection} deleteHomepageSection={deleteHomepageSection} uploadHomepageImage={uploadHomepageImage} weeklyPoll={weeklyPoll} welcomeBadges={welcomeBadges} groups={groups} featuredGroup={featuredGroup} communityRequests={communityRequests} onVote={voteWeeklyPoll} onCreatePoll={createWeeklyPoll} onFeatureGroup={featureCommunityGroup} onCreateRequest={createCommunityRequest} onCloseRequest={closeCommunityRequest} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }}/>
        )}
        {page === "members" && <section><div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1></div><input className="search-input" placeholder="Mitglied suchen …" value={search} onChange={(e) => setSearch(e.target.value)}/></div><MemberGrid members={sortedMembers} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friends" && <section><div className="page-heading"><h1>Freunde</h1><p>Nur bestätigte Freundschaften werden hier angezeigt.</p></div><MemberGrid members={members.filter((m) => acceptedFriendIds.includes(m.id) && !m.is_test_account && m.account_status !== "SUSPENDED")} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friend-requests" && <FriendRequests incoming={incomingRequests} sent={sentRequests} memberById={memberById} respond={respondToFriendRequest} cancel={cancelFriendRequest}/>} 
        {page === "blocked" && <Blocked blockedUsers={blockedUsers} memberById={memberById} unblock={unblockUser}/>} 
        {page === "messages" && <Messages user={user} messages={messages} chatMember={chatMember} setChatMember={setChatMember} memberById={memberById} openChat={openChat} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage} deleteMessage={deleteMessage}/>}
        {page === "news" && <News news={news} members={members} profile={profile} createNews={createNews} editNews={editNews} deleteNews={deleteNews}/>}
        {page === "community" && <><CommunityHub members={visibleMembers} events={communityEvents} ads={communityAds} photos={memberPhotos} profile={profile} profileUpdates={publicProfileUpdates} onDeleteAd={deleteCommunityAd}/>{isAdmin(profile?.role) && <AdminCommunityTools members={members} isHeadAdmin={isHeadAdmin(profile?.role)} createEvent={createCommunityEvent} createAd={createCommunityAd} setBusinessAccount={setBusinessAccount}/>}</>}
        {page === "groups" && <GroupsPage groups={groups} members={members} profile={profile} user={user} transferRequests={groupOwnerChanges} onCreate={createGroup} onJoin={joinGroup} onLeave={leaveGroup} onEdit={editGroup} onDelete={deleteGroup} onTransfer={requestGroupOwnerChange} onReviewTransfer={reviewGroupOwnerChange} onOpen={setSelectedGroup}/>}
        {page === "groups" && selectedGroup && <GroupDetails group={groups.find((group) => group.id === selectedGroup.id) || selectedGroup} members={members} profile={profile} user={user} onClose={() => setSelectedGroup(null)} onJoin={joinGroup} onLeave={leaveGroup} onEdit={editGroup} onDelete={deleteGroup}/>}
        {page === "forum" && <Forum title="Community-Forum" intro="Austausch für alle Mitglieder von Ennstal Connect." scope="COMMUNITY" posts={forumPosts} members={visibleMembers} profile={profile} createPost={createForumPost} editPost={editForumPost} deletePost={deleteForumPost} locked={isFeatureLocked("FORUM_POSTING")}/>}
        {page === "admin-forum" && isAdmin(profile?.role) && <Forum title="Admin-Forum" intro="Interner Bereich für Moderation und Administration." scope="ADMIN" posts={forumPosts} members={members} profile={profile} createPost={createForumPost} editPost={editForumPost} deletePost={deleteForumPost} locked={false}/>}
        {page === "profile" && <section className="profile-page-layout"><Profile profile={profile} user={user} isHeadAdmin={isHeadAdmin} saveProfile={saveProfile} uploadProfileImage={uploadProfileImage} uploadProfileBackground={uploadProfileBackground} uploadProfileBioImage={uploadProfileBioImage} openPublicPreview={() => setPage("profile-preview")}/><ProfileWelcomeBadges badges={welcomeBadges}/><ProfilePhotoGallery photos={memberPhotos.filter((photo) => photo.owner_id === user.id)} likes={photoLikes} comments={photoComments} user={user} onUpload={uploadMemberPhoto} onLike={togglePhotoLike} onComment={addPhotoComment} onDelete={deleteMemberPhoto}/></section>}
        {page === "profile-preview" && <PublicProfilePreview profile={profile} photos={memberPhotos} groups={groups} onBack={() => setPage("profile")} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }}/>} 
        {page === "member-profile" && viewingMember && <MemberProfile member={viewingMember} friends={viewingFriends} groups={groups} user={user} viewerProfile={profile} friendship={friendshipWith(viewingMember.id)} back={() => { setViewingMember(null); setViewingFriends([]); setPage("members"); }} onOpen={openMember} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }} requestFriend={requestFriend} respond={respondToFriendRequest} removeFriend={removeFriend} blockUser={blockUser} reportUser={reportUser} warnMember={warnMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} toggleTestAccount={toggleTestAccount} setBusinessAccount={setBusinessAccount} setForumModerator={setForumModerator} setGroupModerator={setGroupModerator} setProfileVerification={setProfileVerification} loadPermissions={loadPermissions} setMemberFeatureLock={setMemberFeatureLock} openChat={openChat}/>} 
        {page === "member-profile" && viewingMember && <MemberGroups member={viewingMember} groups={groups} onOpen={(group) => { setSelectedGroup(group); setPage("groups"); }}/>}
        {page === "member-profile" && viewingMember && <ProfileHighlights member={viewingMember} friends={viewingFriends} groups={groups} photos={memberPhotos}/>}
        {page === "member-profile" && viewingMember && isHeadAdmin(profile?.role) && viewingMember.id !== user.id && <HeadAdminProfileMediaTools member={viewingMember} onRemove={removeMemberProfileImage}/>}
        {page === "member-profile" && viewingMember && <MemberGroups member={viewingMember} groups={groups} onOpen={(group) => { setSelectedGroup(group); setPage("groups"); }}/>}
        {page === "member-profile" && viewingMember && <PublicProfilePhotoFolder member={viewingMember} photos={memberPhotos} canSeeFriends={isAdmin(profile?.role) || friendshipWith(viewingMember.id)?.status === "ACCEPTED"}/>} 
        {page === "member-profile" && viewingMember && isHeadAdmin(profile?.role) && viewingMember.role !== "HEAD_ADMIN" && <><FeatureUnlocks member={viewingMember} setMemberFeatureLock={setMemberFeatureLock}/><MemberBusinessTool member={viewingMember} setBusinessAccount={setBusinessAccount}/></>}
        {page === "reports" && isAdmin(profile?.role) && <Reports reports={reports} memberById={memberById} resolveReport={resolveReport}/>} 
        {page === "admin" && isAdmin(profile?.role) && <AdminPanel members={adminMembers.length ? adminMembers : members} memberEmails={memberEmails} adminLog={adminLog} profile={profile} user={user} onOpen={openMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} setBusinessAccount={setBusinessAccount} editingMember={editingMember} setEditingMember={setEditingMember} saveMemberData={saveMemberData} adminTarget={adminTarget} loadPermissions={loadPermissions} permissionDraft={permissionDraft} setPermissionDraft={setPermissionDraft} savePermissions={savePermissions} savingPermissions={savingPermissions} openAccountReview={openAccountReview}/>}
        {page === "admin-account-review" && isAdmin(profile?.role) && <AccountReview queue={accountReviewQueue} members={members} canReview={isHeadAdmin(profile?.role)} onBack={() => setPage("admin")} onOpen={openMember} onReview={reviewProfileVerification}/>}
        {page === "impressum" && <LegalPage type="impressum"/>}
        {page === "privacy" && <LegalPage type="privacy"/>}
        {page === "rules" && <CommunityRules/>}
      </div></main>
    </div>
    <footer className="site-footer"><strong>Ennstal Connect</strong><div><button onClick={() => setPage("impressum")}>Impressum</button><button onClick={() => setPage("privacy")}>Datenschutz</button><button onClick={() => setPage("rules")}>Community-Regeln</button></div></footer>
    {rulesAccepted === false && <RulesAcceptanceModal accepting={acceptingRules} onAccept={acceptCommunityRules}/>} 
  </div>;
}

function Home({ profile, user, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection, uploadHomepageImage, weeklyPoll, welcomeBadges, groups, featuredGroup, communityRequests, onVote, onCreatePoll, onFeatureGroup, onCreateRequest, onCloseRequest, onOpenGroup }) {
  const [frames, setFrames] = useState([{ imageUrl: "", status: "" }, { imageUrl: "", status: "" }]);
  const updateFrame = (index, changes) => setFrames((current) => current.map((frame, i) => i === index ? { ...frame, ...changes } : frame));
  const chooseImage = async (index, event) => { const file = event.target.files?.[0]; if (!file) return; updateFrame(index, { status: "Bild wird hochgeladen …" }); try { const imageUrl = await uploadHomepageImage(file); updateFrame(index, { imageUrl, status: "✓ Bild bereit – Rahmen jetzt veröffentlichen." }); } catch (error) { updateFrame(index, { status: `Upload fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}` }); } };
  const saveFrame = async (index, event) => { const saved = await createHomepageSection(event); if (saved) updateFrame(index, { imageUrl: "", status: "" }); };
  const frameForm = (label, index) => <section className="homepage-builder panel"><span className="eyebrow">{label}</span><h2>Rahmen gestalten</h2><form onSubmit={(event) => saveFrame(index, event)} className="homepage-form"><input name="title" placeholder="Rahmen-Überschrift" required/><textarea name="content" placeholder="Text für den Rahmen" required/><input name="image_url" value={frames[index].imageUrl} onChange={(event) => updateFrame(index, { imageUrl: event.target.value })} placeholder="Bild-URL (optional)"/><label className="homepage-image-picker">Foto hochladen<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => chooseImage(index, event)}/></label>{frames[index].imageUrl && <img className="homepage-upload-preview" src={frames[index].imageUrl} alt="Bildvorschau"/>}{frames[index].status && <p className="homepage-upload-status" aria-live="polite">{frames[index].status}</p>}<select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select><button className="primary-button">Rahmen veröffentlichen</button></form></section>;
  return <section className="home-page"><div className="hero community-logo-hero"><img src="/ennstal-connect-logo-v2.png" alt="Ennstal Connect Community-Logo"/></div><div className="page-heading"><div><span className="eyebrow">ENNSTAL & OBERSTEIERMARK</span><h1>Willkommen, {getName(profile)}</h1><p>Eine lebendige regionale Community für Menschen aus dem Ennstal und Umgebung.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}</div><EngagementPanel poll={weeklyPoll} badges={welcomeBadges} groups={groups} featuredGroup={featuredGroup} requests={communityRequests} user={user} isHeadAdmin={isHeadAdmin(profile?.role)} onVote={onVote} onCreatePoll={onCreatePoll} onFeatureGroup={onFeatureGroup} onCreateRequest={onCreateRequest} onCloseRequest={onCloseRequest} onOpenGroup={onOpenGroup}/>{canEdit && <div className="homepage-builder-grid">{frameForm("RAHMEN 1", 0)}{frameForm("RAHMEN 2", 1)}</div>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={`homepage-frame ${x.frame_style || "standard"}`} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">ENNSTAL CONNECT</span><h2>{x.title}</h2><p>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;
}

function EngagementPanel({ poll, badges, groups, featuredGroup, requests, user, isHeadAdmin, onVote, onCreatePoll, onFeatureGroup, onCreateRequest, onCloseRequest, onOpenGroup }) { const options = Array.isArray(poll?.options) ? poll.options : []; const counts = Array.isArray(poll?.vote_counts) ? poll.vote_counts : []; const total = counts.reduce((sum, value) => sum + Number(value || 0), 0); const category = (value) => value === "MITFAHREN" ? "🚗 Mitfahrgelegenheit" : value === "WANDERPARTNER" ? "🥾 Wanderpartner" : "📍 Regionaler Tipp"; return <section className="engagement-grid"><article className="panel weekly-poll"><span className="eyebrow">WOCHENFRAGE</span>{poll ? <><h2>{poll.question}</h2><div className="weekly-poll-options">{options.map((option, index) => { const count = Number(counts[index] || 0); const selected = Number(poll.my_vote) === index; return <button className={selected ? "selected" : ""} key={`${option}-${index}`} onClick={() => onVote(index)}><span>{option}</span><b>{total ? Math.round(count / total * 100) : 0}%</b><small>{count} Stimme{count === 1 ? "" : "n"}</small></button>; })}</div></> : <p>Noch keine Wochenfrage – schau bald wieder vorbei.</p>}{isHeadAdmin && <form className="engagement-admin-form" onSubmit={onCreatePoll}><input name="question" placeholder="Neue Wochenfrage" required/><input name="option" placeholder="Antwortmöglichkeit 1" required/><input name="option" placeholder="Antwortmöglichkeit 2" required/><input name="option" placeholder="Antwortmöglichkeit 3 (optional)"/><input name="option" placeholder="Antwortmöglichkeit 4 (optional)"/><button className="secondary-button">Wochenfrage veröffentlichen</button></form>}</article><article className="panel featured-group"><span className="eyebrow">GRUPPE DER WOCHE</span>{featuredGroup ? <button className="featured-group-open" onClick={() => onOpenGroup(featuredGroup)}>{featuredGroup.image_url && <img src={featuredGroup.image_url} alt=""/>}<div><h2>{featuredGroup.name}</h2><p>{featuredGroup.description}</p><strong>Gruppe ansehen →</strong></div></button> : <p>Der Head Admin kann hier eine Gruppe hervorheben.</p>}{isHeadAdmin && <select value={featuredGroup?.id || ""} onChange={(event) => onFeatureGroup(event.target.value)}><option value="">Keine Gruppe ausgewählt</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}</article><article className="panel welcome-badges"><span className="eyebrow">DEINE ERSTEN SCHRITTE</span><h2>Willkommens-Badges</h2><div>{badges.map((badge) => <span className={badge.earned ? "earned" : ""} key={badge.key}><b>{badge.icon}</b><span>{badge.title}<small>{badge.description}</small></span>{badge.earned ? "✓" : ""}</span>)}</div></article><article className="panel community-request-board"><span className="eyebrow">GEMEINSAM UNTERWEGS</span><h2>Mitfahren, Wandern & Tipps</h2><form onSubmit={onCreateRequest}><select name="category" defaultValue="WANDERPARTNER"><option value="MITFAHREN">🚗 Mitfahrgelegenheit</option><option value="WANDERPARTNER">🥾 Wanderpartner</option><option value="REGIONALER_TIPP">📍 Leichte Wanderrouten & regionale Tipps</option></select><input name="title" placeholder="z. B. Suche Wanderpartner für den Sonntag" required/><textarea name="content" placeholder="Beschreibe kurz, was du suchst oder welchen Tipp du brauchst …" required/><button className="primary-button">Veröffentlichen</button></form><div className="community-request-list">{requests.map((request) => <article key={request.id}><small>{category(request.category)}</small><strong>{request.title}</strong><p>{request.content}</p>{request.author_id === user?.id && <button className="text-button" onClick={() => onCloseRequest(request)}>Als erledigt schließen</button>}</article>)}{!requests.length && <p>Noch keine Aufrufe. Starte den ersten!</p>}</div></article></section>; }

function MemberGrid({ members, profile, friendships, onOpen, onMessage }) { return <div className="member-grid">{members.map((m) => <MemberCard key={m.id} member={m} profile={profile} friendships={friendships} onOpen={onOpen} onMessage={onMessage}/>)}</div>; }
function MemberCard({ member, profile, friendships, onOpen, onMessage }) {
  const r = member.role || "MEMBER";
  const friendship = friendships.find((x) => (x.requester_id === profile?.id && x.receiver_id === member.id) || (x.receiver_id === profile?.id && x.requester_id === member.id));
  const friend = friendship?.status === "ACCEPTED";
  const online = isRecentlyActive(member);
  return <article className={`member-card ${roleClass(r)} ${member.account_badge === "BUSINESS" ? "business" : ""}`} onClick={() => onOpen(member)}>
    <div className="member-role-line"><span className={`role-chip ${member.account_badge === "BUSINESS" ? "business" : roleClass(r)}`}>{r === "HEAD_ADMIN" ? "♛ Global Admin" : r === "ADMIN" ? "★ Community Admin" : r === "SUPPORTER" ? "★ Supporter" : member.account_badge === "BUSINESS" ? "★ Unternehmenskonto" : "Mitglied"}</span>{friend && <span className="friend-indicator" title="Befreundet">♥</span>}</div>
    <strong className="member-nickname">{getName(member)}</strong>
    <img className="member-avatar" src={member.avatar_url || DEFAULT_AVATAR} alt=""/>
    <div className="member-name">{[member.first_name, member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date) !== null && ` · ${getAge(member.birth_date)} Jahre`}</div>
    {!member.hide_online_status && <div className={`member-status ${online ? "online" : "offline"}`}><span/>{online ? (member.presence_device === "MOBILE" ? "Mobil online" : "Online") : "Offline"}{!online && member.last_active_at && <small>zuletzt aktiv {new Date(member.last_active_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</small>}</div>}
    {member.id !== profile?.id && <button className="member-message" onClick={(e) => { e.stopPropagation(); onMessage(member); }}>💬 Nachricht</button>}
  </article>;
}

function FriendRequests({ incoming, sent, memberById, respond, cancel }) { return <section><div className="page-heading"><div><span className="eyebrow">VERBINDUNGEN</span><h1>Freundschaftsanfragen</h1><p>Anfragen werden erst nach Annahme zu Freunden.</p></div></div><h2>Eingehend</h2><div className="cards">{incoming.map((r) => { const m = memberById(r.requester_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>{roleLabel(m.role)}</span></div><div className="request-actions"><button className="primary-button" onClick={() => respond(r, true)}>✓ Annehmen</button><button className="danger-button" onClick={() => respond(r, false)}>Ablehnen</button></div></>}</article>; })}{!incoming.length && <div className="empty-card">Keine eingehenden Anfragen.</div>}</div><h2>Gesendet</h2><div className="cards">{sent.map((r) => { const m = memberById(r.receiver_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>Wartet auf Antwort</span></div><button className="danger-button" onClick={() => cancel(r)}>Anfrage abbrechen</button></>}</article>; })}{!sent.length && <div className="empty-card">Keine offenen gesendeten Anfragen.</div>}</div></section>; }
function Blocked({ blockedUsers, memberById, unblock }) { return <section><div className="page-heading"><h1>Blockierliste</h1><p>Blockierte Nutzer sehen dich nicht in deinen normalen Community-Listen.</p></div><div className="member-grid">{blockedUsers.map((b) => { const m = memberById(b.blocked_id); return m && <article className="member-card member" key={b.id}><img className="member-avatar" src={m.avatar_url || DEFAULT_AVATAR} alt=""/><strong className="member-nickname">{getName(m)}</strong><button className="secondary-button" onClick={() => unblock(m.id)}>Entsperren</button></article>; })}{!blockedUsers.length && <div className="empty-card">Keine blockierten Nutzer.</div>}</div></section>; }
function Messages({ user, messages, chatMember, setChatMember, memberById, openChat, messageText, setMessageText, sendMessage, deleteMessage }) { return <section><div className="page-heading"><h1>Nachrichten</h1></div>{!chatMember ? <div className="message-overview">{messages.filter((m) => m.receiver_id === user.id || m.sender_id === user.id).map((m) => { const other = memberById(m.sender_id === user.id ? m.receiver_id : m.sender_id); return other && <button className="message-preview" key={m.id} onClick={() => openChat(other)}><img src={other.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(other)}</strong><small>{m.content}</small></span></button>; })}{!messages.length && <div className="empty-card">Noch keine Nachrichten.</div>}</div> : <div className="chat-box"><div className="chat-header"><button className="back-button" onClick={() => setChatMember(null)}>← Zurück</button><MemberMini member={chatMember}/></div><div className="chat-messages">{messages.filter((m) => (m.sender_id === user.id && m.receiver_id === chatMember.id) || (m.sender_id === chatMember.id && m.receiver_id === user.id)).map((m) => <div className={`chat-message ${m.sender_id === user.id ? "mine" : ""}`} key={m.id}><p>{m.content}</p><small>{new Date(m.created_at).toLocaleString("de-AT")}</small><button className="message-delete-button" onClick={() => deleteMessage(m)} aria-label="Nachricht löschen">×</button></div>)}</div><form className="message-form" onSubmit={sendMessage}><textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Nachricht schreiben …"/><button className="primary-button">Senden</button></form></div>}</section>; }
function MemberMini({ member }) { return <div className="member-mini"><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><strong>{getName(member)}</strong></div>; }

function ProfileWelcomeBadges({ badges }) { if (!badges.length) return null; return <section className="panel profile-welcome-badges"><span className="eyebrow">DEINE ERSTEN SCHRITTE</span><h2>Willkommens-Badges</h2><div>{badges.map((badge) => <span className={badge.earned ? "earned" : ""} key={badge.key}><b>{badge.icon}</b><span><strong>{badge.title}</strong><small>{badge.description}</small></span>{badge.earned ? "✓" : ""}</span>)}</div></section>; }

function Profile({ profile, user, isHeadAdmin, saveProfile, uploadProfileImage, uploadProfileBackground, uploadProfileBioImage }) { const background = profile?.profile_background || "#1b1f26"; const isImage = background.startsWith("http"); const cardStyle = isImage ? { "--profile-background-image": `linear-gradient(rgba(18,25,34,.42), rgba(18,25,34,.76)), url(${background})` } : { backgroundColor: background }; const bioStyle = { color: profile?.bio_color || "#f1f5f9" }; return <section><div className="my-area-layout"><div className={`my-profile-card ${roleClass(profile?.role)}`} style={cardStyle}><div className="profile-role-mark">{profile?.role === "HEAD_ADMIN" ? "♛" : "★"}</div><img className="my-avatar" src={profile?.avatar_url || DEFAULT_AVATAR} alt="Profil"/><h1>{getName(profile)}</h1><div className={`profile-role-label ${roleClass(profile?.role)}`}>{roleLabel(profile?.role)}</div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">♛ GLOBAL ADMIN · VERANTWORTLICH</div>}<h2>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}{getAge(profile?.birth_date) !== null && ` · ${getAge(profile.birth_date)} Jahre`}</h2>{profile?.bio_image_url && <img className="profile-bio-image" src={profile.bio_image_url} alt="Bild zum Über-mich-Bereich"/>}<p className={`profile-bio ${profile?.bio_font || "modern"} ${profile?.bio_size || "normal"}`} style={bioStyle}>{profile?.bio || "Noch kein Über-mich-Text."}</p></div><form className="panel profile-form" onSubmit={saveProfile}><span className="eyebrow">DEIN PROFIL</span><h2>Profil gestalten</h2><p className="profile-editor-note">Farben, Schriften und Bilder werden einheitlich in deinem eigenen und öffentlichen Profil angezeigt.</p><label>Nickname *</label><input name="nickname" defaultValue={profile?.nickname || ""} required/><input type="hidden" name="profile_background_image" value={isImage ? background : ""}/><div className="form-grid"><div><label>Profil-Akzent</label><input type="color" name="profile_accent" defaultValue={profile?.profile_accent || "#ff6b25"}/></div><div><label>Profil-Hintergrundfarbe</label><input type="color" name="profile_background_color" defaultValue={isImage ? "#1b1f26" : background}/></div></div><label>Profilbild</label><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && uploadProfileImage(e.target.files[0])}/><label>Hintergrundfoto</label><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && uploadProfileBackground(e.target.files[0])}/><label>Geschlecht *</label><select name="gender" defaultValue={profile?.gender || ""} required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><label>Über mich</label><textarea name="bio" maxLength="1000" rows="8" defaultValue={profile?.bio || ""} placeholder="Erzähl der Community etwas über dich …"/><small className="profile-editor-help">Bis zu 1.000 Zeichen. Absätze bleiben erhalten.</small><div className="form-grid profile-typography-grid"><label>Schriftart<select name="bio_font" defaultValue={profile?.bio_font || "modern"}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="bio_size" defaultValue={profile?.bio_size || "normal"}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label><label>Schriftfarbe<input type="color" name="bio_color" defaultValue={profile?.bio_color || "#f1f5f9"}/></label></div><label>Bild zu „Über mich“</label><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && uploadProfileBioImage(e.target.files[0])}/><label>Interessen</label><input name="interests" defaultValue={formatInterests(profile?.interests)} placeholder="z. B. Wandern, Fußball"/><label>Wohnort</label><input name="location" defaultValue={profile?.location || ""}/><div className="form-grid"><label>Instagram-Name<input name="instagram_username" defaultValue={profile?.instagram_username || ""} placeholder="z. B. ennstal.connect"/></label><label>Snapchat-Name<input name="snapchat_username" defaultValue={profile?.snapchat_username || ""} placeholder="z. B. ennstalconnect"/></label></div><label>Website</label><input name="website" defaultValue={profile?.website || ""}/><button className="primary-button">Änderungen speichern</button></form></div><ProfileShareQr profile={profile}/></section>; }

function ProfileShareQr({ profile }) { const [qr, setQr] = useState(""); const profileUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(profile?.id || "")}`; useEffect(() => { if (!profile?.id) return; QRCode.toDataURL(profileUrl, { width: 640, margin: 3, color: { dark: "#13283b", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setQr).catch(() => setQr("")); }, [profile?.id, profileUrl]); return <section className="panel profile-qr-card"><div><span className="eyebrow">DEIN PROFIL-QR-CODE</span><h2>Schneller gefunden werden</h2><p>Der Code führt direkt zu deinem Ennstal-Connect-Profil. Ideal zum Teilen oder für einen Auto-Sticker.</p></div>{qr && <><img src={qr} alt={`QR-Code zum Profil von ${getName(profile)}`}/><a className="primary-button" href={qr} download={`ennstal-connect-${profile?.nickname || "profil"}-qr.png`}>QR-Code herunterladen</a></>}</section>; }

function PublicProfilePreview({ profile, photos, groups, onBack, onOpenGroup }) {
  const privacy = profile?.privacy_settings || {};
  const isPublic = (field) => (privacy[field] || "PUBLIC") === "PUBLIC";
  const publicPhotos = photos.filter((photo) => photo.owner_id === profile?.id && photo.visibility !== "FRIENDS");
  const background = profile?.profile_background?.startsWith("http") ? { backgroundImage: `linear-gradient(rgba(20,37,54,.68),rgba(20,37,54,.86)),url(${profile.profile_background})`, backgroundSize: "cover", backgroundPosition: "center" } : {};
  return <section className="member-profile-page public-profile-preview"><button className="back-button" onClick={onBack}>← Zurück zum Bearbeiten</button><span className="eyebrow">VORSCHAU</span><p>So sehen Mitglieder, die nicht mit dir befreundet sind, dein Profil.</p><article className={`member-profile-hero ${roleClass(profile?.role)}`} style={background}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt="Profilbild"/><div><span>{roleLabel(profile?.role)}</span><h1>{getName(profile)}</h1>{isPublic("name") && <p>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}{isPublic("birth_date") && getAge(profile?.birth_date) !== null && ` · ${getAge(profile.birth_date)} Jahre`}</p>}{isPublic("bio") && profile?.bio_image_url && <img className="profile-bio-image" src={profile.bio_image_url} alt="Bild zum Über-mich-Bereich"/>}{isPublic("bio") && profile?.bio && <p className={`member-profile-bio ${profile?.bio_font || "modern"} ${profile?.bio_size || "normal"}`} style={{ color: profile?.bio_color || "#f1f5f9" }}>{profile.bio}</p>}{(profile?.role === "HEAD_ADMIN" || profile?.admin_responsibilities?.length) && <p className="admin-responsibilities">Zuständig für: {profile.role === "HEAD_ADMIN" ? (profile.head_admin_responsibilities || "Gesamtverantwortung, Sicherheit & Regeln") : profile.admin_responsibilities.join(" · ")}</p>}</div></article><section className="panel profile-visible-details"><span className="eyebrow">PROFILINFORMATIONEN</span>{isPublic("location") && profile?.location && <p>Ort: {profile.location}</p>}{isPublic("interests") && formatInterests(profile?.interests) && <p>Interessen: {formatInterests(profile.interests)}</p>}{isPublic("website") && profile?.website && <p>Webseite: {profile.website}</p>}{!isPublic("location") && !isPublic("interests") && !isPublic("website") && <p>Keine weiteren Informationen sind öffentlich sichtbar.</p>}</section><MemberGroups member={profile} groups={groups} onOpen={onOpenGroup}/>{publicPhotos.length > 0 && <PublicProfilePhotoFolder member={profile} photos={publicPhotos} canSeeFriends={false}/>}</section>;
}

function ProfileTimeline({ visits, activities, members, onOpen }) { const memberFor = (id) => members.find((member) => member.id === id); const profileLink = (member, children) => member ? <button type="button" className={`profile-activity-link ${roleClass(member.role)}`} onClick={() => onOpen(member)}>{children}</button> : children; const roleName = (member) => member ? `${roleMark(member.role)} ${getName(member)}`.trim() : "Mitglied"; return <section className="profile-activity-dashboard"><article className="profile-timeline panel"><span className="eyebrow">PROFILBESUCHE</span><h2>Die letzten 10 Besuche</h2><div>{visits.slice(0,10).map((visit) => { const visitor = memberFor(visit.visitor_id); return <p key={`visit-${visit.id || visit.visited_at}`}>{profileLink(visitor, <><strong>{roleName(visitor)}</strong> hat dein Profil besucht</>)}<time>{new Date(visit.visited_at).toLocaleString("de-AT")}</time></p>; })}{!visits.length && <p>Noch keine Profilbesuche.</p>}</div></article><article className="profile-timeline panel"><span className="eyebrow">PROFIL-AKTUALISIERUNGEN</span><h2>Deine letzten 10 Änderungen</h2><div>{activities.slice(0,10).map((activity) => { const actor = memberFor(activity.actor_id); return <p key={activity.id}>{profileLink(actor, <><strong>{roleName(actor)}</strong> · {activity.activity_type}</>)}<time>{new Date(activity.created_at).toLocaleString("de-AT")}</time></p>; })}{!activities.length && <p>Noch keine Profil-Aktualisierungen.</p>}</div></article></section>; }
function ProfilePhotoGallery({ photos, likes, comments, user, onUpload, onLike, onComment, onDelete }) { const [caption, setCaption] = useState(""); const [visibility, setVisibility] = useState("PUBLIC"); const [drafts, setDrafts] = useState({}); return <section className="profile-gallery panel"><span className="eyebrow">MEINE FOTOS</span><h2>Fotos aus deinem Profil</h2><label className="photo-upload-button">Foto hochladen<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, caption, visibility); event.target.value = ""; }}/></label><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength="240" placeholder="Kurze Bildbeschreibung (optional)"/><label className="photo-visibility">Foto sichtbar für<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">Alle Mitglieder</option><option value="FRIENDS">Nur Freunde</option></select></label><div className="profile-photo-grid">{photos.map((photo) => { const photoLikes = likes.filter((like) => like.photo_id === photo.id); const liked = photoLikes.some((like) => like.user_id === user.id); const photoComments = comments.filter((comment) => comment.photo_id === photo.id); return <figure key={photo.id}><img src={photo.image_url} alt={photo.caption || "Profilfoto"}/>{photo.caption && <figcaption>{photo.caption}</figcaption>}<small className="photo-privacy-label">{photo.visibility === "FRIENDS" ? "👥 Nur Freunde" : "◎ Öffentlich"}</small><div className="photo-actions"><button onClick={() => onLike(photo.id)}>{liked ? "♥ Gefällt dir" : "♡ Gefällt mir"} ({photoLikes.length})</button><button className="danger-button" onClick={() => onDelete(photo)}>Löschen</button></div><div className="photo-comments">{photoComments.map((comment) => <small key={comment.id}>{comment.content}</small>)}<form onSubmit={(event) => { event.preventDefault(); onComment(photo.id, drafts[photo.id] || ""); setDrafts((current) => ({ ...current, [photo.id]: "" })); }}><input value={drafts[photo.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [photo.id]: event.target.value }))} placeholder="Kommentieren …"/><button>↵</button></form></div></figure>; })}</div>{!photos.length && <p>Noch keine Fotos veröffentlicht.</p>}</section>; }

function Reports({ reports, memberById, resolveReport }) { return <section><div className="page-heading"><div><span className="eyebrow">MODERATION</span><h1>Meldungen</h1><p>Gemeldete Mitglieder prüfen und bearbeiten.</p></div></div><div className="report-list">{reports.map((r) => <article className="report-card" key={r.id}><div className="report-top"><strong>🚩 {r.status}</strong><span>{new Date(r.created_at).toLocaleString("de-AT")}</span></div><p><b>Gemeldet von:</b> {getName(memberById(r.reporter_id))}</p><p><b>Gemeldetes Mitglied:</b> {getName(memberById(r.reported_user_id))}</p><p>{r.reason}</p>{r.status === "PENDING" && <div className="content-manage-actions"><button className="primary-button" onClick={() => resolveReport(r.id, "CONFIRMED")}>Meldung bestätigen</button><button className="danger-button" onClick={() => resolveReport(r.id, "UNFOUNDED")}>Unbegründet</button></div>}</article>)}{!reports.length && <div className="empty-card">Keine Meldungen vorhanden.</div>}</div></section>; }

function AccountReview({ queue, members, canReview, onBack, onOpen, onReview }) { return <section className="account-review-page"><div className="page-heading"><div><span className="eyebrow">KONTOSCHUTZ</span><h1>Verifizierungen prüfen</h1><p>Hier erscheinen nur Profile, für die eine Verifizierung angefordert wurde.</p></div><button className="secondary-button" onClick={onBack}>← Zur Admin-Zentrale</button></div>{queue.length ? <div className="report-list">{queue.map((item) => { const member = members.find((entry) => entry.id === item.user_id); const due = item.due_at ? new Date(item.due_at) : null; return <article key={`${item.user_id}-${item.due_at || "request"}`} className="report-card"><strong>{item.nickname || "Mitglied"}</strong><p>{item.reason || "Keine Begründung hinterlegt."}</p><small>{due && !Number.isNaN(due.getTime()) ? `Frist: ${due.toLocaleString("de-AT")}` : "Keine Frist gesetzt"}</small><div className="content-manage-actions"><button className="secondary-button" onClick={() => { if (member) onOpen(member); }}>Profil öffnen</button>{canReview && <><button className="primary-button" onClick={() => onReview(item, true)}>✓ Verifizieren</button><button className="danger-button" onClick={() => onReview(item, false)}>Anfrage ablehnen</button></>}</div></article>; })}</div> : <div className="empty-card">Keine Verifizierungen stehen derzeit aus.</div>}</section>; }

function AdminPanel({ members, memberEmails, adminLog, profile, user, onOpen, updateMemberRole, toggleSuspension, setBusinessAccount, editingMember, setEditingMember, saveMemberData, adminTarget, loadPermissions, permissionDraft, setPermissionDraft, savePermissions, savingPermissions, openAccountReview }) {
  const admins = members.filter((m) => isAdmin(m.role));
  useEffect(() => { const heading = document.querySelector(".admin-page > .page-heading"); if (!heading || heading.querySelector(".admin-review-button")) return; const button = document.createElement("button"); button.className = "primary-button admin-review-button"; button.type = "button"; button.textContent = "✓ Verifizierungen prüfen"; button.onclick = openAccountReview; heading.appendChild(button); }, [openAccountReview]);
  useEffect(() => { if (!isHeadAdmin(profile?.role)) return; document.querySelectorAll(".admin-member-card").forEach((card) => { const name = card.querySelector(".admin-member-person-button strong")?.textContent; const member = members.find((item) => getName(item) === name); if (!member || member.role === "HEAD_ADMIN") return; if (member.account_badge === "BUSINESS") { const role = card.querySelector(".admin-member-card-info strong"); if (role) role.textContent = "★ Unternehmenskonto"; card.classList.add("business-card"); } if (card.querySelector(".business-account-button")) return; const button = document.createElement("button"); button.className = "profile-admin-button business-account-button"; button.textContent = member.account_badge === "BUSINESS" ? "★ Unternehmenskonto entfernen" : "★ Unternehmenskonto"; button.onclick = () => setBusinessAccount(member.id, member.account_badge !== "BUSINESS"); card.querySelector(".admin-member-card-actions")?.appendChild(button); }); }, [members, profile?.role, setBusinessAccount]);
  return <section className="admin-page"><div className="page-heading"><div><span className="eyebrow">VERWALTUNG</span><h1>Admin-Zentrale</h1><p>Global Admin und Community Admin werden klar unterschieden. Berechtigungen sind einzeln steuerbar.</p></div></div>
    <div className="admin-member-cards">{members.slice().sort((a,b) => (a.role === "HEAD_ADMIN" ? 1 : a.role === "ADMIN" ? 2 : a.role === "SUPPORTER" ? 3 : 4) - (b.role === "HEAD_ADMIN" ? 1 : b.role === "ADMIN" ? 2 : b.role === "SUPPORTER" ? 3 : 4) || getName(a).localeCompare(getName(b), "de")).map((m) => <article className={`admin-member-card ${roleClass(m.role)} ${m.is_test_account ? "hidden-account" : ""}`} key={m.id}><button className="admin-member-person-button" onClick={() => onOpen(m)}><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(m)}</strong><small>{roleLabel(m.role)}{m.is_test_account ? " · Verborgenes Konto" : ""}{m.account_status === "SUSPENDED" ? " · Gesperrt" : ""}</small></span></button><div className="admin-member-card-info"><div><span>Rolle</span><strong>{roleLabel(m.role)}</strong></div><div><span>Status</span><strong>{m.is_test_account ? "Verborgen" : m.account_status === "SUSPENDED" ? "Gesperrt" : "Sichtbar"}</strong></div><div><span>Community-Regeln</span><strong>{m.rules_accepted_at ? `Bestätigt · ${new Date(m.rules_accepted_at).toLocaleDateString("de-AT")}` : "Noch nicht bestätigt"}</strong></div></div>{isHeadAdmin(profile?.role) && m.role !== "HEAD_ADMIN" && <div className="admin-member-card-actions"><button className="profile-admin-button supporter" onClick={() => updateMemberRole(m, "SUPPORTER")}>🟢 Supporter</button><button className="profile-admin-button admin" onClick={() => updateMemberRole(m, m.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{m.role === "ADMIN" ? "✕ Community Admin entfernen" : "★ Community Admin"}</button>{m.role !== "MEMBER" && <button className="profile-admin-button remove-role" onClick={() => updateMemberRole(m, "MEMBER")}>↩ Rolle entfernen</button>}<button className="profile-admin-button" onClick={() => setEditingMember(m)}>✎ Name / Geburtsdatum</button><button className="profile-admin-button" onClick={() => loadPermissions(m.id)}>⚙ Rechte</button><button className="profile-admin-button danger" onClick={() => toggleSuspension(m)}>{m.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button></div>}</article>)}</div>
    {editingMember && <section className="profile-admin-edit-form panel"><div className="panel-title-row"><h2>Mitgliedsdaten ändern</h2><button className="modal-close-inline" onClick={() => setEditingMember(null)}>×</button></div><form onSubmit={saveMemberData} className="profile-admin-edit-grid"><label>Nickname<input name="nickname" defaultValue={editingMember.nickname || ""}/></label><label>Vorname<input name="first_name" defaultValue={editingMember.first_name || ""} required/></label><label>Nachname<input name="last_name" defaultValue={editingMember.last_name || ""} required/></label><label>Geburtsdatum<input type="date" name="birth_date" defaultValue={editingMember.birth_date || ""} required/></label><label>Geschlecht<select name="gender" defaultValue={editingMember.gender || ""}><option value="">Nicht angegeben</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label><div className="edit-actions"><button className="primary-button">💾 Speichern</button></div></form></section>}
    {isHeadAdmin(profile?.role) && adminTarget && <section className="permissions-panel panel"><div className="panel-title-row"><div><span className="eyebrow">RECHTE</span><h2>Einzelne Berechtigungen</h2><p>{getName(members.find((m) => m.id === adminTarget))} – jede Berechtigung kann unabhängig aktiviert werden.</p></div><button className="modal-close-inline" onClick={() => setAdminTarget?.("")}>×</button></div><div className="permissions-grid">{PERMISSIONS.map(([key,label]) => <label className="permission-row" key={key}><input type="checkbox" checked={!!permissionDraft[key]} onChange={(e) => setPermissionDraft((x) => ({...x, [key]: e.target.checked}))}/><span>{label}</span></label>)}</div><button className="primary-button" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Speichere …" : "Berechtigungen speichern"}</button></section>}
    <section className="admin-email-directory panel"><span className="eyebrow">VERTRAULICH · NUR ADMINISTRATION</span><h2>Registrierte E-Mail-Adressen</h2><div>{members.map((member) => <p key={member.id}><strong>{roleMark(member.role)} {getName(member)}</strong><span>{memberEmails[member.id] || "Wird geladen …"}</span></p>)}</div></section>
    {isHeadAdmin(profile?.role) && <section className="admin-log-panel panel"><span className="eyebrow">VERTRAULICH · NUR GLOBAL ADMIN</span><h2>Admin-Logbuch</h2><p>Begründete Rechte- und Moderationsaktionen von Admins und Supportern.</p><div className="admin-log-list">{adminLog.map((entry) => { const actor = members.find((m) => m.id === entry.actor_id); const target = members.find((m) => m.id === entry.target_id); const detailText = entry.details?.old_role && entry.details?.new_role ? `Rolle: ${entry.details.old_role} → ${entry.details.new_role}${entry.details.reason ? ` · Begründung: ${entry.details.reason}` : ""}` : formatAdminLogDetails(entry.details); return <article className="admin-log-row" key={entry.id}><div><strong>{ADMIN_LOG_LABELS[entry.action] || entry.details?.action_name || entry.action}</strong><span>Ausgeführt von: {getName(actor) || "System"}{entry.details?.actor_role ? ` (${roleLabel(entry.details.actor_role)})` : ""}{target ? ` · Betroffen: ${getName(target)}` : ""}</span>{detailText && <small>{detailText}</small>}</div><time>{new Date(entry.created_at).toLocaleString("de-AT")}</time></article>; })}{!adminLog.length && <div className="empty-card">Noch keine begründeten Verwaltungsaktionen protokolliert.</div>}</div></section>}
  </section>;
}

function News({ news, profile, createNews, editNews, deleteNews }) { return <section className="news-page"><div className="page-heading"><div><span className="eyebrow">ENNSTAL CONNECT</span><h1>Neuigkeiten</h1><p>Aktuelle Informationen aus der Community.</p></div></div>{isAdmin(profile?.role) && <form className="news-composer panel" onSubmit={createNews}><h2>Neuigkeit veröffentlichen</h2><input name="title" minLength="3" placeholder="Überschrift" required/><textarea name="content" minLength="3" placeholder="Was gibt es Neues?" required/><label className="content-image-upload">Bild hinzufügen (optional)<input name="image" type="file" accept="image/*"/></label><button className="primary-button">Veröffentlichen</button></form>}<div className="news-grid">{news.map((entry) => <article className="news-card" key={entry.id}>{entry.image_url && <img className="content-card-image" src={entry.image_url} alt=""/>}<span className="eyebrow">NEUIGKEIT · {new Date(entry.created_at).toLocaleDateString("de-AT")}</span><h2>{entry.title}</h2><p>{entry.content}</p>{isAdmin(profile?.role) && <div className="content-card-actions"><button className="secondary-button" onClick={() => editNews(entry)}>✎ Bearbeiten</button><button className="danger-button" onClick={() => deleteNews(entry)}>Löschen</button></div>}</article>)}{!news.length && <div className="empty-card">Noch keine Neuigkeiten veröffentlicht.</div>}</div></section>; }

function GroupsPage({ groups, members, profile, user, transferRequests, onCreate, onJoin, onLeave, onEdit, onDelete, onTransfer, onReviewTransfer, onOpen }) {
  const memberFor = (id) => members.find((member) => member.id === id);
  const hasGroupRights = isAdmin(profile?.role) || (profile?.role === "SUPPORTER" && (profile?.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item))));
  const canModerate = (group) => hasGroupRights || group.created_by === user?.id;
  const moderators = members.filter((member) => !member.is_test_account && member.account_status !== "SUSPENDED" && (isAdmin(member.role) || (member.role === "SUPPORTER" && (member.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item))))));
  const openGroup = (event, group) => { if (!event.target.closest("button,input,textarea,label")) onOpen(group); };
  useEffect(() => {
    document.querySelectorAll(".groups-page .group-card").forEach((card, index) => {
      const group = groups[index]; if (!group) return;
      card.onclick = (event) => openGroup(event, group);
      const actions = card.querySelector(".content-card-actions");
      if (!actions || actions.querySelector(".group-details-button")) return;
      const details = document.createElement("button"); details.type = "button"; details.className = "secondary-button group-details-button"; details.textContent = "Details"; details.onclick = () => onOpen(group); actions.prepend(details);
      if (canModerate(group)) { const remove = document.createElement("button"); remove.type = "button"; remove.className = "danger-button group-delete-button"; remove.textContent = "Löschen"; remove.onclick = () => onDelete(group); actions.appendChild(remove); }
    });
  }, [groups, profile?.role, profile?.admin_responsibilities, user?.id, onOpen, onDelete]);
  return <section className="groups-page"><div className="page-heading"><div><span className="eyebrow">GEMEINSAM AKTIV</span><h1>Gruppen</h1><p>Gründe eigene Gruppen, finde Gleichgesinnte und tritt jederzeit ein oder aus.</p></div></div>{moderators.length > 0 && <aside className="group-moderators panel"><span className="eyebrow">ZUSTÄNDIG FÜR GRUPPEN</span><h2>Gruppenmoderation</h2><div>{moderators.map((member) => <span className={`group-moderator ${roleClass(member.role)}`} key={member.id}>{roleMark(member.role)} {getName(member)} <small>· {isAdmin(member.role) ? roleLabel(member.role) : "Gruppenmoderation"}</small></span>)}</div></aside>}{hasGroupRights && transferRequests.length > 0 && <aside className="group-transfer-queue panel"><span className="eyebrow">FREIGABE ERFORDERLICH</span><h2>Offene Inhaberwechsel</h2>{transferRequests.map((request) => <div key={request.id}><span><strong>{request.group_name}</strong> · {getName(memberFor(request.requested_by))} möchte <strong>{getName(memberFor(request.proposed_owner_id))}</strong> als Inhaber einsetzen.</span><button className="primary-button" onClick={() => onReviewTransfer(request, true)}>Freigeben</button><button className="danger-button" onClick={() => onReviewTransfer(request, false)}>Ablehnen</button></div>)}</aside>}<form className="group-create-form panel" onSubmit={onCreate}><span className="eyebrow">DEINE GRUPPE</span><h2>Neue Gruppe erstellen</h2><input name="name" placeholder="Gruppenname" minLength="3" required/><textarea name="description" placeholder="Worum geht es in deiner Gruppe? Eine Beschreibung ist erforderlich." minLength="10" required/><label className="content-image-upload">Gruppenfoto (optional)<input name="image" type="file" accept="image/*"/></label><button className="primary-button">Gruppe erstellen</button></form><div className="group-grid">{groups.map((group) => { const memberIds = Array.isArray(group.member_ids) ? group.member_ids : []; const joined = memberIds.includes(user?.id); const creator = memberFor(group.created_by); const owner = memberFor(group.owner_id); return <article className="group-card panel" key={group.id}>{group.image_url ? <img className="group-cover" src={group.image_url} alt={`Gruppenfoto ${group.name}`}/> : <div className="group-cover group-cover-empty">◉</div>}<div className="group-card-body"><span className="eyebrow">MITGLIEDER {group.member_count ?? memberIds.length}</span><h2>{group.name}</h2><p>{group.description}</p><div className="group-ownership"><span>Erstellt von <strong>{getName(creator)}</strong></span><span>Inhaber: <strong>{getName(owner)}</strong></span></div><div className="group-member-list">{memberIds.map((id) => { const member = memberFor(id); return member && <span key={id} title={getName(member)}>{roleMark(member.role)} {getName(member)}</span>; })}{!memberIds.length && <small>Noch keine Mitglieder.</small>}</div><div className="content-card-actions">{joined ? <button className="secondary-button" onClick={() => onLeave(group)}>Gruppe verlassen</button> : <button className="primary-button" onClick={() => onJoin(group)}>Gruppe beitreten</button>}{canModerate(group) && <><button className="secondary-button" onClick={() => onEdit(group)}>✎ Bearbeiten</button>{group.created_by === user?.id && <button className="secondary-button" onClick={() => onTransfer(group)}>Inhaberwechsel anfragen</button>}</>}</div></div></article>; })}{!groups.length && <div className="empty-card">Noch keine Gruppen. Erstelle die erste Gruppe für deine Interessen.</div>}</div></section>;
}

function MemberGroups({ member, groups, onOpen }) {
  const joined = groups.filter((group) => Array.isArray(group.member_ids) && group.member_ids.includes(member.id));
  if (!joined.length) return null;
  return <section className="member-groups panel"><span className="eyebrow">GRUPPEN</span><h2>{getName(member)} ist Mitglied in</h2><div>{joined.map((group) => <button type="button" key={group.id} onClick={() => onOpen(group)}>{group.image_url ? <img src={group.image_url} alt=""/> : <span className="member-group-fallback">◉</span>}<span><strong>{group.name}</strong><small>{group.member_count ?? group.member_ids.length} Mitglieder · Gruppe öffnen</small></span></button>)}</div></section>;
}

function PublicProfilePhotoFolder({ member, photos, canSeeFriends }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const visible = photos.filter((photo) => photo.owner_id === member.id && (photo.visibility !== "FRIENDS" || canSeeFriends));
  if (!visible.length) return null;
  return <section className="public-photo-folder panel"><span className="eyebrow">FOTOORDNER</span><h2>Fotos von {getName(member)}</h2><p>{canSeeFriends && photos.some((photo) => photo.owner_id === member.id && photo.visibility === "FRIENDS") ? "Öffentliche Fotos und mit dir geteilte Freunde-Fotos." : "Öffentlich sichtbare Fotos."}</p><div>{visible.map((photo) => <figure key={photo.id}><button type="button" className="public-photo-enlarge" onClick={() => setSelectedPhoto(photo)} aria-label={`Foto von ${getName(member)} vergrößern`}><img src={photo.image_url} alt={photo.caption || `Foto von ${getName(member)}`}/></button>{photo.caption && <figcaption>{photo.caption}</figcaption>}<small>{photo.visibility === "FRIENDS" ? "👥 Nur Freunde" : "◎ Öffentlich"}</small></figure>)}</div>{selectedPhoto && <div className="public-photo-lightbox" onClick={() => setSelectedPhoto(null)} role="dialog" aria-modal="true" aria-label="Foto groß anzeigen"><button type="button" className="public-photo-lightbox-close" onClick={() => setSelectedPhoto(null)} aria-label="Großansicht schließen">×</button><img src={selectedPhoto.image_url} alt={selectedPhoto.caption || `Foto von ${getName(member)}`} onClick={(event) => event.stopPropagation()}/>{selectedPhoto.caption && <p onClick={(event) => event.stopPropagation()}>{selectedPhoto.caption}</p>}</div>}</section>;
}

function GroupDetails({ group, members, profile, user, onClose, onJoin, onLeave, onEdit, onDelete }) {
  const memberFor = (id) => members.find((member) => member.id === id);
  const memberIds = Array.isArray(group.member_ids) ? group.member_ids : [];
  const joined = memberIds.includes(user?.id);
  const canManage = isAdmin(profile?.role) || (profile?.role === "SUPPORTER" && (profile?.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item)))) || group.created_by === user?.id;
  return <div className="group-details-overlay" onClick={onClose}><article className="group-details panel" onClick={(event) => event.stopPropagation()}>{group.image_url && <img src={group.image_url} alt={`Gruppenfoto ${group.name}`}/>}<button className="group-details-close" onClick={onClose} aria-label="Schließen">×</button><span className="eyebrow">GRUPPE</span><h1>{group.name}</h1><p className="group-details-description">{group.description}</p><div className="group-details-ownership"><span>Erstellt von <strong>{getName(memberFor(group.created_by))}</strong></span><span>Aktueller Inhaber: <strong>{getName(memberFor(group.owner_id))}</strong></span></div><h2>Mitglieder ({group.member_count ?? memberIds.length})</h2><div className="group-details-members">{memberIds.map((id) => { const member = memberFor(id); return member && <div key={id}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{roleMark(member.role)} {getName(member)}</strong><small>{roleLabel(member.role)}</small></span></div>; })}{!memberIds.length && <p>Noch keine Mitglieder.</p>}</div><div className="group-details-actions">{joined ? <button className="secondary-button" onClick={() => onLeave(group)}>Gruppe verlassen</button> : <button className="primary-button" onClick={() => onJoin(group)}>Gruppe beitreten</button>}{canManage && <><button className="secondary-button" onClick={() => onEdit(group)}>✎ Bearbeiten</button><button className="danger-button" onClick={() => onDelete(group)}>Gruppe löschen</button></>}</div></article></div>;
}

function Forum({ title, intro, scope, posts, members, profile, createPost, editPost, deletePost, locked }) {
  const visiblePosts = posts.filter((post) => post.scope === scope);
  const memberFor = (id) => members.find((member) => member.id === id);
  const nameFor = (id) => getName(memberFor(id));
  const identityFor = (id) => { const member = memberFor(id); return member ? `${roleMark(member.role)} ${getName(member)} · ${roleLabel(member.role)}`.trim() : "Unbekanntes Mitglied"; };
  const forumContacts = scope === "COMMUNITY" ? members.filter((member) => member.account_status !== "SUSPENDED" && !member.is_test_account && (isAdmin(member.role) || (member.role === "SUPPORTER" && (member.forum_moderator || (member.admin_responsibilities || []).some((item) => /forum/i.test(String(item))))))) : [];
  useEffect(() => { const cards = document.querySelectorAll(".forum-post"); cards.forEach((card, index) => { const post = visiblePosts[index]; const canModerate = post?.scope === "COMMUNITY" && profile?.forum_moderator; if (!post || (post.author_id !== profile?.id && !isHeadAdmin(profile?.role) && !canModerate) || card.querySelector(".forum-delete-button")) return; const button = document.createElement("button"); button.className = "danger-button forum-delete-button"; button.textContent = "Löschen"; button.onclick = () => deletePost(post); card.querySelector(".forum-post-head")?.appendChild(button); }); }, [visiblePosts, profile?.id, profile?.role, profile?.forum_moderator, deletePost]);
  useEffect(() => { if (!isAdmin(profile?.role)) return; const cards = document.querySelectorAll(".forum-post"); cards.forEach((card, index) => { const post = visiblePosts[index]; const head = card.querySelector(".forum-post-head"); if (!post || !head) return; if (!head.querySelector(".secondary-button")) { const edit = document.createElement("button"); edit.className = "secondary-button forum-admin-edit-button"; edit.textContent = "✎ Bearbeiten"; edit.onclick = () => editPost(post); head.appendChild(edit); } if (!head.querySelector(".danger-button")) { const remove = document.createElement("button"); remove.className = "danger-button forum-admin-delete-button"; remove.textContent = "Löschen"; remove.onclick = () => deletePost(post); head.appendChild(remove); } }); }, [visiblePosts, profile?.role, editPost, deletePost]);
  return <section className="forum-page"><div className="page-heading"><div><span className="eyebrow">{scope === "ADMIN" ? "INTERN" : "COMMUNITY"}</span><h1>{title}</h1><p>{intro}</p></div></div>{forumContacts.length > 0 && <aside className="forum-contacts panel"><span className="eyebrow">ZUSTÄNDIG IM FORUM</span><h2>Forum-Moderation & Ansprechpartner</h2><div>{forumContacts.map((member) => <span className={`forum-contact ${roleClass(member.role)}`} key={member.id}>{roleMark(member.role)} {getName(member)} <small>· {member.forum_moderator ? "Forum-Moderation" : roleLabel(member.role)}</small></span>)}</div></aside>}<form className="forum-composer panel" onSubmit={(event) => createPost(event, scope)}><h2>Neuen Beitrag schreiben</h2>{locked && <p className="forum-locked">Deine Schreibfunktion im Forum ist momentan gesperrt.</p>}<input name="title" placeholder="Überschrift" minLength="3" required disabled={locked}/><textarea name="content" placeholder="Teile deinen Beitrag mit der Community …" minLength="3" required disabled={locked}/><div className="form-grid"><label>Schriftart<select name="font_family" defaultValue="modern" disabled={locked}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="font_size" defaultValue="normal" disabled={locked}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label></div><label>Betonung<select name="emphasis" defaultValue="normal" disabled={locked}><option value="normal">Normal</option><option value="bold">Fett</option><option value="italic">Kursiv</option></select></label><button className="primary-button" disabled={locked}>Beitrag veröffentlichen</button></form><div className="forum-post-list">{visiblePosts.map((post) => { const canEdit = post.author_id === profile?.id || isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator); return <article className="forum-post panel" key={post.id}><div className="forum-post-head"><div><span className="eyebrow">{scope === "ADMIN" ? "ADMIN-FORUM" : "FORUM"}</span><h2>{post.title}</h2><p>von <strong>{nameFor(post.author_id)}</strong> · {new Date(post.created_at).toLocaleString("de-AT")}</p></div>{canEdit && <button className="secondary-button" onClick={() => editPost(post)}>✎ Bearbeiten</button>}</div><p className={`forum-content ${post.font_family || "modern"} ${post.font_size || "normal"} ${post.emphasis || "normal"}`}>{post.content}</p>{post.edited_at && <small className="forum-edited">✎ Bearbeitet von {identityFor(post.edited_by)}{post.edit_reason ? ` · ${post.edit_reason}` : ""}</small>}</article>; })}{!visiblePosts.length && <div className="empty-card">Noch keine Beiträge. Starte die Diskussion!</div>}</div></section>;
}

function FeatureUnlocks({ member, setMemberFeatureLock }) { return <section className="member-admin-tools feature-unlocks"><span className="eyebrow">FUNKTIONEN FREIGEBEN</span><h2>Sperren aufheben</h2><p>Nur verwenden, wenn die Funktion für dieses Mitglied wieder erlaubt sein soll.</p><div><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", false)}>Forum freigeben</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "MESSAGING", false)}>Nachrichten freigeben</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FRIEND_REQUESTS", false)}>Anfragen freigeben</button></div></section>; }

function ProfileModal({ selectedMember, user, profile, friendship, setSelectedMember, requestFriend, respond, removeFriend, blockUser, reportUser, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  return <div className="modal-overlay" onClick={() => setSelectedMember(null)}><div className="profile-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedMember(null)}>×</button><div className={`modal-profile-header ${roleClass(selectedMember.role)}`}><div className="profile-modal-role">{selectedMember.role === "HEAD_ADMIN" ? "♛ GLOBAL ADMIN" : selectedMember.role === "ADMIN" ? "★ COMMUNITY ADMIN" : selectedMember.role === "SUPPORTER" ? "★ SUPPORTER" : "MITGLIED"}</div><img className="modal-avatar" src={selectedMember.avatar_url || DEFAULT_AVATAR} alt=""/><div className="modal-title"><h1>{getName(selectedMember)}</h1><span>{[selectedMember.first_name, selectedMember.last_name].filter(Boolean).join(" ")}{getAge(selectedMember.birth_date) !== null && ` · ${getAge(selectedMember.birth_date)} Jahre`}</span></div></div><div className="modal-content">{selectedMember.bio && <><h3>Über mich</h3><p>{selectedMember.bio}</p></>}{selectedMember.id !== user.id && <div className="profile-actions"><button className="primary-button" onClick={() => { setSelectedMember(null); openChat(selectedMember); }}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(selectedMember)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Anfrage ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(selectedMember)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>}{!isAdmin(selectedMember.role) && <button className="secondary-button" onClick={() => blockUser(selectedMember)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(selectedMember)}>🚩 Nutzer melden</button></div>}</div></div></div>;
}

function HeadAdminProfileMediaTools({ member, onRemove }) {
  const items = [["avatar_url", "Profilbild"], ["profile_background", "Hintergrundfoto"], ["bio_image_url", "Über-mich-Bild"]].filter(([field]) => String(member?.[field] || "").startsWith("http"));
  if (!items.length) return null;
  return <section className="head-admin-media-tools panel"><span className="eyebrow">HEAD-ADMIN · PROFILMEDIEN</span><h2>Bilder bei Regelverstoß entfernen</h2><p>Jede Entfernung verlangt eine Begründung und wird im Admin-Logbuch festgehalten.</p><div>{items.map(([field, label]) => <button type="button" className="danger-button" key={field} onClick={() => onRemove(member, field, label)}>{label} entfernen</button>)}</div></section>;
}

function ProfileHighlights({ member, friends, groups, photos }) {
  const memberGroups = groups.filter((group) => group.created_by === member.id || (group.member_ids || []).includes(member.id));
  const visiblePhotos = photos.filter((photo) => photo.owner_id === member.id && photo.visibility !== "FRIENDS");
  const interests = formatInterests(member.interests).split(",").map((item) => item.trim()).filter(Boolean);
  const contactVisible = (member.privacy_settings?.website || "PUBLIC") === "PUBLIC";
  const copyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(member.id)}`;
    try { await navigator.clipboard.writeText(link); window.alert("Profil-Link wurde kopiert."); }
    catch { window.prompt("Profil-Link kopieren:", link); }
  };
  return <section className="profile-highlights panel"><div className="profile-stat-grid"><span><strong>{friends.length}</strong><small>Freunde</small></span><span><strong>{memberGroups.length}</strong><small>Gruppen</small></span><span><strong>{visiblePhotos.length}</strong><small>öffentliche Fotos</small></span></div>{interests.length > 0 && <div className="profile-interest-tags">{interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}<div className="profile-social-actions">{contactVisible && member.instagram_username && <a href={`https://instagram.com/${encodeURIComponent(member.instagram_username)}`} target="_blank" rel="noreferrer">◎ Instagram</a>}{contactVisible && member.snapchat_username && <a href={`https://www.snapchat.com/add/${encodeURIComponent(member.snapchat_username)}`} target="_blank" rel="noreferrer">◉ Snapchat</a>}{contactVisible && member.website && <a href={/^https?:\/\//i.test(member.website) ? member.website : `https://${member.website}`} target="_blank" rel="noreferrer">↗ Website</a>}<button type="button" onClick={copyLink}>⧉ Profil-Link kopieren</button></div></section>;
}

function MemberProfile({ member, friends, user, viewerProfile, friendship, back, onOpen, requestFriend, respond, removeFriend, blockUser, reportUser, warnMember, updateMemberRole, toggleSuspension, toggleTestAccount, setBusinessAccount, setForumModerator, setGroupModerator, setProfileVerification, loadPermissions, setMemberFeatureLock, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  const canModerate = (isAdmin(viewerProfile?.role) || viewerProfile?.forum_moderator) && member.id !== user.id && member.role !== "HEAD_ADMIN";
  const canManageRoles = isHeadAdmin(viewerProfile?.role) && canModerate;
  const canSee = (field) => isAdmin(viewerProfile?.role) || (member.privacy_settings?.[field] || "PUBLIC") === "PUBLIC" || ((member.privacy_settings?.[field] || "PUBLIC") === "FRIENDS" && accepted);
  useEffect(() => {
    const tools = document.querySelector(".member-admin-tools>div");
    const hasGroupModeration = (member.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item)));
    if (!tools || !isHeadAdmin(viewerProfile?.role) || member.role !== "SUPPORTER" || tools.querySelector(".group-moderator-tool")) return;
    const button = document.createElement("button"); button.className = "secondary-button group-moderator-tool";
    button.textContent = hasGroupModeration ? "★ Gruppenmoderation entfernen" : "★ Zum Gruppenmoderator ernennen";
    button.onclick = () => setGroupModerator(member, !hasGroupModeration); tools.appendChild(button);
  }, [member, viewerProfile?.role, setGroupModerator]);
  useEffect(() => { const page = document.querySelector(".member-profile-page"); const hero = page?.querySelector(".member-profile-hero"); if (!page || !hero) return; const text = hero.querySelector("div"); const nameLine = text?.querySelector("p:not(.member-profile-bio)"); const bio = text?.querySelector(".member-profile-bio"); if (nameLine) nameLine.style.display = canSee("name") || canSee("birth_date") ? "" : "none"; if (bio) bio.style.display = canSee("bio") ? "" : "none"; page.querySelector(".profile-visible-details")?.remove(); const details = [["location", "Ort", member.location], ["interests", "Interessen", formatInterests(member.interests)], ["website", "Webseite", member.website]].filter(([field,,value]) => value && canSee(field)); if (!details.length) return; const panel = document.createElement("section"); panel.className = "panel profile-visible-details"; const label = document.createElement("span"); label.className = "eyebrow"; label.textContent = "PROFILINFORMATIONEN"; panel.appendChild(label); details.forEach(([, caption, value]) => { const row = document.createElement("p"); row.textContent = `${caption}: ${String(value)}`; panel.appendChild(row); }); hero.insertAdjacentElement("afterend", panel); }, [member, accepted, viewerProfile?.role]);
  useEffect(() => { const hero = document.querySelector(".member-profile-page .member-profile-hero"); const text = hero?.querySelector(":scope > div"); if (!hero || !text) return; text.querySelector(".admin-responsibilities")?.remove(); const saved = Array.isArray(member.admin_responsibilities) ? member.admin_responsibilities : []; const defaultAdminText = member.role === "ADMIN" ? ["Community-Verwaltung – Zuständigkeiten werden vom Head Admin festgelegt"] : []; const list = member.role === "HEAD_ADMIN" ? [member.head_admin_responsibilities || "Gesamtverantwortung, Sicherheit & Regeln"] : [...(saved.length ? saved : defaultAdminText), ...(member.forum_moderator ? ["Forum-Moderation · Meldungen und respektvoller Austausch"] : [])]; const visible = list.map((value) => String(value || "").trim()).filter(Boolean); if (!visible.length) return; const box = document.createElement("p"); box.className = "admin-responsibilities"; box.textContent = `Zuständig für: ${visible.join(" · ")}`; text.appendChild(box); }, [member.id, member.role, member.head_admin_responsibilities, member.admin_responsibilities, member.forum_moderator]);
  useEffect(() => { const tools = document.querySelector(".member-admin-tools>div"); if (!tools || !isAdmin(viewerProfile?.role) || member.is_verified || member.role === "HEAD_ADMIN" || tools.querySelector(".verification-request-tool")) return; const button = document.createElement("button"); button.className = "secondary-button verification-request-tool"; button.textContent = "✓ Verifizierung mit Frist anfordern"; button.onclick = async () => { const reason = prompt(`Warum soll ${getName(member)} sein Profil verifizieren?`, "Bitte bestätige zur Sicherheit die Echtheit deines Profils."); if (reason === null || reason.trim().length < 3) return; const days = Number(prompt("Frist in Tagen (1 bis 30):", "7")); if (!Number.isInteger(days) || days < 1 || days > 30) return alert("Bitte eine Frist zwischen 1 und 30 Tagen eingeben."); const { error } = await supabase.rpc("admin_require_profile_verification", { p_target_user: member.id, p_reason: reason.trim(), p_due_days: days }); alert(error ? error.message : "Verifizierung wurde angefordert. Das Mitglied wurde benachrichtigt."); }; tools.appendChild(button); }, [member, viewerProfile?.role]);
  useEffect(() => { const hero = document.querySelector(".member-profile-hero"); if (hero) { hero.classList.toggle("business-profile", member.account_badge === "BUSINESS"); if (!hero.querySelector(".verified-profile-badge") && member.is_verified) { const badge = document.createElement("small"); badge.className = "verified-profile-badge"; badge.textContent = "✓ Verifiziert"; hero.querySelector("div")?.appendChild(badge); } if (member.profile_background?.startsWith("http")) { hero.style.backgroundImage = `linear-gradient(rgba(20,37,54,.68), rgba(20,37,54,.86)), url(${member.profile_background})`; hero.style.backgroundSize = "cover"; hero.style.backgroundPosition = "center"; } } const tools = document.querySelector(".member-admin-tools>div"); if (tools && isHeadAdmin(viewerProfile?.role) && !tools.querySelector(".profile-business-tool")) { const button = document.createElement("button"); button.className = "secondary-button profile-business-tool"; button.textContent = member.account_badge === "BUSINESS" ? "★ Unternehmenskonto entfernen" : "★ Unternehmenskonto"; button.onclick = () => setBusinessAccount(member.id, member.account_badge !== "BUSINESS"); tools.appendChild(button); } if (tools && isHeadAdmin(viewerProfile?.role) && member.role === "SUPPORTER" && !tools.querySelector(".forum-moderator-tool")) { const button = document.createElement("button"); button.className = "secondary-button forum-moderator-tool"; button.textContent = member.forum_moderator ? "★ Forum-Moderation entfernen" : "★ Zum Forum-Moderator ernennen"; button.onclick = () => setForumModerator(member, !member.forum_moderator); tools.appendChild(button); } if (tools && isHeadAdmin(viewerProfile?.role) && !tools.querySelector(".profile-verification-tool")) { const button = document.createElement("button"); button.className = "secondary-button profile-verification-tool"; button.textContent = member.is_verified ? "✓ Verifizierung entfernen" : "✓ Profil verifizieren"; button.onclick = () => setProfileVerification(member, !member.is_verified); tools.appendChild(button); } if (tools && isHeadAdmin(viewerProfile?.role) && !tools.querySelector(".test-account-tool")) { const button = document.createElement("button"); button.className = "secondary-button test-account-tool"; button.textContent = member.is_test_account ? "◉ Testkonto sichtbar machen" : "◌ Als Testkonto ausblenden"; button.onclick = () => toggleTestAccount(member); tools.appendChild(button); } }, [member, viewerProfile?.role, setBusinessAccount, setForumModerator, setProfileVerification, toggleTestAccount]);
  return <section className="member-profile-page"><button className="back-button" onClick={back}>← Zurück zu Mitgliedern</button><article className={`member-profile-hero ${roleClass(member.role)}`}><img className={!member.avatar_url ? "member-profile-default-avatar" : ""} src={member.avatar_url || DEFAULT_AVATAR} alt="Standard-Profilbild"/><div><span>{roleLabel(member.role)}</span><h1>{getName(member)}</h1><p>{[member.first_name, member.last_name].filter(Boolean).join(" ")}{getAge(member.birth_date) !== null && ` · ${getAge(member.birth_date)} Jahre`}</p>{member.bio && <p className="member-profile-bio">{member.bio}</p>}</div></article><div className="member-profile-actions"><button className="primary-button" onClick={() => openChat(member)}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(member)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(member)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>} {!isAdmin(member.role) && <button className="secondary-button" onClick={() => blockUser(member)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(member)}>🚩 Nutzer melden</button></div>{canModerate && <section className="member-admin-tools"><span className="eyebrow">MODERATION</span><h2>Admin-Werkzeuge</h2><div><button className="danger-button" onClick={() => warnMember(member)}>⚠ Verwarnung senden</button><button className="secondary-button" onClick={() => toggleSuspension(member)}>{member.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button>{canManageRoles && <><button className="secondary-button" onClick={() => updateMemberRole(member, "SUPPORTER")}>🟢 Supporter</button><button className="secondary-button" onClick={() => updateMemberRole(member, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{member.role === "ADMIN" ? "✕ Admin entfernen" : "★ Community Admin"}</button>{member.role !== "MEMBER" && <button className="secondary-button" onClick={() => updateMemberRole(member, "MEMBER")}>↩ Rolle entfernen</button>}<button className="secondary-button" onClick={() => loadPermissions(member.id)}>⚙ Rechte verwalten</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", true)}>Forum sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "MESSAGING", true)}>Nachrichten sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FRIEND_REQUESTS", true)}>Anfragen sperren</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", false)}>Forum freigeben</button></>}</div></section>}{friends.length > 0 && <section className="public-friends"><span className="eyebrow">FREUNDE</span><h2>Mit {getName(member)} verbunden</h2><div>{friends.map((friend) => <button key={friend.id} onClick={() => onOpen(friend)}><img src={friend.avatar_url || DEFAULT_AVATAR} alt=""/><span>{getName(friend)}</span></button>)}</div></section>}</section>;
}

function PublicProfileUpdatesPreview() { const [updates, setUpdates] = useState([]); useEffect(() => { if (!supabase) return; supabase.from("public_profile_updates").select("nickname, role, is_verified, avatar_url, activity_type, created_at").order("created_at", { ascending: false }).limit(5).then(({ data }) => setUpdates(data || [])); }, []); if (!updates.length) return null; return <section className="public-auth-updates"><span className="eyebrow">ÖFFENTLICHE AKTUALISIERUNGEN</span><h2>Aus der Community</h2>{updates.map((entry, index) => <div className={`hub-row ${roleClass(entry.role)}`} key={`${entry.nickname}-${entry.created_at}-${index}`}><img src={entry.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{roleMark(entry.role)} {entry.nickname}{entry.is_verified ? " ✓" : ""}</strong><span>{entry.activity_type}</span></div></div>)}</section>; }
function Auth({ login, register }) { const [mode,setMode] = useState("login"); return <div className="auth-welcome"><section className="auth-intro"><img src="/ennstal-connect-logo-v2.png" alt="Ennstal Connect"/><span className="eyebrow">DIE REGIONALE COMMUNITY</span><h1>Gemeinsam verbunden im Ennstal.</h1><p>Entdecke Neuigkeiten, Veranstaltungen, Gruppen und einen sicheren Austausch für Ennstal und Obersteiermark.</p><div className="auth-feature-list"><div><b>♛ Head Admin</b><span>Verantwortlich für Sicherheit, Regeln und Unterstützung.</span></div><div><b>★ Für die Community</b><span>Forum, Gruppen, Nachrichten, Freundschaften und regionale Informationen.</span></div><div><b>◉ Eigene Gruppen</b><span>Mitglieder können Gruppen mit Foto und Beschreibung gründen, beitreten und gemeinsam gestalten.</span></div><div><b>❔ Wochenfrage</b><span>Jede Woche abstimmen, mitreden und sehen, was die Community bewegt.</span></div><div><b>★ Gruppe der Woche</b><span>Entdecke regelmäßig eine besonders aktive Gruppe und tritt direkt bei.</span></div><div><b>✓ Deine ersten Schritte</b><span>Willkommens-Badges belohnen ein gestaltetes Profil, die erste Gruppe, Fotos und Beiträge.</span></div><div><b>🥾 Gemeinsam unterwegs</b><span>Finde Mitfahrgelegenheiten und Wanderpartner oder frage nach leichten Wanderrouten und regionalen Tipps.</span></div><div><b>★ Supporter & Moderation</b><span>Der Head Admin kann Supporter gezielt für Forum oder Gruppen freigeben. Ihre Zuständigkeit wird mit Stern und Nickname sichtbar angezeigt.</span></div><div><b>📱 Am Handy vollständig dabei</b><span>Nutze Community, Forum, Gruppen, Nachrichten, Profile und den Adminbereich auch mobil. Bilder lassen sich antippen und vergrößern.</span></div><div><b>◉ Mobil online</b><span>Andere Mitglieder sehen, ob du gerade über dein Handy online bist.</span></div><div><b>◎ Instagram & Snapchat</b><span>Ergänze deine Social-Media-Namen direkt in deinem Ennstal-Connect-Profil.</span></div><div><b>▦ Persönlicher Profil-QR-Code</b><span>Erstelle und lade deinen eigenen QR-Code herunter, damit andere dein Profil schnell finden können.</span></div><div><b>🏔 Einheitliches Ennstal-Connect-Design</b><span>Das Ennstal-Connect-Logo begleitet dich einheitlich auf Anmeldung, Community und allen Geräten.</span></div><div><b>✓ Respektvoll verbunden</b><span>Mit der Registrierung akzeptierst du einen freundlichen Umgang und die Community-Regeln.</span></div></div><small>Mitgliederprofile und private Inhalte werden erst nach der Anmeldung angezeigt.</small><PublicProfileUpdatesPreview/></section><div className="auth-box">{mode === "login" ? <form className="panel" onSubmit={login}><h2>Anmelden</h2><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" placeholder="Passwort *" required/><button className="primary-button">Anmelden</button><button type="button" className="text-button" onClick={() => setMode("register")}>Noch kein Konto? Jetzt registrieren</button></form> : <form className="panel" onSubmit={register}><h2>Registrieren</h2><p className="auth-form-note">Wähle einen einmaligen Nicknamen – er ist später für alle sichtbar.</p><input name="nickname" placeholder="Nickname *" required/><input name="first_name" placeholder="Vorname *" required/><input name="last_name" placeholder="Nachname *" required/><input name="birth_date" type="date" required/><select name="gender" defaultValue="" required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><input name="email" type="email" placeholder="E-Mail *" required/><input name="password" type="password" minLength={6} placeholder="Passwort *" required/><button className="primary-button">Konto erstellen</button><button type="button" className="text-button" onClick={() => setMode("login")}>Bereits registriert? Anmelden</button></form>}</div></div>; }
function PasswordReset({ finishPasswordReset, notice }) { return <div className="auth-page"><div className="auth-welcome"><section className="auth-intro"><img src="/ennstal-connect-logo-v2.png" alt="Ennstal Connect"/><span className="eyebrow">KONTO-SICHERHEIT</span><h1>Neues Passwort festlegen.</h1><p>Wähle ein sicheres neues Passwort für dein Ennstal-Connect-Konto.</p></section><div className="auth-box"><form className="panel" onSubmit={finishPasswordReset}><h2>Passwort zurücksetzen</h2><input name="password" type="password" minLength={6} placeholder="Neues Passwort (mindestens 6 Zeichen)" required/><input name="confirm_password" type="password" minLength={6} placeholder="Passwort wiederholen" required/><button className="primary-button">Passwort speichern</button></form></div></div>{notice && <div className="toast">{notice}</div>}</div>; }
function InfoPage({ title, text }) { return <section><div className="page-heading"><h1>{title}</h1></div><div className="panel"><p>{text}</p></div></section>; }
function CommunityHub({ members, events, ads, photos, profile, profileUpdates, onDeleteAd }) {
  const birthdays = members.filter((member) => member.birthday_visible && member.birth_date).map((member) => ({ member, date: new Date(member.birth_date) })).sort((a, b) => (a.date.getMonth() * 31 + a.date.getDate()) - (b.date.getMonth() * 31 + b.date.getDate())).slice(0, 8);
  const admins = members.filter((member) => isAdmin(member.role)).sort((a, b) => (a.role === "HEAD_ADMIN" ? -1 : b.role === "HEAD_ADMIN" ? 1 : getName(a).localeCompare(getName(b), "de")));
  const moderators = members.filter((member) => member.role === "SUPPORTER" && (member.forum_moderator || (member.admin_responsibilities || []).some((entry) => /gruppen verwalten/i.test(String(entry))))).sort((a, b) => getName(a).localeCompare(getName(b), "de"));
  const businesses = members.filter((member) => member.account_badge === "BUSINESS").sort((a, b) => getName(a).localeCompare(getName(b), "de"));
  const publicPhotos = photos.filter((photo) => photo.visibility !== "FRIENDS");
  const responsibilityFor = (member) => member.role === "HEAD_ADMIN" ? (member.head_admin_responsibilities || "Gesamtverantwortung, Sicherheit & Regeln") : (member.admin_responsibilities?.length ? member.admin_responsibilities.join(" · ") : "Community-Moderation & Unterstützung");
  const moderationFor = (member) => [member.forum_moderator && "Forum-Moderation", (member.admin_responsibilities || []).some((entry) => /gruppen verwalten/i.test(String(entry))) && "Gruppenmoderation"].filter(Boolean).join(" · ");
  const contactRow = (member, detail, business = false) => <div className="hub-row community-contact-row" key={`${business ? "business" : "contact"}-${member.id}`}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong className={`role-author ${business ? "business" : roleClass(member.role)}`}>{business ? "★" : roleMark(member.role)} {getName(member)}</strong><span>{detail}</span></div></div>;
  const updateRow = (entry, index) => <div className="hub-row community-contact-row" key={`${entry.profile_id || entry.nickname}-${entry.created_at}-${index}`}><img src={entry.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong className={`role-author ${entry.account_badge === "BUSINESS" ? "business" : roleClass(entry.role)}`}>{entry.account_badge === "BUSINESS" ? "★" : roleMark(entry.role)} {entry.nickname}{entry.is_verified ? " ✓" : ""}</strong><span>{entry.activity_type}</span></div></div>;
  return <section className="community-hub"><div className="page-heading"><div><span className="eyebrow">AKTUELL & VERBUNDEN</span><h1>Community</h1><p>Termine, engagierte Ansprechpartner und Beiträge aus dem Ennstal.</p></div></div><div className="community-hub-layout"><div className="community-hub-content"><div className="community-hub-grid"><article className="panel"><span className="eyebrow">TERMINE</span><h2>Nächste Veranstaltungen</h2>{events.length ? events.slice(0,5).map((event) => <div className="hub-row" key={event.id}>{event.image_url && <img src={event.image_url} alt=""/>}<div><strong>{event.title}</strong><span>{new Date(event.event_at).toLocaleString("de-AT")}{event.location && ` · ${event.location}`}</span></div></div>) : <p>Noch keine Termine veröffentlicht.</p>}</article><article className="panel"><span className="eyebrow">GEBURTSTAGE</span><h2>Demnächst</h2>{birthdays.length ? birthdays.map(({ member, date }) => <div className="hub-row" key={member.id}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(member)}</strong><span>{date.toLocaleDateString("de-AT", { day: "2-digit", month: "long" })}</span></div></div>) : <p>Keine freigegebenen Geburtstage.</p>}</article><article className="panel"><span className="eyebrow">AUS DER COMMUNITY</span><h2>Mitgliederfotos</h2><div className="photo-strip">{publicPhotos.slice(0,6).map((photo) => <img key={photo.id} src={photo.image_url} alt={photo.caption || "Mitgliederfoto"}/>)}</div>{!publicPhotos.length && <p>Die Fotogalerie wird nach den ersten Uploads hier sichtbar.</p>}</article></div></div><aside className="community-contact-sidebar"><article className="panel"><span className="eyebrow">ANSPRECHPARTNER</span><h2>Administration</h2>{admins.length ? admins.map((member) => contactRow(member, responsibilityFor(member))) : <p>Noch keine Administration eingetragen.</p>}</article><article className="panel"><span className="eyebrow">MODERATION</span><h2>Forum & Gruppen</h2>{moderators.length ? moderators.map((member) => contactRow(member, moderationFor(member))) : <p>Derzeit keine Supporter-Moderation eingetragen.</p>}</article><article className="panel"><span className="eyebrow">REGIONAL VERBUNDEN</span><h2>Unternehmenskonten</h2>{businesses.length ? businesses.map((member) => contactRow(member, member.company_name || member.company_description || "Unternehmenskonto", true)) : <p>Noch keine Unternehmenskonten eingetragen.</p>}</article><article className="panel public-profile-updates"><span className="eyebrow">ÖFFENTLICHE PROFIL-AKTUALISIERUNGEN</span><h2>Aus der Community</h2>{profileUpdates.length ? profileUpdates.slice(0, 8).map(updateRow) : <p>Noch keine öffentlichen Profil-Aktualisierungen.</p>}</article></aside></div><p className="community-business-note">Unternehmen und Vereine können ein Unternehmenskonto beantragen. Sie erhalten einen blauen Stern und Rahmen, aber keine zusätzlichen Community-Rechte.</p><aside className={`community-ads ${ads.length ? "" : "community-ads-empty"}`}><div className="community-ads-heading"><span className="eyebrow">UNTERSTÜTZER & WERBUNG</span><h2>{ads.length ? "Regionale Angebote" : "Hier könnte deine Werbung stehen"}</h2></div>{ads.length ? <div className="community-ad-list">{ads.map((ad) => <article className="community-ad-card" key={ad.id}>{ad.link_url ? <a href={ad.link_url} target="_blank" rel="noreferrer">{ad.image_url && <img src={ad.image_url} alt={`Werbung von ${ad.title}`}/>}<strong>{ad.title}</strong><span>{ad.body}</span></a> : <div>{ad.image_url && <img src={ad.image_url} alt={`Werbung von ${ad.title}`}/>}<strong>{ad.title}</strong><span>{ad.body}</span></div>}{isHeadAdmin(profile?.role) && <button type="button" className="community-ad-remove" onClick={() => onDeleteAd(ad)}>Entfernen</button>}</article>)}</div> : <div className="community-ad-placeholder"><img src="/community-hero.png" alt="Ennstal und Obersteiermark"/><div><strong>Werbefläche für regionale Unternehmen und Vereine</strong><span>Präsentiere dein Angebot sichtbar in der Ennstal-Connect-Community.</span></div></div>}</aside></section>;
}
function MemberBusinessTool({ member, setBusinessAccount }) { const business = member.account_badge === "BUSINESS"; return <section className="member-business-tool panel"><span className="eyebrow">ADMIN-WERKZEUG</span><h2>Unternehmenskonto</h2><p>Unternehmenskonten erhalten einen blauen Rahmen und Stern, aber keine zusätzlichen Rechte.</p><button className="secondary-button" onClick={() => setBusinessAccount(member.id, !business)}>{business ? "★ Unternehmenskonto entfernen" : "★ Zum Unternehmenskonto ernennen"}</button></section>; }
function AdminCommunityTools({ members, isHeadAdmin, createEvent, createAd, setBusinessAccount }) { return <section className="admin-community-tools panel"><span className="eyebrow">VERWALTUNG</span><h2>Termine, Werbung & Unternehmenskonten</h2><div className="community-tool-grid"><form onSubmit={createEvent}><h3>Veranstaltung erstellen</h3><input name="title" placeholder="Titel" required/><input name="event_at" type="datetime-local" required/><input name="location" placeholder="Ort"/><input name="image_url" placeholder="Bild-URL (optional)"/><textarea name="description" placeholder="Beschreibung"/><button className="primary-button">Termin veröffentlichen</button></form>{isHeadAdmin && <><form onSubmit={createAd}><h3>Werbefläche erstellen</h3><input name="title" placeholder="Firma / Verein" required/><input name="link_url" placeholder="Webseite (optional)"/><input name="image_url" placeholder="Bild-URL (optional)"/><label className="content-image-upload">Werbebild hochladen (optional)<input name="image" type="file" accept="image/*"/></label><textarea name="body" placeholder="Kurztext"/><button className="primary-button">Werbung veröffentlichen</button></form><div><h3>Unternehmenskonto</h3>{members.filter((m) => m.role !== "HEAD_ADMIN").map((m) => <p key={m.id}><strong>{getName(m)}</strong><button className="secondary-button" onClick={() => setBusinessAccount(m.id, m.account_badge !== "BUSINESS")}>{m.account_badge === "BUSINESS" ? "Entfernen" : "Vergeben"}</button></p>)}</div></>}</div></section>; }
function RulesAcceptanceModal({ accepting, onAccept }) {
  return <div className="rules-acceptance-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-acceptance-title"><section className="rules-acceptance-dialog"><span className="eyebrow">ERSTE ANMELDUNG · VERPFLICHTEND</span><h1 id="rules-acceptance-title">Community-Regeln bestätigen</h1><p>Bevor du Ennstal Connect verwenden kannst, bestätige bitte die aktuelle Fassung der Community-Regeln.</p><div className="rules-acceptance-summary"><strong>Nicht erlaubt sind unter anderem:</strong><span>Fake-Accounts und Identitätstäuschung</span><span>Beleidigungen, Drohungen, Rassismus und Diskriminierung</span><span>Straftaten, Betrug, Hassrede und gefährliche Inhalte</span><span>Veröffentlichung fremder Daten, Nachrichten oder Bilder ohne Berechtigung</span><span>Spam, unerlaubte Werbung und technische Manipulation</span></div><p>Bei Verstößen können Inhalte entfernt, einzelne Funktionen gesperrt, Konten vorübergehend gesperrt oder Mitglieder endgültig ausgeschlossen werden.</p><button className="primary-button" type="button" disabled={accepting} onClick={onAccept}>{accepting ? "Bestätigung wird gespeichert …" : "Ich habe die Community-Regeln gelesen und akzeptiere sie"}</button></section></div>;
}

function CommunityRules() {
  return <section className="legal-page panel"><h1>Community-Regeln</h1><p className="legal-notice">Ennstal Connect soll ein sicherer, respektvoller und ehrlicher Ort für die Menschen im Ennstal und der Obersteiermark sein. Mit der Nutzung der Community sind diese Regeln einzuhalten.</p><h2>1. Respektvoller Umgang</h2><p>Beleidigungen, Drohungen, Mobbing, Belästigung, Nachstellung, Verleumdung, Hassrede sowie rassistische, antisemitische, sexistische, homophobe oder andere diskriminierende Inhalte werden nicht toleriert.</p><h2>2. Keine Straftaten oder gefährlichen Inhalte</h2><p>Verboten sind strafbare Inhalte und Handlungen, Gewaltandrohungen oder Gewaltverherrlichung, Betrug, Erpressung, Aufrufe zu Straftaten, die Verbreitung verbotener Inhalte sowie jede Nutzung, durch die andere Personen gefährdet oder geschädigt werden.</p><h2>3. Echte und ehrliche Konten</h2><p>Fake-Accounts, Mehrfachkonten zur Umgehung von Sperren, Identitätstäuschung, das Auftreten als eine andere Person oder Organisation und bewusst falsche Profilangaben sind nicht erlaubt. Testkonten dürfen ausschließlich durch die Administration für technische Prüfungen angelegt und müssen für normale Mitglieder verborgen werden.</p><h2>4. Schutz von Privatsphäre und Rechten</h2><p>Persönliche Daten, private Nachrichten oder Bilder anderer Personen dürfen nicht ohne Berechtigung veröffentlicht oder weitergegeben werden. Mitglieder dürfen nur Inhalte hochladen, für die sie die notwendigen Rechte und Zustimmungen besitzen. Urheberrechte, Persönlichkeitsrechte, Datenschutz und das Recht am eigenen Bild sind einzuhalten.</p><h2>5. Kein Spam oder Missbrauch</h2><p>Unerwünschte Werbung, massenhafte Nachrichten, manipulierte Links, Schadsoftware, Betrugsversuche, absichtliche Falschmeldungen und die technische Störung oder missbräuchliche Nutzung von Ennstal Connect sind verboten. Regionale Werbung ist nur in den dafür vorgesehenen und freigegebenen Bereichen erlaubt.</p><h2>6. Eigenverantwortung</h2><p>Jedes Mitglied ist für das eigene Verhalten und für selbst hochgeladene, versendete oder veröffentlichte Bilder, Texte, Nachrichten, Kommentare, Links und sonstige Inhalte verantwortlich.</p><h2>7. Freiwillige Moderation</h2><p>Head Admin, Community Admins, Supporter, Moderatoren sowie beteiligte Unternehmer und Vereine wirken freiwillig und grundsätzlich ohne Vergütung, Gewinnbeteiligung oder sonstigen finanziellen Vorteil mit. Sie sind dennoch verpflichtet, ihre freigegebenen Rechte sorgfältig, sachlich und ausschließlich zum Schutz der Community einzusetzen.</p><h2>8. Maßnahmen bei Regelverstößen</h2><p>Abhängig von Schwere, Häufigkeit und Gefahr eines Verstoßes kann die Administration Inhalte entfernen, eine Verwarnung aussprechen, einzelne Rechte oder Funktionen – etwa Nachrichten, Forum, Gruppen oder Uploads – vorübergehend oder dauerhaft sperren, das gesamte Konto zeitweise sperren oder ein Mitglied endgültig aus der Community ausschließen. Schwere Verstöße können unmittelbar zu einer Sperre oder zum Ausschluss führen.</p><h2>9. Meldungen und Behörden</h2><p>Regelwidrige oder möglicherweise rechtswidrige Inhalte können der Administration gemeldet werden. Bei einem konkreten Straftatverdacht arbeitet der Betreiber im gesetzlich zulässigen und erforderlichen Umfang mit Polizei, Staatsanwaltschaft, Gerichten und anderen zuständigen Behörden zusammen.</p><h2>10. Rückfragen</h2><p>Fragen zu einer Moderationsentscheidung oder zu diesen Regeln können an ennstal.connect@gmx.at gerichtet werden.</p></section>;
}

function LegalPage({ type }) {
  const privacy = type === "privacy";
  return <section className="legal-page panel">
    <h1>{privacy ? "Datenschutzerklärung" : "Impressum"}</h1>
    {privacy ? <>
      <p className="legal-notice">Stand: 5. September 2026 · Diese Datenschutzerklärung gilt für Ennstal Connect und richtet sich nach der Datenschutz-Grundverordnung (DSGVO) sowie dem österreichischen Datenschutzgesetz (DSG).</p>
      <h2>1. Verantwortlicher</h2>
      <p>Verantwortlicher Betreiber: Marco Egger, Ennstal Connect<br/>Waidbachstraße, 8700 Leoben, Österreich<br/>E-Mail: ennstal.connect@gmx.at</p>
      <h2>2. Welche Daten verarbeitet werden</h2>
      <p>Verarbeitet werden jene Daten, die für den Betrieb der Community erforderlich sind. Dazu gehören insbesondere Registrierungs- und Kontaktdaten, Profildaten, Geburtsdatum, freiwillige Profilangaben, Profil- und Hintergrundbilder, Beiträge, Kommentare, Gruppen, Veranstaltungen, Freundschaften, private Nachrichten, hochgeladene Medien, Moderations- und Sicherheitsdaten, Online-Status, Geräteart sowie technische Protokolldaten.</p>
      <h2>3. Zwecke und Rechtsgrundlagen</h2>
      <p>Die Verarbeitung erfolgt zur Bereitstellung und Verwaltung des Benutzerkontos und der Community-Funktionen, zur Kommunikation zwischen Mitgliedern, zur Darstellung freiwillig veröffentlichter Profile und Inhalte, zur Moderation, Missbrauchsprävention, Systemsicherheit und Bearbeitung von Anfragen. Rechtsgrundlagen sind – je nach Verarbeitung – die Vertragserfüllung bzw. vorvertragliche Maßnahmen gemäß Art. 6 Abs. 1 lit. b DSGVO, berechtigte Interessen an einem sicheren und funktionsfähigen Community-Betrieb gemäß Art. 6 Abs. 1 lit. f DSGVO, eine Einwilligung gemäß Art. 6 Abs. 1 lit. a DSGVO sowie gesetzliche Verpflichtungen gemäß Art. 6 Abs. 1 lit. c DSGVO.</p>
      <h2>4. Sichtbarkeit und Empfänger</h2>
      <p>Je nach gewählter Privatsphäre-Einstellung können Profilangaben und veröffentlichte Inhalte für andere angemeldete Mitglieder, Freunde oder öffentlich sichtbar sein. Private Nachrichten sind grundsätzlich nur für die beteiligten Personen bestimmt; notwendige Zugriffe zur technischen Fehlerbehebung, Sicherheit oder aufgrund gesetzlicher Pflichten bleiben vorbehalten. Daten werden außerdem nur soweit erforderlich an technische Dienstleister für Hosting, Datenbank, Authentifizierung, Speicherung und Betrieb übermittelt. Supabase wird für Datenbank-, Anmelde- und Speicherfunktionen eingesetzt. Dienstleister werden im erforderlichen Umfang datenschutzrechtlich verpflichtet.</p>
      <h2>5. Übermittlungen außerhalb des EWR</h2>
      <p>Soweit ein eingesetzter technischer Dienstleister Daten außerhalb des Europäischen Wirtschaftsraums verarbeitet, erfolgt dies nur auf Grundlage eines Angemessenheitsbeschlusses oder geeigneter Garantien, insbesondere der Standardvertragsklauseln der Europäischen Kommission, soweit gesetzlich erforderlich.</p>
      <h2>6. Speicherdauer</h2>
      <p>Daten werden grundsätzlich solange gespeichert, wie das Konto besteht und sie für die Community-Funktionen benötigt werden. Nach Kontolöschung oder einem berechtigten Löschbegehren werden Daten gelöscht oder anonymisiert, sofern keine gesetzlichen Aufbewahrungspflichten, Sicherheitsgründe oder die Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen eine weitere Speicherung erfordern. Moderations- und Sicherheitsnachweise können im notwendigen Umfang für einen angemessenen Zeitraum aufbewahrt werden.</p>
      <h2>7. Eigene Bilder, Nachrichten und Beiträge</h2>
      <p>Jedes Mitglied ist für die von ihm hochgeladenen oder veröffentlichten Bilder, Texte, Nachrichten, Kommentare, Links und sonstigen Inhalte selbst verantwortlich. Es dürfen nur Inhalte verwendet werden, für die die notwendigen Rechte und Erlaubnisse bestehen. Insbesondere dürfen keine Urheberrechte, Persönlichkeitsrechte, Datenschutzrechte oder das Recht am eigenen Bild anderer Personen verletzt werden. Bilder erkennbarer Personen dürfen nur veröffentlicht werden, wenn dies rechtlich zulässig ist und erforderliche Zustimmungen vorliegen. Private Nachrichten und personenbezogene Inhalte anderer dürfen nicht ohne Berechtigung veröffentlicht oder an Dritte weitergegeben werden.</p>
      <p>Rechtswidrige oder die Rechte anderer verletzende Inhalte können gemeldet, gesperrt oder entfernt werden. Gesetzliche Pflichten und eine gesetzlich zwingende Verantwortlichkeit des Betreibers bleiben von der Eigenverantwortung der Mitglieder unberührt.</p>
      <h2>8. Datensicherheit</h2>
      <p>Es werden angemessene technische und organisatorische Maßnahmen eingesetzt, um personenbezogene Daten vor Verlust, unberechtigtem Zugriff, Veränderung und Offenlegung zu schützen. Kein Online-Dienst kann jedoch einen vollständig risikofreien Betrieb garantieren.</p>
      <h2>9. Deine Datenschutzrechte</h2>
      <p>Du hast im gesetzlichen Rahmen insbesondere das Recht auf Information und Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch sowie den Widerruf einer Einwilligung für die Zukunft. Anträge können an ennstal.connect@gmx.at gerichtet werden. Zur Vermeidung unberechtigter Auskünfte kann ein geeigneter Identitätsnachweis verlangt werden.</p>
      <h2>10. Beschwerderecht</h2>
      <p>Wenn du der Ansicht bist, dass deine personenbezogenen Daten rechtswidrig verarbeitet werden, kannst du dich bei der Österreichischen Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien, Österreich · E-Mail: dsb@dsb.gv.at · Website: dsb.gv.at.</p>
      <h2>11. Änderungen</h2>
      <p>Diese Datenschutzerklärung kann angepasst werden, wenn sich Funktionen, eingesetzte Dienste oder rechtliche Anforderungen ändern. Die jeweils aktuelle Fassung wird auf Ennstal Connect veröffentlicht.</p>
    </> : <>
      <p><strong>Ennstal Connect</strong></p>
      <p>Verantwortlicher Betreiber: Marco Egger<br/>Waidbachstraße<br/>8700 Leoben, Österreich<br/>E-Mail: ennstal.connect@gmx.at</p>
      <h2>Zweck und anwendbares Recht</h2>
      <p>Ennstal Connect ist eine regionale Community für Vernetzung, Kommunikation und Austausch im Ennstal und Umgebung. Es gilt österreichisches Recht unter Beachtung des zwingend anwendbaren Rechts der Europäischen Union, insbesondere der DSGVO und des Digital Services Act.</p>
      <h2>Privater und unentgeltlicher Betrieb</h2>
      <p>Ennstal Connect wird derzeit als privat betriebene und unentgeltliche Community ohne Gewinnerzielungsabsicht geführt. Der Betreiber nimmt für die Nutzung der Community keine Mitgliedsbeiträge, Entgelte oder Spenden an und erzielt daraus keinen finanziellen Vorteil. Es wird weder das Bestehen eines eingetragenen Vereins noch eine steuerlich anerkannte Gemeinnützigkeit behauptet.</p>
      <p>Eine bloß privat und unentgeltlich betriebene Online-Community ist in Österreich nicht allein aufgrund ihres Bestehens oder der Bezeichnung „Community“ als Verein, Gewerbe oder Non-Profit-Organisation anzumelden. Diese Beurteilung gilt für die derzeit beschriebene Ausgestaltung. Sollten künftig Einnahmen angenommen, wirtschaftliche Leistungen angeboten oder eine vereinsmäßige Organisation gegründet werden, wird eine allenfalls erforderliche Anmeldung oder rechtliche Einordnung vorab geprüft.</p>
      <h2>Verantwortung der Mitglieder</h2>
      <p>Jedes Mitglied ist für seine Handlungen sowie für selbst hochgeladene, versendete oder veröffentlichte Bilder, Texte, Nachrichten, Kommentare, Links und sonstige Inhalte verantwortlich. Mitglieder müssen über alle erforderlichen Rechte und Zustimmungen verfügen. Verboten sind insbesondere strafbare Inhalte, Beleidigungen, Drohungen, Verleumdungen, Rassismus, Hassrede, Diskriminierung, Gewaltverherrlichung sowie Verletzungen von Urheber-, Persönlichkeits- oder Datenschutzrechten Dritter.</p>
      <h2>Moderation und Entfernung</h2>
      <p>Ennstal Connect toleriert keine Straftaten, Beleidigungen, rassistischen oder diskriminierenden Inhalte und keine sonstigen Rechtsverletzungen. Verdächtige Inhalte können gemeldet, geprüft, gesperrt oder entfernt werden. Konten können bei Verstößen eingeschränkt oder gesperrt werden.</p>
      <h2>Freiwillige Community-Tätigkeit</h2>
      <p>Head Admin, Community Admins, Supporter, Moderatoren sowie beteiligte Unternehmer und Vereine wirken freiwillig mit. Für diese Community-Tätigkeiten bestehen grundsätzlich keine Vergütung, keine Gewinnbeteiligung und kein sonstiger finanzieller Vorteil oder Profit, sofern nicht ausdrücklich und transparent etwas anderes bekanntgegeben wird.</p>
      <h2>Rolle des Betreibers</h2>
      <p>Der Betreiber stellt die technische Community-Plattform bereit und macht sich Inhalte der Mitglieder nicht allein durch deren Speicherung zu eigen. Eine pauschale Befreiung von gesetzlich zwingenden Pflichten ist damit nicht verbunden. Sobald der Betreiber von konkret rechtswidrigen Inhalten Kenntnis erhält, werden die gesetzlich erforderlichen und angemessenen Maßnahmen geprüft.</p>
      <h2>Zusammenarbeit mit Behörden</h2>
      <p>Bei einem konkreten Verdacht auf Straftaten unterstützt der Betreiber Polizei, Staatsanwaltschaft, Gerichte und andere zuständige Behörden im gesetzlich zulässigen und erforderlichen Umfang. Vorhandene Konto-, Inhalts- oder Protokolldaten werden nur bei einer gültigen gesetzlichen Grundlage oder rechtmäßigen behördlichen beziehungsweise gerichtlichen Anordnung gesichert, herausgefiltert und übermittelt. Es werden keine Daten allein aufgrund informeller Anfragen oder bloßer Vermutungen herausgegeben.</p>
      <h2>Haftungshinweis</h2>
      <p>Für rechtswidrige Handlungen und eigene Inhalte eines Mitglieds ist grundsätzlich das jeweilige Mitglied verantwortlich. Gesetzlich zwingende Prüf-, Reaktions-, Auskunfts- und sonstige Verantwortlichkeiten des Betreibers bleiben unberührt.</p>
    </>}
  </section>;
}
