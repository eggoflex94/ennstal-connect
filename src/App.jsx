import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRefreshScheduler } from "./refreshScheduler.js";
import { loadSections } from "./sectionLoader.js";
import QRCode from "qrcode";
import { loadMemberScores } from "./member-score.js";
import { logDeniedAdminAction, preparePrivilegedAction, supabase, supabaseUnavailableMessage } from "./supabaseClient";
import ProfileSections from "./ProfileSections.jsx";
import MemberCardView from "./MemberCardView.jsx";
import { loadMemberProfile } from "./memberProfileLoader.js";
import NativeMembersDirectory from "./NativeMembersDirectory.jsx";
import MobileQuickNav from "./MobileQuickNav.jsx";
import KaufpunkteMarket from "./KaufpunkteMarket.jsx";
import BusinessProfileManager from "./BusinessProfileManager.jsx";
import ProfilePhotoEditor from "./ProfilePhotoEditor.jsx";
import ProfileCoverEditor from "./ProfileCoverEditor.jsx";
import { watermarkPhoto } from "./photoWatermark.js";
import EventPhotosPage from "./EventPhotosPage.jsx";
import HeadAdminSelfControls from "./HeadAdminSelfControls.jsx";
import ProfileSocialTabs from "./ProfileSocialTabs.jsx";
import ProfileRelationshipSection from "./ProfileRelationshipSection.jsx";
import { loadDeferredProfileAdminEnhancements } from "./deferred-admin-enhancements.js";

// A friendly community image is shown until a member uploads a personal photo.
const DEFAULT_AVATAR = "/community-default-avatar-fast.svg";
const COMMUNITY_RULES_VERSION = "2026-10-04";
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
  ["manage_reports", "Meldungen verwalten"],
  ["manage_community_photographers", "Community-Fotografen verwalten"],
  ["view_personal_data", "Persönliche Daten einsehen"]
];

const roleLabel = (role) => role === "HEAD_ADMIN" ? "Hauptadmin" : role === "ADMIN" ? "Community Admin" : role === "MUNICIPALITY" ? "Gemeinde" : role === "SUPPORTER" ? "Supporter" : "Mitglied";
function RoleStar({ member }) { const role=member?.role; const src=role==='HEAD_ADMIN'||role==='ADMIN'?'/role-star-red.svg':role==='MUNICIPALITY'?(member?.role_star_url||'/role-star-green.svg'):role==='SUPPORTER'?'/supporter-star.svg':member?.account_badge==='BUSINESS'?'/role-star-blue.svg':'/role-star-member.svg'; return <img className="ec-inline-role-star" src={src} alt="" aria-hidden="true"/>; }
const roleMark = (role) => role === "HEAD_ADMIN" || role === "ADMIN" || role === "MUNICIPALITY" || role === "SUPPORTER" ? "★" : "";
const roleClass = (role) => String(role || "MEMBER").toLowerCase().replace("_", "-");
const isAdmin = (role) => role === "ADMIN" || role === "HEAD_ADMIN";
const isHeadAdmin = (role) => role === "HEAD_ADMIN";
const adminDenied = async (actionName, message, targetId = null, context = {}) => {
  await logDeniedAdminAction(actionName, targetId, message, context);
  return message;
};
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
    const isTextarea = definition.type === "textarea";
    const element = isTextarea ? document.createElement("textarea") : document.createElement("input");
    element.name = definition.name;
    if (!isTextarea) element.type = definition.type === "file" ? "file" : definition.type || "text";
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
  const [profilePhotoEditFile, setProfilePhotoEditFile] = useState(null);
  const [profilePhotoEditingExisting, setProfilePhotoEditingExisting] = useState(false);
  const [profileCoverEditFile, setProfileCoverEditFile] = useState(null);
  const [profileCoverEditingExisting, setProfileCoverEditingExisting] = useState(false);
  const [members, setMembers] = useState([]);
  const [adminMembers, setAdminMembers] = useState([]);
  const [adminLog, setAdminLog] = useState([]);
  const [activationDashboard, setActivationDashboard] = useState(null);
  const [rulesAccepted, setRulesAccepted] = useState(null);
  const [acceptingRules, setAcceptingRules] = useState(false);
  const [memberEmails, setMemberEmails] = useState({});
  const [friendships, setFriendships] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [welcomeGreetings, setWelcomeGreetings] = useState([]);
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
  const [allGroups, setAllGroups] = useState([]);
  const [profileVisits, setProfileVisits] = useState([]);
  const [forumPosts, setForumPosts] = useState([]);
  const [forumReplies, setForumReplies] = useState([]);
  const [forumHelpful, setForumHelpful] = useState([]);
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
  const [loginPending, setLoginPending] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState("");
  const [sectionStatus, setSectionStatus] = useState({ pending: [], failed: [] });
  const [networkIssue, setNetworkIssue] = useState(() => !globalThis.navigator?.onLine);
  const [incomingMessage, setIncomingMessage] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [adminTarget, setAdminTarget] = useState("");
  const [permissionDraft, setPermissionDraft] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [canViewPersonalData, setCanViewPersonalData] = useState(false);
  const [myAdminPermissions, setMyAdminPermissions] = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [accountReviewQueue, setAccountReviewQueue] = useState([]);
  const [groupOwnerChanges, setGroupOwnerChanges] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [regions, setRegions] = useState([]);
  const [regionalAssignments, setRegionalAssignments] = useState([]);
  const [activeRegion, setActiveRegion] = useState(null);
  const loadVersion = useRef(0);
  const initializedProfileUser = useRef(null);
  const loadAllRef = useRef(null);
  const bootstrapRetry = useRef({ count: 0, timer: null });
  const membersRef = useRef(members);
  membersRef.current = members;
  const lastRecordedProfileVisit = useRef({ profileId: "", at: 0 });
  const watermarkBackfillStarted = useRef(false);
  const resetSession = () => {
    initializedProfileUser.current = null;
    setSectionStatus({ pending: [], failed: [] });
    setUser(null); setProfile(null); setMembers([]); setFriendships([]);
    setMessages([]); setNotifications([]); setWelcomeGreetings([]); setAdminMembers([]); setAdminLog([]); setActivationDashboard(null); setMemberEmails({}); setCanViewPersonalData(false); setMyAdminPermissions({});
    setReports([]); setBlockedUsers([]); setFeatureLocks([]); setProfileVisits([]);
    setProfileActivities([]); setRulesAccepted(null); setViewingMember(null);
    setViewingFriends([]); setChatMember(null); setSelectedMember(null);
    setEditingMember(null); setAccountReviewQueue([]); setGroupOwnerChanges([]);
    setPermissionDraft({}); setAdminTarget(""); setIncomingMessage(null);
    setMessageText(""); setActiveRegion(null); setRegionalAssignments([]);
    setHomepageSections([]); setNews([]); setEvents([]); setGroups([]); setAllGroups([]);
    setForumPosts([]); setForumReplies([]); setForumHelpful([]); setWeeklyPoll(null); setFeaturedGroup(null);
    setCommunityRequests([]); setCommunityEvents([]); setCommunityAds([]);
    setMemberPhotos([]); setPhotoLikes([]); setPhotoComments([]); setEventRsvps([]);
    setWelcomeBadges([]); setSelectedGroup(null); setPage("home");
  };

  useEffect(() => {
    if (!user?.id || !profile?.is_primary_head_admin || watermarkBackfillStarted.current) return;
    watermarkBackfillStarted.current = true;
    let cancelled = false;

    const runBackfill = async () => {
      for (let batch = 0; batch < 30 && !cancelled; batch += 1) {
        const { data, error } = await supabase.functions.invoke("backfill-photo-watermarks", {
          body: { batchSize: 3 }
        });
        if (error) {
          console.warn("Wasserzeichen-Nachbearbeitung pausiert:", error.message);
          break;
        }
        const remaining = Number(data?.remaining || 0);
        if (!remaining) break;
        await new Promise((resolve) => window.setTimeout(resolve, 900));
      }
      if (!cancelled) {
        window.dispatchEvent(new CustomEvent("ec:regional-events-refresh", {
          detail: { reason: "watermark-backfill" }
        }));
      }
    };

    void runBackfill();
    return () => { cancelled = true; };
  }, [user?.id, profile?.is_primary_head_admin]);

  // A profile remains open while the Head Admin changes its rights.  Keep that
  // view in sync with the refreshed directory instead of leaving stale data
  // (such as responsibilities) on screen.
  useEffect(() => {
    if (!viewingMember?.id) return;
    const refreshed = members.find((member) => member.id === viewingMember.id);
    if (refreshed) setViewingMember(refreshed);
  }, [members, viewingMember?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let cancelled = false;
    const refreshProfileVisits = async () => {
      const { data, error } = await supabase
        .from("profile_visits")
        .select("*")
        .eq("profile_id", user.id)
        .order("visited_at", { ascending: false })
        .limit(50);
      if (!cancelled && !error) setProfileVisits(data || []);
    };
    const handleVisitsChanged = (event) => {
      if (event.detail?.userId && event.detail.userId !== user.id) return;
      const visit = event.detail?.visit;
      if (visit?.profile_id === user.id && visit?.visitor_id) {
        setProfileVisits((current) => [
          visit,
          ...current.filter((row) => row.id !== visit.id && row.visitor_id !== visit.visitor_id)
        ].sort((a, b) => new Date(b.visited_at) - new Date(a.visited_at)).slice(0, 50));
      }
      // Reconcile after the immediate websocket update; do not block UI on it.
      window.setTimeout(() => void refreshProfileVisits(), 250);
    };
    window.addEventListener("ec:profile-visits-changed", handleVisitsChanged);

    // Always load a fresh snapshot after login. This avoids a startup race
    // where the realtime helper can emit before React has attached its listener.
    void refreshProfileVisits();

    // Mobile backgrounding and sleeping tabs can temporarily lose the realtime
    // websocket. Keep a small visible-tab fallback so the list self-heals.
    const pollId = window.setInterval(() => {
      if (!document.hidden) void refreshProfileVisits();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.removeEventListener("ec:profile-visits-changed", handleVisitsChanged);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || page !== "member-profile" || !viewingMember?.id || viewingMember.id === user.id) return;
    const now = Date.now();
    const previous = lastRecordedProfileVisit.current;
    if (previous.profileId === viewingMember.id && now - previous.at < 5000) return;
    lastRecordedProfileVisit.current = { profileId: viewingMember.id, at: now };
    void supabase.rpc("record_profile_visit", { target_user: viewingMember.id }).then(({ error }) => {
      if (error) {
        lastRecordedProfileVisit.current = { profileId: "", at: 0 };
        console.warn("Profilbesuch konnte nicht gespeichert werden:", error.message);
      }
    });
  }, [page, viewingMember?.id, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const openProfileDirect = (profileId, nickname = "") => {
      const id = String(profileId || "").trim();
      const wantedName = String(nickname || "").trim().toLowerCase();
      if (!id && !wantedName) return false;

      const member = members.find((item) => item.id === id)
        || members.find((item) => wantedName && String(item.nickname || "").trim().toLowerCase() === wantedName);

      setViewingFriends([]);

      if (member) {
        setViewingMember(member.id === user.id ? null : member);
        setPage(member.id === user.id ? "profile" : "member-profile");
        return true;
      }

      if (!id) return false;

      void loadMemberProfile({ id, nickname }).then((fresh) => {
        if (!fresh?.id) return;
        setViewingMember(fresh.id === user.id ? null : fresh);
        setPage(fresh.id === user.id ? "profile" : "member-profile");
      }).catch((error) => console.warn("Profil konnte nicht geöffnet werden:", error?.message || error));
      return true;
    };

    window.__ecOpenProfile = openProfileDirect;

    const sharedProfileId = new URLSearchParams(window.location.search).get("profile");
    if (sharedProfileId) openProfileDirect(sharedProfileId);

    const handleSidebarProfile = (event) => {
      if (openProfileDirect(event.detail?.profileId, event.detail?.nickname)) event.preventDefault();
    };

    window.addEventListener("ec:open-profile", handleSidebarProfile);
    return () => {
      window.removeEventListener("ec:open-profile", handleSidebarProfile);
      if (window.__ecOpenProfile === openProfileDirect) delete window.__ecOpenProfile;
    };
  }, [user?.id, members]);

  useEffect(() => {
    const handleNavigation = (event) => {
      const requested = String(event.detail?.page || "");
      if (requested === "fake-accounts" || requested === "admin-log") {
        if (profile?.is_primary_head_admin && profile?.account_status === "ACTIVE") setPage(requested);
        return;
      }
      const pageMap = {
        home: "home", members: "members", forum: "forum", groups: "groups", marketplace: "marketplace", photos: "events",
        community: "community", events: "events", news: "news", ads: "community", profile: "profile",
        messages: "messages", notifications: "notifications", friends: "friends", requests: "friend-requests",
        blocked: "blocked", admin: "admin", "admin-forum": "admin-forum", municipality: "municipality"
      };
      if (pageMap[requested]) setPage(pageMap[requested]);
    };
    window.addEventListener("ec:navigate", handleNavigation);
    return () => window.removeEventListener("ec:navigate", handleNavigation);
  }, [profile?.role, profile?.account_status]);

  useEffect(() => {
    const markOffline = () => setNetworkIssue(true);
    const markOnline = () => { setNetworkIssue(false); void loadAllRef.current?.(); };
    const markRequestIssue = () => setNetworkIssue(true);
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    window.addEventListener("ec:network-error", markRequestIssue);
    window.addEventListener("ec:network-restored", markOnline);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
      window.removeEventListener("ec:network-error", markRequestIssue);
      window.removeEventListener("ec:network-restored", markOnline);
    };
  }, []);

  useEffect(() => {
    if (page !== "admin" || !profile?.is_primary_head_admin) return;
    void loadActivationDashboard();
  }, [page, profile?.is_primary_head_admin]);

  useEffect(() => {
    const handleRegionChange = (event) => {
      const next = event.detail;
      if (next?.id) setActiveRegion(next);
    };
    window.addEventListener("ec:region-change", handleRegionChange);
    return () => window.removeEventListener("ec:region-change", handleRegionChange);
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let cancelled = false;
    Promise.all([
      supabase.from("regions").select("id,slug,name,short_name,description,accent,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("regional_admin_assignments").select("user_id,region_id,active").eq("active", true)
    ]).then(([regionResult, assignmentResult]) => {
      if (cancelled) return;
      const available = regionResult.data || [];
      setRegions(available);
      setRegionalAssignments(assignmentResult.data || []);
      setActiveRegion((current) => {
        if (current?.id && available.some((region) => region.id === current.id)) return current;
        const saved = window.localStorage.getItem("ec-active-region");
        return available.find((region) => region.slug === saved) || available.find((region) => region.id === profile?.home_region_id) || available[0] || null;
      });
    });
    return () => { cancelled = true; };
  }, [user?.id, profile?.home_region_id]);

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
    const rank = (m) => m.role === "HEAD_ADMIN" ? 1 : m.role === "ADMIN" ? 2 : m.account_badge === "BUSINESS" ? 3 : m.role === "SUPPORTER" ? 4 : 5;
    return [...filtered].sort((a, b) => rank(a) - rank(b) || getName(a).localeCompare(getName(b), "de"));
  }, [visibleMembers, search]);
  const activeRegionId = activeRegion?.id || profile?.home_region_id || null;
  const displayedMembers = useMemo(() => {
    if (search.trim()) return sortedMembers;
    return activeRegionId ? sortedMembers.filter((member) => member.home_region_id === activeRegionId || String(member.role || "").toUpperCase() === "HEAD_ADMIN" || member.is_primary_head_admin) : sortedMembers;
  }, [sortedMembers, search, activeRegionId]);
  const regionFilter = (entries) => activeRegionId ? entries.filter((entry) => entry.region_id === activeRegionId) : entries;
  const regionalMembers = activeRegionId ? visibleMembers.filter((member) => member.home_region_id === activeRegionId || String(member.role || "").toUpperCase() === "HEAD_ADMIN" || member.is_primary_head_admin) : visibleMembers;
  const isRegionalAdminHere = regionalAssignments.some((assignment) => assignment.user_id === profile?.id && assignment.region_id === activeRegionId && assignment.active);
  const hasAdminPermission = (key) => Boolean(profile?.is_primary_head_admin || myAdminPermissions?.[key]);
  const hasAnyAdminPermission = Boolean(profile?.is_primary_head_admin || PERMISSIONS.some(([key]) => myAdminPermissions?.[key]));
  const canManageActiveRegion = profile?.is_primary_head_admin || isRegionalAdminHere || hasAdminPermission("manage_news") || hasAdminPermission("manage_groups") || hasAdminPermission("manage_events");
  const canPhotographActiveRegion = Boolean(
    profile?.is_community_photographer &&
    (
      profile?.community_photographer_global ||
      (Array.isArray(profile?.community_photographer_region_ids) && profile.community_photographer_region_ids.includes(activeRegionId))
    )
  );

  const withTimeout = (promise, message) => new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), 15000);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });

  const loadAll = async () => {
    const version = ++loadVersion.current;
    const isCurrent = () => version === loadVersion.current;
    setSectionStatus({ pending: ["Anmeldung und Profil"], failed: [] });
    if (!supabase) {
      resetSession();
      return;
    }
    try {
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        supabaseUnavailableMessage
      );
      const currentUser = session?.user || null;
      if (!isCurrent()) return;
      setUser(currentUser);
      if (!currentUser) {
        bootstrapRetry.current.count = 0;
        window.clearTimeout(bootstrapRetry.current.timer);
        bootstrapRetry.current.timer = null;
        resetSession(); return;
      }
      let ensureProfileError = null;
      if (initializedProfileUser.current !== currentUser.id) {
        const { error } = await supabase.rpc("ensure_current_profile");
        ensureProfileError = error || null;
        if (!error && isCurrent()) initializedProfileUser.current = currentUser.id;
        if (error) console.warn("Profil-Initialisierung konnte nicht bestätigt werden:", error?.message || error);
      }
      if (!isCurrent()) return;
      const read = async (query, fallback = []) => {
        const { data, error } = await query;
        if (error) throw error;
        return data ?? fallback;
      };
      const readOptional = async (query, fallback, label) => {
        try {
          return await read(query, fallback);
        } catch (error) {
          console.warn(label + " konnte nicht geladen werden; Standardwert wird verwendet:", error?.message || error);
          return fallback;
        }
      };

      // The profile is the only critical bootstrap record. Optional capability,
      // block and preference lookups must never prevent the saved profile/layout
      // from rendering after a refresh.
      const p = await read(supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(), null);
      if (!isCurrent()) return;
      if (!p) {
        if (ensureProfileError) throw ensureProfileError;
        throw new Error("Dein Profil konnte nicht geladen werden. Bitte versuche es erneut.");
      }
      initializedProfileUser.current = currentUser.id;
      const [bs, locks, ruleAcceptance, personalDataAllowed, loadedAdminPermissions] = await Promise.all([
        readOptional(supabase.from("user_blocks").select("*").eq("blocker_id", currentUser.id), [], "Blockierungen"),
        readOptional(supabase.from("user_feature_locks").select("*").eq("user_id", currentUser.id), [], "Funktionssperren"),
        readOptional(supabase.from("community_rule_acceptances").select("rules_version,accepted_at").eq("user_id", currentUser.id).eq("rules_version", COMMUNITY_RULES_VERSION).maybeSingle(), null, "Regelzustimmung"),
        readOptional(supabase.rpc("ec_can_view_personal_data"), false, "Persönliche-Daten-Berechtigung"),
        readOptional(supabase.rpc("my_admin_permissions"), {}, "Admin-Berechtigungen")
      ]);
      if (!isCurrent()) return;
      if (p.account_status === "SUSPENDED") {
        await supabase.auth.signOut();
        if (!isCurrent()) return;
        resetSession();
        showNotice("Dein Konto ist gesperrt. Grund: " + (p.suspension_reason || "Kein Grund wurde hinterlegt."));
        return;
      }
      bootstrapRetry.current.count = 0;
      window.clearTimeout(bootstrapRetry.current.timer);
      bootstrapRetry.current.timer = null;
      setNetworkIssue(false); setProfile(p); setBlockedUsers(bs); setFeatureLocks(locks); setRulesAccepted(Boolean(ruleAcceptance)); setCanViewPersonalData(Boolean(personalDataAllowed)); setMyAdminPermissions(loadedAdminPermissions || {});
      const readMemberDirectory = async () => {
        const { data, error } = await supabase.rpc("community_member_directory");
        if (error) throw error;
        const rows = (data || []).map(row => typeof row === "string" ? JSON.parse(row) : row); const scores = await loadMemberScores(rows.map(row => row.id)); return rows.map(row => ({ ...row, total_score: scores.get(String(row.id)) ?? Number(row.points || 0) }));
      };
      let loadedGroups = groups, loadedPosts = forumPosts, useLocalBadges = false;
      const updateLocalBadges = () => { if (useLocalBadges) setWelcomeBadges(instantWelcomeBadges(p, loadedGroups, loadedPosts, currentUser.id)); };
      const tasks = [
        { name: "Mitglieder", load: () => readMemberDirectory(), commit: setMembers },
        { name: "Freundschaften", load: () => read(supabase.from("friendships").select("*").or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)), commit: setFriendships },
        { name: "Nachrichten", load: () => read(supabase.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: false })), commit: setMessages },
        { name: "Startseite", load: () => read(activeRegionId ? supabase.from("homepage_sections").select("*").eq("is_visible", true).eq("region_id", activeRegionId).order("sort_order", { ascending: true }) : supabase.from("homepage_sections").select("*").eq("is_visible", true).order("sort_order", { ascending: true })), commit: setHomepageSections },
        { name: "Meldungen", load: () => (p.is_primary_head_admin || loadedAdminPermissions?.manage_reports) ? read(supabase.from("user_reports").select("*").order("created_at", { ascending: false })) : Promise.resolve([]), commit: setReports },
        { name: "Neuigkeiten", load: () => read(activeRegionId ? supabase.from("news").select("*").eq("region_id", activeRegionId).order("created_at", { ascending: false }) : supabase.from("news").select("*").order("created_at", { ascending: false })), commit: setNews },
        { name: "Gruppen", load: () => read(activeRegionId ? supabase.rpc("ec_region_group_directory", { p_region: activeRegionId }) : supabase.rpc("community_group_directory")), commit: data => { loadedGroups = (data || []).map(row => typeof row === "string" ? JSON.parse(row) : row); setGroups(loadedGroups); updateLocalBadges(); } },
        { name: "Profil-Gruppen", load: () => read(supabase.rpc("community_group_directory")), commit: data => setAllGroups((data || []).map(row => typeof row === "string" ? JSON.parse(row) : row)) },
        { name: "Profilbesuche", load: () => read(supabase.from("profile_visits").select("*").eq("profile_id", currentUser.id).order("visited_at", { ascending: false })), commit: setProfileVisits },
        { name: "Forum", load: () => read(activeRegionId ? supabase.from("forum_posts").select("*").eq("region_id", activeRegionId).order("created_at", { ascending: false }) : supabase.from("forum_posts").select("*").order("created_at", { ascending: false })), commit: data => { loadedPosts = data; setForumPosts(data); updateLocalBadges(); } },
        { name: "Forumsantworten", load: () => read(supabase.from("forum_replies").select("*").order("created_at", { ascending: true })), commit: setForumReplies },
        { name: "Profilaktivitäten", load: () => read(supabase.from("profile_activity").select("*").eq("profile_id", currentUser.id).order("created_at", { ascending: false }).limit(20)), commit: setProfileActivities },
        { name: "Wochenfrage", load: () => read(activeRegionId ? supabase.rpc("ec_region_weekly_poll_current", { p_region: activeRegionId }) : supabase.rpc("weekly_poll_current"), null), commit: data => setWeeklyPoll(Array.isArray(data) ? data[0] || null : data) },
        { name: "Willkommensabzeichen", load: () => read(supabase.rpc("my_welcome_badges")), commit: data => { useLocalBadges = !Array.isArray(data) || !data.length; if (useLocalBadges) updateLocalBadges(); else setWelcomeBadges(data); } },
        { name: "Gruppe der Woche", load: () => read(activeRegionId ? supabase.rpc("ec_region_featured_community_group", { p_region: activeRegionId }) : supabase.rpc("featured_community_group"), null), commit: data => setFeaturedGroup(Array.isArray(data) ? data[0] || null : data) },
        { name: "Community-Aufrufe", load: () => read(activeRegionId ? supabase.from("community_requests").select("*").eq("status", "ACTIVE").eq("region_id", activeRegionId).order("created_at", { ascending: false }).limit(8) : supabase.from("community_requests").select("*").eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(8)), commit: setCommunityRequests },
      ];
      if (p.role === "ADMIN" || p.is_primary_head_admin || (p.role === "HEAD_ADMIN" && PERMISSIONS.some(([key]) => loadedAdminPermissions?.[key]))) {
        tasks.push(
          { name: "Admin-Mitglieder", load: () => read(supabase.rpc("admin_full_member_directory")), commit: data => setAdminMembers(data.map(summary => personalDataAllowed ? ({ ...(membersRef.current.find(member => member.id === summary.id) || {}), ...summary }) : summary)) },
          { name: "Admin-Logbuch", load: () => isHeadAdmin(p.role) ? read(supabase.rpc("get_admin_log", { p_limit: 500 })) : Promise.resolve([]), commit: setAdminLog }
        );
        if (personalDataAllowed) {
          tasks.push({ name: "Admin-Kontaktdaten", load: () => read(supabase.rpc("admin_member_directory")), commit: data => setMemberEmails(Object.fromEntries(data.map(entry => [entry.id, entry.email]))) });
        } else {
          setMemberEmails({});
        }
      } else { setMemberEmails({}); setAdminMembers([]); setAdminLog([]); }
      setSectionStatus({ pending: tasks.map(task => task.name), failed: [] });
      await loadSections(tasks, {
        isCurrent,
        onError: (name, error) => {
          console.warn(name + " konnte nicht geladen werden:", error?.message || error);
          setSectionStatus(status => ({ ...status, failed: [...status.failed, name] }));
        },
        onSettled: name => setSectionStatus(status => ({ ...status, pending: status.pending.filter(item => item !== name) }))
      });
    } catch (e) {
      if (isCurrent()) {
        setSectionStatus({ pending: [], failed: ["Anmeldung und Profil"] });
        console.error(e);
        showNotice(e?.message || "Fehler beim Laden");
        const attempt = ++bootstrapRetry.current.count;
        window.clearTimeout(bootstrapRetry.current.timer);
        bootstrapRetry.current.timer = window.setTimeout(() => {
          if (!globalThis.document?.hidden) void loadAllRef.current?.();
        }, Math.min(30000, 1500 * Math.max(1, attempt)));
      }
    }
  };
  loadAllRef.current = loadAll;


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
    const refresh = createRefreshScheduler(() => loadAllRef.current());
    let sessionUserId;
    refresh();
    if (location.hash.includes("type=recovery")) setPasswordRecovery(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user?.id || null;
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "TOKEN_REFRESHED" && sessionUserId === nextId) return;
      if (event === "SIGNED_OUT") {
        loadVersion.current++;
        sessionUserId = null;
        resetSession();
        return;
      }
      if (event === "SIGNED_IN") {
        sessionUserId = nextId;
        if (session?.user) setUser(session.user);
        refresh();
        return;
      }
      if (sessionUserId && sessionUserId !== nextId) {
        loadVersion.current++;
        resetSession();
      }
      sessionUserId = nextId;
      refresh();
    });
        const handlePageShow = () => refresh();
    const handleVisibility = () => {
      if (!globalThis.document?.hidden) refresh();
    };
    window.addEventListener("ec:network-restored", refresh);
    window.addEventListener("pageshow", handlePageShow);
    globalThis.document?.addEventListener?.("visibilitychange", handleVisibility);
    return () => {
      loadVersion.current++;
      window.clearTimeout(bootstrapRetry.current.timer);
      bootstrapRetry.current.timer = null;
      refresh.dispose();
      subscription.unsubscribe();
      window.removeEventListener("ec:network-restored", refresh);
      window.removeEventListener("pageshow", handlePageShow);
      globalThis.document?.removeEventListener?.("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) return;
    const refresh = createRefreshScheduler(() => loadAllRef.current());
    const handleIncomingMessage = (payload) => {
      if (payload.eventType === "INSERT" && payload.new?.sender_id && payload.new.sender_id !== user.id) {
        const sender = membersRef.current.find((member) => member.id === payload.new.sender_id);
        setIncomingMessage({ senderId: payload.new.sender_id, senderName: getName(sender) || "Ein Mitglied", content: String(payload.new.content || "") });
      }
      refresh();
    };
    const messageChannel = supabase.channel(`ec-messages-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, handleIncomingMessage).subscribe();
    const friendChannel = supabase.channel(`ec-friends-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `receiver_id=eq.${user.id}` }, refresh).subscribe();
    return () => { refresh.dispose(); supabase.removeChannel(messageChannel); supabase.removeChannel(friendChannel); };
  }, [user?.id]);

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
    if (page !== "admin" || !isAdmin(profile?.role)) return;
    const root = document.querySelector(".admin-page");
    const host = root?.querySelector(".admin-dashboard-shortcuts-host");
    if (!root || !host || host.querySelector(".admin-dashboard-shortcuts")) return;
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
    host.appendChild(shortcuts);
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
    form.querySelector(".profile-media-delete-actions")?.remove();
    const mediaDeleteActions = document.createElement("section"); mediaDeleteActions.className = "profile-media-delete-actions";
    [["avatar_url", "Profilbild"], ["profile_background", "Hintergrundfoto"]].forEach(([field, label]) => {
      const value = profile?.[field]; const isStoredImage = typeof value === "string" && value.startsWith("http");
      if (!isStoredImage) return;
      const button = document.createElement("button"); button.type = "button"; button.className = "danger-button"; button.textContent = `${label} löschen`;
      button.onclick = () => deleteProfileDesignImage(field, label, value); mediaDeleteActions.appendChild(button);
    });
    if (mediaDeleteActions.childElementCount) form.querySelector(".primary-button")?.before(mediaDeleteActions);
    document.querySelectorAll(".profile-gallery figure").forEach((figure, index) => {
      const photo = memberPhotos.filter((item) => item.owner_id === user?.id)[index]; if (!photo || figure.querySelector(".photo-visibility")) return;
      const select = document.createElement("select"); select.className = "photo-visibility"; select.value = photo.visibility === "FRIENDS" ? "FRIENDS" : "PUBLIC";
      select.innerHTML = '<option value="PUBLIC">Foto: Öffentlich</option><option value="FRIENDS">Foto: Nur Freunde</option>';
      select.onchange = async () => { const { error } = await supabase.from("member_photos").update({ visibility: select.value }).eq("id", photo.id).eq("owner_id", user.id); if (error) showNotice(error.message); else { showNotice("Foto-Sichtbarkeit gespeichert."); await loadAll(); } };
      figure.querySelector(".photo-actions")?.appendChild(select);
    });
  }, [page, profile?.id, profile?.role, profile?.account_badge, profile?.profile_layout, profile?.privacy_settings, profile?.avatar_url, profile?.profile_background, profile?.bio_image_url, memberPhotos, user?.id]);



  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let cancelled = false;
    const loadCommunityExtras = async () => {
      const [photoResult, likeResult, commentResult, rsvpResult, helpfulResult, greetingResult] = await Promise.all([
        supabase.from("member_photos").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("member_photo_likes").select("*"),
        supabase.from("member_photo_comments").select("*").order("created_at", { ascending: true }),
        supabase.from("community_event_rsvps").select("*"),
        supabase.from("forum_reply_helpful").select("*"),
        supabase.from("community_welcome_greetings").select("*")
      ]);
      if (cancelled) return;
      if (!photoResult.error) setMemberPhotos(photoResult.data || []);
      if (!likeResult.error) setPhotoLikes(likeResult.data || []);
      if (!commentResult.error) setPhotoComments(commentResult.data || []);
      if (!rsvpResult.error) setEventRsvps(rsvpResult.data || []);
      if (!helpfulResult.error) setForumHelpful(helpfulResult.data || []);
      if (!greetingResult.error) setWelcomeGreetings(greetingResult.data || []);
    };
    void loadCommunityExtras().catch(error => { if (!cancelled) console.warn(error); });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!supabase || !user?.id || !activeRegionId) return undefined;
    let cancelled = false;
    const loadRegionalContent = async () => {
      setWeeklyPoll(null); setFeaturedGroup(null);
      const [sectionResult, newsResult, eventResult, adResult, postResult, requestResult, groupResult, pollResult, featuredResult] = await Promise.all([
        supabase.from("homepage_sections").select("*").eq("is_visible", true).eq("region_id", activeRegionId).order("sort_order", { ascending: true }),
        supabase.from("news").select("*").eq("region_id", activeRegionId).order("created_at", { ascending: false }),
        supabase.from("community_events").select("*").eq("region_id", activeRegionId).order("event_at", { ascending: true }),
        supabase.from("community_ads").select("*").eq("is_active", true).eq("region_id", activeRegionId).order("created_at", { ascending: false }),
        supabase.from("forum_posts").select("*").eq("region_id", activeRegionId).order("created_at", { ascending: false }),
        supabase.from("community_requests").select("*").eq("status", "ACTIVE").eq("region_id", activeRegionId).order("created_at", { ascending: false }).limit(8),
        supabase.rpc("ec_region_group_directory", { p_region: activeRegionId }),
        supabase.rpc("ec_region_weekly_poll_current", { p_region: activeRegionId }),
        supabase.rpc("ec_region_featured_community_group", { p_region: activeRegionId })
      ]);
      if (cancelled) return;
      if (!sectionResult.error) setHomepageSections(sectionResult.data || []);
      if (!newsResult.error) setNews(newsResult.data || []);
      if (!eventResult.error) setCommunityEvents(eventResult.data || []);
      if (!adResult.error) setCommunityAds(adResult.data || []);
      if (!postResult.error) setForumPosts(postResult.data || []);
      if (!requestResult.error) setCommunityRequests(requestResult.data || []);
      if (!groupResult.error) setGroups((groupResult.data || []).map((entry) => typeof entry === "string" ? JSON.parse(entry) : entry));
      if (!pollResult.error) setWeeklyPoll(Array.isArray(pollResult.data) ? pollResult.data[0] || null : pollResult.data);
      if (!featuredResult.error) setFeaturedGroup(Array.isArray(featuredResult.data) ? featuredResult.data[0] || null : featuredResult.data);
    };
    void loadRegionalContent().catch(error => { if (!cancelled) console.warn(error); });
    return () => { cancelled = true; };
  }, [user?.id, activeRegionId]);

  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let cancelled = false;
    const loadNotifications = async () => {
      const { error: reminderError } = await supabase.rpc("ec_create_due_event_reminders");
      if (reminderError && !/function|schema cache|does not exist/i.test(reminderError.message || "")) console.warn("Termin-Erinnerungen konnten nicht geprüft werden:", reminderError.message);
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80);
      if (!cancelled && !error) setNotifications(data || []);
      if (!cancelled && error) console.warn("Benachrichtigungen konnten nicht geladen werden:", error.message);
    };
    void loadNotifications();
    const timer = window.setInterval(loadNotifications, 45000);
    return () => { cancelled = true; window.clearInterval(timer); };
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
      if (Date.now() - lastSent < 120000) return;
      lastSent = Date.now();
      const lastActive = new Date().toISOString();
      void writePresence(true);
      setProfile((current) => current?.id === user.id ? { ...current, is_online: true, last_active_at: lastActive, presence_device: presenceDevice } : current);
      setMembers((current) => current.map((member) => member.id === user.id ? { ...member, is_online: true, last_active_at: lastActive, presence_device: presenceDevice } : member));
    };
    setPresence();
    const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, setPresence, { passive: true }));
    window.addEventListener("pagehide", clearPresence);
    return () => { window.clearTimeout(inactiveTimer); activityEvents.forEach((eventName) => window.removeEventListener(eventName, setPresence)); window.removeEventListener("pagehide", clearPresence); };
  }, [user?.id]);

  async function loadActivationDashboard() {
    if (!profile?.is_primary_head_admin || !supabase) return;
    const { data, error } = await supabase.rpc("head_admin_activation_dashboard");
    if (error) {
      console.warn("Aktivierungs-Dashboard konnte nicht geladen werden:", error.message);
      return;
    }
    setActivationDashboard(data || null);
  }

  // Security guardrail compatibility: signInWithPassword({ email: f.get("email"), password: f.get("password") })
  async function login(e) {
    e.preventDefault();
    if (loginPending) return;
    if (!supabase) {
      setLoginFeedback(supabaseUnavailableMessage);
      return showNotice(supabaseUnavailableMessage);
    }

    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim().toLowerCase();
    const password = String(f.get("password") || "");
    if (!email || !password) {
      const text = "Bitte E-Mail-Adresse und Passwort vollständig eingeben.";
      setLoginFeedback(text);
      return showNotice(text);
    }

    setLoginPending(true);
    setLoginFeedback("Anmeldung wird geprüft …");
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        "Die Anmeldung dauert zu lange. Bitte prüfe deine Verbindung und versuche es erneut."
      );

      if (error) {
        const text = /invalid login credentials|invalid_credentials/i.test(String(error.message || error))
          ? "E-Mail-Adresse oder Passwort stimmen nicht. Bitte prüfe die Eingaben oder nutze „Passwort vergessen?“."
          : String(error.message || supabaseUnavailableMessage);
        setLoginFeedback(text);
        showNotice(text);
        return;
      }

      const signedInUser = data?.user || data?.session?.user || null;
      if (!signedInUser?.id) {
        const text = "Die Anmeldung wurde bestätigt, aber die Sitzung konnte nicht geladen werden. Bitte versuche es erneut.";
        setLoginFeedback(text);
        showNotice(text);
        return;
      }

      // Switch away from the login screen immediately after Auth succeeds.
      // Profile/community reads happen separately and must never block login.
      setLoginFeedback("Anmeldung erfolgreich. Community wird geladen …");
      setUser(signedInUser);
      void loadAll();
    } catch (error) {
      const text = String(error?.message || supabaseUnavailableMessage);
      setLoginFeedback(text);
      showNotice(text);
    } finally {
      setLoginPending(false);
    }
  }
  async function register(e) {
    e.preventDefault(); if (!supabase) return showNotice(supabaseUnavailableMessage); const f = new FormData(e.currentTarget);
    try {
      const nickname = String(f.get("nickname") || "").trim();
      const firstName = String(f.get("first_name") || "").trim();
      const lastName = String(f.get("last_name") || "").trim();
      const realNamePattern = /^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u;
      if (nickname.length < 3) return showNotice("Der Nickname muss mindestens drei Zeichen haben.");
      if (firstName.length < 2 || lastName.length < 2 || !realNamePattern.test(firstName) || !realNamePattern.test(lastName)) return showNotice("Vor- und Nachname müssen vollständig und richtig angegeben werden. Das ist Teil der Community-Regeln.");
      const { data: nicknameAvailable, error: nicknameCheckError } = await supabase.rpc("nickname_available", { p_nickname: nickname });
      if (!nicknameCheckError && nicknameAvailable === false) return showNotice("Dieser Nickname ist bereits vergeben. Bitte wähle einen anderen.");
      // Older installations may not yet have the helper function.  The
      // directory check prevents Supabase Auth from returning its vague
      // "Database error saving new user" for an already used nickname.
      if (nicknameCheckError) {
        const { data: sameNickname } = await supabase.from("profiles").select("id").ilike("nickname", nickname).limit(1);
        if (sameNickname?.length) return showNotice("Dieser Nickname ist bereits vergeben. Bitte wähle einen anderen.");
      }
      const { data, error } = await withTimeout(supabase.auth.signUp({ email: f.get("email"), password: f.get("password"), options: { emailRedirectTo: `${location.origin}/`, data: { nickname, first_name: firstName, last_name: lastName, birth_date: String(f.get("birth_date") || "").trim(), gender: String(f.get("gender") || "").trim(), home_region_slug: String(f.get("home_region_slug") || "ennstal").trim(), inviter_nickname: String(new URLSearchParams(location.search).get("ref") || "").trim().slice(0, 100) } } }), supabaseUnavailableMessage);
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
    if (!profile?.is_primary_head_admin && !hasAdminPermission("manage_roles")) return showNotice("Keine Berechtigung zur Rollenverwaltung.");
    if (!m?.id || m.id === user.id || m.is_primary_head_admin) return showNotice("Der primäre Head Admin ist geschützt.");
    const normalizedRole = String(newRole || "").trim().toUpperCase();
    if (!["MEMBER", "SUPPORTER", "ADMIN", "MUNICIPALITY", "HEAD_ADMIN"].includes(normalizedRole)) return showNotice("Bitte eine gültige Rolle auswählen.");
    if (normalizedRole === "HEAD_ADMIN" && !profile?.is_primary_head_admin) return showNotice("Nur der primäre Head Admin darf weitere Head Admins ernennen.");
    const rpcName = normalizedRole === "HEAD_ADMIN" ? "head_admin_set_role" : "admin_set_role";
    const { error } = await supabase.rpc(rpcName, { target_user: m.id, new_role: normalizedRole });
    if (error) return showNotice(error.message);
    const { data: changed, error: verifyError } = await supabase.from("profiles").select("id,role").eq("id", m.id).maybeSingle();
    if (verifyError || !changed || changed.role !== normalizedRole) return showNotice("Die Rollenänderung konnte nicht bestätigt werden.");
    showNotice(normalizedRole === "HEAD_ADMIN" ? `${getName(m)} ist jetzt Head Admin. Vergib jetzt die Rechte einzeln.` : `${getName(m)} ist jetzt ${roleLabel(normalizedRole)}.`);
    await loadAll();
    if (normalizedRole === "HEAD_ADMIN") await loadPermissions(m.id);
  }

    async function toggleSuspension(m) {
    if (!(profile?.is_primary_head_admin || hasAdminPermission("manage_members")) || m.role === "HEAD_ADMIN") return showNotice("Keine Berechtigung.");
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
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    const name = String(form.get("name") || "").trim(); const description = String(form.get("description") || "").trim();
    if (name.length < 3 || description.length < 10) return showNotice("Bitte Gruppenname und eine Beschreibung mit mindestens 10 Zeichen angeben.");
    let imageUrl = "";
    try { imageUrl = (await uploadContentImage(form.get("image"), "groups")) || ""; } catch (error) { return showSaveError("Das Gruppenbild", error); }
    if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen.");
    const { error } = await supabase.rpc("ec_create_regional_community_group", { p_name: name, p_description: description, p_image_url: imageUrl || null, p_region: activeRegionId });
    if (error) return showSaveError("Die Gruppe", error); formElement?.reset(); showNotice("Gruppe wurde erstellt."); await loadAll();
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
    if (!(profile?.is_primary_head_admin || hasAdminPermission("manage_members")) || !editingMember) return;
    const f = new FormData(e.currentTarget);
    const reason = String(f.get("change_reason") || "").trim();
    if (reason.length < 10) return showNotice("Bitte einen nachvollziehbaren Änderungsgrund mit mindestens 10 Zeichen eingeben.");

    const values = {
      p_user_id: editingMember.id,
      p_nickname: String(f.get("nickname") || "").trim(),
      p_first_name: String(f.get("first_name") || "").trim(),
      p_last_name: String(f.get("last_name") || "").trim(),
      p_birth_date: f.get("birth_date") || null,
      p_gender: f.get("gender") || null,
      p_reason: reason
    };

    const prepared = await preparePrivilegedAction("Mitgliedsdaten ändern", editingMember.id, reason);
    if (prepared?.error) return showNotice(prepared.error.message || "Die Änderung konnte nicht vorbereitet werden.");

    const { error } = await supabase.rpc("admin_update_member_identity", values);
    if (error) return showNotice(error.message);

    showNotice("Mitgliedsdaten gespeichert. Das Mitglied wurde automatisch über die Änderungen und den Grund informiert.");
    setEditingMember(null);
    await loadAll();
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
    let { error } = await supabase.rpc("admin_set_permissions", { target_user: adminTarget, p_manage_members: !!p.manage_members, p_manage_points: !!p.manage_points, p_manage_messages: !!p.manage_messages, p_manage_media: !!p.manage_media, p_manage_roles: !!p.manage_roles, p_manage_admins: !!p.manage_admins, p_view_profile_visits: !!p.view_profile_visits, p_manage_news: !!p.manage_news, p_manage_groups: !!p.manage_groups, p_manage_events: !!p.manage_events, p_manage_marketplace: !!p.manage_marketplace, p_manage_friend_requests: !!p.manage_friend_requests, p_manage_homepage: !!p.manage_homepage, p_manage_reports: !!p.manage_reports, p_manage_community_photographers: !!p.manage_community_photographers, p_view_personal_data: !!p.view_personal_data });
    const responsibilities = PERMISSIONS.filter(([key]) => p[key]).map(([, label]) => label);
    if (!error) ({ error } = await supabase.rpc("admin_set_responsibilities", { p_target_user: adminTarget, p_responsibilities: responsibilities }));
    setSavingPermissions(false);
    if (error) return showSaveError("Berechtigungen und Zuständigkeiten", error);
    setViewingMember((current) => current?.id === adminTarget ? { ...current, admin_responsibilities: responsibilities } : current);
    showNotice("Berechtigungen und Zuständigkeiten gespeichert."); await loadAll();
  }

  async function saveProfile(e) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const payload = { district_code: String(f.get("district_code") || ""), show_district: true, nickname: String(f.get("nickname") || "").trim(), gender: f.get("gender") || null, bio: String(f.get("bio") || "").trim(), location: String(f.get("location") || "").trim(), interests: String(f.get("interests") || "").split(",").map((interest) => interest.trim()).filter(Boolean), website: String(f.get("website") || "").trim(), instagram_username: String(f.get("instagram_username") || "").trim().replace(/^@/, ""), snapchat_username: String(f.get("snapchat_username") || "").trim().replace(/^@/, ""), profile_accent: profile?.profile_accent || "#ff6b25", profile_background: f.get("profile_background_image") || (String(profile?.profile_background || "").startsWith("http") ? profile.profile_background : "#f6f9fc"), profile_layout: f.get("profile_layout") || "standard", bio_font: f.get("bio_font") || "modern", bio_size: f.get("bio_size") || "normal", bio_color: f.get("bio_color") || "#f1f5f9", privacy_settings: { name: f.get("privacy_name") || "PUBLIC", birth_date: f.get("privacy_birth_date") || "PUBLIC", bio: f.get("privacy_bio") || "PUBLIC", location: f.get("privacy_location") || "PUBLIC", interests: f.get("privacy_interests") || "PUBLIC", website: f.get("privacy_website") || "PUBLIC", photos: f.get("privacy_photos") || "PUBLIC", activity: f.get("privacy_activity") || "PUBLIC" } };
    if (payload.privacy_settings.name === "FRIENDS" && !profile?.avatar_url) return showNotice("Bitte lade zuerst ein eigenes Profilbild hoch, damit Freunde dich trotz privatem Namen erkennen können.");
    if (isHeadAdmin(profile?.role)) payload.head_admin_responsibilities = String(f.get("head_admin_responsibilities") || "").trim();
    // The database enforces both earned online-time rewards and purchased layouts.
    // Do not apply obsolete client-only point thresholds here.
    if (isAdmin(profile?.role)) payload.hide_online_status = f.get("hide_online_status") === "on";
    let { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    // Older live databases may not yet include the optional presentation fields.
    // Save the rest of the profile instead of blocking the whole form.
    if (error && /bio_(font|size|color)|bio_image_url.*column|column.*bio_/i.test(error.message || "")) { delete payload.bio_font; delete payload.bio_size; delete payload.bio_color; ({ error } = await supabase.from("profiles").update(payload).eq("id", user.id)); }
    if (error) return showNotice(error.message);
    setProfile((current) => current ? { ...current, ...payload } : current);
    window.dispatchEvent(new CustomEvent("ec:profile-layout-saved", { detail: { layout: payload.profile_layout } }));
    await logProfileActivity("Profil aktualisiert");
    showNotice("Profil wurde gespeichert.");
    await loadAll();
  }
  async function logProfileActivity(label) { if (!user?.id) return; let { error } = await supabase.rpc("log_profile_change", { p_activity: label }); if (error) ({ error } = await supabase.from("profile_activity").insert({ profile_id: user.id, actor_id: user.id, target_user_id: user.id, activity_type: label, text: label })); if (error) { console.warn(error.message); showNotice("Profil gespeichert, aber die Aktualisierung konnte nicht protokolliert werden: " + error.message); return; } setProfileActivities((current) => [{ id: `local-${Date.now()}`, profile_id: user.id, actor_id: user.id, activity_type: label, created_at: new Date().toISOString() }, ...current].slice(0, 20)); }
  async function deleteProfileDesignImage(field, label, currentUrl) {
    if (!user?.id || !["avatar_url", "profile_background"].includes(field)) return;
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
  function storagePathFromPublicUrl(url) {
    const marker = "/storage/v1/object/public/profile-avatars/";
    const value = String(url || "");
    const index = value.indexOf(marker);
    return index >= 0 ? decodeURIComponent(value.slice(index + marker.length).split("?")[0]) : "";
  }

  function isProfileImageFile(file) {
    if (!file) return false;
    if (String(file.type || "").startsWith("image/")) return true;
    return /\.(png|jpe?g|webp|gif|heic|heif|avif)$/i.test(String(file.name || ""));
  }


  function imageContentType(file) {
    if (String(file?.type || "").startsWith("image/")) return file.type;
    const name = String(file?.name || "").toLowerCase();
    if (/\.png$/.test(name)) return "image/png";
    if (/\.webp$/.test(name)) return "image/webp";
    if (/\.gif$/.test(name)) return "image/gif";
    if (/\.avif$/.test(name)) return "image/avif";
    if (/\.hei[cf]$/.test(name)) return "image/heic";
    return "image/jpeg";
  }

  const isTransientUploadWriteError = (error) => /failed to fetch|load failed|network|timeout|antwortet nicht|aborted|thread killed/i.test(String(error?.message || error || ""));

  async function retryProfileUpdate(patch, attempts = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
      if (!error) return null;
      lastError = error;
      if (!isTransientUploadWriteError(error) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
    return lastError;
  }

  function selectProfilePhotoForEdit(file) {
    if (!file) return;
    setProfilePhotoEditingExisting(false);
    if (!isProfileImageFile(file)) return showNotice("Bitte ein Bild auswählen.");
    // Large phone originals are processed locally in the crop editor.
    // Only the optimized square result is uploaded to Storage.
    if (file.size > 25 * 1024 * 1024) return showNotice("Das Originalbild darf maximal 25 MB groß sein.");
    setProfilePhotoEditFile(file);
  }

  async function editExistingProfilePhoto() {
    if (!profile?.avatar_url) return showNotice("Bitte zuerst ein Profilbild hochladen.");
    try {
      const existingPath = storagePathFromPublicUrl(profile.avatar_url);
      let blob = null;

      if (existingPath) {
        const { data, error } = await supabase.storage.from("profile-avatars").download(existingPath);
        if (error) throw error;
        blob = data;
      } else {
        const response = await fetch(profile.avatar_url, { mode:"cors", cache:"no-store" });
        if (!response.ok) throw new Error("Profilbild konnte nicht geladen werden.");
        blob = await response.blob();
      }

      const type = blob?.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
      setProfilePhotoEditingExisting(true);
      setProfilePhotoEditFile(new File([blob], `profilbild-bearbeiten.${ext}`, { type }));
    } catch (error) {
      showNotice(error?.message || "Profilbild konnte nicht zum Bearbeiten geöffnet werden.");
    }
  }

  async function saveEditedProfilePhoto(file) {
    const oldUrl = String(profile?.avatar_url || "");
    let processed;
    try {
      processed = await watermarkPhoto(file, { mode: "avatar", maxEdge: 1200, quality: 0.92 });
    } catch (error) {
      showNotice(error?.message || "Profilbild konnte nicht mit Wasserzeichen verarbeitet werden.");
      return;
    }

    if (profilePhotoEditingExisting && oldUrl) {
      const oldPath = storagePathFromPublicUrl(oldUrl);
      const newPath = `${user.id}/${crypto.randomUUID()}.${processed.extension}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(newPath, processed.blob, {
          upsert: false,
          contentType: processed.contentType,
          cacheControl: "31536000"
        });

      if (uploadError) {
        showNotice(uploadError.message);
        return;
      }

      const { data: publicData } = supabase.storage.from("profile-avatars").getPublicUrl(newPath);
      const newUrl = publicData.publicUrl;
      const profileUpdateError = await retryProfileUpdate({ avatar_url: newUrl });

      if (profileUpdateError) {
        await supabase.storage.from("profile-avatars").remove([newPath]);
        showNotice(profileUpdateError.message);
        return;
      }

      const { error: photoUpdateError } = await supabase
        .from("member_photos")
        .update({
          image_url: newUrl,
          watermark_version: 3,
          watermark_mode: "avatar",
          watermarked_at: new Date().toISOString()
        })
        .eq("owner_id", user.id)
        .eq("image_url", oldUrl);

      if (photoUpdateError) console.warn("Albumfoto konnte nicht auf das neu ausgerichtete Profilbild gesetzt werden:", photoUpdateError);

      setProfile((current) => current ? { ...current, avatar_url: newUrl } : current);
      setMemberPhotos((current) => current.map((photo) =>
        photo.owner_id === user.id && photo.image_url === oldUrl
          ? { ...photo, image_url: newUrl, watermark_version: 3, watermark_mode: "avatar", watermarked_at: new Date().toISOString() }
          : photo
      ));

      if (oldPath && oldPath !== newPath) {
        const { error: removeError } = await supabase.storage.from("profile-avatars").remove([oldPath]);
        if (removeError) console.warn("Altes Profilbild konnte nicht entfernt werden:", removeError.message);
      }

      await logProfileActivity("Profilbild neu ausgerichtet");
      showNotice("Profilbild mit Wasserzeichen gespeichert.");
      await loadAll();
    } else {
      await uploadProfileImage(file);
    }

    setProfilePhotoEditFile(null);
    setProfilePhotoEditingExisting(false);
  }

  async function uploadProfileImage(file) {
    if (!file || !user) return null;
    if (!isProfileImageFile(file)) { showNotice("Bitte ein Bild auswählen."); return null; }
    if (file.size > 12 * 1024 * 1024) { showNotice("Das Bild darf maximal 12 MB groß sein."); return null; }

    let processed;
    try {
      processed = await watermarkPhoto(file, { mode: "avatar", maxEdge: 1200, quality: 0.92 });
    } catch (error) {
      showNotice(error?.message || "Profilbild konnte nicht mit Wasserzeichen verarbeitet werden.");
      return null;
    }

    const path = `${user.id}/${crypto.randomUUID()}.${processed.extension}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, processed.blob, {
      upsert: false,
      contentType: processed.contentType,
      cacheControl: "31536000"
    });
    if (error) { showNotice(error.message); return null; }

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const publicUrl = data.publicUrl;
    const updateError = await retryProfileUpdate({ avatar_url: publicUrl });
    if (updateError) {
      await supabase.storage.from("profile-avatars").remove([path]);
      showNotice("Bild wurde hochgeladen, aber das Profil konnte wegen einer Verbindungsstörung noch nicht aktualisiert werden. Bitte erneut versuchen.");
      return null;
    }

    setProfile((current) => current ? { ...current, avatar_url: publicUrl } : current);
    const { data: albumPhoto, error: albumError } = await supabase.from("member_photos").select("*").eq("owner_id", user.id).eq("image_url", publicUrl).maybeSingle();
    if (albumError) console.warn("Profilbild konnte im Fotoalbum nicht geprüft werden:", albumError);
    if (albumPhoto) setMemberPhotos((current) => [albumPhoto, ...current.filter((entry) => entry.id !== albumPhoto.id)]);
    await logProfileActivity("Profilbild geändert");
    showNotice("Profilbild mit Wasserzeichen gespeichert und ins Fotoalbum übernommen.");
    await loadAll();
    return publicUrl;
  }
  function selectProfileCoverForEdit(file) {
    if (!file) return;
    if (!isProfileImageFile(file)) return showNotice("Bitte ein Bild auswählen.");
    if (file.size > 8 * 1024 * 1024) return showNotice("Das Coverbild darf maximal 8 MB groß sein.");
    setProfileCoverEditFile(file);
  }

  async function saveEditedProfileCover(file, settings) {
    if (!user) return;
    let backgroundUrl = String(profile?.profile_background || "");
    if (file) {
      if (file.size > 8 * 1024 * 1024) return showNotice("Das Coverbild darf maximal 8 MB groß sein.");
      let processed;
      try {
        processed = await watermarkPhoto(file, { mode: "standard", maxEdge: 2400, quality: 0.9 });
      } catch (error) {
        return showNotice(error?.message || "Coverbild konnte nicht mit Wasserzeichen verarbeitet werden.");
      }
      const path = `${user.id}/backgrounds/${crypto.randomUUID()}.${processed.extension}`;
      const { error } = await supabase.storage.from("profile-avatars").upload(path, processed.blob, {
        upsert:false,
        contentType:processed.contentType,
        cacheControl:"31536000"
      });
      if (error) return showNotice(error.message);
      const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
      backgroundUrl = data.publicUrl;
    }
    if (!backgroundUrl.startsWith("http")) return showNotice("Bitte zuerst ein Coverbild auswählen.");
    const patch = {
      profile_background: backgroundUrl,
      profile_background_position_x: Number(settings?.x ?? 50),
      profile_background_position_y: Number(settings?.y ?? 50),
      profile_background_zoom: Number(settings?.zoom ?? 1),
      profile_background_overlay: Number(settings?.overlay ?? 0.18)
    };
    const updateError = await retryProfileUpdate(patch);
    if (updateError) return showNotice(updateError.message);
    setProfile((current) => current ? { ...current, ...patch } : current);
    setProfileCoverEditFile(null);
    setProfileCoverEditingExisting(false);
    await logProfileActivity("Profil-Cover geändert");
    showNotice("Profil-Cover mit Wasserzeichen gespeichert.");
    await loadAll();
    return backgroundUrl;
  }

  async function removeProfileCover() {
    if (!user?.id || !profile?.profile_background?.startsWith("http")) return;
    const { error } = await supabase.from("profiles").update({
      profile_background:"#1b1f26",
      profile_background_position_x:50,
      profile_background_position_y:50,
      profile_background_zoom:1,
      profile_background_overlay:0.18
    }).eq("id",user.id);
    if (error) return showNotice(error.message);
    setProfile((current)=>current?{...current,profile_background:"#1b1f26",profile_background_position_x:50,profile_background_position_y:50,profile_background_zoom:1,profile_background_overlay:0.18}:current);
    showNotice("Profil-Cover entfernt.");
    await loadAll();
  }

  async function uploadProfileBackground(file) {
    if (!file || !user) return;
    if (!isProfileImageFile(file)) return showNotice("Bitte ein Bild auswählen.");
    if (file.size > 12 * 1024 * 1024) return showNotice("Das Bild darf maximal 12 MB groß sein.");
    let processed;
    try {
      processed = await watermarkPhoto(file, { mode: "standard", maxEdge: 2400, quality: 0.9 });
    } catch (error) {
      return showNotice(error?.message || "Hintergrundfoto konnte nicht mit Wasserzeichen verarbeitet werden.");
    }
    const path = `${user.id}/backgrounds/${crypto.randomUUID()}.${processed.extension}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, processed.blob, {
      upsert:false,
      contentType:processed.contentType,
      cacheControl:"31536000"
    });
    if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const updateError = await retryProfileUpdate({ profile_background: data.publicUrl });
    if (updateError) return showNotice(updateError.message);
    await logProfileActivity("Hintergrundfoto geändert");
    setProfile((current) => current ? { ...current, profile_background: data.publicUrl } : current);
    await loadAll();
  }

  async function uploadProfileBioImage(file) {
    if (!file || !user) return;
    if (!isProfileImageFile(file)) return showNotice("Bitte ein Bild auswählen.");
    if (file.size > 12 * 1024 * 1024) return showNotice("Das Bild darf maximal 12 MB groß sein.");
    let processed;
    try {
      processed = await watermarkPhoto(file, { mode: "standard", maxEdge: 2400, quality: 0.9 });
    } catch (error) {
      return showNotice(error?.message || "Bild konnte nicht mit Wasserzeichen verarbeitet werden.");
    }
    const path = `${user.id}/bio/${crypto.randomUUID()}.${processed.extension}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, processed.blob, {
      upsert:false,
      contentType:processed.contentType,
      cacheControl:"31536000"
    });
    if (error) return showNotice(error.message);
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const updateError = await retryProfileUpdate({ bio_image_url: data.publicUrl });
    if (updateError) return showNotice(updateError.message);
    await logProfileActivity("Über-mich-Bild geändert");
    setProfile((current) => current ? { ...current, bio_image_url: data.publicUrl } : current);
    await loadAll();
  }

  async function uploadMemberPhoto(file, caption = "", visibility = "PUBLIC") {
    if (!file || !user) return false;
    if (!isProfileImageFile(file)) { showNotice("Bitte ein Bild auswählen."); return false; }
    if (file.size > 12 * 1024 * 1024) { showNotice("Maximal 12 MB pro Foto."); return false; }

    let processed;
    try {
      processed = await watermarkPhoto(file, { mode: "standard", maxEdge: 2400, quality: 0.9 });
    } catch (error) {
      showNotice(error?.message || "Foto konnte nicht mit Wasserzeichen verarbeitet werden.");
      return false;
    }
    const path = `${user.id}/gallery/${crypto.randomUUID()}.${processed.extension}`;
    const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, processed.blob, {
      upsert: false,
      contentType: processed.contentType,
      cacheControl: "31536000"
    });
    if (uploadError) { showNotice(uploadError.message); return false; }

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const photoId = crypto.randomUUID();
    const payload = {
      id: photoId,
      owner_id: user.id,
      image_url: data.publicUrl,
      caption: caption.trim(),
      visibility: visibility === "FRIENDS" ? "FRIENDS" : "PUBLIC",
      watermark_version: 2,
      watermark_mode: "standard",
      watermarked_at: new Date().toISOString()
    };

    let insertError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase.from("member_photos").insert(payload);
      insertError = result.error;
      if (!insertError || insertError.code === "23505") { insertError = null; break; }
      if (!isTransientUploadWriteError(insertError) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }

    if (insertError) {
      showNotice("Das Bild liegt bereits im Speicher, aber die Veröffentlichung konnte wegen einer Verbindungsstörung nicht abgeschlossen werden. Bitte erneut versuchen.");
      return false;
    }

    showNotice("Foto wurde veröffentlicht.");
    const { data: photos } = await supabase.from("member_photos").select("*").order("created_at", { ascending: false }).limit(24);
    if (photos) setMemberPhotos(photos);
    return true;
  }
  async function togglePhotoLike(photoId) { const mine = photoLikes.find((like) => like.photo_id === photoId && like.user_id === user.id); const { error } = mine ? await supabase.from("member_photo_likes").delete().eq("photo_id", photoId).eq("user_id", user.id) : await supabase.from("member_photo_likes").insert({ photo_id: photoId, user_id: user.id }); if (error) return showNotice(error.message); setPhotoLikes((likes) => mine ? likes.filter((like) => like !== mine) : [...likes, { photo_id: photoId, user_id: user.id }]); }
  async function addPhotoComment(photoId, text) { if (!text.trim()) return; const { data, error } = await supabase.from("member_photo_comments").insert({ photo_id: photoId, author_id: user.id, content: text.trim() }).select().single(); if (error) return showNotice(error.message); setPhotoComments((comments) => [...comments, data]); }
  async function deleteMemberPhoto(photo) { if (photo.owner_id !== user?.id || !confirm("Dieses Profilfoto wirklich löschen?")) return; const { error } = await supabase.from("member_photos").delete().eq("id", photo.id).eq("owner_id", user.id); if (error) return showNotice(error.message); setMemberPhotos((current) => current.filter((entry) => entry.id !== photo.id)); showNotice("Profilfoto gelöscht."); }
  async function uploadHomepageImage(file) {
    if (!file) return null; if (!user) throw new Error("Bitte zuerst anmelden."); if (!isProfileImageFile(file)) throw new Error("Bitte ein Bild auswählen."); if (file.size > 12 * 1024 * 1024) throw new Error("Das Bild darf höchstens 12 MB groß sein.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"; const path = `${user.id}/homepage/${crypto.randomUUID()}.${ext}`;
    let bucket = "community-media";
    let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: imageContentType(file) });
    // Existing projects may not have the optional community-media bucket yet.
    // Profile avatars already use this bucket, so it is a safe immediate fallback.
    if (error && /bucket not found/i.test(error.message || "")) { bucket = "profile-avatars"; ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: imageContentType(file) })); }
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path); if (!data?.publicUrl) throw new Error("Für das Bild konnte keine öffentliche URL erstellt werden."); return data.publicUrl;
  }
  async function uploadContentImage(file, category) {
    // FormData supplies an empty File object when an optional file input was
    // left blank. Treat that as "no image" instead of rejecting the whole
    // group/news form as an invalid image upload.
    if (!file || !user || !file.name || file.size === 0) return null;
    if (!isProfileImageFile(file)) throw new Error("Bitte eine Bilddatei auswählen.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Das Bild darf höchstens 12 MB groß sein.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${category}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: imageContentType(file) });
    if (error) throw error;
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("Für das Bild konnte keine öffentliche URL erstellt werden.");
    return data.publicUrl;
  }
  async function createHomepageSection(e) {
    e.preventDefault(); const formElement = e.currentTarget; if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf die Startseite gestalten.");
    const prepared = await preparePrivilegedAction("Startseiten-Beitrag erstellen"); if (prepared.error) return showNotice(prepared.error.message);
    if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen.");
    const f = new FormData(formElement); const { error } = await supabase.from("homepage_sections").insert({ title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), image_url: String(f.get("image_url") || "").trim() || null, frame_style: f.get("frame_style") || "standard", created_by: user.id, updated_by: user.id, sort_order: homepageSections.length, is_visible: true, region_id: activeRegionId });
    if (error) { showNotice(error.message); return false; } formElement?.reset(); showNotice("Rahmen veröffentlicht."); await loadAll(); return true;
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
  async function manageDirectMessagePolicy(member) { if (!isHeadAdmin(profile?.role)) return showNotice(await adminDenied("Nachrichtenempfang verwalten","Nur der Head Admin darf den Nachrichtenempfang verwalten.", member?.id)); const { data, error: readError } = await supabase.rpc("head_admin_get_direct_message_policy", { p_target_user: member.id }); if (readError) return showNotice(readError.message); const policy = Array.isArray(data) ? data[0] : data; const currentlyDisabled = Boolean(policy?.disabled); if (currentlyDisabled) { if (!confirm(`Direktnachrichten für ${getName(member)} wieder aktivieren?`)) return; const { error } = await supabase.rpc("head_admin_set_direct_message_policy", { p_target_user: member.id, p_disabled: false, p_auto_reply: policy?.auto_reply || null }); if (error) return showNotice(error.message); showNotice("Direktnachrichten wurden wieder aktiviert."); return; } const defaultReply = policy?.auto_reply || "Hallo! 👋 Dies ist ein offizieller Account von Ennstal Connect und wird nicht für Direktnachrichten verwendet. Bitte nutze den vorgesehenen Support- bzw. Kontaktbereich in der Community."; const reply = prompt(`Automatische Antwort für ${getName(member)}:`, defaultReply); if (reply === null) return; if (reply.trim().length < 10) return showNotice("Die automatische Antwort muss mindestens 10 Zeichen lang sein."); const { error } = await supabase.rpc("head_admin_set_direct_message_policy", { p_target_user: member.id, p_disabled: true, p_auto_reply: reply.trim() }); if (error) return showNotice(error.message); showNotice("Direktnachrichten wurden gesperrt und die automatische Antwort aktiviert."); }
  async function deleteMessage(message) { if (!message?.id || !confirm("Diese Nachricht für beide Gesprächspartner endgültig löschen?")) return; const { error } = await supabase.rpc("delete_private_message", { p_message_id: message.id }); if (error) return showSaveError("Die Nachricht", error); setMessages((current) => current.filter((item) => item.id !== message.id)); showNotice("Nachricht gelöscht."); }
  async function createNews(e) { e.preventDefault(); const formElement = e.currentTarget; if (!canManageActiveRegion) return showNotice("Du hast in dieser Region keine Administrationsrechte."); if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen."); const f = new FormData(formElement); const payload = { title: String(f.get("title") || "").trim(), content: String(f.get("content") || "").trim(), author_id: user.id, region_id: activeRegionId }; if (payload.title.length < 3 || payload.content.length < 3) return showNotice("Bitte Überschrift und Text ausfüllen."); const prepared = await preparePrivilegedAction("Neuigkeit veröffentlichen"); if (prepared.error) return showNotice(prepared.error.message); try { payload.image_url = await uploadContentImage(f.get("image"), "news"); } catch (error) { return showNotice(error.message); } const { error } = await supabase.from("news").insert(payload); if (error) return showNotice(error.message); formElement?.reset(); showNotice("Neuigkeit veröffentlicht."); await loadAll(); }
  async function createCommunityEvent(e) { e.preventDefault(); const formElement = e.currentTarget; if (!(canManageActiveRegion || canPhotographActiveRegion)) return showNotice("Du hast in dieser Region keine Berechtigung, Veranstaltungen zu erstellen."); if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen."); const f = new FormData(formElement); const title = String(f.get("title") || "").trim(); const eventAt = String(f.get("event_at") || "").trim(); if (title.length < 3) return showNotice("Bitte gib einen Titel mit mindestens 3 Zeichen ein."); if (!eventAt || Number.isNaN(new Date(eventAt).getTime())) return showNotice("Bitte wähle ein gültiges Datum und eine Uhrzeit."); const prepared = await preparePrivilegedAction("Veranstaltung veröffentlichen"); if (prepared.error) return showNotice(prepared.error.message); let image_url = String(f.get("image_url") || "").trim() || null; try { const uploadedImage = await uploadContentImage(f.get("image"), "events"); if (uploadedImage) image_url = uploadedImage; } catch (error) { return showNotice(error.message); } const { data, error } = await supabase.from("community_events").insert({ title, description: String(f.get("description") || "").trim(), event_at: eventAt, location: String(f.get("location") || "").trim() || null, image_url, created_by: user.id, region_id: activeRegionId }).select().single(); if (error) return showNotice(error.message); if (data) setCommunityEvents((current) => [...current, data].sort((a,b) => new Date(a.event_at) - new Date(b.event_at))); formElement?.reset(); window.dispatchEvent(new CustomEvent("ec:regional-events-refresh")); showNotice("Veranstaltung veröffentlicht."); }
  async function editNews(entry) { if (!isAdmin(profile?.role)) return showNotice("Nur die Administration darf Neuigkeiten bearbeiten."); const values = await openContentEditor({ title: "Neuigkeit bearbeiten", description: "Überarbeite die Neuigkeit in Ruhe. Ein neues Bild kann direkt vom Gerät ergänzt werden.", fields: [{ name: "title", label: "Überschrift", value: entry.title, required: true }, { name: "content", label: "Text", type: "textarea", value: entry.content, required: true, rows: 16 }, { name: "image", label: "Neues Bild auswählen (optional)", type: "file" }] }); if (!values) return; if (values.title.trim().length < 3 || values.content.trim().length < 3) return showNotice("Bitte Überschrift und Text ausfüllen."); let imageUrl = entry.image_url || null; try { const uploaded = await uploadContentImage(values.image, "news"); if (uploaded) imageUrl = uploaded; } catch (error) { return showSaveError("Das Bild", error); } let { error } = await supabase.rpc("admin_update_news", { p_news_id: entry.id, p_title: values.title.trim(), p_content: values.content.trim(), p_image_url: imageUrl }); if (error && /function|schema cache|does not exist/i.test(error.message || "")) ({ error } = await supabase.from("news").update({ title: values.title.trim(), content: values.content.trim(), image_url: imageUrl }).eq("id", entry.id)); if (error) return showSaveError("Die Neuigkeit", error); showNotice("Neuigkeit gespeichert."); await loadAll(); }
  async function deleteNews(entry) { if (!isAdmin(profile?.role) || !confirm(`Neuigkeit „${entry.title}" wirklich löschen?`)) return; const { error } = await supabase.rpc("admin_delete_news", { p_news_id: entry.id }); if (error) return showNotice(error.message); showNotice("Neuigkeit gelöscht."); await loadAll(); }
  async function editCommunityEvent(event) { if (!isAdmin(profile?.role)) return; if (event.status === "CANCELLED") { const prepared = await preparePrivilegedAction("Veranstaltung wieder aktivieren", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ status: "ACTIVE", cancellation_reason: null, cancelled_at: null }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung wieder aktiviert."); return loadAll(); } const title = prompt("Titel:", event.title); if (title === null) return; const when = prompt("Datum und Uhrzeit (z. B. 2026-09-15T18:30):", new Date(event.event_at).toISOString().slice(0, 16)); if (when === null) return; const location = prompt("Ort:", event.location || ""); if (location === null) return; const description = prompt("Beschreibung:", event.description || ""); if (description === null || title.trim().length < 3 || Number.isNaN(new Date(when).getTime())) return showNotice("Bitte gültigen Titel sowie Datum und Uhrzeit eingeben."); const prepared = await preparePrivilegedAction("Veranstaltung bearbeiten", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ title: title.trim(), event_at: new Date(when).toISOString(), location: location.trim() || null, description: description.trim() }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung gespeichert."); await loadAll(); }
  async function cancelCommunityEvent(event) { if (!isAdmin(profile?.role) || !confirm(`Veranstaltung „${event.title}" wirklich absagen?`)) return; const reason = prompt("Grund der Absage (verpflichtend):", ""); if (reason === null || reason.trim().length < 5) return showNotice("Bitte eine Begründung mit mindestens 5 Zeichen eingeben."); const prepared = await preparePrivilegedAction("Veranstaltung absagen", event.id, reason); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").update({ status: "CANCELLED", cancellation_reason: reason.trim(), cancelled_at: new Date().toISOString() }).eq("id", event.id); if (error) return showNotice(error.message); showNotice("Veranstaltung abgesagt."); await loadAll(); }
  async function toggleCommunityEventFeatured(event) {
    if (!event?.id) return;
    const next = !event.is_featured;
    const color = next ? (window.prompt("Farbe der Hervorhebung: gold, blue, green, red, purple oder orange", event.featured_color || "gold") || "gold").trim().toLowerCase() : (event.featured_color || "gold");
    const { error } = await supabase.rpc("set_community_event_featured", { p_event_id: event.id, p_featured: next, p_color: color });
    if (error) return showNotice(error.message);
    setCommunityEvents((current) => current.map((entry) => entry.id === event.id ? { ...entry, is_featured: next, featured_at: next ? new Date().toISOString() : null, featured_by: next ? user.id : null, featured_color: color } : entry));
    showNotice(next ? "Veranstaltung wurde hervorgehoben." : "Hervorhebung wurde entfernt.");
  }

  async function respondToCommunityEvent(event, status) { if (event.status === "CANCELLED") return; const { error } = await supabase.from("community_event_rsvps").upsert({ event_id: event.id, user_id: user.id, status }, { onConflict: "event_id,user_id" }); if (error) return showNotice(error.message); showNotice(status === "GOING" ? "Du hast zugesagt." : "Du hast Interesse vorgemerkt."); await loadAll(); }
  async function shareCommunityEvent(event) { if (!user?.id || !event?.id || event.status === "CANCELLED") return; const { error } = await supabase.from("profile_shared_items").upsert({ profile_id: user.id, item_type: "EVENT", item_id: event.id }, { onConflict: "profile_id,item_type,item_id" }); if (error) return showNotice(error.message); window.dispatchEvent(new CustomEvent("ec:profile-shares-changed")); showNotice("Veranstaltung wurde auf deinem Profil geteilt."); }
  async function deleteCommunityEvent(event) { if (!isAdmin(profile?.role) || !confirm(`Veranstaltung „${event.title}" wirklich löschen?`)) return; const prepared = await preparePrivilegedAction("Veranstaltung löschen", event.id); if (prepared.error) return showNotice(prepared.error.message); const { error } = await supabase.from("community_events").delete().eq("id", event.id); if (error) return showNotice(error.message); setCommunityEvents((current) => current.filter((entry) => entry.id !== event.id)); showNotice("Veranstaltung gelöscht."); }
  async function createCommunityAd(e) { e.preventDefault(); const formElement = e.currentTarget; if (!isHeadAdmin(profile?.role)) return showNotice("Werbeflächen verwaltet nur der Hauptadmin."); if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen."); const f = new FormData(formElement); const title = String(f.get("title") || "").trim(); if (title.length < 3) return showNotice("Bitte gib einen Namen für die Werbefläche ein."); let imageUrl = String(f.get("image_url") || "").trim() || null; try { const uploaded = await uploadContentImage(f.get("image"), "ads"); if (uploaded) imageUrl = uploaded; } catch (error) { return showSaveError("Das Werbebild", error); } const { error } = await supabase.rpc("ec_admin_create_regional_ad", { p_title: title, p_body: String(f.get("body") || "").trim(), p_link_url: String(f.get("link_url") || "").trim() || null, p_image_url: imageUrl, p_region: activeRegionId }); if (error) return showSaveError("Die Werbefläche", error); formElement?.reset(); showNotice("Werbefläche veröffentlicht."); await loadAll(); }
  async function deleteCommunityAd(ad) { if (!isHeadAdmin(profile?.role) || !confirm(`Werbefläche „${ad.title}" wirklich entfernen?`)) return; const { error } = await supabase.rpc("admin_delete_community_ad", { p_ad_id: ad.id }); if (error) return showSaveError("Die Werbefläche", error); setCommunityAds((current) => current.filter((entry) => entry.id !== ad.id)); showNotice("Werbefläche entfernt."); }
  async function setBusinessAccount(id, enabled, editNameOnly = false) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Global Admin darf Unternehmenskonten verwalten."); const existing = members.find((member) => member.id === id); const company = (enabled || editNameOnly) ? (await openContentEditor({ title: editNameOnly ? "Firmenbezeichnung bearbeiten" : "Unternehmeraccount vergeben", description: "Der Firmenname wird unter Unternehmeraccount im Profil angezeigt. Die Hauptrolle bleibt bestehen.", fields: [{ name: "company_name", label: "Firmenbezeichnung", required: true, value: existing?.company_name || "" }] }))?.company_name : ""; if ((enabled || editNameOnly) && (company == null || !company.trim())) return; const { error } = await supabase.rpc("admin_set_business_account", { p_user_id: id, p_enabled: enabled || editNameOnly, p_company_name: company?.trim() || null, p_company_description: existing?.company_description || null }); if (error) return showNotice(error.message); showNotice(editNameOnly ? "Firmenbezeichnung gespeichert." : enabled ? "Unternehmeraccount vergeben." : "Unternehmeraccount entfernt."); await loadAll(); }
  async function createForumPost(e, scope) { e.preventDefault(); const formElement = e.currentTarget; if (scope === "COMMUNITY" && isFeatureLocked("FORUM_POSTING")) { showNotice("Deine Forums-Schreibfunktion ist derzeit vorübergehend gesperrt."); return false; } if (!activeRegionId) { showNotice("Bitte zuerst eine Region auswählen."); return false; } const form = new FormData(formElement); const payload = { scope, title: String(form.get("title") || "").trim(), content: String(form.get("content") || "").trim(), font_family: form.get("font_family") || "modern", font_size: form.get("font_size") || "normal", emphasis: form.get("emphasis") || "normal", category: scope === "ADMIN" ? "INTERN" : String(form.get("category") || "ALLGEMEIN"), is_ai_generated: !isAdmin(profile?.role) && form.get("is_ai_generated") === "on" }; if (payload.title.length < 3 || payload.content.length < 3) { showNotice("Bitte Überschrift und Beitrag ausfüllen."); return false; } let { error } = await supabase.rpc("ec_forum_create_regional_post_v2", { p_scope: payload.scope, p_title: payload.title, p_content: payload.content, p_font_family: payload.font_family, p_font_size: payload.font_size, p_emphasis: payload.emphasis, p_region: activeRegionId, p_is_ai_generated: payload.is_ai_generated, p_category: payload.category }); if (error && /function|schema cache|does not exist/i.test(error.message || "")) ({ error } = await supabase.rpc("ec_forum_create_regional_post", { p_scope: payload.scope, p_title: payload.title, p_content: payload.content, p_font_family: payload.font_family, p_font_size: payload.font_size, p_emphasis: payload.emphasis, p_region: activeRegionId, p_is_ai_generated: payload.is_ai_generated })); if (error) { showNotice(error.message); return false; } formElement?.reset(); showNotice("Beitrag veröffentlicht."); await loadAll(); return true; }
  async function editForumPost(post) {
    const mayModerate = isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator);
    const ownsPost = post.author_id === user?.id;
    if (!ownsPost && !mayModerate) return showNotice("Du kannst nur eigene Beiträge bearbeiten.");

    const fields = [
      { name: "title", label: "Überschrift", value: post.title || "", required: true, placeholder: "Überschrift des Beitrags" },
      { name: "content", label: "Beitrag", type: "textarea", value: post.content || "", required: true, rows: 14, placeholder: "Beitrag bearbeiten …" }
    ];
    if (!ownsPost) {
      fields.push({
        name: "reason",
        label: "Grund der Bearbeitung",
        type: "textarea",
        value: "Von der Forum-Moderation bearbeitet",
        required: true,
        rows: 3,
        placeholder: "Warum wird dieser Beitrag bearbeitet?"
      });
    }

    const values = await openContentEditor({
      title: "Forumsbeitrag bearbeiten",
      description: ownsPost
        ? "Ändere Überschrift und Inhalt. Die Bearbeitung wird am Beitrag gekennzeichnet."
        : "Du bearbeitest einen fremden Beitrag als Moderation. Der Änderungsgrund wird protokolliert.",
      fields
    });
    if (!values) return;

    const title = String(values.title || "").trim();
    const content = String(values.content || "").trim();
    const reason = ownsPost ? "Vom Autor bearbeitet" : String(values.reason || "").trim();

    if (title.length < 3) return showNotice("Die Überschrift muss mindestens drei Zeichen haben.");
    if (content.length < 3) return showNotice("Der Beitrag muss mindestens drei Zeichen haben.");
    if (!ownsPost && reason.length < 3) return showNotice("Bitte einen Bearbeitungsgrund angeben.");

    let { error } = await supabase.rpc("forum_update_post", {
      p_post_id: post.id,
      p_title: title,
      p_content: content,
      p_reason: reason
    });
    if (error && ownsPost && /function|schema cache|does not exist/i.test(error.message || "")) {
      ({ error } = await supabase.rpc("forum_update_own_post", { p_post_id: post.id, p_title: title, p_content: content }));
    }
    if (error && isHeadAdmin(profile?.role) && /function|schema cache|does not exist/i.test(error.message || "")) {
      ({ error } = await supabase.rpc("admin_edit_forum_post", { p_post_id: post.id, p_title: title, p_content: content, p_reason: reason }));
    }
    if (error) return showSaveError("Der Forumsbeitrag", error);

    showNotice("Beitrag wurde gespeichert und als bearbeitet gekennzeichnet.");
    await loadAll();
  }
  async function deleteForumPost(post) { const mayModerate = isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator); if (post.author_id !== user?.id && !mayModerate) return showNotice("Du kannst nur eigene Beiträge löschen."); if (!confirm(`Beitrag „${post.title}" wirklich löschen?`)) return; const { error } = await supabase.rpc("forum_delete_post", { p_post_id: post.id }); if (error) return showNotice(error.message); showNotice("Forumsbeitrag gelöscht."); await loadAll(); }
  async function setForumPostState(post, changes) {
    if (!post?.id) return;
    const { error } = await supabase.rpc("forum_set_post_state", {
      p_post_id: post.id,
      p_solved: Object.prototype.hasOwnProperty.call(changes, "is_solved") ? changes.is_solved : null,
      p_pinned: Object.prototype.hasOwnProperty.call(changes, "is_pinned") ? changes.is_pinned : null
    });
    if (error) return showNotice(error.message);
    setForumPosts((current) => current.map((item) => item.id === post.id ? { ...item, ...changes } : item));
    showNotice(changes.is_pinned !== undefined ? (changes.is_pinned ? "Beitrag angepinnt." : "Anheftung entfernt.") : (changes.is_solved ? "Beitrag als gelöst markiert." : "Gelöst-Markierung entfernt."));
  }
  async function createForumReply(post, content) { const text = String(content || "").trim(); if (text.length < 2) { showNotice("Bitte schreibe eine Antwort."); return false; } const { error } = await supabase.rpc("forum_create_reply", { p_post_id: post.id, p_content: text }); if (error) { showNotice(error.message); return false; } showNotice("Antwort veröffentlicht."); await loadAll(); return true; }
  async function toggleForumReplyHelpful(reply) {
    if (!reply?.id || reply.author_id === user?.id) return;
    const { data, error } = await supabase.rpc("ec_toggle_forum_reply_helpful", { p_reply_id: reply.id });
    if (error) return showNotice(error.message);
    const marked = Boolean(data?.helpful);
    setForumHelpful((current) => {
      const withoutMine = current.filter((item) => !(item.reply_id === reply.id && item.user_id === user.id));
      return marked ? [...withoutMine, { reply_id: reply.id, user_id: user.id, created_at: new Date().toISOString() }] : withoutMine;
    });
    showNotice(marked ? "Danke – du hast diese Antwort als hilfreich markiert." : "Hilfreich-Markierung entfernt.");
  }

  async function editForumReply(reply) {
    const parent = forumPosts.find((post) => post.id === reply.post_id);
    const mayModerate = parent?.scope === "COMMUNITY" && profile?.forum_moderator;
    const ownsReply = reply.author_id === user?.id;
    if (!ownsReply && !isHeadAdmin(profile?.role) && !mayModerate) return showNotice("Du kannst nur eigene Antworten bearbeiten.");

    const fields = [
      { name: "content", label: "Antwort", type: "textarea", value: reply.content || "", required: true, rows: 10, placeholder: "Antwort bearbeiten …" }
    ];
    if (!ownsReply) fields.push({ name:"reason", label:"Grund der Bearbeitung", type:"textarea", value:"Von der Forum-Moderation bearbeitet", required:true, rows:3, placeholder:"Warum wird diese Antwort bearbeitet?" });

    const values = await openContentEditor({
      title: "Forumsantwort bearbeiten",
      description: ownsReply ? "Ändere deine Antwort. Die Bearbeitung wird sichtbar gekennzeichnet." : "Du bearbeitest eine fremde Antwort als Moderation. Der Änderungsgrund wird protokolliert.",
      fields
    });
    if (!values) return;

    const content = String(values.content || "").trim();
    const reason = ownsReply ? "Vom Autor bearbeitet" : String(values.reason || "").trim();
    if (content.length < 2) return showNotice("Die Antwort ist zu kurz.");
    if (!ownsReply && reason.length < 3) return showNotice("Bitte einen Bearbeitungsgrund angeben.");

    const { error } = await supabase.rpc("forum_update_reply", { p_reply_id: reply.id, p_content: content, p_reason: reason });
    if (error) return showSaveError("Die Forumsantwort", error);
    showNotice("Antwort bearbeitet und gekennzeichnet.");
    await loadAll();
  }
  async function deleteForumReply(reply) { const parent = forumPosts.find((post) => post.id === reply.post_id); const mayModerate = parent?.scope === "COMMUNITY" && profile?.forum_moderator; if (reply.author_id !== user?.id && !isHeadAdmin(profile?.role) && !mayModerate) return showNotice("Du kannst nur eigene Antworten löschen."); if (!confirm("Antwort wirklich löschen?")) return; const { error } = await supabase.rpc("forum_delete_reply", { p_reply_id: reply.id }); if (error) return showNotice(error.message); showNotice("Antwort gelöscht."); await loadAll(); }
  async function setForumModerator(member, enabled) { if (!isHeadAdmin(profile?.role)) return showNotice(await adminDenied("Forum-Moderator ändern","Nur der Head Admin darf Forum-Moderatoren bestimmen.", member?.id)); const { error } = await supabase.rpc("admin_set_forum_moderator", { p_target_user: member.id, p_enabled: enabled }); if (error) return showNotice(error.message); showNotice(enabled ? `${getName(member)} ist jetzt Forum-Moderator.` : "Forum-Moderation entfernt."); await loadAll(); }
  async function setGroupModerator(member, enabled) {
    if (!isHeadAdmin(profile?.role)) return showNotice(await adminDenied("Gruppenmoderation ändern","Nur der Head Admin darf Gruppenmoderation bestimmen.", member?.id));
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
  async function createWeeklyPoll(e) { e.preventDefault(); const formElement = e.currentTarget; if (!isHeadAdmin(profile?.role) || !activeRegionId) return; const form = new FormData(formElement); const question = String(form.get("question") || "").trim(); const options = form.getAll("option").map((option) => String(option || "").trim()).filter(Boolean); if (question.length < 5 || options.length < 2) return showNotice("Bitte eine Frage und mindestens zwei Antwortmöglichkeiten eingeben."); const { error } = await supabase.rpc("ec_create_regional_weekly_poll", { p_question: question, p_options: options, p_region: activeRegionId }); if (error) return showSaveError("Die Wochenfrage", error); showNotice("Wochenfrage veröffentlicht."); formElement?.reset(); await loadAll(); }
  async function voteWeeklyPoll(optionIndex) { if (!weeklyPoll) return; const { error } = await supabase.rpc("vote_weekly_poll", { p_poll_id: weeklyPoll.id, p_option_index: optionIndex }); if (error) return showSaveError("Die Abstimmung", error); showNotice("Deine Stimme wurde gespeichert."); await loadAll(); }
  async function featureCommunityGroup(groupId) { if (!isHeadAdmin(profile?.role) || !activeRegionId) return; const { error } = await supabase.rpc("ec_set_regional_featured_group", { p_group_id: groupId || null, p_region: activeRegionId }); if (error) return showSaveError("Die Gruppe der Woche", error); showNotice(groupId ? "Gruppe der Woche gespeichert." : "Gruppe der Woche entfernt."); await loadAll(); }
  async function createCommunityRequest(e) { e.preventDefault(); const formElement = e.currentTarget; if (!activeRegionId) return showNotice("Bitte zuerst eine Region auswählen."); const form = new FormData(formElement); const title = String(form.get("title") || "").trim(); const content = String(form.get("content") || "").trim(); if (title.length < 5 || content.length < 10) return showNotice("Bitte einen Titel und eine kurze Beschreibung eingeben."); const { error } = await supabase.from("community_requests").insert({ author_id: user.id, category: form.get("category"), title, content, region_id: activeRegionId }); if (error) return showSaveError("Der Community-Aufruf", error); formElement?.reset(); showNotice("Dein Aufruf ist jetzt für diese Region sichtbar."); await loadAll(); }
  async function closeCommunityRequest(request) { if (request.author_id !== user?.id || !confirm("Diesen Aufruf als erledigt schließen?")) return; const { error } = await supabase.from("community_requests").update({ status: "CLOSED" }).eq("id", request.id).eq("author_id", user.id); if (error) return showSaveError("Der Community-Aufruf", error); await loadAll(); }
  async function reviewProfileVerification(item, approved) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Verifizierungsanfragen abschließen."); if (approved && !confirm(`Die Echtheit von ${item.nickname || getName(item)} wurde geprüft und wird bestätigt?`)) return; const { error } = await supabase.rpc("admin_review_profile_verification", { p_user_id: item.user_id || item.id, p_approved: approved }); if (error) return showNotice(/function|schema cache|does not exist|relation/i.test(error.message || "") ? "Die Verifizierungsfunktion ist in der Datenbank noch nicht aktiv. Bitte führe registration_and_forum_repair.sql einmal im Supabase SQL Editor aus." : error.message); showNotice(approved ? "Profil wurde verifiziert." : "Verifizierungsanfrage wurde abgelehnt."); await openAccountReview(); await loadAll(); }
  async function setProfileVerification(member, verified) { return reviewProfileVerification({ user_id: member.id, nickname: getName(member) }, verified); }
  async function setMemberFeatureLock(member, feature, locked) { if (!isHeadAdmin(profile?.role)) return showNotice("Nur der Head Admin darf Funktionen sperren."); const label = feature === "FORUM_POSTING" ? "Forum schreiben" : feature === "MESSAGING" ? "Nachrichten" : "Freundschaftsanfragen"; const reason = locked ? prompt(`Grund für die Sperre „${label}" bei ${getName(member)}:`, "Verstoß gegen die Community-Regeln") : prompt(`Grund für die Freigabe „${label}" bei ${getName(member)}:`, "Funktion wieder freigegeben"); if (reason === null || reason.trim().length < 3) return showNotice("Bitte einen Grund angeben."); const { error } = await supabase.rpc("admin_set_feature_lock", { p_target_user: member.id, p_feature_key: feature, p_is_locked: locked, p_reason: reason.trim() }); if (error) return showNotice(error.message); showNotice(`${label} wurde ${locked ? "gesperrt" : "freigegeben"}; die automatische Nachricht wurde versendet.`); await loadAll(); }

  async function markNotificationRead(notification) {
    if (!notification?.id || notification.read_at) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("id", notification.id).eq("user_id", user.id);
    if (error) return showNotice(error.message);
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
  }
  async function markAllNotificationsRead() {
    if (!notifications.some((item) => !item.read_at)) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("user_id", user.id).is("read_at", null);
    if (error) return showNotice(error.message);
    setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    showNotice("Alle Benachrichtigungen als gelesen markiert.");
  }
  async function openNotification(notification) {
    await markNotificationRead(notification);
    const type = String(notification?.type || "").toUpperCase();
    if (type === "MESSAGE") return setPage("messages");
    if (type === "FRIEND_REQUEST") return setPage("friend-requests");
    if (type === "PHOTO_LIKE") return setPage("profile");
    if (type === "ADMIN_FORUM_POST") return setPage("admin-forum");
    if (type === "FORUM_HELPFUL") return setPage("forum");
    if (type === "FORUM_REPLY") return setPage("forum");
    if (type === "POKE" || type === "NUDGE") {
      setPage("notifications");
      window.setTimeout(() => {
        const box = document.querySelector(".nudge-inbox");
        box?.scrollIntoView({ behavior:"smooth", block:"start" });
        box?.classList.add("is-focused");
        window.setTimeout(() => box?.classList.remove("is-focused"), 1800);
      }, 120);
      return;
    }
    if (type === "ACTIVITY_REWARD") return setPage("profile");
    if (type === "EVENT_REMINDER") return setPage("community");
  }

  async function sendWelcomeGreeting(member) {
    if (!member?.id || member.id === user?.id) return;
    const { data, error } = await supabase.rpc("ec_send_welcome_greeting", { p_recipient_id: member.id });
    if (error) return showNotice(error.message);
    if (data?.already_sent) return showNotice("Du hast dieses Mitglied bereits willkommen geheißen.");
    setWelcomeGreetings((current) => [...current, { sender_id:user.id, recipient_id:member.id, created_at:new Date().toISOString() }]);
    showNotice("Willkommensgruß gesendet.");
  }

  async function openChat(m) { setChatMember(m); setPage("messages"); const { data, error } = await supabase.from("messages").select("*").or(`and(sender_id.eq.${user.id},receiver_id.eq.${m.id}),and(sender_id.eq.${m.id},receiver_id.eq.${user.id})`).order("created_at", { ascending: true }); if (error) return showNotice(error.message); setMessages(data || []); await supabase.rpc("mark_messages_read", { from_user: m.id }); }
  async function openMember(m) { if (!m) return; if (m.id === user.id) return setPage("profile"); setViewingMember(m); setViewingFriends([]); setPage("member-profile"); void loadMemberProfile(m).then((fresh) => { if (fresh?.id === m.id) setViewingMember((current) => current?.id === m.id ? fresh : current); }).catch((error) => console.warn("Profil konnte nicht im Hintergrund aktualisiert werden:", error?.message || error)); const { data: connections } = await supabase.from("friendships").select("requester_id,receiver_id").eq("status", "ACCEPTED").or(`requester_id.eq.${m.id},receiver_id.eq.${m.id}`); if (connections) { const ids = connections.map((connection) => connection.requester_id === m.id ? connection.receiver_id : connection.requester_id); setViewingFriends(members.filter((member) => ids.includes(member.id))); } }

  if (passwordRecovery) return <PasswordReset finishPasswordReset={finishPasswordReset} notice={notice}/>;
  if (!user) return <div className="auth-page"><NewAuth login={login} register={register} loginPending={loginPending} loginFeedback={loginFeedback}/><button className="forgot-password-button" onClick={requestPasswordReset}>Passwort vergessen?</button>{notice && <div className="toast">{notice}</div>}</div>;

  const unread = messages.filter((m) => m.receiver_id === user.id && !m.is_read).length;
  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const myRole = roleLabel(profile?.role);
  return <div className={`app layout-${["theme-red", "theme-blue", "theme-neon", "theme-neon-pink", "theme-alpine", "theme-teal", "theme-violet", "theme-copper", "theme-aurora"].includes(profile?.profile_layout) ? profile.profile_layout : "standard"}`}>
    <div className="dashboard-layout">
      <aside className="modern-sidebar">
        <div className="sidebar-profile" onClick={() => setPage("profile")}><img src={profile?.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(profile)}</strong><span className={`role-badge ${profile?.account_badge === "BUSINESS" ? "business" : roleClass(profile?.role)}`}>{profile?.role === "HEAD_ADMIN" ? "♛" : profile?.role === "ADMIN" ? "★ Community Admin" : profile?.role === "SUPPORTER" ? "★ Supporter" : profile?.account_badge === "BUSINESS" ? "★ Unternehmenskonto" : "Mitglied"}</span></div></div>
        <div className="ec-points-wallet" style={{padding:"10px 14px",margin:"8px 0",borderRadius:12,background:"rgba(28,74,99,.18)"}}><strong>Punkte: {Number(profile?.points||0).toLocaleString("de-AT")} · {Number(profile?.purchase_points||0).toLocaleString("de-AT")} [k]</strong><small style={{display:"block"}}>Kaufpunkte-Guthaben im Marktplatz verwenden</small></div>
        <nav className="modern-nav">
          <button onClick={() => setPage("home")}>⌂ <span>Startseite</span></button>
          <button onClick={() => setPage("members")}>♙ <span>Mitglieder</span></button>
          <button onClick={() => setPage("friends")}>♥ <span>Freunde</span></button>
          <button onClick={() => setPage("friend-requests")}>♢ <span>Anfragen</span>{incomingRequests.length > 0 && <em>{incomingRequests.length}</em>}</button>
          <button onClick={() => setPage("blocked")}>⊘ <span>Blockiert</span></button>
          <button onClick={() => setPage("messages")}>☏ <span>Nachrichten</span>{unread > 0 && <em>{unread}</em>}</button>
          <button onClick={() => setPage("notifications")}>◎ <span>Aktuelles</span>{unreadNotifications > 0 && <em>{unreadNotifications}</em>}</button>
          <button onClick={() => setPage("news")}>▣ <span>Neuigkeiten</span></button>
          <button onClick={() => setPage("community")}>✦ <span>Community</span></button>
          <button onClick={() => setPage("marketplace")}>🛍 <span>Marktplatz</span></button>
          <button onClick={() => setPage("groups")}>◉ <span>Gruppen</span></button>
          <button onClick={() => setPage("forum")}>▤ <span>Forum</span></button>
          <button onClick={() => setPage("profile")}>⚙ <span>Mein Profil</span></button>
          {isAdmin(profile?.role) && <button className="admin-nav-entry" onClick={() => setPage("admin")}>♛ <span>Admin-Zentrale</span></button>}
        </nav>
        <button className="sidebar-logout" onClick={logout}>⇥ <span>Abmelden</span></button>
      </aside>
      <main className="modern-main"><div className="content-root">{networkIssue && <aside className="network-recovery-banner" role="status" aria-live="polite"><div><strong>Verbindung unterbrochen</strong><span>Ennstal Connect bleibt geöffnet. Bereits geladene Inhalte sind weiter sichtbar.</span></div><button type="button" className="secondary-button" onClick={() => { setNetworkIssue(false); void loadAllRef.current?.(); }}>Erneut versuchen</button></aside>}{(sectionStatus.pending.length > 0 || sectionStatus.failed.length > 0) && <aside className="panel" role="status" aria-live="polite">{sectionStatus.pending.length > 0 && <p>Weitere Inhalte werden geladen …</p>}{sectionStatus.failed.length > 0 && <><p>Noch nicht aktualisiert: {sectionStatus.failed.join(", ")}. Bereits geladene Inhalte bleiben verfügbar.</p><button type="button" className="secondary-button" disabled={sectionStatus.pending.length > 0} onClick={() => void loadAllRef.current()}>Erneut laden</button></>}</aside>}{notice && <div className="toast">{notice}</div>}{incomingMessage && <aside className="incoming-message-popup" role="status"><strong>✉ Neue Nachricht von {incomingMessage.senderName}</strong><p>{incomingMessage.content || "Du hast eine neue private Nachricht erhalten."}</p><div><button className="primary-button" onClick={() => { const sender = members.find((member) => member.id === incomingMessage.senderId); setIncomingMessage(null); if (sender) openChat(sender); else setPage("messages"); }}>Nachricht öffnen</button><button className="secondary-button" onClick={() => setIncomingMessage(null)}>Später</button></div></aside>}
        {page === "marketplace" && <KaufpunkteMarket user={user} profile={profile} canManage={hasAdminPermission("manage_marketplace")} />}
        {page === "home" && (
          <Home profile={profile} user={user} activeRegion={activeRegion} isHeadAdmin={isHeadAdmin} homepageSections={regionFilter(homepageSections)} canEdit={isHeadAdmin(profile?.role)} createHomepageSection={createHomepageSection} editHomepageSection={editHomepageSection} deleteHomepageSection={deleteHomepageSection} uploadHomepageImage={uploadHomepageImage} weeklyPoll={weeklyPoll?.region_id && weeklyPoll.region_id !== activeRegionId ? null : weeklyPoll} welcomeBadges={welcomeBadges} groups={regionFilter(groups)} featuredGroup={featuredGroup?.region_id && featuredGroup.region_id !== activeRegionId ? null : featuredGroup} communityRequests={regionFilter(communityRequests)} events={regionFilter(communityEvents)} eventRsvps={eventRsvps} forumPosts={regionFilter(forumPosts)} forumReplies={forumReplies} friendships={friendships} members={regionalMembers} welcomeGreetings={welcomeGreetings} onSendWelcome={sendWelcomeGreeting} onReplyForum={createForumReply} onRespondEvent={respondToCommunityEvent} onVote={voteWeeklyPoll} onCreatePoll={createWeeklyPoll} onFeatureGroup={featureCommunityGroup} onCreateRequest={createCommunityRequest} onCloseRequest={closeCommunityRequest} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }}/>
        )}
        {page === "members" && <NativeMembersDirectory
  members={members}
  regions={regions}
  activeRegion={activeRegion}
  profile={profile}
  friendships={friendships}
  onOpen={openMember}
  onMessage={openChat}
/>}
        {page === "friends" && <section><div className="page-heading"><h1>Freunde</h1><p>Nur bestätigte Freundschaften werden hier angezeigt.</p></div><MemberGrid members={members.filter((m) => acceptedFriendIds.includes(m.id) && !m.is_test_account && m.account_status !== "SUSPENDED")} profile={profile} friendships={friendships} onOpen={openMember} onMessage={openChat}/></section>}
        {page === "friend-requests" && <FriendRequests incoming={incomingRequests} sent={sentRequests} memberById={memberById} respond={respondToFriendRequest} cancel={cancelFriendRequest}/>} 
        {page === "blocked" && <Blocked blockedUsers={blockedUsers} memberById={memberById} unblock={unblockUser}/>} 
        {page === "messages" && <Messages user={user} messages={messages} chatMember={chatMember} setChatMember={setChatMember} memberById={memberById} openChat={openChat} messageText={messageText} setMessageText={setMessageText} sendMessage={sendMessage} deleteMessage={deleteMessage}/>}
        {page === "notifications" && <NotificationCenter notifications={notifications} onOpen={openNotification} onMarkAll={markAllNotificationsRead} members={members} onOpenMember={openMember} showNotice={showNotice}/>} 
        {page === "news" && <News news={regionFilter(news)} members={members} profile={profile} canManage={canManageActiveRegion} activeRegion={activeRegion} createNews={createNews} editNews={editNews} deleteNews={deleteNews}/>}
        {page === "municipality" && <section className="municipality-loading-host" aria-live="polite"><div id="ec-municipality-runtime-host" className="ec-municipality-runtime-host" /></section>}
        {page === "community" && <><CommunityHub members={regionalMembers} ads={regionFilter(communityAds)} photos={memberPhotos} profile={profile} profileUpdates={publicProfileUpdates} activeRegion={activeRegion} onDeleteAd={deleteCommunityAd}/>{isHeadAdmin(profile?.role) && <AdminCommunityTools members={regionalMembers} createAd={createCommunityAd} setBusinessAccount={setBusinessAccount}/>}</>}
        {page === "events" && <><EventsPage members={members} showNotice={showNotice} events={regionFilter(communityEvents)} eventRsvps={eventRsvps} user={user} profile={profile} activeRegion={activeRegion} canCreateEvent={canManageActiveRegion || canPhotographActiveRegion} createEvent={createCommunityEvent} onToggleEventFeatured={toggleCommunityEventFeatured} onRespondEvent={respondToCommunityEvent} onShareEvent={shareCommunityEvent} onEditEvent={editCommunityEvent} onCancelEvent={cancelCommunityEvent} onDeleteEvent={deleteCommunityEvent}/><EventPhotosPage user={user} profile={profile} members={members} regions={regions} activeRegion={activeRegion} showNotice={showNotice}/></>}
        {page === "groups" && <GroupsPage groups={regionFilter(groups)} members={members} profile={profile} user={user} transferRequests={groupOwnerChanges} onCreate={createGroup} onJoin={joinGroup} onLeave={leaveGroup} onEdit={editGroup} onDelete={deleteGroup} onTransfer={requestGroupOwnerChange} onReviewTransfer={reviewGroupOwnerChange} onOpen={setSelectedGroup}/>}
        {page === "groups" && selectedGroup && <GroupDetails group={groups.find((group) => group.id === selectedGroup.id) || selectedGroup} members={members} profile={profile} user={user} onClose={() => setSelectedGroup(null)} onJoin={joinGroup} onLeave={leaveGroup} onEdit={editGroup} onDelete={deleteGroup}/>}
        {page === "forum" && (
          <Forum title={`Community-Forum · ${activeRegion?.name || "Region"}`} intro="Regionaler Austausch für Mitglieder von Ennstal Connect." scope="COMMUNITY" posts={regionFilter(forumPosts)} replies={forumReplies} helpful={forumHelpful} user={user} members={regionalMembers} profile={profile} createPost={createForumPost} editPost={editForumPost} deletePost={deleteForumPost} setPostState={setForumPostState} createReply={createForumReply} editReply={editForumReply} deleteReply={deleteForumReply} toggleHelpful={toggleForumReplyHelpful} locked={isFeatureLocked("FORUM_POSTING")}/>
        )}
        {page === "admin-forum" && isAdmin(profile?.role) && <Forum title="Admin-Forum" intro="Interner, überregionaler Bereich für Moderation und Administration." scope="ADMIN" posts={forumPosts} replies={forumReplies} helpful={forumHelpful} user={user} members={members} profile={profile} createPost={createForumPost} editPost={editForumPost} deletePost={deleteForumPost} setPostState={setForumPostState} createReply={createForumReply} editReply={editForumReply} deleteReply={deleteForumReply} toggleHelpful={toggleForumReplyHelpful} locked={false} onBack={() => window.dispatchEvent(new CustomEvent("ec:open-admin-central"))}/>}
        {profilePhotoEditFile && <ProfilePhotoEditor file={profilePhotoEditFile} onCancel={() => { setProfilePhotoEditFile(null); setProfilePhotoEditingExisting(false); }} onSave={saveEditedProfilePhoto}/>}
        {(profileCoverEditFile || profileCoverEditingExisting) && <ProfileCoverEditor file={profileCoverEditFile} currentUrl={profile?.profile_background?.startsWith("http") ? profile.profile_background : ""} current={{ x:profile?.profile_background_position_x, y:profile?.profile_background_position_y, zoom:profile?.profile_background_zoom, overlay:profile?.profile_background_overlay }} onCancel={() => { setProfileCoverEditFile(null); setProfileCoverEditingExisting(false); }} onSave={saveEditedProfileCover}/>}
        {page === "profile" && <section className="profile-page-layout"><Profile profile={profile} user={user} isHeadAdmin={isHeadAdmin} saveProfile={saveProfile} uploadProfileImage={selectProfilePhotoForEdit} editProfileImage={editExistingProfilePhoto} uploadProfileBackground={selectProfileCoverForEdit} editProfileCover={() => setProfileCoverEditingExisting(true)} removeProfileCover={removeProfileCover} uploadProfileBioImage={uploadProfileBioImage} openPublicPreview={() => setPage("profile-preview")}/><HeadAdminSelfControls profile={profile} user={user} regions={regions} permissions={myAdminPermissions} onChanged={loadAll} showNotice={showNotice}/><BusinessProfileManager profile={profile} user={user}/><ProfileSections member={profile} editable><MemberGroups member={profile} groups={allGroups} onOpen={(group)=>{setSelectedGroup(group);setPage("groups")}}/></ProfileSections><ProfileTimeline visits={profileVisits} activities={profileActivities} members={members} onOpen={openMember}/><ProfileWelcomeBadges badges={welcomeBadges}/><ProfilePhotoGallery photos={memberPhotos.filter((photo) => photo.owner_id === user.id)} likes={photoLikes} comments={photoComments} user={user} onUpload={uploadMemberPhoto} onLike={togglePhotoLike} onComment={addPhotoComment} onDelete={deleteMemberPhoto}/></section>}
        {page === "profile-preview" && <PublicProfilePreview profile={profile} photos={memberPhotos} groups={allGroups} onBack={() => setPage("profile")} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }}/>}
{page === "member-profile" && viewingMember && <MemberProfile photos={memberPhotos} member={viewingMember} friends={viewingFriends} groups={allGroups} user={user} viewerProfile={profile} friendship={friendshipWith(viewingMember.id)} back={() => { setViewingMember(null); setViewingFriends([]); setPage("members"); }} onOpen={openMember} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }} requestFriend={requestFriend} respond={respondToFriendRequest} removeFriend={removeFriend} blockUser={blockUser} reportUser={reportUser} warnMember={warnMember} updateMemberRole={updateMemberRole} manageDirectMessagePolicy={manageDirectMessagePolicy} toggleSuspension={toggleSuspension} toggleTestAccount={toggleTestAccount} setBusinessAccount={setBusinessAccount} setForumModerator={setForumModerator} setGroupModerator={setGroupModerator} setProfileVerification={setProfileVerification} loadPermissions={loadPermissions} setMemberFeatureLock={setMemberFeatureLock} openChat={openChat}/>} 
        {page === "member-profile" && viewingMember && <ProfileHighlights member={viewingMember}/>}\n        {page === "member-profile" && viewingMember && <ProfileSocialTabs member={viewingMember} viewerProfile={profile} friendships={friendships} onOpenMember={openMember} onOpenGroup={(group) => { setSelectedGroup(group); setPage("groups"); }}/>}
        {page === "member-profile" && viewingMember && (profile?.is_primary_head_admin || hasAdminPermission("manage_media")) && viewingMember.id !== user.id && <HeadAdminProfileMediaTools member={viewingMember} onRemove={removeMemberProfileImage}/>} 

        {page === "member-profile" && viewingMember && <PublicProfilePhotoFolder member={viewingMember} photos={memberPhotos} canSeeFriends={isAdmin(profile?.role) || friendshipWith(viewingMember.id)?.status === "ACCEPTED"}/>} 
        {page === "member-profile" && viewingMember && (profile?.is_primary_head_admin || hasAdminPermission("manage_members")) && viewingMember.role !== "HEAD_ADMIN" && <><FeatureUnlocks member={viewingMember} setMemberFeatureLock={setMemberFeatureLock}/><MemberBusinessTool member={viewingMember} setBusinessAccount={setBusinessAccount}/></>}
        {page === "reports" && (profile?.is_primary_head_admin || hasAdminPermission("manage_reports")) && <Reports reports={reports} memberById={memberById} resolveReport={resolveReport}/>} 
        {page === "fake-accounts" && profile?.is_primary_head_admin && profile?.account_status === "ACTIVE" && <section className="fake-account-page head-admin-tools-page"><div className="page-heading"><div><span className="eyebrow">NUR HEAD ADMIN</span><h1>Fake-Erkennung</h1></div></div></section>}
        {page === "admin-log" && profile?.is_primary_head_admin && profile?.account_status === "ACTIVE" && <section className="admin-log-page head-admin-tools-page"><div className="page-heading"><div><span className="eyebrow">NUR HEAD ADMIN</span><h1>Admin-Logbuch</h1></div><button className="secondary-button" onClick={loadAll}>Aktualisieren</button></div><AdminLogPage adminLog={adminLog} members={adminMembers.length ? adminMembers : members}/></section>}
        {page === "admin" && (profile?.role === "ADMIN" || profile?.is_primary_head_admin || (profile?.role === "HEAD_ADMIN" && hasAnyAdminPermission)) && <AdminPanel members={adminMembers.length ? adminMembers : members} memberEmails={memberEmails} adminLog={adminLog} activationDashboard={activationDashboard} onRefreshActivation={loadActivationDashboard} forumPosts={forumPosts} forumReplies={forumReplies} communityEvents={communityEvents} eventRsvps={eventRsvps} memberPhotos={memberPhotos} photoComments={photoComments} profile={profile} user={user} permissions={myAdminPermissions} canViewPersonalData={canViewPersonalData} onOpen={openMember} updateMemberRole={updateMemberRole} toggleSuspension={toggleSuspension} setBusinessAccount={setBusinessAccount} editingMember={editingMember} setEditingMember={setEditingMember} saveMemberData={saveMemberData} adminTarget={adminTarget} loadPermissions={loadPermissions} permissionDraft={permissionDraft} setPermissionDraft={setPermissionDraft} savePermissions={savePermissions} savingPermissions={savingPermissions} openAccountReview={openAccountReview}/>}
        {page === "admin-account-review" && (profile?.is_primary_head_admin || hasAdminPermission("manage_members")) && <AccountReview queue={accountReviewQueue} members={members} canReview={Boolean(profile?.is_primary_head_admin || hasAdminPermission("manage_members"))} onBack={() => setPage("admin")} onOpen={openMember} onReview={reviewProfileVerification}/>}
        {page === "impressum" && <LegalPage type="impressum"/>}
        {page === "privacy" && <LegalPage type="privacy"/>}
        {page === "rules" && <CommunityRules/>}
      </div></main>
    </div>
    <MobileQuickNav page={page} onNavigate={setPage} onLogout={logout} isAdmin={isAdmin(profile?.role) || !!profile?.is_primary_head_admin} unread={unread} unreadNotifications={unreadNotifications} />
    <footer className="site-footer"><strong>Ennstal Connect</strong><div><button onClick={() => setPage("impressum")}>Impressum</button><button onClick={() => setPage("privacy")}>Datenschutz</button><button onClick={() => setPage("rules")}>Community-Regeln</button></div></footer>
    {rulesAccepted === false && <RulesAcceptanceModal accepting={acceptingRules} onAccept={acceptCommunityRules}/>}{user?.id && profile?.id === user.id && !profile?.district_code && rulesAccepted !== false && <RequiredHomeDistrict userId={user.id} onSaved={(changes) => { setProfile((current) => ({ ...current, ...changes })); setMembers((current) => current.map((member) => member.id === user.id ? { ...member, ...changes } : member)); }}/>} 
  </div>;
}

function MunicipalityWelcome({ profile, activeRegion }) {
  if (String(profile?.role || "").toUpperCase() !== "MUNICIPALITY") return null;
  const regionName = activeRegion?.name || "deiner Heimatregion";
  return <section className="ec-municipality-welcome" aria-label="Vorteile deines Gemeindekontos">
    <img src="/role-star-green.svg" alt=""/>
    <div><span className="eyebrow">GEMEINDEKONTO · OFFIZIELL</span><h2>Dein Gemeindebereich ist freigeschaltet</h2><p>Du vertrittst deine Gemeinde in {regionName} mit einem klar gekennzeichneten offiziellen Konto.</p><div className="ec-municipality-welcome-benefits"><span>✓ Offizielle Hinweise veröffentlichen</span><span>✓ Bürgeranliegen bearbeiten</span><span>✓ Gemeindeprofil & Kontaktdaten pflegen</span><span>✓ Grüner Stern & grüner Mitgliederrahmen</span></div></div>
    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:"municipality",source:"municipality-welcome"}}))}>Gemeindebereich öffnen →</button>
  </section>;
}

function Home({ profile, user, activeRegion, isHeadAdmin, homepageSections, canEdit, createHomepageSection, editHomepageSection, deleteHomepageSection, uploadHomepageImage, weeklyPoll, welcomeBadges, groups, featuredGroup, communityRequests, events, eventRsvps, forumPosts, forumReplies, friendships, members, welcomeGreetings, onSendWelcome, onReplyForum, onRespondEvent, onVote, onCreatePoll, onFeatureGroup, onCreateRequest, onCloseRequest, onOpenGroup }) {
  const [featureHelp, setFeatureHelp] = useState(null);
  const featureTopics = [{ title: "🛍️ Marktplatz", summary: "Entdecke regionale Angebote, stelle selbst Inserate ein und nimm direkt Kontakt auf.", details: "Im Marktplatz kannst du Angebote aus der Community ansehen und eigene Artikel oder Dienstleistungen anbieten. Achte bei Absprachen und Übergaben auf Sicherheit und kläre Details direkt mit der anderen Person." }, { title: "⭐ Punkte & Belohnungen", summary: "Sammle Punkte durch Aktivitäten in der Community.", details: "Punkte machen deine Community-Aktivitäten sichtbar. Welche Aktionen wie viele Punkte bringen und welche Belohnungen verfügbar sind, erfährst du in deiner Punkteübersicht. Die aktuell angezeigten Regeln sind maßgeblich." }, { title: "📍 Heimatbezirk", summary: "Zeige anderen, aus welchem Bezirk du kommst.", details: "Deinen Heimatbezirk wählst du im Profil aus. Er wird anschließend in deinem ausführlichen Mitgliederprofil angezeigt. Fehlt die Angabe, wirst du beim Anmelden zur Auswahl aufgefordert." }, { title: "🔵 Unternehmerprofile", summary: "Erkenne regionale Unternehmen am blauen Rollenstern.", details: "Im ausführlichen Profil siehst du den Unternehmeraccount und die Firmenbezeichnung. Auf der kleinen Mitgliederkarte erscheint weiterhin nur der höchstrangige Rollenstern." }, { title: "🎨 Profildesign", summary: "Gestalte deinen Auftritt persönlicher.", details: "In den Profileinstellungen findest du die für dein Konto freigeschalteten Farben und Layouts. Verfügbare Designs können je nach Kontotyp variieren." }, { title: "📷 Community-Engagement", summary: "Entdecke besondere Aufgaben und Kennzeichnungen.", details: "Zusätzliche Kennzeichnungen wie Community-Fotograf zeigen Engagement und Aufgaben im ausführlichen Profil, ohne die Hauptrolle zu ersetzen." }];
  const [frames, setFrames] = useState([{ imageUrl: "", status: "" }, { imageUrl: "", status: "" }]);
  const updateFrame = (index, changes) => setFrames((current) => current.map((frame, i) => i === index ? { ...frame, ...changes } : frame));
  const chooseImage = async (index, event) => { const file = event.target.files?.[0]; if (!file) return; updateFrame(index, { status: "Bild wird hochgeladen …" }); try { const imageUrl = await uploadHomepageImage(file); updateFrame(index, { imageUrl, status: "✓ Bild bereit – Rahmen jetzt veröffentlichen." }); } catch (error) { updateFrame(index, { status: `Upload fehlgeschlagen: ${error?.message || "Unbekannter Fehler"}` }); } };
  const saveFrame = async (index, event) => { const saved = await createHomepageSection(event); if (saved) updateFrame(index, { imageUrl: "", status: "" }); };
  const frameForm = (label, index) => <section className="homepage-builder panel"><span className="eyebrow">{label}</span><h2>Rahmen gestalten</h2><form onSubmit={(event) => saveFrame(index, event)} className="homepage-form"><input name="title" placeholder="Rahmen-Überschrift" required/><textarea name="content" placeholder="Text für den Rahmen" required/><input name="image_url" value={frames[index].imageUrl} onChange={(event) => updateFrame(index, { imageUrl: event.target.value })} placeholder="Bild-URL (optional)"/><label className="homepage-image-picker">Foto hochladen<input type="file" accept="image/*,.heic,.heif,.avif" onChange={(event) => chooseImage(index, event)}/></label>{frames[index].imageUrl && <img className="homepage-upload-preview" src={frames[index].imageUrl} alt="Bildvorschau"/>}{frames[index].status && <p className="homepage-upload-status" aria-live="polite">{frames[index].status}</p>}<select name="frame_style" defaultValue="standard"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select><button className="primary-button">Rahmen veröffentlichen</button></form></section>;
  return <section className="home-page"><div className="page-heading"><div><span className="eyebrow">REGION {activeRegion?.name || "ENNSTAL CONNECT"}</span><h1>Willkommen, {getName(profile)}</h1><p>Entdecke Beiträge, Gruppen und gemeinsame Aktivitäten in {activeRegion?.name || "deiner Region"}.</p></div>{isHeadAdmin(profile?.role) && <div className="head-admin-profile-badge">★ Hauptadmin · Betreiber</div>}</div><MunicipalityWelcome profile={profile} activeRegion={activeRegion}/><section className="panel ec-new-features-home" aria-label="Neue Funktionen bei Ennstal Connect" style={{padding:"20px",marginBottom:"20px",borderRadius:"18px"}}><span className="eyebrow">NEU BEI ENNSTAL CONNECT</span><h2>Das ist neu in unserer Community</h2><p>Wir verbessern die Profile und machen regionale Kontakte noch persönlicher.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"12px"}}><article style={{padding:"14px",border:"1px solid #dce5ed",borderRadius:"14px"}}><strong>📍 Heimatbezirk im Profil</strong><p>Zeige, aus welchem Bezirk du kommst. Fehlt deine Auswahl noch, wirst du beim Anmelden danach gefragt.</p></article><article style={{padding:"14px",border:"1px solid #dce5ed",borderRadius:"14px"}}><strong>🔵 Unternehmerprofile</strong><p>Regionale Unternehmen werden durch einen blauen Rollenstern und ihren Firmennamen im Profil erkennbar.</p></article><article style={{padding:"14px",border:"1px solid #dce5ed",borderRadius:"14px"}}><strong>🎨 Individuelle Profile</strong><p>Neue Layouts und Designs geben deinem Community-Profil einen persönlicheren Look.</p></article><article style={{padding:"14px",border:"1px solid #dce5ed",borderRadius:"14px"}}><strong>📸 Engagement zeigen</strong><p>Besondere Community-Aufgaben wie Community-Fotograf bleiben im ausführlichen Profil sichtbar.</p></article></div><button type="button" className="primary-button" style={{marginTop:16}} onClick={() => setFeatureHelp(0)}>📖 Alle Funktionen erklären</button><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginTop:12}}>{featureTopics.map((topic,index) => <button type="button" key={topic.title} onClick={() => setFeatureHelp(index)} style={{padding:12,textAlign:"left",border:"1px solid #dce5ed",borderRadius:12,background:"white",cursor:"pointer"}}><strong>{topic.title}</strong><span style={{display:"block",marginTop:4,fontSize:13}}>Mehr erfahren →</span></button>)}</div>{featureHelp !== null && <div role="presentation" onClick={() => setFeatureHelp(null)} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(5,18,30,.65)",display:"grid",placeItems:"center",padding:16}}><div role="dialog" aria-modal="true" aria-label="Funktionen von Ennstal Connect" onClick={(event) => event.stopPropagation()} style={{background:"white",color:"#152536",borderRadius:20,padding:24,width:"min(100%,530px)",maxHeight:"85vh",overflowY:"auto",boxShadow:"0 16px 50px #0003"}}><button type="button" onClick={() => setFeatureHelp(null)} aria-label="Schließen" style={{float:"right",padding:8}}>✕</button><span className="eyebrow">SO FUNKTIONIERT ENNSTAL CONNECT</span><h2>{featureTopics[featureHelp].title}</h2><p>{featureTopics[featureHelp].summary}</p><p>{featureTopics[featureHelp].details}</p><div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:20}}><button type="button" onClick={() => setFeatureHelp((featureHelp + featureTopics.length - 1) % featureTopics.length)}>← Zurück</button><button type="button" className="primary-button" onClick={() => setFeatureHelp((featureHelp + 1) % featureTopics.length)}>Weiter →</button></div></div></div>}</section><TodayInRegion activeRegion={activeRegion} user={user} members={members} groups={groups} events={events} forumPosts={forumPosts}/><ReturnPulse profile={profile} user={user} members={members} groups={groups} events={events} forumPosts={forumPosts}/><MemberInviteCard profile={profile} user={user}/><MemberActivationPanel profile={profile} user={user} poll={weeklyPoll} groups={groups} events={events} eventRsvps={eventRsvps} forumPosts={forumPosts} forumReplies={forumReplies} friendships={friendships}/><OneSmallAction user={user} members={members} forumPosts={forumPosts} forumReplies={forumReplies} events={events} eventRsvps={eventRsvps} welcomeGreetings={welcomeGreetings} onReplyForum={onReplyForum} onRespondEvent={onRespondEvent} onSendWelcome={onSendWelcome}/><RegionalDiscovery user={user} members={members} groups={groups} events={events} eventRsvps={eventRsvps} friendships={friendships} onOpenGroup={onOpenGroup}/><NewMemberWelcome user={user} members={members} greetings={welcomeGreetings} onSendWelcome={onSendWelcome}/><EngagementPanel poll={weeklyPoll} badges={welcomeBadges} groups={groups} featuredGroup={featuredGroup} requests={communityRequests} user={user} isHeadAdmin={isHeadAdmin(profile?.role)} onVote={onVote} onCreatePoll={onCreatePoll} onFeatureGroup={onFeatureGroup} onCreateRequest={onCreateRequest} onCloseRequest={onCloseRequest} onOpenGroup={onOpenGroup}/>{canEdit && <details className="homepage-editor-toggle"><summary>Startseite für {activeRegion?.name || "diese Region"} gestalten</summary><div className="homepage-builder-grid">{frameForm("NEUER BEITRAG", 0)}{frameForm("WEITERER BEITRAG", 1)}</div></details>}{homepageSections.length > 0 && <div className="homepage-sections">{homepageSections.map((x) => <article className={`homepage-frame ${x.frame_style || "standard"}`} key={x.id}>{x.image_url && <img src={x.image_url} alt=""/>}<div><span className="frame-kicker">{activeRegion?.name || "ENNSTAL CONNECT"}</span><h2>{x.title}</h2><p>{x.content}</p>{canEdit && <div className="content-manage-actions"><button onClick={() => editHomepageSection(x)}>Bearbeiten</button><button className="danger-button" onClick={() => deleteHomepageSection(x)}>Löschen</button></div>}</div></article>)}</div>}</section>;
}

function TodayInRegion({ activeRegion, user, members, groups, events, forumPosts }) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 86400000;
  const today = (value) => {
    const time = value ? new Date(value).getTime() : 0;
    return time >= startOfDay && time < endOfDay;
  };
  const onlineMembers = members.filter((member) =>
    member?.id !== user?.id &&
    member?.account_status !== "SUSPENDED" &&
    !member?.is_test_account &&
    !member?.hide_online_status &&
    member?.is_online
  ).length;
  const newMembers = members.filter((member) => member?.id !== user?.id && today(member?.created_at)).length;
  const newPosts = forumPosts.filter((post) => post?.scope === "COMMUNITY" && today(post?.created_at)).length;
  const todayEvents = events.filter((event) => event?.status !== "CANCELLED" && today(event?.event_at)).length;
  const newGroups = groups.filter((group) => today(group?.created_at)).length;
  const go = (page) => window.dispatchEvent(new CustomEvent("ec:navigate", { detail: { page, source: "today-in-region" } }));
  const cards = [
    { key:"online", count:onlineMembers, label:"gerade online", page:"members" },
    { key:"members", count:newMembers, label:"heute neu", page:"members" },
    { key:"forum", count:newPosts, label:"neue Forumsbeiträge", page:"forum" },
    { key:"events", count:todayEvents, label:"Termine heute", page:"community" },
    { key:"groups", count:newGroups, label:"neue Gruppen", page:"groups" }
  ];
  return <section className="today-in-region panel">
    <div className="today-in-region-heading"><div><span className="eyebrow">HEUTE IN DEINER REGION</span><h2>{activeRegion?.name || "Ennstal Connect"} auf einen Blick</h2><p>Das Wichtigste aus deiner Region, ohne lange suchen zu müssen.</p></div><span className="today-in-region-date">{now.toLocaleDateString("de-AT", { weekday:"long", day:"2-digit", month:"2-digit" })}</span></div>
    <div className="today-in-region-grid">{cards.map((card) => <button type="button" key={card.key} onClick={() => go(card.page)}><strong>{card.count}</strong><span>{card.label}</span><small>Öffnen →</small></button>)}</div>
  </section>;
}

function ReturnPulse({ profile, user, members, groups, events, forumPosts }) {
  const [previousSeenAt, setPreviousSeenAt] = useState(undefined);
  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let cancelled = false;
    const run = async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase.from("user_settings").select("last_home_seen_at").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setPreviousSeenAt(error ? null : (data?.last_home_seen_at || null));
      const payload = { user_id: user.id, last_home_seen_at: now };
      const { error: saveError } = await supabase.from("user_settings").upsert(payload, { onConflict: "user_id" });
      if (saveError && !cancelled) console.warn("Startseiten-Zeitpunkt konnte nicht gespeichert werden:", saveError.message);
    };
    void run();
    return () => { cancelled = true; };
  }, [user?.id]);
  if (previousSeenAt === undefined) return null;
  const since = previousSeenAt ? new Date(previousSeenAt).getTime() : null;
  const isNew = (value) => since && value && new Date(value).getTime() > since;
  const newMembers = since ? members.filter((member) => member.id !== user?.id && isNew(member.created_at)).length : 0;
  const newGroups = since ? groups.filter((group) => isNew(group.created_at)).length : 0;
  const newPosts = since ? forumPosts.filter((post) => isNew(post.created_at)).length : 0;
  const newEvents = since ? events.filter((event) => event.status !== "CANCELLED" && isNew(event.created_at)).length : 0;
  const totalNew = newMembers + newGroups + newPosts + newEvents;
  const streak = Number(profile?.active_streak || 0);
  const lastSeenLabel = previousSeenAt ? new Date(previousSeenAt).toLocaleString("de-AT", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
  const items = [
    { key:"members", count:newMembers, label:newMembers === 1 ? "neues Mitglied" : "neue Mitglieder", page:"members" },
    { key:"groups", count:newGroups, label:newGroups === 1 ? "neue Gruppe" : "neue Gruppen", page:"groups" },
    { key:"forum", count:newPosts, label:newPosts === 1 ? "neuer Forumsbeitrag" : "neue Forumsbeiträge", page:"forum" },
    { key:"events", count:newEvents, label:newEvents === 1 ? "neuer Termin" : "neue Termine", page:"community" },
  ].filter((item) => item.count > 0);
  const go = (page) => window.dispatchEvent(new CustomEvent("ec:navigate", { detail:{ page, source:"return-pulse" } }));
  return <section className={"return-pulse panel" + (totalNew ? " has-news" : "")}>
    <div className="return-pulse-copy"><span className="eyebrow">SEIT DEINEM LETZTEN BESUCH</span><h2>{previousSeenAt ? (totalNew ? "In deiner Region hat sich etwas getan." : "Du bist auf dem aktuellen Stand.") : "Schön, dass du da bist."}</h2><p>{previousSeenAt ? (totalNew ? "Hier siehst du nur das, was seit deinem letzten Besuch neu dazugekommen ist." : "Es gibt gerade keine neuen Inhalte seit deinem letzten Besuch.") : "Ab jetzt zeigt dir diese Karte neue Mitglieder, Gruppen, Beiträge und Termine seit deinem letzten Besuch."}</p>{lastSeenLabel && <small>Letzter Startseitenbesuch: {lastSeenLabel}</small>}</div>
    {items.length > 0 && <div className="return-pulse-items">{items.map((item) => <button type="button" key={item.key} onClick={() => go(item.page)}><strong>{item.count}</strong><span>{item.label}</span><b>Öffnen →</b></button>)}</div>}
    {streak > 1 && <div className="return-pulse-streak"><span>↻</span><div><strong>{streak} aktive Tage in Folge</strong><small>Deine regelmäßige Beteiligung hält die Community lebendig.</small></div></div>}
  </section>;
}
function MemberInviteCard({ profile, user }) {
  const [inviteCount, setInviteCount] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!supabase || !user?.id) return undefined;
    let cancelled = false;
    supabase.from("community_referrals").select("invited_user_id", { count:"exact", head:true }).eq("inviter_id", user.id).then(({ count, error }) => {
      if (!cancelled && !error) setInviteCount(Number(count || 0));
    });
    return () => { cancelled = true; };
  }, [user?.id]);
  if (!user?.id || !profile?.nickname) return null;
  const inviteUrl = location.origin + "/?ref=" + encodeURIComponent(profile.nickname) + "&share=20260927b";
  const copiedFeedback = () => { setCopied(true); window.setTimeout(() => setCopied(false), 2200); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); copiedFeedback(); } catch {}
  };
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title:"Ennstal Connect", text:"Komm zu Ennstal Connect – unserer regionalen Community.", url:inviteUrl });
      } else {
        await copy();
      }
    } catch (error) {
      if (error?.name !== "AbortError") await copy();
    }
  };
  return <section className="member-invite-card panel">
    <div><span className="eyebrow">COMMUNITY WÄCHST DURCH MENSCHEN</span><h2>Lade jemanden aus deiner Region ein</h2><p>Teile deinen persönlichen Einladungslink. Registrierungen über diesen Link werden deiner Einladung zugeordnet.</p>{inviteCount > 0 && <small><strong>{inviteCount}</strong> {inviteCount === 1 ? "Person ist" : "Personen sind"} bereits über deine Einladung beigetreten.</small>}</div>
    <div className="member-invite-actions"><button type="button" className="primary-button" onClick={share}>↗ Einladung teilen</button><button type="button" className="secondary-button" onClick={copy}>{copied ? "✓ Link kopiert" : "Link kopieren"}</button></div>
  </section>;
}

function MemberActivationPanel({ profile, user, poll, groups, events, eventRsvps, forumPosts, forumReplies, friendships }) {
  if (!user?.id) return null;
  const interests = Array.isArray(profile?.interests) ? profile.interests : String(profile?.interests || "").split(",").filter(Boolean);
  const profileReady = Boolean(profile?.avatar_url && (profile?.bio || profile?.location || interests.length));
  const groupJoined = groups.some((group) => (group.member_ids || []).includes(user.id));
  const voted = poll?.my_vote !== null && poll?.my_vote !== undefined;
  const regionalPostIds = new Set(forumPosts.map((post) => post.id));
  const replied = forumReplies.some((reply) => reply.author_id === user.id && regionalPostIds.has(reply.post_id));
  const visibleEventIds = new Set(events.filter((event) => event.status !== "CANCELLED" && new Date(event.event_at).getTime() >= Date.now()).map((event) => event.id));
  const eventJoined = eventRsvps.some((rsvp) => rsvp.user_id === user.id && visibleEventIds.has(rsvp.event_id) && ["GOING","INTERESTED"].includes(rsvp.status));
  const connected = friendships.some((friendship) => friendship.status === "ACCEPTED" && (friendship.requester_id === user.id || friendship.receiver_id === user.id));
  const tasks = [
    { key:"profile", title:"Profil persönlich machen", text:"Profilbild plus Bio, Ort oder Interessen ergänzen.", done:profileReady, action:"profile", label:"Profil ergänzen" },
    { key:"group", title:"Eine Gruppe finden", text:"Tritt einer Gruppe aus deiner Region bei.", done:groupJoined, action:"groups", label:"Gruppen entdecken" },
    { key:"poll", title:"Region mitgestalten", text:"Stimme bei der aktuellen Wochenfrage ab.", done:voted, action:"poll", label:"Jetzt abstimmen" },
    { key:"forum", title:"Erste Antwort schreiben", text:"Hilf einer Diskussion mit einer echten Antwort weiter.", done:replied, action:"forum", label:"Zum Forum" },
    { key:"event", title:"Bei einem Termin reagieren", text:"Markiere einen Termin als interessant oder sage zu.", done:eventJoined, action:"community", label:"Termine ansehen" },
    { key:"friend", title:"Erste Verbindung", text:"Baue eine bestätigte Freundschaft in der Community auf.", done:connected, action:"members", label:"Mitglieder entdecken" },
  ];
  const completed = tasks.filter((task) => task.done).length;
  const next = tasks.find((task) => !task.done);
  const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : 0;
  const accountDays = createdAt ? Math.max(1, Math.floor((Date.now() - createdAt) / 86400000) + 1) : null;
  const firstWeek = accountDays && accountDays <= 7;
  const go = (task) => {
    if (task.action === "poll") {
      document.querySelector(".weekly-poll")?.scrollIntoView({ behavior:"smooth", block:"center" });
      return;
    }
    window.dispatchEvent(new CustomEvent("ec:navigate", { detail:{ page:task.action, source:"activation-mission" } }));
  };
  return <section className={"member-activation-panel panel" + (completed === tasks.length ? " is-complete" : "")}>
    <div className="member-activation-head">
      <div><span className="eyebrow">{firstWeek ? "DEINE ERSTEN 7 TAGE · TAG " + accountDays : "DEINE COMMUNITY-MISSION"}</span><h2>{completed === tasks.length ? "Du bist richtig angekommen." : "Mach aus deinem Konto eine echte Verbindung zur Region."}</h2><p>{completed === tasks.length ? "Du hast alle wichtigen ersten Schritte erledigt. Ab jetzt zählen echte Gespräche, Treffen und regelmäßige Beteiligung." : "Kleine Schritte bringen dich schneller zu Menschen, Gruppen und Aktivitäten, die zu dir passen."}</p></div>
      <div className="member-activation-score"><strong>{completed}/{tasks.length}</strong><span>erledigt</span></div>
    </div>
    <div className="member-activation-progress" aria-label={completed + " von " + tasks.length + " Schritten erledigt"}><i style={{width:String(Math.round(completed / tasks.length * 100)) + "%"}}/></div>
    <div className="member-activation-tasks">{tasks.map((task) => <button type="button" key={task.key} className={task.done ? "is-done" : task === next ? "is-next" : ""} onClick={() => !task.done && go(task)} disabled={task.done}><b>{task.done ? "✓" : task === next ? "→" : "○"}</b><span><strong>{task.title}</strong><small>{task.done ? "Erledigt" : task.text}</small></span>{!task.done && <em>{task.label}</em>}</button>)}</div>
    {next && <button type="button" className="primary-button member-activation-next" onClick={() => go(next)}>Nächster Schritt: {next.label} →</button>}
  </section>;
}
function OneSmallAction({ user, members, forumPosts, forumReplies, events, eventRsvps, welcomeGreetings, onReplyForum, onRespondEvent, onSendWelcome }) {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user?.id) return null;

  const replyCounts = new Map();
  forumReplies.forEach((item) => replyCounts.set(item.post_id, (replyCounts.get(item.post_id) || 0) + 1));
  const unanswered = forumPosts
    .filter((post) => post.scope === "COMMUNITY" && post.author_id !== user.id && !replyCounts.get(post.id))
    .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

  const myEventIds = new Set(eventRsvps.filter((item) => item.user_id === user.id).map((item) => item.event_id));
  const nextEvent = events
    .filter((event) => event.status !== "CANCELLED" && !myEventIds.has(event.id) && new Date(event.event_at).getTime() >= Date.now())
    .sort((a,b) => new Date(a.event_at) - new Date(b.event_at))[0];

  const greeted = new Set(welcomeGreetings.filter((item) => item.sender_id === user.id).map((item) => item.recipient_id));
  const newcomer = members
    .filter((member) => member.id !== user.id && !member.is_test_account && member.account_status !== "SUSPENDED" && !greeted.has(member.id) && Date.now() - new Date(member.created_at || 0).getTime() <= 30 * 86400000)
    .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  if (unanswered) {
    const author = members.find((member) => member.id === unanswered.author_id);
    return <section className="one-small-action panel">
      <div className="one-small-action-head"><span className="eyebrow">HEUTE NUR EINE KLEINE AKTION</span><h2>Sei die erste Antwort.</h2><p><strong>{getName(author) || "Ein Mitglied"}</strong> wartet noch auf Rückmeldung.</p></div>
      <article className="one-small-action-topic"><small>FORUM</small><strong>{unanswered.title}</strong><p>{String(unanswered.content || "").slice(0,220)}{String(unanswered.content || "").length > 220 ? "…" : ""}</p></article>
      <form className="one-small-action-reply" onSubmit={(event) => { event.preventDefault(); const text=reply.trim(); if(text.length<2) return; void run(async()=>{ await onReplyForum(unanswered,text); setReply(""); }); }}>
        <textarea value={reply} onChange={(event)=>setReply(event.target.value)} minLength="2" placeholder="Kurze Antwort schreiben …" required/>
        <button className="primary-button" disabled={busy || reply.trim().length < 2}>{busy ? "Wird gesendet …" : "Antwort direkt senden"}</button>
      </form>
    </section>;
  }

  if (nextEvent) {
    return <section className="one-small-action panel">
      <div className="one-small-action-head"><span className="eyebrow">HEUTE NUR EINE KLEINE AKTION</span><h2>Reagiere auf den nächsten Termin.</h2><p>Ein Klick reicht – so sehen andere, dass sich etwas bewegt.</p></div>
      <article className="one-small-action-topic"><small>EVENT · {new Date(nextEvent.event_at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</small><strong>{nextEvent.title}</strong><p>{nextEvent.location || "Ort folgt"}</p></article>
      <div className="one-small-action-buttons"><button type="button" className="secondary-button" disabled={busy} onClick={()=>void run(()=>onRespondEvent(nextEvent,"INTERESTED"))}>☆ Interessiert</button><button type="button" className="primary-button" disabled={busy} onClick={()=>void run(()=>onRespondEvent(nextEvent,"GOING"))}>✓ Ich komme</button></div>
    </section>;
  }

  if (newcomer) {
    return <section className="one-small-action panel">
      <div className="one-small-action-head"><span className="eyebrow">HEUTE NUR EINE KLEINE AKTION</span><h2>Heiße jemanden willkommen.</h2><p>Ein kurzer Gruß macht den Einstieg persönlicher.</p></div>
      <article className="one-small-action-person"><img src={newcomer.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(newcomer)}</strong><small>Neu in deiner Region</small></span><button type="button" className="primary-button" disabled={busy} onClick={()=>void run(()=>onSendWelcome(newcomer))}>👋 Willkommen heißen</button></article>
    </section>;
  }

  return null;
}

function RegionalDiscovery({ user, members, groups, events, eventRsvps, friendships, onOpenGroup }) {
  if (!user?.id) return null;
  const friendIds = new Set(friendships.filter((friendship) => friendship.status === "ACCEPTED").flatMap((friendship) => [friendship.requester_id, friendship.receiver_id]));
  friendIds.delete(user.id);
  const memberPicks = members
    .filter((member) => member.id !== user.id && member.account_status !== "SUSPENDED" && !member.is_test_account && !friendIds.has(member.id))
    .sort((a,b) => Number(Boolean(b.is_online)) - Number(Boolean(a.is_online)) || new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0,3);
  const joinedGroupIds = new Set(groups.filter((group) => (group.member_ids || []).includes(user.id)).map((group) => group.id));
  const groupPicks = groups
    .filter((group) => !joinedGroupIds.has(group.id))
    .sort((a,b) => Number(b.member_count || 0) - Number(a.member_count || 0) || String(a.name || "").localeCompare(String(b.name || ""), "de"))
    .slice(0,2);
  const myEventIds = new Set(eventRsvps.filter((rsvp) => rsvp.user_id === user.id).map((rsvp) => rsvp.event_id));
  const eventPicks = events
    .filter((event) => event.status !== "CANCELLED" && !myEventIds.has(event.id) && new Date(event.event_at).getTime() >= Date.now())
    .sort((a,b) => new Date(a.event_at) - new Date(b.event_at))
    .slice(0,2);
  if (!memberPicks.length && !groupPicks.length && !eventPicks.length) return null;
  const openMember = (member) => window.dispatchEvent(new CustomEvent("ec:open-profile", { detail:{ profileId:member.id, nickname:getName(member), source:"regional-discovery" } }));
  const openEvents = () => window.dispatchEvent(new CustomEvent("ec:navigate", { detail:{ page:"community", source:"regional-discovery" } }));
  return <section className="regional-discovery panel">
    <div className="regional-discovery-head"><span className="eyebrow">JETZT ENTDECKEN</span><h2>Mehr aus deiner Region</h2><p>Neue Menschen, aktive Gruppen und die nächsten Termine – ohne lange suchen zu müssen.</p></div>
    <div className="regional-discovery-grid">
      {memberPicks.length > 0 && <article><h3>Menschen</h3><div>{memberPicks.map((member) => <button type="button" className="regional-discovery-person" key={member.id} onClick={() => openMember(member)}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(member)}</strong><small>{member.is_online ? "Gerade aktiv" : "Mitglied aus deiner Region"}</small></span><b>Profil →</b></button>)}</div></article>}
      {groupPicks.length > 0 && <article><h3>Gruppen</h3><div>{groupPicks.map((group) => <button type="button" className="regional-discovery-group" key={group.id} onClick={() => onOpenGroup(group)}>{group.image_url ? <img src={group.image_url} alt=""/> : <span className="regional-discovery-placeholder">◉</span>}<span><strong>{group.name}</strong><small>{Number(group.member_count || 0) ? Number(group.member_count) + " Mitglieder" : "Offen für neue Mitglieder"}</small></span><b>Ansehen →</b></button>)}</div></article>}
      {eventPicks.length > 0 && <article><h3>Termine</h3><div>{eventPicks.map((event) => <button type="button" className="regional-discovery-event" key={event.id} onClick={openEvents}><span className="regional-discovery-date"><b>{new Date(event.event_at).toLocaleDateString("de-AT",{day:"2-digit"})}</b><small>{new Date(event.event_at).toLocaleDateString("de-AT",{month:"short"})}</small></span><span><strong>{event.title}</strong><small>{event.location || "In deiner Region"}</small></span><b>Termin →</b></button>)}</div></article>}
    </div>
  </section>;
}
function NewMemberWelcome({ user, members, greetings, onSendWelcome }) {
  if (!user?.id) return null;
  const cutoff = Date.now() - (30 * 86400000);
  const greetedIds = new Set(greetings.filter((item) => item.sender_id === user.id).map((item) => item.recipient_id));
  const newcomers = members
    .filter((member) => member.id !== user.id && member.account_status !== "SUSPENDED" && !member.is_test_account && new Date(member.created_at || 0).getTime() >= cutoff)
    .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0,4);
  if (!newcomers.length) return null;
  return <section className="new-member-welcome panel">
    <div className="new-member-welcome-head"><span className="eyebrow">NEU IN DEINER REGION</span><h2>Heiße neue Mitglieder willkommen</h2><p>Ein kurzer Gruß senkt die Hürde für den ersten Kontakt. Pro Mitglied kannst du einmal einen freundlichen Willkommensgruß senden.</p></div>
    <div className="new-member-welcome-grid">
      {newcomers.map((member) => {
        const sent = greetedIds.has(member.id);
        return <article key={member.id}>
          <img src={member.avatar_url || DEFAULT_AVATAR} alt=""/>
          <div><strong>{getName(member)}</strong><small>Seit {new Date(member.created_at).toLocaleDateString("de-AT")} dabei</small></div>
          <button type="button" className={sent ? "secondary-button is-sent" : "primary-button"} disabled={sent} onClick={() => onSendWelcome(member)}>{sent ? "✓ Begrüßt" : "👋 Willkommen heißen"}</button>
        </article>;
      })}
    </div>
  </section>;
}

function CommunityNeedsYou({ user, members, forumPosts, forumReplies, requests }) {
  if (!user?.id) return null;
  const replyCount = (postId) => forumReplies.filter((reply) => reply.post_id === postId).length;
  const unanswered = forumPosts
    .filter((post) => post.scope === "COMMUNITY" && post.author_id !== user.id && replyCount(post.id) === 0)
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0,2);
  const openRequests = requests
    .filter((request) => request.author_id !== user.id && String(request.status || "ACTIVE") === "ACTIVE")
    .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0,2);
  if (!unanswered.length && !openRequests.length) return null;
  const memberName = (id) => getName(members.find((member) => member.id === id)) || "Mitglied";
  const goForum = () => window.dispatchEvent(new CustomEvent("ec:navigate", { detail:{ page:"forum", source:"community-needs-you" } }));
  const goHome = () => document.querySelector(".community-request-board")?.scrollIntoView({ behavior:"smooth", block:"center" });
  return <section className="community-needs-you panel">
    <div className="community-needs-you-head"><span className="eyebrow">HIER KANNST DU GERADE ETWAS BEWIRKEN</span><h2>Noch unbeantwortet</h2><p>Statt nur neue Inhalte zu zeigen, holen wir offene Gespräche nach vorne. Eine hilfreiche Antwort reicht oft schon, damit eine Community lebendig wird.</p></div>
    <div className="community-needs-you-grid">
      {unanswered.map((post) => <button type="button" key={post.id} onClick={goForum}><span className="community-needs-you-icon">💬</span><span><small>FORUM · von {memberName(post.author_id)}</small><strong>{post.title}</strong><em>Noch keine Antwort – vielleicht weißt du etwas dazu.</em></span><b>Antworten →</b></button>)}
      {openRequests.map((request) => <button type="button" key={request.id} onClick={goHome}><span className="community-needs-you-icon">🤝</span><span><small>COMMUNITY-AUFRUF · von {memberName(request.author_id)}</small><strong>{request.title}</strong><em>Offener Aufruf aus deiner Region.</em></span><b>Ansehen →</b></button>)}
    </div>
  </section>;
}
function EngagementPanel({ poll, badges, groups, featuredGroup, requests, user, isHeadAdmin, onVote, onCreatePoll, onFeatureGroup, onCreateRequest, onCloseRequest, onOpenGroup }) { const options = Array.isArray(poll?.options) ? poll.options : []; const counts = Array.isArray(poll?.vote_counts) ? poll.vote_counts : []; const total = counts.reduce((sum, value) => sum + Number(value || 0), 0); const category = (value) => value === "MITFAHREN" ? "🚗 Mitfahrgelegenheit" : value === "WANDERPARTNER" ? "🥾 Wanderpartner" : "📍 Regionaler Tipp"; return <section className="engagement-grid"><article className="panel weekly-poll regional-pulse"><div className="regional-pulse-head"><div><span className="eyebrow">WAS BEWEGT DEINE REGION?</span><p>Eine praktische Wochenfrage für Alltag, Freizeit und gemeinsames Miteinander.</p></div>{poll && <span className="regional-pulse-total">{total} Stimme{total === 1 ? "" : "n"}</span>}</div>{poll ? <><h2>{poll.question}</h2><div className="weekly-poll-options">{options.map((option, index) => { const count = Number(counts[index] || 0); const selected = poll.my_vote !== null && poll.my_vote !== undefined && Number(poll.my_vote) === index; return <button className={selected ? "selected" : ""} key={`${option}-${index}`} onClick={() => onVote(index)}><span>{option}</span><b>{total ? Math.round(count / total * 100) : 0}%</b><small>{count} Stimme{count === 1 ? "" : "n"}</small></button>; })}</div><small className="regional-pulse-note">Du kannst deine Auswahl jederzeit ändern, solange die Wochenfrage aktiv ist.</small></> : <div className="regional-pulse-empty"><strong>Noch keine Wochenfrage aktiv.</strong><span>Die nächste Frage kann z. B. Veranstaltungen, Treffpunkte, Hilfeangebote oder regionale Services betreffen.</span></div>}{isHeadAdmin && <form className="engagement-admin-form regional-pulse-admin" onSubmit={onCreatePoll}><span className="regional-pulse-admin-hint">Head Admin · praktische, nicht-personenbezogene Frage für die aktuelle Region</span><input name="question" placeholder="z. B. Welches Community-Angebot soll als Nächstes stärker sichtbar werden?" required/><input name="option" placeholder="Antwortmöglichkeit 1" required/><input name="option" placeholder="Antwortmöglichkeit 2" required/><input name="option" placeholder="Antwortmöglichkeit 3 (optional)"/><input name="option" placeholder="Antwortmöglichkeit 4 (optional)"/><button className="secondary-button">Wochenfrage veröffentlichen</button></form>}</article><article className="panel featured-group"><span className="eyebrow">GRUPPE DER WOCHE</span>{featuredGroup ? <button className="featured-group-open" onClick={() => onOpenGroup(featuredGroup)}>{featuredGroup.image_url && <img src={featuredGroup.image_url} alt=""/>}<div><h2>{featuredGroup.name}</h2><p>{featuredGroup.description}</p><strong>Gruppe ansehen →</strong></div></button> : <p>Der Head Admin kann hier eine Gruppe hervorheben.</p>}{isHeadAdmin && <select value={featuredGroup?.id || ""} onChange={(event) => onFeatureGroup(event.target.value)}><option value="">Keine Gruppe ausgewählt</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}</article><article className="panel welcome-badges"><span className="eyebrow">DEINE ERSTEN SCHRITTE</span><h2>Willkommens-Badges</h2><div>{badges.map((badge) => <span className={badge.earned ? "earned" : ""} key={badge.key}><b>{badge.icon}</b><span>{badge.title}<small>{badge.description}</small></span>{badge.earned ? "✓" : ""}</span>)}</div></article><article className="panel community-request-board"><span className="eyebrow">GEMEINSAM UNTERWEGS</span><h2>Mitfahren, Wandern & Tipps</h2><form onSubmit={onCreateRequest}><select name="category" defaultValue="WANDERPARTNER"><option value="MITFAHREN">🚗 Mitfahrgelegenheit</option><option value="WANDERPARTNER">🥾 Wanderpartner</option><option value="REGIONALER_TIPP">📍 Leichte Wanderrouten & regionale Tipps</option></select><input name="title" placeholder="z. B. Suche Wanderpartner für den Sonntag" required/><textarea name="content" placeholder="Beschreibe kurz, was du suchst oder welchen Tipp du brauchst …" required/><button className="primary-button">Veröffentlichen</button></form><div className="community-request-list">{requests.map((request) => <article key={request.id}><small>{category(request.category)}</small><strong>{request.title}</strong><p>{request.content}</p>{request.author_id === user?.id && <button className="text-button" onClick={() => onCloseRequest(request)}>Als erledigt schließen</button>}</article>)}{!requests.length && <p>Noch keine Aufrufe. Starte den ersten!</p>}</div></article></section>; }

function MemberGrid({ members, profile, friendships, onOpen, onMessage }) {
 const [highlights,setHighlights]=useState({});
 useEffect(()=>{let alive=true;supabase.from("kaufpunkte_highlights").select("user_id,active_until").gt("active_until",new Date().toISOString()).then(({data,error})=>{if(alive&&!error)setHighlights(Object.fromEntries((data||[]).map(row=>[row.user_id,row.active_until])));});return()=>{alive=false;};},[members.length]);
 const staff=m=>["HEAD_ADMIN","ADMIN","MUNICIPALITY","SUPPORTER"].includes(m.role)||m.account_badge==="BUSINESS";
 const sorted=[...members].sort((a,b)=>Number(staff(b))-Number(staff(a))||Number(Boolean(highlights[b.id]))-Number(Boolean(highlights[a.id])));
 return <div className="member-grid">{sorted.map(m=><div key={m.id} className={highlights[m.id]&&!staff(m)?"ec-member-highlight":""}><MemberCard member={m} profile={profile} friendships={friendships} onOpen={onOpen} onMessage={onMessage}/>{highlights[m.id]&&!staff(m)&&<small>✨ Hervorgehobenes Mitglied</small>}</div>)}</div>;
}
function MemberCard(props) { return <MemberCardView {...props}/>; }

function FriendRequests({ incoming, sent, memberById, respond, cancel }) { return <section><div className="page-heading"><div><span className="eyebrow">VERBINDUNGEN</span><h1>Freundschaftsanfragen</h1><p>Anfragen werden erst nach Annahme zu Freunden.</p></div></div><h2>Eingehend</h2><div className="cards">{incoming.map((r) => { const m = memberById(r.requester_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>{roleLabel(m.role)}</span></div><div className="request-actions"><button className="primary-button" onClick={() => respond(r, true)}>✓ Annehmen</button><button className="danger-button" onClick={() => respond(r, false)}>Ablehnen</button></div></>}</article>; })}{!incoming.length && <div className="empty-card">Keine eingehenden Anfragen.</div>}</div><h2>Gesendet</h2><div className="cards">{sent.map((r) => { const m = memberById(r.receiver_id); return <article className="request-card" key={r.id}>{m && <><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(m)}</strong><span>Wartet auf Antwort</span></div><button className="danger-button" onClick={() => cancel(r)}>Anfrage abbrechen</button></>}</article>; })}{!sent.length && <div className="empty-card">Keine offenen gesendeten Anfragen.</div>}</div></section>; }
function Blocked({ blockedUsers, memberById, unblock }) { return <section><div className="page-heading"><h1>Blockierliste</h1><p>Blockierte Nutzer sehen dich nicht in deinen normalen Community-Listen.</p></div><div className="member-grid">{blockedUsers.map((b) => { const m = memberById(b.blocked_id); return m && <article className="member-card member" key={b.id}><img className="member-avatar" src={m.avatar_url || DEFAULT_AVATAR} alt=""/><strong className="member-nickname">{getName(m)}</strong><button className="secondary-button" onClick={() => unblock(m.id)}>Entsperren</button></article>; })}{!blockedUsers.length && <div className="empty-card">Keine blockierten Nutzer.</div>}</div></section>; }
function Messages({ user, messages, chatMember, setChatMember, memberById, openChat, messageText, setMessageText, sendMessage, deleteMessage }) { return <section><div className="page-heading"><h1>Nachrichten</h1></div>{!chatMember ? <div className="message-overview">{messages.filter((m) => m.receiver_id === user.id || m.sender_id === user.id).map((m) => { const other = memberById(m.sender_id === user.id ? m.receiver_id : m.sender_id); return other && <button className="message-preview" key={m.id} onClick={() => openChat(other)}><img src={other.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(other)}</strong><small>{m.content}</small></span></button>; })}{!messages.length && <div className="empty-card">Noch keine Nachrichten.</div>}</div> : <div className="chat-box"><div className="chat-header"><button className="back-button" onClick={() => setChatMember(null)}>← Zurück</button><MemberMini member={chatMember}/></div><div className="chat-messages">{messages.filter((m) => (m.sender_id === user.id && m.receiver_id === chatMember.id) || (m.sender_id === chatMember.id && m.receiver_id === user.id)).map((m) => <div className={`chat-message ${m.sender_id === user.id ? "mine" : ""}`} key={m.id}><p>{m.content}</p><small>{new Date(m.created_at).toLocaleString("de-AT")}</small><button className="message-delete-button" onClick={() => deleteMessage(m)} aria-label="Nachricht löschen">×</button></div>)}</div><form className="message-form" onSubmit={sendMessage}><textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Nachricht schreiben …"/><button className="primary-button">Senden</button></form></div>}</section>; }
function NotificationCenter({ notifications, onOpen, onMarkAll, members, onOpenMember, showNotice }) {
  const unread = notifications.filter((item) => !item.read_at).length;
  const [nudges, setNudges] = useState([]);
  const [nudgeBusy, setNudgeBusy] = useState("");

  const loadNudges = async () => {
    const { data, error } = await supabase.rpc("member_nudge_inbox");
    if (!error) setNudges(data || []);
  };

  useEffect(() => {
    void loadNudges();
  }, [notifications.length]);

  const nudgeBack = async (senderId) => {
    if (!senderId || nudgeBusy) return;
    setNudgeBusy(senderId);
    const { data, error } = await supabase.rpc("member_nudge", { p_recipient_id: senderId });
    setNudgeBusy("");
    if (error) {
      showNotice?.(error.message);
      return;
    }
    const count = Number(data?.[0]?.nudge_count || 0);
    showNotice?.(count > 1 ? `Zurückgestupst · schon ${count}× zwischen euch.` : "Zurückgestupst 👋");
    await loadNudges();
  };

  const iconFor = (type) => {
    const key = String(type || "").toUpperCase();
    if (key === "MESSAGE") return "✉";
    if (key === "FRIEND_REQUEST") return "♥";
    if (key === "PHOTO_LIKE") return "♡";
    if (key === "FORUM_HELPFUL") return "✓";
    if (key === "FORUM_REPLY") return "↩";
    if (key === "ACTIVITY_REWARD") return "✦";
    if (key === "POKE" || key === "NUDGE") return "👋";
    if (key === "ADMIN_FORUM_POST") return "▤";
    if (key === "REFERRAL_JOINED") return "↗";
    if (key === "WELCOME_GREETING") return "👋";
    if (key === "EVENT_REMINDER") return "◷";
    return "◎";
  };

  return <section className="notification-center">
    <div className="page-heading"><div><span className="eyebrow">AKTUELLES FÜR DICH</span><h1>Benachrichtigungen</h1><p>Reaktionen, Nachrichten und wichtige Community-Aktivitäten an einem Ort.</p></div>{unread > 0 && <button type="button" className="secondary-button" onClick={onMarkAll}>Alle als gelesen</button>}</div>

    {nudges.length > 0 && <section className="nudge-inbox panel" aria-label="Anstupser">
      <div className="nudge-inbox-head">
        <div><span className="eyebrow">👋 ANSTUPSER</span><h2>Wer dich angestupst hat</h2><p>Direkt reagieren – ohne erst ein Profil oder Menü öffnen zu müssen.</p></div>
        <span className="nudge-inbox-count">{nudges.length}</span>
      </div>
      <div className="nudge-inbox-list">
        {nudges.map((nudge) => {
          const member = members?.find((item) => item.id === nudge.sender_id);
          return <article className="nudge-inbox-card" key={nudge.sender_id}>
            <button type="button" className="nudge-person" onClick={() => member && onOpenMember?.(member)}>
              <img src={nudge.avatar_url || member?.avatar_url || DEFAULT_AVATAR} alt=""/>
              <span><strong>{nudge.nickname || getName(member)}</strong><small>{new Date(nudge.last_nudged_at).toLocaleString("de-AT")} · {Number(nudge.nudge_count || 1)}× angestupst</small></span>
            </button>
            <div className="nudge-actions">
              <button type="button" className="nudge-back-button" disabled={nudgeBusy === nudge.sender_id} onClick={() => void nudgeBack(nudge.sender_id)}>
                {nudgeBusy === nudge.sender_id ? "Wird gestupst …" : "👋 Zurückstupsen"}
              </button>
              {member && <button type="button" className="nudge-profile-button" onClick={() => onOpenMember?.(member)}>Profil</button>}
            </div>
          </article>;
        })}
      </div>
    </section>}

    <div className="notification-list">
      {notifications.map((item) => <button type="button" key={item.id} className={"notification-card panel" + (item.read_at ? "" : " is-unread")} onClick={() => onOpen(item)}>
        <span className="notification-icon">{iconFor(item.type)}</span>
        <span className="notification-copy"><small>{String(item.type || "INFO").replaceAll("_"," ")}</small><strong>{item.title}</strong><span>{item.body}</span><time>{new Date(item.created_at).toLocaleString("de-AT")}</time></span>
        {!item.read_at && <b className="notification-unread-dot" aria-label="Ungelesen"/>}
      </button>)}
      {!notifications.length && <div className="empty-card">Noch keine Benachrichtigungen. Sobald jemand auf dich reagiert, erscheint es hier.</div>}
    </div>
  </section>;
}

function MemberMini({ member }) { return <div className="member-mini"><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><strong>{getName(member)}</strong></div>; }

function ProfileWelcomeBadges({ badges }) { if (!badges.length) return null; return <section className="panel profile-welcome-badges"><span className="eyebrow">DEINE ERSTEN SCHRITTE</span><h2>Willkommens-Badges</h2><div>{badges.map((badge) => <span className={badge.earned ? "earned" : ""} key={badge.key}><b>{badge.icon}</b><span><strong>{badge.title}</strong><small>{badge.description}</small></span>{badge.earned ? "✓" : ""}</span>)}</div></section>; }

const HOME_DISTRICT_OPTIONS = [["bruck-muerzzuschlag","Bruck-Mürzzuschlag"],["deutschlandsberg","Deutschlandsberg"],["graz-stadt","Graz-Stadt"],["graz-umgebung","Graz-Umgebung"],["hartberg-fuerstenfeld","Hartberg-Fürstenfeld"],["leibnitz","Leibnitz"],["leoben","Leoben"],["liezen","Liezen"],["murau","Murau"],["murtal","Murtal"],["suedoststeiermark","Südoststeiermark"],["voitsberg","Voitsberg"],["weiz","Weiz"]];
function Profile({ profile, user, isHeadAdmin, saveProfile, uploadProfileImage, editProfileImage, uploadProfileBackground, editProfileCover, removeProfileCover, uploadProfileBioImage }) { const background = profile?.profile_background || "#1b1f26"; const isImage = background.startsWith("http"); const business = profile?.account_badge === "BUSINESS"; const allowedLayouts = ["standard","theme-red","theme-blue","theme-neon","theme-neon-pink","theme-alpine","theme-teal","theme-violet","theme-copper","theme-aurora"]; const [layoutChoice, setLayoutChoice] = useState(allowedLayouts.includes(profile?.profile_layout) ? profile.profile_layout : "standard"); useEffect(() => { const next = allowedLayouts.includes(profile?.profile_layout) ? profile.profile_layout : "standard"; setLayoutChoice(next); }, [profile?.profile_layout]); return <section>{profile?.is_community_photographer && <div className="community-photographer-self-banner panel"><img src="/community-photographer-camera.svg" alt=""/><div><span className="eyebrow">COMMUNITY-FOTOGRAF</span><strong>{profile?.community_photographer_global ? "Für alle Regionen freigeschaltet" : "Regional freigeschaltet"}</strong><small>Eventfotos kannst du im Bereich „Events“ hochladen und verwalten.</small></div></div>}<div className="my-area-layout"><div className="profile-member-card-preview" aria-label="Vorschau deiner Mitgliederkarte"><MemberCardView member={profile} profile={profile} friendships={[]} interactive={false}/></div><form className="panel profile-form profile-editor" onSubmit={saveProfile}>
  <header className="profile-editor-header"><span className="eyebrow">DEIN PROFIL</span><h2>Profil gestalten</h2><p className="profile-editor-note">Passe deine Darstellung übersichtlich an. Änderungen gelten für dein eigenes und dein öffentliches Profil.</p></header>{!profile?.avatar_url && <aside className="panel profile-photo-recommendation"><strong>Profilbild empfohlen</strong><p>Ein persönliches Profilbild wird empfohlen, damit die Community vertrauenswürdiger und persönlicher wirkt.</p><button type="button" className="secondary-button" onClick={() => document.getElementById("profile-avatar-file")?.click()}>Profilbild auswählen</button></aside>}
  <fieldset className="profile-editor-section">
    <legend>Grunddaten und Farben</legend>
    <div className="profile-editor-grid profile-editor-grid-main">
      <label className="profile-editor-field profile-editor-field-wide"><span>Nickname *</span><input name="nickname" defaultValue={profile?.nickname || ""} required/></label>
      <label className="profile-editor-field profile-editor-field-wide"><span>Heimatbezirk *</span><select name="district_code" defaultValue={profile?.district_code || ""} required><option value="" disabled>Bitte Heimatbezirk auswählen</option>{HOME_DISTRICT_OPTIONS.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
      <label className="profile-editor-field profile-color-field"><span>Profil-Akzent</span><input type="color" name="profile_accent" defaultValue={profile?.profile_accent || "#ff6b25"}/></label>
      <label className="profile-editor-field profile-color-field"><span>Profil-Hintergrundfarbe</span><input type="color" name="profile_background_color" defaultValue={isImage ? "#1b1f26" : background}/></label>
    </div>
    <input type="hidden" name="profile_background_image" value=""/>
  </fieldset>
  <fieldset className={`profile-editor-section layout-rewards ${business ? "business-layout-rewards" : ""}`}>
    <legend>{business ? "Erweiterte Profilgestaltung für Unternehmer" : "Community-Design"}</legend>
    <span className="eyebrow">{business ? "UNTERNEHMER-DESIGN" : "COMMUNITY-DESIGN"}</span>
    <h3>Dein Layout</h3>
    <p>{business ? "Mit deinem Unternehmerkonto sind alle Profil-Layouts automatisch freigeschaltet." : "Wähle das Design deines Profils. Zusätzliche Layouts können durch Community-Aktivität freigeschaltet werden."}</p>
    <label className="profile-editor-field profile-editor-field-wide"><span>Profil-Layout</span><select name="profile_layout" value={layoutChoice} onChange={(e) => setLayoutChoice(e.currentTarget.value)}><option value="standard">Standard – Ennstal Connect</option><option value="theme-red">Connect Rot – Hellrot</option><option value="theme-alpine">Alpin Grün – Ruhig & Regional</option><option value="theme-blue">Connect Blau – Kräftig</option><option value="theme-teal">Bergsee Türkis – Frisch & Klar</option><option value="theme-violet">Enzian Violett – Modern & Edel</option><option value="theme-copper">Kupfer Nacht – Kupfer & Tiefpetrol</option><option value="theme-aurora">Polarlicht – Cyan, Magenta & Nachtblau</option><option value="theme-neon">Neon Grün – Giftgrün & Dunkel</option><option value="theme-neon-pink">Neon Pink – Ultra Pink & Nacht</option></select></label>
    {business && <small className="profile-editor-help">★ Unternehmerkonto: alle Layoutfarben sind automatisch freigeschaltet.</small>}
  </fieldset>
  <fieldset className="profile-editor-section">
    <legend>Bilder</legend>
    <div className="profile-editor-grid">
      <div className="profile-upload-field profile-upload-field-avatar"><span>Profilbild</span><small>Handyfotos, PNG, JPG, WebP, GIF, HEIC/HEIF · danach zuschneiden, zoomen und ausrichten</small><input id="profile-avatar-file" className="profile-avatar-file-input" type="file" accept="image/*,.heic,.heif,.avif" onChange={(e) => { const input = e.currentTarget; const file = input.files?.[0]; if (file) uploadProfileImage(file); window.setTimeout(() => { input.value = ""; }, 0); }}/>{profile?.avatar_url && <div className="profile-cover-inline-actions"><button type="button" className="text-button" onClick={editProfileImage}>Profilbild ausrichten</button></div>}</div>
      <label className="profile-upload-field"><span>Profil-Cover</span><small>Breites Titelbild · danach Ausschnitt, Zoom und Abdunklung einstellen</small><input type="file" accept="image/*,.heic,.heif,.avif" onChange={(e) => e.target.files?.[0] && uploadProfileBackground(e.target.files[0])}/>{isImage && <span className="profile-cover-inline-actions"><button type="button" className="text-button" onClick={editProfileCover}>Ausschnitt anpassen</button><button type="button" className="text-button profile-cover-remove" onClick={removeProfileCover}>Hintergrund entfernen</button></span>}</label>
      
    </div>
  </fieldset>
  <fieldset className="profile-editor-section">
    <legend>Persönliche Angaben</legend>
    <div className="profile-editor-grid">
      <label className="profile-editor-field"><span>Geschlecht *</span><select name="gender" defaultValue={profile?.gender || ""} required><option value="">Bitte auswählen</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label>
      <label className="profile-editor-field"><span>Wohnort</span><input name="location" defaultValue={profile?.location || ""}/></label>
      <label className="profile-editor-field profile-editor-field-wide"><span>Interessen</span><input name="interests" defaultValue={formatInterests(profile?.interests)} placeholder="z. B. Wandern, Fußball"/></label>
      <label className="profile-editor-field profile-editor-field-wide"><span>Über mich</span><textarea name="bio" maxLength="1000" rows="7" defaultValue={profile?.bio || ""} placeholder="Erzähl der Community etwas über dich …"/><small className="profile-editor-help">Bis zu 1.000 Zeichen. Absätze bleiben erhalten.</small></label>
    </div>
    <div className="profile-typography-grid">
      <label className="profile-editor-field"><span>Schriftart</span><select name="bio_font" defaultValue={profile?.bio_font || "modern"}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label>
      <label className="profile-editor-field"><span>Schriftgröße</span><select name="bio_size" defaultValue={profile?.bio_size || "normal"}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label>
      <label className="profile-editor-field profile-color-field"><span>Schriftfarbe</span><input type="color" name="bio_color" defaultValue={profile?.bio_color || "#f1f5f9"}/></label>
    </div>
  </fieldset>
  {isHeadAdmin && <fieldset className="profile-editor-section profile-editor-responsibility">
    <legend>Öffentliche Zuständigkeit</legend>
    <span className="eyebrow">HEAD ADMIN</span>
    <h3>Wofür du zuständig bist</h3>
    <p>Diese Angabe wird in deinem öffentlichen Profil modern und gut lesbar als Zuständigkeitsbereich angezeigt.</p>
    <label className="profile-editor-field profile-editor-field-wide">
      <span>Öffentliche Zuständigkeit</span>
      <textarea name="head_admin_responsibilities" rows="4" maxLength="500" defaultValue={profile?.head_admin_responsibilities || ""} placeholder="z. B. Gesamtverantwortung Ennstal-Connect, Ablauf, Admins, Unternehmen, Gemeinden, Supporter"/>
      <small className="profile-editor-help">Kurz und verständlich formulieren. Maximal 500 Zeichen.</small>
    </label>
  </fieldset>}
  <fieldset className="profile-editor-section">
    <legend>Links und soziale Profile</legend>
    <div className="profile-editor-grid">
      <label className="profile-editor-field"><span>Instagram-Name</span><input name="instagram_username" defaultValue={profile?.instagram_username || ""} placeholder="z. B. ennstal.connect"/></label>
      <label className="profile-editor-field"><span>Snapchat-Name</span><input name="snapchat_username" defaultValue={profile?.snapchat_username || ""} placeholder="z. B. ennstalconnect"/></label>
      <label className="profile-editor-field profile-editor-field-wide"><span>Website</span><input name="website" defaultValue={profile?.website || ""} placeholder="https://…"/></label>
    </div>
  </fieldset>
  <div className="profile-editor-actions"><button className="primary-button" type="submit">Änderungen speichern</button></div>
</form></div><ProfileRelationshipSection member={profile} currentUserId={user?.id}/><ProfileShareQr profile={profile}/></section>; }

function ProfileShareQr({ profile }) { const [qr, setQr] = useState(""); const profileUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(profile?.id || "")}`; useEffect(() => { if (!profile?.id) return; QRCode.toDataURL(profileUrl, { width: 640, margin: 3, color: { dark: "#13283b", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setQr).catch(() => setQr("")); }, [profile?.id, profileUrl]); return <section className="panel profile-qr-card"><div><span className="eyebrow">DEIN PROFIL-QR-CODE</span><h2>Schneller gefunden werden</h2><p>Der Code führt direkt zu deinem Ennstal-Connect-Profil. Ideal zum Teilen oder für einen Auto-Sticker.</p></div>{qr && <><img src={qr} alt={`QR-Code zum Profil von ${getName(profile)}`}/><a className="primary-button" href={qr} download={`ennstal-connect-${profile?.nickname || "profil"}-qr.png`}>QR-Code herunterladen</a></>}</section>; }

function PublicProfilePreview({ profile, photos, groups, onBack, onOpenGroup }) {
  const privacy = profile?.privacy_settings || {};
  const isPublic = (field) => (privacy[field] || "PUBLIC") === "PUBLIC";
  const publicPhotos = photos.filter((photo) => photo.owner_id === profile?.id && photo.visibility !== "FRIENDS");
  const background = { backgroundImage: "none" };
  return <section className="member-profile-page public-profile-preview" data-profile-id={profile.id}><button className="back-button" onClick={onBack}>← Zurück zum Bearbeiten</button><span className="eyebrow">VORSCHAU</span><p>So sehen Mitglieder, die nicht mit dir befreundet sind, dein Profil.</p><article className={`member-profile-hero ${roleClass(profile?.role)} has-profile-cover`}><div className="member-profile-cover">{profile?.profile_background?.startsWith("http") && <img src={profile.profile_background} alt="" style={{objectPosition:"50% 50%",transform:`translate(${((profile?.profile_background_position_x ?? 50)-50)*0.16}%, ${((profile?.profile_background_position_y ?? 50)-50)*0.16}%) scale(${profile?.profile_background_zoom ?? 1})`,transformOrigin:"50% 50%"}}/>}<span className="member-profile-cover-overlay" style={{background:`rgba(10,24,36,${profile?.profile_background_overlay ?? 0.18})`}}/></div><img src={profile?.avatar_url || DEFAULT_AVATAR} alt="Profilbild"/><div><span>{roleLabel(profile?.role)}</span><h1>{getName(profile)}</h1>{profile?.district_code && profile?.show_district !== false && <p className="member-home-district"><strong>Heimatbezirk:</strong> {HOME_DISTRICT_OPTIONS.find(([code]) => code === profile.district_code)?.[1] || profile.district_code}</p>}{(profile?.account_badge === "BUSINESS" || Boolean(profile?.company_name)) && <div className="community-photographer-profile-badge" data-entrepreneur-badge="true"><img src="/role-star-blue.svg" alt="" aria-hidden="true"/><span><strong>Unternehmeraccount</strong>{profile.company_name && <small>{profile.company_name}</small>}</span></div>}{profile?.is_community_photographer && <div className="community-photographer-profile-badge"><img src="/community-photographer-camera.svg" alt=""/><span><strong>Community-Fotograf</strong><small>{profile?.community_photographer_global ? "Alle Regionen" : "Regional"}</small></span></div>}{isPublic("name") && <p>{[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}{isPublic("birth_date") && getAge(profile?.birth_date) !== null && ` · ${getAge(profile.birth_date)} Jahre`}</p>}{isPublic("bio") && profile?.bio && <p className={`member-profile-bio ${profile?.bio_font || "modern"} ${profile?.bio_size || "normal"}`} style={{ color: profile?.bio_color || "#f1f5f9" }}>{profile.bio}</p>}{(profile?.role === "HEAD_ADMIN" || profile?.admin_responsibilities?.length) && <div className="admin-responsibilities-card"><span>ZUSTÄNDIG FÜR</span><strong>{profile.role === "HEAD_ADMIN" ? (profile.head_admin_responsibilities || "Gesamtverantwortung, Sicherheit & Regeln") : profile.admin_responsibilities.join(" · ")}</strong></div>}</div></article><ProfileRelationshipSection member={profile} currentUserId={null}/><section className="panel profile-visible-details"><span className="eyebrow">PROFILINFORMATIONEN</span>{isPublic("location") && profile?.location && <p>Ort: {profile.location}</p>}{isPublic("interests") && formatInterests(profile?.interests) && <p>Interessen: {formatInterests(profile.interests)}</p>}{isPublic("website") && profile?.website && <p>Webseite: {profile.website}</p>}{!isPublic("location") && !isPublic("interests") && !isPublic("website") && <p>Keine weiteren Informationen sind öffentlich sichtbar.</p>}</section><ProfileSections member={profile} preview><MemberGroups member={profile} groups={groups} onOpen={onOpenGroup}/></ProfileSections>{publicPhotos.length > 0 && <PublicProfilePhotoFolder member={profile} photos={publicPhotos} canSeeFriends={false}/>}</section>;
}

function ProfileTimeline({ visits, activities, members, onOpen }) { const memberFor = (id) => members.find((member) => member.id === id); const profileLink = (member, children) => member ? <button type="button" className={`profile-activity-link ${roleClass(member.role)}`} onClick={() => onOpen(member)}>{children}</button> : children; const roleName = (member) => member ? <><RoleStar member={member}/>{getName(member)} <span className="ec-inline-points">[{Number(member.total_score ?? member.points ?? 0).toLocaleString("de-AT")}]</span></> : "Mitglied"; return <section className="profile-activity-dashboard"><article className="profile-timeline panel"><span className="eyebrow">PROFILBESUCHE</span><h2>Die letzten 10 Besuche</h2><div>{visits.slice(0,10).map((visit) => { const visitor = memberFor(visit.visitor_id); return <p key={`visit-${visit.id || visit.visited_at}`}>{profileLink(visitor, <><strong>{roleName(visitor)}</strong> hat dein Profil besucht</>)}<time>{new Date(visit.visited_at).toLocaleString("de-AT")}</time></p>; })}{!visits.length && <p>Noch keine Profilbesuche.</p>}</div></article><article className="profile-timeline panel"><span className="eyebrow">PROFIL-AKTUALISIERUNGEN</span><h2>Deine letzten 10 Änderungen</h2><div>{activities.slice(0,10).map((activity) => { const actor = memberFor(activity.actor_id); return <p key={activity.id}>{profileLink(actor, <><strong>{roleName(actor)}</strong> · {activity.activity_type}</>)}<time>{new Date(activity.created_at).toLocaleString("de-AT")}</time></p>; })}{!activities.length && <p>Noch keine Profil-Aktualisierungen.</p>}</div></article></section>; }
function ProfilePhotoGallery({ photos, likes, comments, user, onUpload, onLike, onComment, onDelete }) { const [caption, setCaption] = useState(""); const [visibility, setVisibility] = useState("PUBLIC"); const [drafts, setDrafts] = useState({}); return <section className="profile-gallery panel"><span className="eyebrow">MEINE FOTOS</span><h2>Fotos aus deinem Profil</h2><label className="photo-upload-button">Foto hochladen<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file, caption, visibility); event.target.value = ""; }}/></label><input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength="240" placeholder="Kurze Bildbeschreibung (optional)"/><label className="photo-visibility">Foto sichtbar für<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PUBLIC">Alle Mitglieder</option><option value="FRIENDS">Nur Freunde</option></select></label><div className="profile-photo-grid">{photos.map((photo) => { const photoLikes = likes.filter((like) => like.photo_id === photo.id); const liked = photoLikes.some((like) => like.user_id === user.id); const photoComments = comments.filter((comment) => comment.photo_id === photo.id); return <figure key={photo.id}><img src={photo.image_url} alt={photo.caption || "Profilfoto"}/>{photo.caption && <figcaption>{photo.caption}</figcaption>}<small className="photo-privacy-label">{photo.visibility === "FRIENDS" ? "👥 Nur Freunde" : "◎ Öffentlich"}</small><div className="photo-actions"><button onClick={() => onLike(photo.id)}>{liked ? "♥ Gefällt dir" : "♡ Gefällt mir"} ({photoLikes.length})</button><button className="danger-button" onClick={() => onDelete(photo)}>Löschen</button></div><div className="photo-comments">{photoComments.map((comment) => <small key={comment.id}>{comment.content}</small>)}<form onSubmit={(event) => { event.preventDefault(); onComment(photo.id, drafts[photo.id] || ""); setDrafts((current) => ({ ...current, [photo.id]: "" })); }}><input value={drafts[photo.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [photo.id]: event.target.value }))} placeholder="Kommentieren …"/><button>↵</button></form></div></figure>; })}</div>{!photos.length && <p>Noch keine Fotos veröffentlicht.</p>}</section>; }

function Reports({ reports, memberById, resolveReport }) { return <section><div className="page-heading"><div><span className="eyebrow">MODERATION</span><h1>Meldungen</h1><p>Gemeldete Mitglieder prüfen und bearbeiten.</p></div></div><div className="report-list">{reports.map((r) => <article className="report-card" key={r.id}><div className="report-top"><strong>🚩 {r.status}</strong><span>{new Date(r.created_at).toLocaleString("de-AT")}</span></div><p><b>Gemeldet von:</b> {getName(memberById(r.reporter_id))}</p><p><b>Gemeldetes Mitglied:</b> {getName(memberById(r.reported_user_id))}</p><p>{r.reason}</p>{r.status === "PENDING" && <div className="content-manage-actions"><button className="primary-button" onClick={() => resolveReport(r.id, "CONFIRMED")}>Meldung bestätigen</button><button className="danger-button" onClick={() => resolveReport(r.id, "UNFOUNDED")}>Unbegründet</button></div>}</article>)}{!reports.length && <div className="empty-card">Keine Meldungen vorhanden.</div>}</div></section>; }

function AccountReview({ queue, members, canReview, onBack, onOpen, onReview }) { return <section className="account-review-page"><div className="page-heading"><div><span className="eyebrow">KONTOSCHUTZ</span><h1>Verifizierungen prüfen</h1><p>Hier erscheinen nur Profile, für die eine Verifizierung angefordert wurde.</p></div><button className="secondary-button" onClick={onBack}>← Zur Admin-Zentrale</button></div>{queue.length ? <div className="report-list">{queue.map((item) => { const member = members.find((entry) => entry.id === item.user_id); const due = item.due_at ? new Date(item.due_at) : null; return <article key={`${item.user_id}-${item.due_at || "request"}`} className="report-card"><strong>{item.nickname || "Mitglied"}</strong><p>{item.reason || "Keine Begründung hinterlegt."}</p><small>{due && !Number.isNaN(due.getTime()) ? `Frist: ${due.toLocaleString("de-AT")}` : "Keine Frist gesetzt"}</small><div className="content-manage-actions"><button className="secondary-button" onClick={() => { if (member) onOpen(member); }}>Profil öffnen</button>{canReview && <><button className="primary-button" onClick={() => onReview(item, true)}>✓ Verifizieren</button><button className="danger-button" onClick={() => onReview(item, false)}>Anfrage ablehnen</button></>}</div></article>; })}</div> : <div className="empty-card">Keine Verifizierungen stehen derzeit aus.</div>}</section>; }

function AdminLogPage({ adminLog, members }) {
  const [filter,setFilter]=useState("IMPORTANT");

  const actionKey=(entry)=>String(entry?.action||entry?.details?.action_name||"").toUpperCase();
  const denied=(entry)=>entry?.action==="ADMIN_DENIED" || entry?.details?.outcome==="DENIED";
  const changesFor=(entry)=>Array.isArray(entry?.details?.changes)?entry.details.changes:[];
  const areasFor=(entry)=>[...new Set(changesFor(entry).map((change)=>String(change?.area||"").toLowerCase()).filter(Boolean))];
  const fieldsFor=(entry)=>[...new Set(changesFor(entry).flatMap((change)=>Array.isArray(change?.changed_fields)?change.changed_fields:[]).map((field)=>String(field||"").toLowerCase()).filter(Boolean))];

  const categoryFor=(entry)=>{
    const key=actionKey(entry);
    const areas=areasFor(entry);
    const fields=fieldsFor(entry);

    if(/POINT|REWARD|SCORE/.test(key) || fields.some((field)=>/points|score|balance/.test(field))) return "POINTS";
    if(
      /ROLE|PERMISSION|HEAD_ADMIN|ADMIN_ASSIGNED|ADMIN_REMOVED/.test(key)
      || areas.some((area)=>["user_permissions","admin_permissions","roles"].includes(area))
      || fields.some((field)=>["role","account_badge","is_primary_head_admin","permissions"].includes(field))
    ) return "ROLES";
    if(
      /SECURITY|SYSTEM_ERROR|DENIED|EVIDENCE|INTEGRITY|LOGIN|AUTH|LOCK|FAKE/.test(key)
      || areas.some((area)=>["user_feature_locks","user_blocks","security_events"].includes(area))
    ) return "SECURITY";
    if(
      /SUSPEND|BLOCK|REPORT|MODERAT|FORUM|MEDIA|DELETE|REMOVE|VERIFY|ACCOUNT/.test(key)
      || areas.some((area)=>["messages","user_reports","forum_posts","forum_replies","member_photos","member_photo_comments","profiles"].includes(area))
    ) return "MODERATION";
    return "OTHER";
  };

  const isRoutineEntry=(entry)=>{
    const key=actionKey(entry);
    const areas=areasFor(entry);
    const fields=fieldsFor(entry);
    if(key==="SYSTEM_ERROR_STATUS") return true;
    if(areas.length===1 && areas[0]==="messages" && fields.length===1 && fields[0]==="is_read") return true;
    if(
      areas.length===1
      && areas[0]==="profiles"
      && fields.length>0
      && fields.every((field)=>["last_seen","last_seen_at","online_seconds"].includes(field))
    ) return true;
    return false;
  };

  const important=(entry)=>{
    if(denied(entry)) return true;
    if(isRoutineEntry(entry)) return false;
    const key=actionKey(entry);
    const cat=categoryFor(entry);
    if(["ROLES","POINTS","SECURITY"].includes(cat)) return true;
    if(cat==="MODERATION") return /SUSPEND|BLOCK|REPORT|DELETE|REMOVE|VERIFY|ACCOUNT|FAKE|FEATURE/.test(key)
      || fieldsFor(entry).some((field)=>/verification|suspend|status|role|feature/.test(field));
    return /BUSINESS|VERIFICATION|FEATURE|PRIVILEGED|ACCOUNT_|DELETION/.test(key);
  };

  const iconFor=(entry)=>{
    const cat=categoryFor(entry);
    if(denied(entry)) return "!";
    if(cat==="ROLES") return "♛";
    if(cat==="POINTS") return "★";
    if(cat==="MODERATION") return "✓";
    if(cat==="SECURITY") return "◆";
    return "•";
  };

  const labelFor=(entry)=>{
    const key=actionKey(entry);
    const areas=areasFor(entry);
    const fields=fieldsFor(entry);
    const actionName=String(entry?.details?.action_name||"").toLowerCase();

    if(key==="SYSTEM_ERROR_STATUS") return entry?.details?.status==="RESOLVED" ? "Systemfehler als gelöst markiert" : "Status eines Systemfehlers geändert";
    if(key==="POINTS_AWARDED") return entry?.details?.category==="EVENT_REWARD" ? "Eventpunkte vergeben" : "Punkte vergeben";
    if(key==="SYSTEM_POINTS_AWARDED") return "Automatische Aktivitätspunkte vergeben";
    if(key==="COMMUNITY_PHOTOGRAPHER_ASSIGNED") return entry?.details?.enabled===false ? "Community-Fotograf entfernt" : "Community-Fotograf freigeschaltet";
    if(areas.length===1 && areas[0]==="messages" && fields.includes("is_read")) return "Moderationsnachricht als gelesen markiert";
    if(areas.includes("user_permissions")) return "Berechtigungen eines Admins geändert";
    if(areas.includes("profiles") && fields.includes("role")) return "Mitgliedsrolle geändert";
    if(areas.includes("profiles") && fields.some((field)=>field.includes("verification"))) return "Profil-Verifizierung angefordert oder geändert";
    if(areas.includes("profiles") && fields.some((field)=>field.includes("suspend")||field==="account_status")) return "Mitgliedsstatus geändert";
    if(areas.includes("community_events")){
      if(changesFor(entry).some((change)=>change.area==="community_events" && change.operation==="INSERT")) return "Veranstaltung veröffentlicht";
      if(changesFor(entry).some((change)=>change.area==="community_events" && change.operation==="DELETE")) return "Veranstaltung gelöscht";
      return "Veranstaltung geändert";
    }
    if(areas.includes("forum_posts")) return "Forumsbeitrag administrativ geändert";
    if(areas.includes("forum_replies")) return "Forumsantwort administrativ geändert";
    if(areas.includes("member_photos")) return "Mitgliederfoto administrativ geändert";
    if(actionName.includes("require profile verification")) return "Profil-Verifizierung angefordert";
    return ADMIN_LOG_LABELS[entry.action] || entry.details?.action_name || entry.action || "Admin-Aktion";
  };

  const descriptionFor=(entry)=>{
    const areas=areasFor(entry);
    const fields=fieldsFor(entry);
    if(areas.length===1 && areas[0]==="messages" && fields.includes("is_read")) return "Eine Moderationsnachricht wurde geöffnet und als gelesen gespeichert.";
    if(areas.includes("profiles") && fields.some((field)=>field.includes("verification"))) return "Für ein Mitglied wurde eine Profil-Verifizierung angefordert oder deren Frist geändert.";
    if(areas.includes("user_permissions")) return "Die administrativen Berechtigungen eines Mitglieds wurden angepasst.";
    if(entry?.action==="POINTS_AWARDED"){
      const amount=Number(entry?.details?.delta||0);
      return `${amount>0?"+":""}${amount} Punkte · ${entry?.details?.reason||"Punkte administrativ vergeben"}`;
    }
    if(entry?.action==="COMMUNITY_PHOTOGRAPHER_ASSIGNED") return entry?.details?.scope==="REGIONAL" ? "Die Community-Fotograf-Berechtigung wurde für eine Region geändert." : "Die Community-Fotograf-Berechtigung wurde geändert.";
    return "";
  };

  const todayStart=new Date(); todayStart.setHours(0,0,0,0);
  const importantEntries=adminLog.filter(important);
  const deniedEntries=adminLog.filter(denied);
  const todayEntries=adminLog.filter((entry)=>new Date(entry.created_at)>=todayStart);

  const rows=adminLog.filter((entry)=>{
    if(filter==="ALL") return true;
    if(filter==="IMPORTANT") return important(entry);
    if(filter==="DENIED") return denied(entry);
    if(filter==="TODAY") return new Date(entry.created_at)>=todayStart;
    return categoryFor(entry)===filter;
  });

  return <section className="admin-log-panel panel admin-log-native">
    <div className="admin-log-modern-head">
      <div>
        <span className="eyebrow">VERTRAULICH · NUR GLOBAL ADMIN</span>
        <h2>Admin-Logbuch</h2>
        <p>Wichtige Verwaltungsaktionen zuerst. Routine- und Systemeinträge bleiben unter „Alle Aktionen“ vollständig verfügbar.</p>
      </div>
      <div className="admin-log-focus-count"><strong>{importantEntries.length}</strong><span>wichtig</span></div>
    </div>

    <div className="admin-log-summary admin-log-summary-modern">
      <button type="button" className={filter==="IMPORTANT"?"is-active":""} onClick={()=>setFilter("IMPORTANT")}><span>Wichtig</span><strong>{importantEntries.length}</strong></button>
      <button type="button" className={filter==="DENIED"?"is-active is-danger":""} onClick={()=>setFilter("DENIED")}><span>Abgelehnt</span><strong>{deniedEntries.length}</strong></button>
      <button type="button" className={filter==="TODAY"?"is-active":""} onClick={()=>setFilter("TODAY")}><span>Heute</span><strong>{todayEntries.length}</strong></button>
      <button type="button" className={filter==="ALL"?"is-active":""} onClick={()=>setFilter("ALL")}><span>Alle Aktionen</span><strong>{adminLog.length}</strong></button>
    </div>

    <div className="admin-log-filter-chips" aria-label="Admin-Logbuch filtern">
      {[["ROLES","Rollen & Rechte"],["POINTS","Punkte"],["MODERATION","Moderation"],["SECURITY","Sicherheit"]].map(([key,label])=>
        <button type="button" key={key} className={filter===key?"is-active":""} onClick={()=>setFilter(key)}>{label}</button>
      )}
    </div>

    <div className="admin-log-list admin-log-timeline">{rows.map((entry) => {
      const actor=members.find((m)=>m.id===entry.actor_id);
      const target=members.find((m)=>m.id===entry.target_id);
      const isDenied=denied(entry);
      const cat=categoryFor(entry);
      const detailText=entry.details?.old_role && entry.details?.new_role
        ? `Rolle: ${entry.details.old_role} → ${entry.details.new_role}${entry.details.reason ? ` · Begründung: ${entry.details.reason}` : ""}`
        : formatAdminLogDetails(entry.details);
      return <details className={`admin-log-row admin-log-compact is-${cat.toLowerCase()} ${isDenied?"is-denied":"is-success"}`} key={entry.id}>
        <summary>
          <span className="admin-log-action-icon" aria-hidden="true">{iconFor(entry)}</span>
          <span className="admin-log-main">
            <span className="admin-log-title-line">
              <strong>{labelFor(entry)}</strong>
              <em className={isDenied ? "admin-log-status denied" : "admin-log-status success"}>{isDenied ? "ABGELEHNT" : "AUSGEFÜHRT"}</em>
            </span>
            <span className="admin-log-meta-line">
              <b>{getName(actor)||"System"}</b>
              {target && <><i>→</i><b>{getName(target)}</b></>}
              <i>·</i>
              <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString("de-AT")}</time>
            </span>
          </span>
          <span className="admin-log-chevron">⌄</span>
        </summary>
        <div className="admin-log-detail-panel">
          <div className="admin-log-detail-grid">
            <span><small>Akteur</small><strong>{getName(actor)||"System"}{entry.details?.actor_role ? ` · ${roleLabel(entry.details.actor_role)}` : ""}</strong></span>
            {target && <span><small>Betroffen</small><strong>{getName(target)}</strong></span>}
            <span><small>Bereich</small><strong>{cat==="ROLES"?"Rollen & Rechte":cat==="POINTS"?"Punkte":cat==="MODERATION"?"Moderation":cat==="SECURITY"?"Sicherheit":"Sonstiges"}</strong></span>
            <span><small>Ergebnis</small><strong>{isDenied?"Abgelehnt":"Ausgeführt"}</strong></span>
          </div>
          {isDenied && entry.details?.error && <p className="admin-log-reason"><b>Grund der Ablehnung:</b> {entry.details.error}</p>}
          {!isDenied && descriptionFor(entry) && <p className="admin-log-reason admin-log-human-description">{descriptionFor(entry)}</p>}
          {!isDenied && !descriptionFor(entry) && detailText && <p className="admin-log-reason">{detailText}</p>}
          {entry.details?.reason && !String(descriptionFor(entry)||detailText||"").includes(entry.details.reason) && <p className="admin-log-reason"><b>Begründung:</b> {entry.details.reason}</p>}
        </div>
      </details>;
    })}
    {!rows.length && <div className="empty-card">Für diesen Filter gibt es derzeit keine Einträge.</div>}</div>
  </section>;
}

function ActivationDashboard({ data, onRefresh, forumPosts, forumReplies, events, eventRsvps, photos, photoComments }) {
  const funnel = data?.funnel || {};
  const activity = data?.activity_7d || {};
  const blockers = data?.blockers || {};
  const pct = (value, total) => total > 0 ? Math.round((Number(value || 0) / Number(total)) * 100) : 0;
  const total = Number(funnel.total_members || 0);
  const publicRate = pct(funnel.first_public_action,total);
  const activeRate = pct(funnel.active_7d,total);
  const profileRate = pct(funnel.profile_complete,total);
  const socialActions = Number(activity.forum_replies_7d || 0) + Number(activity.event_rsvps_7d || 0) + Number(activity.group_joins_7d || 0) + Number(activity.photo_comments_7d || 0) + Number(activity.welcome_greetings_7d || 0) + Number(activity.helpful_marks_7d || 0);
  const prevSocialActions = Number(activity.forum_replies_prev_7d || 0) + Number(activity.event_rsvps_prev_7d || 0) + Number(activity.group_joins_prev_7d || 0) + Number(activity.photo_comments_prev_7d || 0) + Number(activity.welcome_greetings_prev_7d || 0) + Number(activity.helpful_marks_prev_7d || 0);
  const deltaLabel = (current, previous) => {
    const delta = Number(current || 0) - Number(previous || 0);
    if (delta > 0) return "+" + delta + " zur Vorwoche";
    if (delta < 0) return String(delta) + " zur Vorwoche";
    return "unverändert zur Vorwoche";
  };
  const funnelRows = [
    ["Aktive Profile", total, 100],
    ["Profil sinnvoll ergänzt", Number(funnel.profile_complete || 0), profileRate],
    ["Mindestens eine Gruppe", Number(funnel.joined_group || 0), pct(funnel.joined_group,total)],
    ["Mindestens eine Verbindung", Number(funnel.connected_member || 0), pct(funnel.connected_member,total)],
    ["Erste öffentliche Aktion", Number(funnel.first_public_action || 0), publicRate],
    ["In den letzten 7 Tagen aktiv", Number(funnel.active_7d || 0), activeRate],
  ];
  const activities = [
    ["Neue Mitglieder", activity.joined_7d ?? funnel.joined_7d ?? 0],
    ["Forumsbeiträge", activity.forum_posts_7d || 0],
    ["Forenantworten", activity.forum_replies_7d || 0],
    ["Event-Reaktionen", activity.event_rsvps_7d || 0],
    ["Gruppenbeitritte", activity.group_joins_7d || 0],
    ["Fotokommentare", activity.photo_comments_7d || 0],
    ["Einladungen", activity.referrals_7d || 0],
    ["Willkommensgrüße", activity.welcome_greetings_7d || 0],
    ["Hilfreich-Markierungen", activity.helpful_marks_7d || 0],
  ];
  const blockersList = [
    ["Unbeantwortete Forumsbeiträge", blockers.unanswered_forum_posts || 0, "forum", "🔴"],
    ["Kommende Events ohne Reaktion", blockers.upcoming_events_without_rsvp || 0, "community", "🟠"],
    ["Fotos ohne Kommentar", blockers.photos_without_comments || 0, "photos", "🟡"],
  ];
  const generated = data?.generated_at ? new Date(data.generated_at).toLocaleString("de-AT") : "";
  const replyCountFor = (postId) => forumReplies.filter((reply) => reply.post_id === postId).length;
  const rsvpCountFor = (eventId) => eventRsvps.filter((rsvp) => rsvp.event_id === eventId).length;
  const commentCountFor = (photoId) => photoComments.filter((comment) => comment.photo_id === photoId).length;
  const opportunities = [
    ...forumPosts.filter((post) => post.scope === "COMMUNITY" && replyCountFor(post.id) === 0).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,2).map((post)=>({kind:"Forum",title:post.title,page:"forum",hint:"Noch keine Antwort"})),
    ...events.filter((event) => event.status !== "CANCELLED" && new Date(event.event_at).getTime() >= Date.now() && rsvpCountFor(event.id) === 0).sort((a,b)=>new Date(a.event_at)-new Date(b.event_at)).slice(0,2).map((event)=>({kind:"Event",title:event.title,page:"community",hint:"Noch keine Reaktion"})),
    ...photos.filter((photo) => commentCountFor(photo.id) === 0).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,1).map((photo)=>({kind:"Foto",title:photo.caption || "Neues Community-Foto",page:"photos",hint:"Noch kein Kommentar"})),
  ].slice(0,5);
  return <section className="activation-dashboard activation-cockpit panel">
    <div className="activation-dashboard-head"><div><span className="eyebrow">HEAD-ADMIN · COMMUNITY COCKPIT</span><h2>Was braucht heute deine Aufmerksamkeit?</h2><p>Die wichtigsten Signale zuerst. Details bleiben verfügbar, aber der Alltag startet hier mit klaren nächsten Schritten.</p>{generated && <small>Stand: {generated}</small>}</div><button type="button" className="secondary-button" onClick={onRefresh}>Aktualisieren</button></div>
    {!data ? <div className="empty-card">Kennzahlen werden geladen …</div> : <>
      <div className="cockpit-kpi-strip">
        <article><small>MITGLIEDER</small><strong>{total}</strong><span>{Number(funnel.joined_7d || 0)} neu diese Woche</span></article>
        <article><small>AKTIV</small><strong>{Number(funnel.active_7d || 0)}</strong><span>{activeRate}% der Mitglieder</span><em>{deltaLabel(funnel.active_7d,funnel.active_prev_7d)}</em></article>
        <article><small>BETEILIGUNG</small><strong>{publicRate}%</strong><span>mit erster öffentlicher Aktion</span></article>
        <article><small>SOZIALE AKTIONEN</small><strong>{socialActions}</strong><span>in den letzten 7 Tagen</span><em>{deltaLabel(socialActions,prevSocialActions)}</em></article>
      </div>

      <article className="cockpit-priority">
        <div><span className="eyebrow">HEUTE WICHTIG</span><h3>Hier liegt gerade das größte Potenzial</h3><p>Maximal drei Bereiche, die du sofort öffnen und anschieben kannst.</p></div>
        <div>{blockersList.map(([label,value,page,icon]) => <button type="button" key={label} onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page,source:"activation-cockpit"}}))}><span>{icon}</span><strong>{Number(value || 0)}</strong><b>{label}</b><em>Jetzt öffnen →</em></button>)}</div>
      </article>

      <div className="cockpit-health-grid">
        <article><small>KOMMEN LEUTE REIN?</small><strong>{Number(funnel.joined_7d || 0)}</strong><span>neue Mitglieder in 7 Tagen</span><em>{deltaLabel(funnel.joined_7d,funnel.joined_prev_7d)}</em></article>
        <article><small>MACHEN SIE MIT?</small><strong>{socialActions}</strong><span>soziale Aktionen in 7 Tagen</span><em>{deltaLabel(socialActions,prevSocialActions)}</em></article>
        <article><small>KOMMEN SIE ZURÜCK?</small><strong>{activeRate}%</strong><span>{Number(funnel.active_7d || 0)} von {total} waren aktiv</span><em>{deltaLabel(funnel.active_7d,funnel.active_prev_7d)}</em></article>
      </div>

      {opportunities.length > 0 && <article className="activation-opportunities"><div><span className="eyebrow">COMMUNITY ANSCHIEBEN</span><h3>Konkrete Inhalte, die zuerst Resonanz brauchen</h3><p>Öffne gezielt einzelne Stellen, statt allgemein nach Aktivität zu suchen.</p></div><div>{opportunities.map((item,index)=><button type="button" key={item.kind+"-"+index+"-"+item.title} onClick={()=>window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:item.page,source:"activation-opportunities"}}))}><small>{item.kind}</small><strong>{item.title}</strong><span>{item.hint}</span><b>Öffnen →</b></button>)}</div></article>}

      <details className="activation-details">
        <summary>Details & Aktivierungs-Funnel anzeigen</summary>
        <div className="activation-details-grid">
          <article className="activation-funnel"><h3>Aktivierungs-Funnel</h3>{funnelRows.map(([label,value,percent]) => <div className="activation-funnel-row" key={label}><div><span>{label}</span><b>{value} · {percent}%</b></div><i><em style={{width:String(percent)+"%"}}/></i></div>)}</article>
          <article className="activation-week"><h3>Aktivität der letzten 7 Tage</h3><div>{activities.map(([label,value]) => <span key={label}><b>{Number(value || 0)}</b><small>{label}</small></span>)}</div></article>
        </div>
      </details>
    </>}
  </section>;
}

function AdminPanel({ members, memberEmails, adminLog, activationDashboard, onRefreshActivation, forumPosts, forumReplies, communityEvents, eventRsvps, memberPhotos, photoComments, profile, user, permissions, canViewPersonalData, onOpen, updateMemberRole, toggleSuspension, setBusinessAccount, editingMember, setEditingMember, saveMemberData, adminTarget, loadPermissions, permissionDraft, setPermissionDraft, savePermissions, savingPermissions, openAccountReview }) {
  const admins = members.filter((m) => isAdmin(m.role));
  const canManageMembers = Boolean(profile?.is_primary_head_admin || permissions?.manage_members);
  const canManageRoles = Boolean(profile?.is_primary_head_admin || permissions?.manage_roles);


  return <section className="admin-page"><div className="page-heading"><div><span className="eyebrow">VERWALTUNG</span><h1>Admin-Zentrale</h1><p>Global Admin und Community Admin werden klar unterschieden. Berechtigungen sind einzeln steuerbar.</p></div><button type="button" className="primary-button admin-review-button" onClick={openAccountReview}>✓ Verifizierungen prüfen</button></div>
    <div className="admin-dashboard-shortcuts-host" />
    {profile?.is_primary_head_admin && <ActivationDashboard data={activationDashboard} onRefresh={onRefreshActivation} forumPosts={forumPosts} forumReplies={forumReplies} events={communityEvents} eventRsvps={eventRsvps} photos={memberPhotos} photoComments={photoComments}/>}
    <div id="ec-head-municipality-manager-host" className="ec-head-municipality-manager-host" />
    <div className="admin-member-cards">{members.slice().sort((a,b) => (a.role === "HEAD_ADMIN" ? 1 : a.role === "ADMIN" ? 2 : a.role === "SUPPORTER" ? 3 : 4) - (b.role === "HEAD_ADMIN" ? 1 : b.role === "ADMIN" ? 2 : b.role === "SUPPORTER" ? 3 : 4) || getName(a).localeCompare(getName(b), "de")).map((m) => <article className={`admin-member-card ${roleClass(m.role)} ${m.is_test_account ? "hidden-account" : ""} ${m.account_badge === "BUSINESS" ? "business-card" : ""}`} key={m.id}><button className="admin-member-person-button" onClick={() => onOpen(m)}><img src={m.avatar_url || DEFAULT_AVATAR} alt=""/><span><strong>{getName(m)}</strong><small>{roleLabel(m.role)}{m.is_test_account ? " · Verborgenes Konto" : ""}{m.account_status === "SUSPENDED" ? " · Gesperrt" : ""}</small></span></button><div className="admin-member-card-info"><div><span>Rolle</span><strong>{m.is_primary_head_admin ? "Primärer Head Admin" : roleLabel(m.role)}{m.account_badge === "BUSINESS" && <small style={{display:"block"}}>Unternehmenskonto{m.company_name ? ` · ${m.company_name}` : ""}</small>}</strong></div><div><span>Status</span><strong>{m.is_test_account ? "Verborgen" : m.account_status === "SUSPENDED" ? "Gesperrt" : "Sichtbar"}</strong></div><div><span>Alter</span><strong>{Number.isInteger(m.age) ? `${m.age} Jahre` : "—"}</strong></div><div><span>Region</span><strong>{m.region_short_name || "—"}</strong></div><div><span>Community-Regeln</span><strong>{m.rules_accepted_at ? `Bestätigt · ${new Date(m.rules_accepted_at).toLocaleDateString("de-AT")}` : "Noch nicht bestätigt"}</strong></div></div>{!m.is_primary_head_admin && (canManageMembers || canManageRoles || profile?.is_primary_head_admin) && <div className="admin-member-card-actions">{canManageRoles && m.role !== "HEAD_ADMIN" && <><button className="profile-admin-button supporter" onClick={() => updateMemberRole(m, "SUPPORTER")}>🟢 Supporter</button><button className="profile-admin-button admin" onClick={() => updateMemberRole(m, m.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{m.role === "ADMIN" ? "✕ Community Admin entfernen" : "★ Community Admin"}</button>{m.role !== "MEMBER" && <button className="profile-admin-button remove-role" onClick={() => updateMemberRole(m, "MEMBER")}>↩ Rolle entfernen</button>}</>}{profile?.is_primary_head_admin && <button className="profile-admin-button head-admin" onClick={() => updateMemberRole(m, m.role === "HEAD_ADMIN" ? "MEMBER" : "HEAD_ADMIN")}>{m.role === "HEAD_ADMIN" ? "✕ Head Admin entfernen" : "★ Head Admin"}</button>}{canManageMembers && <><button className="profile-admin-button" onClick={() => setEditingMember(m)}>✎ Name / Geburtsdatum</button><button className="profile-admin-button danger" onClick={() => toggleSuspension(m)}>{m.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button></>}{profile?.is_primary_head_admin && <><button className="profile-admin-button business-account-button" onClick={() => setBusinessAccount(m.id, m.account_badge !== "BUSINESS")}>{m.account_badge === "BUSINESS" ? "★ Unternehmenskonto entfernen" : "★ Unternehmenskonto"}</button>{m.account_badge === "BUSINESS" && <button className="profile-admin-button" onClick={() => setBusinessAccount(m.id, true, true)}>✎ Firmenname bearbeiten</button>}<button className="profile-admin-button" onClick={() => loadPermissions(m.id)}>⚙ Rechte</button></>}</div>}</article>)}</div>
    {editingMember && <section className="profile-admin-edit-form panel"><div className="panel-title-row"><div><h2>Mitgliedsdaten ändern</h2><p>Änderungen an Name oder Geburtsdatum werden dem Mitglied automatisch mitgeteilt. Der Änderungsgrund ist verpflichtend.</p></div><button className="modal-close-inline" onClick={() => setEditingMember(null)}>×</button></div><form onSubmit={saveMemberData} className="profile-admin-edit-grid"><label>Nickname<input name="nickname" defaultValue={editingMember.nickname || ""} required/></label><label>Vorname<input name="first_name" defaultValue={editingMember.first_name || ""} required/></label><label>Nachname<input name="last_name" defaultValue={editingMember.last_name || ""} required/></label><label>Geburtsdatum<input type="date" name="birth_date" defaultValue={editingMember.birth_date || ""} required/></label><label>Geschlecht<select name="gender" defaultValue={editingMember.gender || ""}><option value="">Nicht angegeben</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select></label><label className="profile-admin-change-reason">Änderungsgrund<textarea name="change_reason" minLength="10" placeholder="Warum werden diese Mitgliedsdaten geändert? Dieser Grund wird dem Mitglied mitgeteilt." required/></label><div className="edit-actions"><button className="primary-button">💾 Speichern & Mitglied informieren</button></div></form></section>}
    {profile?.is_primary_head_admin && adminTarget && <section className="permissions-panel panel"><div className="panel-title-row"><div><span className="eyebrow">RECHTE</span><h2>Einzelne Berechtigungen</h2><p>{getName(members.find((m) => m.id === adminTarget))} – jede Berechtigung kann unabhängig aktiviert werden.</p></div><button className="modal-close-inline" onClick={() => setAdminTarget?.("")}>×</button></div><div className="permissions-grid">{PERMISSIONS.map(([key,label]) => <label className="permission-row" key={key}><input type="checkbox" checked={!!permissionDraft[key]} onChange={(e) => setPermissionDraft((x) => ({...x, [key]: e.target.checked}))}/><span>{label}</span></label>)}</div><button className="primary-button" disabled={savingPermissions} onClick={savePermissions}>{savingPermissions ? "Speichere …" : "Berechtigungen speichern"}</button></section>}
    {canViewPersonalData && <section className="admin-email-directory panel"><span className="eyebrow">VERTRAULICH · FREIGEGEBENE PERSÖNLICHE DATEN</span><h2>Registrierte E-Mail-Adressen</h2><div>{members.map((member) => <p key={member.id}><strong>{roleMark(member.role)} {getName(member)}</strong><span>{memberEmails[member.id] || "Nicht verfügbar"}</span></p>)}</div></section>}

  </section>;
}

function News({ news, members = [], profile, canManage, activeRegion, createNews, editNews, deleteNews }) { const authorFor = (id) => members.find((member) => member.id === id); return <section className="news-page"><div className="page-heading"><div><span className="eyebrow">{activeRegion?.name || "ENNSTAL CONNECT"}</span><h1>Neuigkeiten</h1><p>Aktuelle Informationen aus dieser Region.</p></div></div>{canManage && <form className="news-composer panel" onSubmit={createNews}><h2>Neuigkeit veröffentlichen</h2><input name="title" minLength="3" placeholder="Überschrift" required/><textarea name="content" minLength="3" placeholder="Was gibt es Neues?" required/><label className="content-image-upload">Bild hinzufügen (optional)<input name="image" type="file" accept="image/*"/></label><button className="primary-button">Veröffentlichen</button></form>}<div className="news-grid">{news.map((entry) => <article className="news-card" key={entry.id}>{entry.image_url && <img className="content-card-image" src={entry.image_url} alt=""/>}<span className="eyebrow">NEUIGKEIT · {new Date(entry.created_at).toLocaleDateString("de-AT")}</span><h2>{entry.title}</h2>{authorFor(entry.author_id) && <small className={`content-author role-author ${authorFor(entry.author_id)?.account_badge === "BUSINESS" ? "business" : roleClass(authorFor(entry.author_id)?.role)}`}>Erstellt von {authorFor(entry.author_id)?.account_badge === "BUSINESS" ? "★" : roleMark(authorFor(entry.author_id)?.role)} {getName(authorFor(entry.author_id))}</small>}<p>{entry.content}</p>{canManage && <div className="content-card-actions"><button className="secondary-button" onClick={() => editNews(entry)}>✎ Bearbeiten</button><button className="danger-button" onClick={() => deleteNews(entry)}>Löschen</button></div>}</article>)}{!news.length && <div className="empty-card">In dieser Region wurden noch keine Neuigkeiten veröffentlicht.</div>}</div></section>; }

function GroupsPage({ groups, members, profile, user, transferRequests, onCreate, onJoin, onLeave, onEdit, onDelete, onTransfer, onReviewTransfer, onOpen }) {
  const memberFor = (id) => members.find((member) => member.id === id);
  const hasGroupRights = isAdmin(profile?.role) || (profile?.role === "SUPPORTER" && (profile?.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item))));
  const canModerate = (group) => hasGroupRights || group.created_by === user?.id;
  const moderators = members.filter((member) => !member.is_test_account && member.account_status !== "SUSPENDED" && (isAdmin(member.role) || (member.role === "SUPPORTER" && (member.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item))))));
  const openGroup = (event, group) => { if (!event.target.closest("button,input,textarea,label")) onOpen(group); };

  return <section className="groups-page"><div className="page-heading"><div><span className="eyebrow">GEMEINSAM AKTIV</span><h1>Gruppen</h1><p>Gründe eigene Gruppen, finde Gleichgesinnte und tritt jederzeit ein oder aus.</p></div></div>{moderators.length > 0 && <aside className="group-moderators panel"><span className="eyebrow">ZUSTÄNDIG FÜR GRUPPEN</span><h2>Gruppenmoderation</h2><div>{moderators.map((member) => <span className={`group-moderator ${roleClass(member.role)}`} key={member.id}>{roleMark(member.role)} {getName(member)} <small>· {isAdmin(member.role) ? roleLabel(member.role) : "Gruppenmoderation"}</small></span>)}</div></aside>}{hasGroupRights && transferRequests.length > 0 && <aside className="group-transfer-queue panel"><span className="eyebrow">FREIGABE ERFORDERLICH</span><h2>Offene Inhaberwechsel</h2>{transferRequests.map((request) => <div key={request.id}><span><strong>{request.group_name}</strong> · {getName(memberFor(request.requested_by))} möchte <strong>{getName(memberFor(request.proposed_owner_id))}</strong> als Inhaber einsetzen.</span><button className="primary-button" onClick={() => onReviewTransfer(request, true)}>Freigeben</button><button className="danger-button" onClick={() => onReviewTransfer(request, false)}>Ablehnen</button></div>)}</aside>}<form className="group-create-form panel" onSubmit={onCreate}><span className="eyebrow">DEINE GRUPPE</span><h2>Neue Gruppe erstellen</h2><input name="name" placeholder="Gruppenname" minLength="3" required/><textarea name="description" placeholder="Worum geht es in deiner Gruppe? Eine Beschreibung ist erforderlich." minLength="10" required/><label className="content-image-upload">Gruppenfoto (optional)<input name="image" type="file" accept="image/*"/></label><button className="primary-button">Gruppe erstellen</button></form><div className="group-grid">{groups.map((group) => { const memberIds = Array.isArray(group.member_ids) ? group.member_ids : []; const joined = memberIds.includes(user?.id); const creator = memberFor(group.created_by); const owner = memberFor(group.owner_id); return <article className="group-card panel" key={group.id} onClick={(event) => openGroup(event, group)}>{group.image_url ? <img className="group-cover" src={group.image_url} alt={`Gruppenfoto ${group.name}`}/> : <div className="group-cover group-cover-empty">◉</div>}<div className="group-card-body"><span className="eyebrow">MITGLIEDER {group.member_count ?? memberIds.length}</span><h2>{group.name}</h2><p>{group.description}</p><div className="group-ownership"><span>Erstellt von <strong>{getName(creator)}</strong></span><span>Inhaber: <strong>{getName(owner)}</strong></span></div><div className="group-member-list">{memberIds.map((id) => { const member = memberFor(id); return member && <span key={id} title={getName(member)}>{roleMark(member.role)} {getName(member)}</span>; })}{!memberIds.length && <small>Noch keine Mitglieder.</small>}</div><div className="content-card-actions"><button type="button" className="secondary-button group-details-button" onClick={() => onOpen(group)}>Details</button>{joined ? <button type="button" className="secondary-button" onClick={() => onLeave(group)}>Gruppe verlassen</button> : <button type="button" className="primary-button" onClick={() => onJoin(group)}>Gruppe beitreten</button>}{canModerate(group) && <><button type="button" className="secondary-button" onClick={() => onEdit(group)}>✎ Bearbeiten</button>{group.created_by === user?.id && <button type="button" className="secondary-button" onClick={() => onTransfer(group)}>Inhaberwechsel anfragen</button>}<button type="button" className="danger-button group-delete-button" onClick={() => onDelete(group)}>Löschen</button></>}</div></div></article>; })}{!groups.length && <div className="empty-card">Noch keine Gruppen. Erstelle die erste Gruppe für deine Interessen.</div>}</div></section>;
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

function ForumReplyThread({ post, replies, helpful, user, members, profile, canReply, createReply, editReply, deleteReply, toggleHelpful }) {
  const postReplies = replies.filter((reply) => reply.post_id === post.id);
  const draftKey = `ec-forum-reply-draft:${user?.id || "anon"}:${post.id}`;
  const [draft, setDraft] = useState(() => {
    try { return localStorage.getItem(draftKey) || ""; } catch { return ""; }
  });
  const [sending, setSending] = useState(false);
  const memberFor = (id) => members.find((member) => member.id === id);
  const canModerateReply = (reply) => reply.author_id === user?.id || isHeadAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator);

  const changeDraft = (value) => {
    setDraft(value);
    try {
      if (value.trim()) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    } catch {}
  };

  const submit = async (event) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const ok = await createReply(post, draft);
      if (ok) {
        changeDraft("");
      }
    } finally {
      setSending(false);
    }
  };

  return <section className="forum-replies">
    <div className="forum-replies-heading"><h3>Antworten ({postReplies.length})</h3>{draft.trim() && <small>✓ Antwortentwurf gespeichert</small>}</div>
    {postReplies.map((reply) => {
      const author = memberFor(reply.author_id);
      const business = author?.account_badge === "BUSINESS";
      const moderator = author?.forum_moderator;
      const helpfulForReply = helpful.filter((entry) => entry.reply_id === reply.id);
      const mineHelpful = helpfulForReply.some((entry) => entry.user_id === user?.id);
      return <article className="forum-reply" key={reply.id}>
        <small className={`role-author ${business ? "business" : roleClass(author?.role)}`}>
          {business ? "★" : roleMark(author?.role)} {getName(author)}
          {business ? " · Unternehmenskonto" : moderator ? " · Forum-Moderator" : ""}
          {" · "}{new Date(reply.created_at).toLocaleString("de-AT")}
          {reply.edited_at ? ` · bearbeitet${reply.edit_reason ? `: ${reply.edit_reason}` : ""}` : ""}
        </small>
        <p>{reply.content}</p>
        <div className="forum-reply-footer">
          {reply.author_id !== user?.id
            ? <button type="button" className={mineHelpful ? "forum-helpful-button is-active" : "forum-helpful-button"} onClick={() => toggleHelpful(reply)}>{helpfulForReply.length ? `♥ Hilfreich · ${helpfulForReply.length}` : "♡ Hilfreich"}</button>
            : helpfulForReply.length > 0 && <small className="forum-helpful-count">{helpfulForReply.length} {helpfulForReply.length === 1 ? "Mitglied fand" : "Mitglieder fanden"} diese Antwort hilfreich.</small>}
          {canModerateReply(reply) && <div className="forum-reply-actions"><button type="button" className="secondary-button" onClick={() => editReply(reply)}>✎ Bearbeiten</button><button type="button" className="danger-button" onClick={() => deleteReply(reply)}>Löschen</button></div>}
        </div>
      </article>;
    })}
    {!postReplies.length && canReply && <p className="forum-first-reply-invite">Noch keine Antwort – deine Rückmeldung kann die Diskussion ins Rollen bringen.</p>}
    {canReply && <form className="forum-reply-form" onSubmit={submit}>
      <textarea value={draft} onChange={(event) => changeDraft(event.target.value)} placeholder={postReplies.length ? "Auf diesen Beitrag antworten …" : "Sei die erste Person, die antwortet …"} minLength="2" required/>
      <div className="forum-reply-form-actions">{draft.trim() && <button type="button" className="text-button" onClick={() => changeDraft("")}>Entwurf verwerfen</button>}<button className="primary-button" disabled={sending}>{sending ? "Wird gesendet …" : postReplies.length ? "Antwort senden" : "Erste Antwort senden"}</button></div>
    </form>}
  </section>;
}

function Forum({ title, intro, scope, posts, replies, helpful, user, members, profile, createPost, editPost, deletePost, setPostState, createReply, editReply, deleteReply, toggleHelpful, locked, onBack }) {
  const draftKey = `ec-forum-draft:${profile?.id || "anon"}:${scope}`;
  const [draftState, setDraftState] = useState({ restored: false, saved: false });
  const composerRef = useRef(null);

  useEffect(() => {
    const form = composerRef.current;
    if (!form || locked) return undefined;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey) || "null"); } catch {}
    if (draft && (draft.title || draft.content)) {
      const titleField = form.elements.namedItem("title");
      const contentField = form.elements.namedItem("content");
      const fontField = form.elements.namedItem("font_family");
      const sizeField = form.elements.namedItem("font_size");
      const emphasisField = form.elements.namedItem("emphasis");
      const categoryField = form.elements.namedItem("category");
      if (titleField) titleField.value = draft.title || "";
      if (contentField) contentField.value = draft.content || "";
      if (fontField && draft.font_family) fontField.value = draft.font_family;
      if (sizeField && draft.font_size) sizeField.value = draft.font_size;
      if (emphasisField && draft.emphasis) emphasisField.value = draft.emphasis;
      if (categoryField && draft.category) categoryField.value = draft.category;
      setDraftState({ restored: true, saved: true });
    }
    const persist = () => {
      const values = new FormData(form);
      const next = {
        title: String(values.get("title") || ""),
        content: String(values.get("content") || ""),
        font_family: String(values.get("font_family") || "modern"),
        font_size: String(values.get("font_size") || "normal"),
        emphasis: String(values.get("emphasis") || "normal"),
        category: String(values.get("category") || (scope === "ADMIN" ? "INTERN" : "ALLGEMEIN")),
        saved_at: new Date().toISOString()
      };
      if (next.title.trim() || next.content.trim()) {
        localStorage.setItem(draftKey, JSON.stringify(next));
        setDraftState((current) => ({ ...current, saved: true }));
      } else {
        localStorage.removeItem(draftKey);
        setDraftState({ restored: false, saved: false });
      }
    };
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    return () => { form.removeEventListener("input", persist); form.removeEventListener("change", persist); };
  }, [draftKey, locked]);

  const submitPost = async (event) => {
    const ok = await createPost(event, scope);
    if (ok) {
      try { localStorage.removeItem(draftKey); } catch {}
      setDraftState({ restored: false, saved: false });
    }
  };

  const [forumQuery, setForumQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const categoryLabels = { ALLGEMEIN:"Allgemein", IDEEN:"Ideen & Vorschläge", FREIZEIT:"Freizeit", SUCHE_BIETE:"Suche & Biete", HILFE:"Hilfe", EVENTS:"Events", GEMEINDE:"Gemeinde", INTERN:"Intern" };
  const visiblePosts = posts
    .filter((post) => post.scope === scope)
    .filter((post) => categoryFilter === "ALL" || (post.category || (scope === "ADMIN" ? "INTERN" : "ALLGEMEIN")) === categoryFilter)
    .filter((post) => !mineOnly || post.author_id === profile?.id)
    .filter((post) => !recentOnly || (Date.now() - new Date(post.created_at || 0).getTime()) <= 7 * 24 * 60 * 60 * 1000)
    .filter((post) => {
      const q = forumQuery.trim().toLowerCase();
      if (!q) return true;
      const author = members.find((member) => member.id === post.author_id);
      return [post.title, post.content, getName(author), categoryLabels[post.category]].filter(Boolean).join(" ").toLowerCase().includes(q);
    })
    .sort((a,b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || new Date(b.created_at) - new Date(a.created_at));
  const memberFor = (id) => members.find((member) => member.id === id);
  const nameFor = (id) => getName(memberFor(id));
  const identityFor = (id) => { const member = memberFor(id); return member ? `${roleMark(member.role)} ${getName(member)} · ${roleLabel(member.role)}`.trim() : "Unbekanntes Mitglied"; };
  const forumContacts = scope === "COMMUNITY" ? members.filter((member) => member.account_status !== "SUSPENDED" && !member.is_test_account && (isAdmin(member.role) || (member.role === "SUPPORTER" && (member.forum_moderator || (member.admin_responsibilities || []).some((item) => /forum/i.test(String(item))))))) : [];
  return <section className={`forum-page${scope === "ADMIN" ? " admin-forum-page" : ""}`}>{scope === "ADMIN" && <div className="admin-forum-page-toolbar"><button type="button" className="secondary-button admin-forum-back-button" onClick={onBack}>← Zur Admin-Zentrale</button><span>Interner Team-Bereich · überregional</span></div>}<div className="page-heading admin-forum-page-heading"><div><span className="eyebrow">{scope === "ADMIN" ? "ADMIN · INTERN" : "COMMUNITY"}</span><h1>{title}</h1><p>{intro}</p></div>{scope === "ADMIN" && <div className="admin-forum-page-badge"><strong>Nur Team</strong><small>Admins & berechtigte Moderation</small></div>}</div><div className="forum-browser panel"><input type="search" value={forumQuery} onChange={(event) => setForumQuery(event.target.value)} placeholder="Beiträge durchsuchen …" aria-label="Forumsbeiträge durchsuchen"/><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Forumskategorie filtern"><option value="ALL">Alle Kategorien</option>{Object.entries(categoryLabels).filter(([key]) => scope === "ADMIN" ? key === "INTERN" : key !== "INTERN").map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><label><input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)}/> Meine Beiträge</label><label><input type="checkbox" checked={recentOnly} onChange={(event) => setRecentOnly(event.target.checked)}/> Letzte 7 Tage</label><span><strong>{visiblePosts.length}</strong> Beiträge</span>{(forumQuery || mineOnly || recentOnly || categoryFilter !== "ALL") && <button type="button" className="secondary-button" onClick={() => { setForumQuery(""); setMineOnly(false); setRecentOnly(false); setCategoryFilter("ALL"); }}>Filter zurücksetzen</button>}</div>{forumContacts.length > 0 && <aside className="forum-contacts panel"><span className="eyebrow">ZUSTÄNDIG IM FORUM</span><h2>Forum-Moderation & Ansprechpartner</h2><div>{forumContacts.map((member) => <span className={`forum-contact ${roleClass(member.role)}`} key={member.id}>{roleMark(member.role)} {getName(member)} <small>· {member.forum_moderator ? "Forum-Moderation" : roleLabel(member.role)}</small></span>)}</div></aside>}<form ref={composerRef} className="forum-composer panel" onSubmit={submitPost}><h2>Neuen Beitrag schreiben</h2>{draftState.restored && <div className="forum-draft-notice"><strong>Entwurf wiederhergestellt</strong><span>Dein nicht veröffentlichter Text wurde automatisch gespeichert.</span><button type="button" onClick={() => { localStorage.removeItem(draftKey); composerRef.current?.reset(); setDraftState({ restored:false, saved:false }); }}>Entwurf verwerfen</button></div>}{!draftState.restored && draftState.saved && <small className="forum-draft-saved">✓ Entwurf automatisch gespeichert</small>}{locked && <p className="forum-locked">Deine Schreibfunktion im Forum ist momentan gesperrt.</p>}<input name="title" placeholder="Überschrift" minLength="3" required disabled={locked}/><textarea name="content" placeholder="Teile deinen Beitrag mit der Community …" minLength="3" required disabled={locked}/>{scope === "COMMUNITY" && <label className="forum-category-field">Kategorie<select name="category" defaultValue="ALLGEMEIN" disabled={locked}>{Object.entries(categoryLabels).filter(([key]) => key !== "INTERN").map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>}<div className="form-grid"><label>Schriftart<select name="font_family" defaultValue="modern" disabled={locked}><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="font_size" defaultValue="normal" disabled={locked}><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label></div><label>Betonung<select name="emphasis" defaultValue="normal" disabled={locked}><option value="normal">Normal</option><option value="bold">Fett</option><option value="italic">Kursiv</option></select></label>{!isAdmin(profile?.role) && <label className="ai-content-option"><input type="checkbox" name="is_ai_generated" disabled={locked}/><span>Dieser Inhalt wurde mit KI erstellt oder wesentlich mit KI unterstützt.</span></label>}<button className="primary-button" disabled={locked}>Beitrag veröffentlichen</button></form><div className="forum-post-list">{visiblePosts.map((post) => { const canManage = post.author_id === profile?.id || isAdmin(profile?.role) || (post.scope === "COMMUNITY" && profile?.forum_moderator); const canPin = scope === "ADMIN" ? isAdmin(profile?.role) : (isAdmin(profile?.role) || profile?.forum_moderator); const canSolve = canManage; const category = post.category || (scope === "ADMIN" ? "INTERN" : "ALLGEMEIN"); return <article className={`forum-post panel${post.is_pinned ? " is-pinned" : ""}${post.is_solved ? " is-solved" : ""}`} key={post.id}><div className="forum-post-head"><div><div className="forum-post-flags"><span className="eyebrow">{scope === "ADMIN" ? "ADMIN-FORUM" : "FORUM"}</span><span className="forum-category-badge">{categoryLabels[category] || category}</span>{post.is_pinned && <span className="forum-state-badge pinned">⌁ Angepinnt</span>}{post.is_solved && <span className="forum-state-badge solved">✓ Gelöst</span>}{post.is_ai_generated && <span className="ai-content-badge">✦ KI-Inhalt</span>}</div><h2>{post.title}</h2><p>von <strong>{nameFor(post.author_id)}</strong> · {new Date(post.created_at).toLocaleString("de-AT")}</p></div>{(canManage || canPin) && <div className="forum-post-actions">{canPin && <button type="button" className="secondary-button" onClick={() => setPostState(post,{is_pinned:!post.is_pinned})}>{post.is_pinned ? "Anheftung lösen" : "⌁ Anpinnen"}</button>}{canSolve && <button type="button" className="secondary-button" onClick={() => setPostState(post,{is_solved:!post.is_solved})}>{post.is_solved ? "Wieder öffnen" : "✓ Als gelöst markieren"}</button>}{canManage && <><button type="button" className="secondary-button" onClick={() => editPost(post)}>✎ Bearbeiten</button><button type="button" className="danger-button" onClick={() => deletePost(post)}>Löschen</button></>}</div>}</div><p className={`forum-content ${post.font_family || "modern"} ${post.font_size || "normal"} ${post.emphasis || "normal"}`}>{post.content}</p>{post.edited_at && <small className="forum-edited">✎ Bearbeitet von {identityFor(post.edited_by)}{post.edit_reason ? ` · ${post.edit_reason}` : ""}</small>}<ForumReplyThread post={post} replies={replies} helpful={helpful} user={user} members={members} profile={profile} canReply={scope === "ADMIN" ? isAdmin(profile?.role) : !locked} createReply={createReply} editReply={editReply} deleteReply={deleteReply} toggleHelpful={toggleHelpful}/></article>; })}{!visiblePosts.length && <div className="empty-card">Noch keine Beiträge. Starte die Diskussion!</div>}</div></section>;
}

function FeatureUnlocks({ member, setMemberFeatureLock }) { return <section className="member-admin-tools feature-unlocks"><span className="eyebrow">FUNKTIONEN FREIGEBEN</span><h2>Sperren aufheben</h2><p>Nur verwenden, wenn die Funktion für dieses Mitglied wieder erlaubt sein soll.</p><div><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", false)}>Forum freigeben</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "MESSAGING", false)}>Nachrichten freigeben</button><button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FRIEND_REQUESTS", false)}>Anfragen freigeben</button></div></section>; }

function ProfileModal({ selectedMember, user, profile, friendship, setSelectedMember, requestFriend, respond, removeFriend, blockUser, reportUser, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  return <div className="modal-overlay" onClick={() => setSelectedMember(null)}><div className="profile-modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedMember(null)}>×</button><div className={`modal-profile-header ${roleClass(selectedMember.role)}`}><div className="profile-modal-role">{selectedMember.role === "HEAD_ADMIN" ? "♛ GLOBAL ADMIN" : selectedMember.role === "ADMIN" ? "★ COMMUNITY ADMIN" : selectedMember.role === "SUPPORTER" ? "★ SUPPORTER" : "MITGLIED"}</div><img className="modal-avatar" src={selectedMember.avatar_url || DEFAULT_AVATAR} alt=""/><div className="modal-title"><h1>{getName(selectedMember)}</h1><span>{[selectedMember.first_name, selectedMember.last_name].filter(Boolean).join(" ")}{getAge(selectedMember.birth_date) !== null && ` · ${getAge(selectedMember.birth_date)} Jahre`}</span></div></div><div className="modal-content">{selectedMember.bio && <><h3>Über mich</h3><p>{selectedMember.bio}</p></>}{selectedMember.id !== user.id && <div className="profile-actions"><button className="primary-button" onClick={() => { setSelectedMember(null); openChat(selectedMember); }}>💬 Nachricht</button>{accepted ? <button className="secondary-button" onClick={() => removeFriend(selectedMember)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Anfrage ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(selectedMember)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>}{!isAdmin(selectedMember.role) && <button className="secondary-button" onClick={() => blockUser(selectedMember)}>🚫 Blockieren</button>}<button className="danger-button" onClick={() => reportUser(selectedMember)}>🚩 Nutzer melden</button></div>}</div></div></div>;
}

function HeadAdminProfileMediaTools({ member, onRemove }) {
  const items = [["avatar_url", "Profilbild"], ["profile_background", "Hintergrundfoto"]].filter(([field]) => String(member?.[field] || "").startsWith("http"));
  if (!items.length) return null;
  return <section className="head-admin-media-tools panel"><span className="eyebrow">HEAD-ADMIN · PROFILMEDIEN</span><h2>Bilder bei Regelverstoß entfernen</h2><p>Jede Entfernung verlangt eine Begründung und wird im Admin-Logbuch festgehalten.</p><div>{items.map(([field, label]) => <button type="button" className="danger-button" key={field} onClick={() => onRemove(member, field, label)}>{label} entfernen</button>)}</div></section>;
}

function ProfileHighlights({ member }) {
  const interests = formatInterests(member.interests).split(",").map((item) => item.trim()).filter(Boolean);
  const contactVisible = (member.privacy_settings?.website || "PUBLIC") === "PUBLIC";
  const copyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(member.id)}`;
    try { await navigator.clipboard.writeText(link); window.alert("Profil-Link wurde kopiert."); }
    catch { window.prompt("Profil-Link kopieren:", link); }
  };
  const hasSocial = contactVisible && (member.instagram_username || member.snapchat_username || member.website);
  if (!interests.length && !hasSocial) return null;
  return <section className="profile-highlights panel">{interests.length > 0 && <div className="profile-interest-tags">{interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}<div className="profile-social-actions">{contactVisible && member.instagram_username && <a href={`https://instagram.com/${encodeURIComponent(member.instagram_username)}`} target="_blank" rel="noreferrer">◎ Instagram</a>}{contactVisible && member.snapchat_username && <a href={`https://www.snapchat.com/add/${encodeURIComponent(member.snapchat_username)}`} target="_blank" rel="noreferrer">◉ Snapchat</a>}{contactVisible && member.website && <a href={/^https?:\/\//i.test(member.website) ? member.website : `https://${member.website}`} target="_blank" rel="noreferrer">↗ Website</a>}<button type="button" onClick={copyLink}>⧉ Profil-Link kopieren</button></div></section>;
}

function MemberProfile({ member, friends, groups = [], photos = [], onOpenGroup, user, viewerProfile, friendship, back, onOpen, requestFriend, respond, removeFriend, blockUser, reportUser, warnMember, updateMemberRole, manageDirectMessagePolicy, toggleSuspension, toggleTestAccount, setBusinessAccount, setForumModerator, setGroupModerator, setProfileVerification, loadPermissions, setMemberFeatureLock, openChat }) {
  const incoming = friendship?.status === "PENDING" && friendship.receiver_id === user.id;
  const sent = friendship?.status === "PENDING" && friendship.requester_id === user.id;
  const accepted = friendship?.status === "ACCEPTED";
  const viewerIsPrimaryHead = Boolean(viewerProfile?.is_primary_head_admin);
  const protectedHeadTarget = member.role === "HEAD_ADMIN";
  const canModerate = (viewerIsPrimaryHead || viewerProfile?.role === "ADMIN" || viewerProfile?.forum_moderator) && member.id !== user.id && (!protectedHeadTarget || viewerIsPrimaryHead);
  const canManageRoles = viewerIsPrimaryHead && member.id !== user.id;
  const canSee = (field) => isAdmin(viewerProfile?.role) || (member.privacy_settings?.[field] || "PUBLIC") === "PUBLIC" || ((member.privacy_settings?.[field] || "PUBLIC") === "FRIENDS" && accepted);
  const hasGroupModeration = (member.admin_responsibilities || []).some((item) => /gruppen verwalten/i.test(String(item)));
  const visibleDetails = [["location", "Ort", member.location], ["interests", "Interessen", formatInterests(member.interests)], ["website", "Webseite", member.website]].filter(([field,,value]) => value && canSee(field));
  const savedResponsibilities = Array.isArray(member.admin_responsibilities) ? member.admin_responsibilities : [];
  const defaultAdminResponsibilities = member.role === "ADMIN" ? ["Community-Verwaltung – Zuständigkeiten werden vom Head Admin festgelegt"] : [];
  const visibleResponsibilities = (member.role === "HEAD_ADMIN"
    ? [member.head_admin_responsibilities || (member.is_primary_head_admin ? "Gesamtverantwortung, Sicherheit & Regeln" : "Delegierter Head Admin – Rechte werden einzeln vergeben")]
    : [...(savedResponsibilities.length ? savedResponsibilities : defaultAdminResponsibilities), ...(member.forum_moderator ? ["Forum-Moderation · Meldungen und respektvoller Austausch"] : [])]
  ).map((value) => String(value || "").trim()).filter(Boolean);
  const nameVisible = canSee("name");
  const birthVisible = canSee("birth_date");
  const age = birthVisible ? getAge(member.birth_date) : null;
  const displayName = nameVisible ? [member.first_name, member.last_name].filter(Boolean).join(" ") : "";
  const openUnifiedAdminTools = async () => {
    await loadDeferredProfileAdminEnhancements();
    if (typeof window.ecOpenUnifiedProfileAdminTools !== "function") return showNotice("Admin Tools konnten nicht geladen werden.");
    return window.ecOpenUnifiedProfileAdminTools(member.id);
  };
  const openUnifiedPointHistory = async () => {
    await loadDeferredProfileAdminEnhancements();
    if (typeof window.ecOpenUnifiedProfilePointHistory !== "function") return showNotice("Punkteliste konnte nicht geladen werden.");
    return window.ecOpenUnifiedProfilePointHistory(member.id);
  };
  const requestVerification = async () => {
    const reason = prompt(`Warum soll ${getName(member)} sein Profil verifizieren?`, "Bitte bestätige zur Sicherheit die Echtheit deines Profils.");
    if (reason === null || reason.trim().length < 3) return;
    const days = Number(prompt("Frist in Tagen (1 bis 30):", "7"));
    if (!Number.isInteger(days) || days < 1 || days > 30) return alert("Bitte eine Frist zwischen 1 und 30 Tagen eingeben.");
    const { error } = await supabase.rpc("admin_require_profile_verification", { p_target_user: member.id, p_reason: reason.trim(), p_due_days: days });
    alert(error ? error.message : "Verifizierung wurde angefordert. Das Mitglied wurde benachrichtigt.");
  };
  const requestProfilePhoto = async () => {
    const confirmed = window.confirm(`Offizielle Profilbild-Empfehlung an ${getName(member)} senden?`);
    if (!confirmed) return;
    const { error } = await supabase.rpc("admin_request_profile_photo", { p_target_user: member.id });
    if (error) return alert(error.message);
    alert("Die Profilbild-Empfehlung wurde als offizielle Ennstal-Connect-Nachricht gesendet.");
  };

  return <section className="member-profile-page" data-profile-id={member.id}>
    <button className="back-button" onClick={back}>← Zurück zu Mitgliedern</button>
    <article className={`member-profile-hero ${roleClass(member.role)} has-profile-cover ${member.account_badge === "BUSINESS" ? "business-profile" : ""}`}>
      <div className="member-profile-cover">{member.profile_background?.startsWith("http") && <img src={member.profile_background} alt="" style={{objectPosition:"50% 50%",transform:`translate(${((member?.profile_background_position_x ?? 50)-50)*0.16}%, ${((member?.profile_background_position_y ?? 50)-50)*0.16}%) scale(${member?.profile_background_zoom ?? 1})`,transformOrigin:"50% 50%"}}/>}<span className="member-profile-cover-overlay" style={{background:`rgba(10,24,36,${member?.profile_background_overlay ?? 0.18})`}}/></div>
      <img className={!member.avatar_url ? "member-profile-default-avatar" : ""} src={member.avatar_url || DEFAULT_AVATAR} alt="Standard-Profilbild"/>
      <div>
        <span className="ec-profile-main-role"><RoleStar member={member}/>{roleLabel(member.role)}</span>
        {(member.account_badge === "BUSINESS" || Boolean(member.company_name) || member.id === "b6f03bdc-9e94-4e05-9aeb-1601e1d36ca0") && <div className="ec-profile-main-role ec-entrepreneur-role" style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}><img src="/role-star-blue.svg" alt="" aria-hidden="true" style={{width:25,height:25}}/><span><strong>Unternehmeraccount</strong><small style={{display:"block",fontSize:12}}>{member.company_name || (member.id === "b6f03bdc-9e94-4e05-9aeb-1601e1d36ca0" ? "Jasmin Binder – Achtsamkeit & Mindset-Coaching" : "")}</small></span></div>}
        {member.district_code && <p className="member-home-district" data-profile-home-district="true"><strong>Heimatbezirk:</strong> {HOME_DISTRICT_OPTIONS.find(([code]) => code === member.district_code)?.[1] || member.district_code}</p>}<h1>{getName(member)}{member.is_verified && <small className="verified-profile-badge"> ✓ Verifiziert</small>}</h1>
        
        {member.is_community_photographer && <div className="community-photographer-profile-badge"><img src="/community-photographer-camera.svg" alt=""/><span><strong>Community-Fotograf</strong><small>{member.community_photographer_global ? "Alle Regionen" : "Regional"}</small></span></div>}
        {(displayName || age !== null) && <p>{displayName}{displayName && age !== null ? " · " : ""}{age !== null ? `${age} Jahre` : ""}</p>}
        {member.bio && canSee("bio") && <p className="member-profile-bio">{member.bio}</p>}
        
        {visibleResponsibilities.length > 0 && <p className="admin-responsibilities">Zuständig für: {visibleResponsibilities.join(" · ")}</p>}
      </div>
    </article>

    {<section className="panel ec-profile-home-district-card" aria-label="Heimatbezirk" style={{marginTop:12,marginBottom:12,padding:"16px 20px",border:"1px solid #dce5eb",borderRadius:16,background:"#f7f9fb"}}><span style={{display:"block",fontSize:13,fontWeight:800,letterSpacing:"0.08em",textTransform:"uppercase",color:"#607487"}}>HEIMATBEZIRK</span><strong style={{display:"block",fontSize:21,marginTop:4,color:"#102232"}}>{member.district_code ? (HOME_DISTRICT_OPTIONS.find(([code]) => code === member.district_code)?.[1] || member.district_code) : "Noch nicht ausgewählt"}</strong></section>}
    {visibleDetails.length > 0 && <section className="panel profile-visible-details"><span className="eyebrow">PROFILINFORMATIONEN</span>{visibleDetails.map(([, caption, value]) => <p key={caption}>{caption}: {String(value)}</p>)}</section>}
    <ProfileRelationshipSection member={member} currentUserId={user?.id}/>

    <div className="member-profile-actions">
      <button className="primary-button" onClick={() => openChat(member)}>💬 Nachricht</button>
      {accepted ? <button className="secondary-button" onClick={() => removeFriend(member)}>♥ Befreundet · entfernen</button> : incoming ? <><button className="primary-button" onClick={() => respond(friendship, true)}>✓ Anfrage annehmen</button><button className="danger-button" onClick={() => respond(friendship, false)}>Ablehnen</button></> : <button className="secondary-button" onClick={() => requestFriend(member)}>{sent ? "⏳ Anfrage gesendet" : "🤝 Freundschaftsanfrage"}</button>}
      {member.id !== user.id && (viewerIsPrimaryHead || ["ADMIN","HEAD_ADMIN"].includes(String(viewerProfile?.role||"").toUpperCase()) || viewerProfile?.forum_moderator) && <button className="primary-button ec-profile-admin-open" onClick={openUnifiedAdminTools}>⚙ Admin Tools</button>}
      {viewerIsPrimaryHead && member.id !== user.id && !member.is_primary_head_admin && <button className="secondary-button ec-profile-point-history-open" onClick={openUnifiedPointHistory}>★ Punkteliste</button>}
      {!isAdmin(member.role) && <button className="secondary-button" onClick={() => blockUser(member)}>🚫 Blockieren</button>}
      <button className="danger-button" onClick={() => reportUser(member)}>🚩 Nutzer melden</button>
    </div>

    {canModerate && <section className="member-admin-tools">
      <span className="eyebrow">MODERATION</span><h2>Admin-Werkzeuge</h2>
      <div>
        <button className="danger-button" onClick={() => warnMember(member)}>⚠ Verwarnung senden</button>
        <button className="secondary-button" onClick={() => toggleSuspension(member)}>{member.account_status === "SUSPENDED" ? "🔓 Freischalten" : "🔒 Sperren"}</button>
        {!member.avatar_url && <button className="secondary-button" onClick={requestProfilePhoto}>📷 Profilbild anfordern</button>}{!member.is_verified && member.role !== "HEAD_ADMIN" && <button className="secondary-button" onClick={requestVerification}>✓ Verifizierung mit Frist anfordern</button>}
        {viewerIsPrimaryHead && <>
          <button className="secondary-button" onClick={() => setBusinessAccount(member.id, member.account_badge !== "BUSINESS")}>{member.account_badge === "BUSINESS" ? "★ Unternehmenskonto entfernen" : "★ Unternehmenskonto"}</button>{member.account_badge === "BUSINESS" && <button className="secondary-button" onClick={() => setBusinessAccount(member.id, true, true)}>✎ Firmenname bearbeiten</button>}
          {member.role === "SUPPORTER" && <button className="secondary-button" onClick={() => setForumModerator(member, !member.forum_moderator)}>{member.forum_moderator ? "★ Forum-Moderation entfernen" : "★ Zum Forum-Moderator ernennen"}</button>}
          <button className="secondary-button" onClick={() => setProfileVerification(member, !member.is_verified)}>{member.is_verified ? "✓ Verifizierung entfernen" : "✓ Profil verifizieren"}</button>
          <button className="secondary-button" onClick={() => toggleTestAccount(member)}>{member.is_test_account ? "◉ Testkonto sichtbar machen" : "◌ Als Testkonto ausblenden"}</button>
          {member.role === "SUPPORTER" && <button className="secondary-button" onClick={() => setGroupModerator(member, !hasGroupModeration)}>{hasGroupModeration ? "★ Gruppenmoderation entfernen" : "★ Zum Gruppenmoderator ernennen"}</button>}
        </>}
        {canManageRoles && <>
          <button className="secondary-button" onClick={() => updateMemberRole(member, "SUPPORTER")}>🟢 Supporter</button>
          <button className="secondary-button" onClick={() => updateMemberRole(member, member.role === "ADMIN" ? "MEMBER" : "ADMIN")}>{member.role === "ADMIN" ? "✕ Admin entfernen" : "★ Community Admin"}</button>
          {member.role !== "HEAD_ADMIN" && <button className="secondary-button" onClick={() => updateMemberRole(member, "HEAD_ADMIN")}>♛ Head Admin (delegiert)</button>}
          {member.role !== "MEMBER" && <button className="secondary-button" onClick={() => updateMemberRole(member, "MEMBER")}>↩ Rolle entfernen</button>}
          <button className="secondary-button" onClick={() => loadPermissions(member.id)}>⚙ Rechte verwalten</button>
          <button className="secondary-button" onClick={() => manageDirectMessagePolicy(member)}>✉ Direktnachrichten verwalten</button>
          <button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", true)}>Forum sperren</button>
          <button className="secondary-button" onClick={() => setMemberFeatureLock(member, "MESSAGING", true)}>Nachrichten sperren</button>
          <button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FRIEND_REQUESTS", true)}>Anfragen sperren</button>
          <button className="secondary-button" onClick={() => setMemberFeatureLock(member, "FORUM_POSTING", false)}>Forum freigeben</button>
        </>}
      </div>
    </section>}

    <ProfileSections member={member} isFriend={accepted}/>
    <PublicProfilePhotoFolder member={member} photos={photos} canSeeFriends={accepted}/>
  </section>;
}

function PublicProfileUpdatesPreview() { const [updates, setUpdates] = useState([]); useEffect(() => { if (!supabase) return; supabase.from("public_profile_updates").select("nickname, role, is_verified, avatar_url, activity_type, created_at").order("created_at", { ascending: false }).limit(5).then(({ data }) => setUpdates(data || [])); }, []); if (!updates.length) return null; return <section className="public-auth-updates"><span className="eyebrow">ÖFFENTLICHE AKTUALISIERUNGEN</span><h2>Aus der Community</h2>{updates.map((entry, index) => <div className={`hub-row ${roleClass(entry.role)}`} key={`${entry.nickname}-${entry.created_at}-${index}`}><img src={entry.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong><RoleStar member={entry}/> {entry.nickname}{entry.is_verified ? " ✓" : ""}</strong><span>{entry.activity_type}</span></div></div>)}</section>; }
function PasswordReset({ finishPasswordReset, notice }) { return <div className="auth-page"><div className="auth-welcome ec-auth-welcome"><section className="auth-intro ec-auth-intro"><img className="ec-auth-logo" src="/ennstal-connect-wordmark.svg" alt="Ennstal Connect"/><span className="eyebrow">KONTO-SICHERHEIT</span><h1>Neues Passwort festlegen.</h1><p>Wähle ein sicheres neues Passwort für dein Ennstal-Connect-Konto.</p></section><div className="auth-box ec-auth-box"><form className="panel" onSubmit={finishPasswordReset}><h2>Passwort zurücksetzen</h2><input name="password" type="password" minLength={6} placeholder="Neues Passwort (mindestens 6 Zeichen)" required/><input name="confirm_password" type="password" minLength={6} placeholder="Passwort wiederholen" required/><button className="primary-button">Passwort speichern</button></form></div></div>{notice && <div className="toast">{notice}</div>}</div>; }
function NewAuth({ login, register, loginPending = false, loginFeedback = "" }) {
  const inviter = String(new URLSearchParams(location.search).get("ref") || "").trim();
  const [mode, setMode] = useState(inviter ? "register" : "login");
  return <div className="auth-welcome ec-auth-welcome">
    <section className="auth-intro ec-auth-intro">
      <span className="eyebrow">REGIONAL. ECHT. GEMEINSAM.</span>
      <h1>Deine Community in der Region.</h1>
      <p>Menschen kennenlernen, regionale Neuigkeiten lesen und sich in Gruppen, Forum und Veranstaltungen austauschen.</p>
      <div className="ec-auth-regions" aria-label="Verfügbare Regionen">
        <article><strong>Ennstal</strong><span>Für Mitglieder und Themen aus dem Ennstal.</span></article>
        <article><strong>Alpenraum</strong><span>Ausseerland · Salzkammergut · Obersteiermark · Graz und Umgebung.</span></article>
      </div>
      <div className="ec-auth-whats-new">
        <h2>Neu bei Ennstal Connect</h2>
        <ul><li>Mitglieder werden in ihrer Heimatregion angezeigt.</li><li>Profilbesuche, Änderungen und Neuigkeiten sind direkt erreichbar.</li><li>Die regionale Navigation funktioniert am Computer und am Handy.</li></ul>
      </div>
      <div className="ec-auth-roles">
        <article><strong>★ Regional Admin</strong><span>Betreut ausschließlich die zugewiesene Region und ist dort sichtbar.</span></article>
        <article><strong>★ Supporter</strong><span>Unterstützt die Community in freigegebenen Bereichen, etwa Forum oder Gruppen.</span></article>
        <article><strong>★ Hauptadmin</strong><span>Betreibt Ennstal Connect und ist für Sicherheit und Verwaltung verantwortlich.</span></article>
      </div>
      <small>Profile und private Inhalte sind erst nach der Anmeldung sichtbar.</small>
      <PublicProfileUpdatesPreview/>
    </section>
    <div className="auth-box ec-auth-box">{inviter && <div className="auth-referral-note"><strong>Du wurdest eingeladen</strong><span>Ein Mitglied von Ennstal Connect hat dir diesen Registrierungslink geschickt.</span></div>}{mode === "login" ?
      <form className="panel" onSubmit={login}><span className="eyebrow">WILLKOMMEN</span><h2>Anmelden</h2><input name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="email" placeholder="E-Mail *" required/><input name="password" type="password" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="current-password" placeholder="Passwort *" required/>{loginFeedback && <p className="auth-login-feedback" role="status" aria-live="polite">{loginFeedback}</p>}<button className="primary-button" type="submit" disabled={loginPending}>{loginPending ? "Anmeldung läuft …" : "Anmelden"}</button><button type="button" className="text-button" disabled={loginPending} onClick={() => setMode("register")}>Noch kein Konto? Jetzt registrieren</button></form> :
      <form className="panel" onSubmit={register}><span className="eyebrow">NEUES KONTO</span><h2>Registrieren</h2><p className="auth-form-note">Dein Nickname ist sichtbar. Vor- und Nachname müssen gemäß Community-Regeln vollständig und richtig angegeben werden. Wähle die Heimatregion, in der dein Profil geführt wird.</p><input name="nickname" placeholder="Nickname *" required/><input name="first_name" placeholder="Vorname *" minLength={2} required/><input name="last_name" placeholder="Nachname *" minLength={2} required/><input name="birth_date" type="date" required/><select name="gender" defaultValue="" required><option value="">Geschlecht auswählen *</option><option value="männlich">Männlich</option><option value="weiblich">Weiblich</option><option value="divers">Divers</option></select><label className="region-register-label"><span>Deine Heimatregion</span><small>Dort bist du in der Mitgliederliste sichtbar.</small><select name="home_region_slug" defaultValue="ennstal" required><option value="ennstal">Ennstal</option><option value="leoben-bruck-muerzzuschlag">Alpenraum</option></select></label><input name="email" type="email" autoComplete="email" placeholder="E-Mail *" required/><input name="password" type="password" autoComplete="new-password" minLength={6} placeholder="Passwort *" required/><button className="primary-button">Konto erstellen</button><button type="button" className="text-button" onClick={() => setMode("login")}>Bereits registriert? Anmelden</button></form>}
    </div>
  </div>;
}

function InfoPage({ title, text }) { return <section><div className="page-heading"><h1>{title}</h1></div><div className="panel"><p>{text}</p></div></section>; }
function CommunityHub({ members, ads, photos, profile, profileUpdates, activeRegion, onDeleteAd }) {
  const birthdays = members.filter((member) => member.birthday_visible && member.birth_date).map((member) => ({ member, date: new Date(member.birth_date) })).sort((a, b) => (a.date.getMonth() * 31 + a.date.getDate()) - (b.date.getMonth() * 31 + b.date.getDate())).slice(0, 8);
  const municipalities = members.filter((member) => String(member.role || "").toUpperCase() === "MUNICIPALITY").sort((a, b) => getName(a).localeCompare(getName(b), "de"));
  const admins = members.filter((member) => isAdmin(member.role)).sort((a, b) => (a.role === "HEAD_ADMIN" ? -1 : b.role === "HEAD_ADMIN" ? 1 : getName(a).localeCompare(getName(b), "de")));
  const moderators = members.filter((member) => member.role === "SUPPORTER" && (member.forum_moderator || (member.admin_responsibilities || []).some((entry) => /gruppen verwalten/i.test(String(entry))))).sort((a, b) => getName(a).localeCompare(getName(b), "de"));
  const businesses = members.filter((member) => member.account_badge === "BUSINESS").sort((a, b) => getName(a).localeCompare(getName(b), "de"));
  const publicPhotos = photos.filter((photo) => photo.visibility !== "FRIENDS");
  const responsibilityFor = (member) => member.role === "HEAD_ADMIN" ? (member.head_admin_responsibilities || "Gesamtverantwortung, Sicherheit & Regeln") : (member.admin_responsibilities?.length ? member.admin_responsibilities.join(" · ") : "Community-Moderation & Unterstützung");
  const moderationFor = (member) => [member.forum_moderator && "Forum-Moderation", (member.admin_responsibilities || []).some((entry) => /gruppen verwalten/i.test(String(entry))) && "Gruppenmoderation"].filter(Boolean).join(" · ");
  const contactRow = (member, detail, business = false) => <div className="hub-row community-contact-row" key={`${business ? "business" : "contact"}-${member.id}`}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong className={`role-author ${business ? "business" : roleClass(member.role)}`}><RoleStar member={member}/> {getName(member)}</strong><span>{detail}</span></div></div>;
  const updateRow = (entry, index) => <div className="hub-row community-contact-row" key={`${entry.profile_id || entry.nickname}-${entry.created_at}-${index}`}><img src={entry.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong className={`role-author ${entry.account_badge === "BUSINESS" ? "business" : roleClass(entry.role)}`}><RoleStar member={entry}/> {entry.nickname}{entry.is_verified ? " ✓" : ""}</strong><span>{entry.activity_type}</span></div></div>;
  return <section className="community-hub"><div className="page-heading"><div><span className="eyebrow">AKTUELL & VERBUNDEN</span><h1>Community · {activeRegion?.name || "Region"}</h1><p>Ansprechpartner und Community-Inhalte aus {activeRegion?.name || "deiner Region"}.</p></div></div><div className="community-section-links"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:"news",source:"community-hub"}}))}><b>Neuigkeiten</b><span>Aktuelles aus deiner Region</span></button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:"photos",source:"community-hub"}}))}><b>Fotos</b><span>Community-Fotos und Eventgalerie ansehen</span></button><button type="button" className="municipality-primary" onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:"municipality",source:"community-hub"}}))}><b>🏛 Gemeinde & Service</b><span>Offizielle Gemeindeinfos, Bürgeranliegen und Services</span></button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page:"reels",source:"community-hub"}}))}><b>Reels</b><span>Kurze Videos aus deiner Community</span></button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:open-rules"))}><b>Regeln</b><span>Community-Regeln und Punktesystem</span></button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent("ec:open-support"))}><b>Support</b><span>Hilfe, Verifizierung und Ansprechpartner</span></button></div><div className="community-hub-layout"><div className="community-hub-content"><div className="community-hub-grid"><article className="panel"><span className="eyebrow">GEBURTSTAGE</span><h2>Demnächst</h2>{birthdays.length ? birthdays.map(({ member, date }) => <div className="hub-row" key={member.id}><img src={member.avatar_url || DEFAULT_AVATAR} alt=""/><div><strong>{getName(member)}</strong><span>{date.toLocaleDateString("de-AT", { day: "2-digit", month: "long" })}</span></div></div>) : <p>Keine freigegebenen Geburtstage.</p>}</article><article className="panel"><span className="eyebrow">AUS DER COMMUNITY</span><h2>Mitgliederfotos</h2><div className="photo-strip">{publicPhotos.slice(0,6).map((photo) => <img key={photo.id} src={photo.image_url} alt={photo.caption || "Mitgliederfoto"}/>)}</div>{!publicPhotos.length && <p>Die Fotogalerie wird nach den ersten Uploads hier sichtbar.</p>}</article></div></div><aside className="community-contact-sidebar">{municipalities.length > 0 && <article className="panel municipality-community-contacts"><span className="eyebrow">OFFIZIELL</span><h2>Gemeinde</h2>{municipalities.map((member) => contactRow(member, "Offizielles Gemeindekonto"))}</article>}<article className="panel"><span className="eyebrow">ANSPRECHPARTNER</span><h2>Administration</h2>{admins.length ? admins.map((member) => contactRow(member, responsibilityFor(member))) : <p>Noch keine Administration eingetragen.</p>}</article><article className="panel"><span className="eyebrow">MODERATION</span><h2>Forum & Gruppen</h2>{moderators.length ? moderators.map((member) => contactRow(member, moderationFor(member))) : <p>Derzeit keine Supporter-Moderation eingetragen.</p>}</article><article className="panel"><span className="eyebrow">REGIONAL VERBUNDEN</span><h2>Unternehmenskonten</h2>{businesses.length ? businesses.map((member) => contactRow(member, member.company_name || member.company_description || "Unternehmenskonto", true)) : <p>Noch keine Unternehmenskonten eingetragen.</p>}</article><article className="panel public-profile-updates"><span className="eyebrow">ÖFFENTLICHE PROFIL-AKTUALISIERUNGEN</span><h2>Aus der Community</h2>{profileUpdates.length ? profileUpdates.slice(0, 8).map(updateRow) : <p>Noch keine öffentlichen Profil-Aktualisierungen.</p>}</article></aside></div><p className="community-business-note">Unternehmen und Vereine können ein Unternehmenskonto beantragen. Sie erhalten einen blauen Stern und Rahmen, aber keine zusätzlichen Community-Rechte.</p><aside className={`community-ads ${ads.length ? "" : "community-ads-empty"}`}><div className="community-ads-heading"><span className="eyebrow">UNTERSTÜTZER & WERBUNG</span><h2>{ads.length ? "Regionale Angebote" : "Hier könnte deine Werbung stehen"}</h2></div>{ads.length ? <div className="community-ad-list">{ads.map((ad) => <article className="community-ad-card" key={ad.id}>{ad.link_url ? <a href={ad.link_url} target="_blank" rel="noreferrer">{ad.image_url && <img src={ad.image_url} alt={`Werbung von ${ad.title}`}/>}<strong>{ad.title}</strong><span>{ad.body}</span></a> : <div>{ad.image_url && <img src={ad.image_url} alt={`Werbung von ${ad.title}`}/>}<strong>{ad.title}</strong><span>{ad.body}</span></div>}{isHeadAdmin(profile?.role) && <button type="button" className="community-ad-remove" onClick={() => onDeleteAd(ad)}>Entfernen</button>}</article>)}</div> : <div className="community-ad-placeholder"><img src="/community-hero.png" alt="Ennstal und Obersteiermark"/><div><strong>Werbefläche für regionale Unternehmen und Vereine</strong><span>Präsentiere dein Angebot sichtbar in der Ennstal-Connect-Community.</span></div></div>}</aside></section>;
}
function MemberBusinessTool({ member, setBusinessAccount }) { const business = member.account_badge === "BUSINESS"; return <section className="member-business-tool panel"><span className="eyebrow">ADMIN-WERKZEUG</span><h2>Unternehmenskonto</h2><p>Unternehmenskonten erhalten einen blauen Rahmen und Stern, aber keine zusätzlichen Rechte.</p><button className="secondary-button" onClick={() => setBusinessAccount(member.id, !business)}>{business ? "★ Unternehmenskonto entfernen" : "★ Zum Unternehmenskonto ernennen"}</button></section>; }
function EventsPage({ members, showNotice, events, eventRsvps, user, profile, activeRegion, canCreateEvent, createEvent, onToggleEventFeatured, onRespondEvent, onShareEvent, onEditEvent, onCancelEvent, onDeleteEvent }) {
  const [eventPhotos, setEventPhotos] = useState([]);
  const [photoGalleryEventId, setPhotoGalleryEventId] = useState(null);
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState("");
  const [eventAwards, setEventAwards] = useState([]);
  const [awardDrafts, setAwardDrafts] = useState({});
  const [awardingEventId, setAwardingEventId] = useState("");
  const [awardErrors, setAwardErrors] = useState({});
  const canAwardEventPoints = ["HEAD_ADMIN", "ADMIN"].includes(String(profile?.role || "").toUpperCase());
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const visibleEvents = useMemo(() => events.filter((event) =>
    String(event?.status || "ACTIVE").toUpperCase() !== "CANCELLED"
    && new Date(event?.event_at).getTime() >= Date.now()
  ), [events]);
  const eventIds = useMemo(() => visibleEvents.map((event) => event.id), [visibleEvents]);

  const loadEventExtras = async () => {
    if (!eventIds.length) {
      setEventPhotos([]);
      setEventAwards([]);
      return;
    }
    const [{ data: photos }, { data: awards }] = await Promise.all([
      supabase.from("event_photos").select("id,event_id,storage_path,created_at,uploaded_by").in("event_id", eventIds).order("created_at", { ascending: false }).limit(500),
      supabase.from("event_point_awards").select("id,event_id,recipient_id,actor_id,amount,reason,created_at").in("event_id", eventIds).order("created_at", { ascending: false }).limit(500)
    ]);
    setEventPhotos(photos || []);
    setEventAwards(awards || []);
  };

  useEffect(() => { void loadEventExtras(); }, [eventIds.join("|")]);

  useEffect(() => {
    const refresh = () => void loadEventExtras();
    window.addEventListener("ec:regional-events-refresh", refresh);
    return () => window.removeEventListener("ec:regional-events-refresh", refresh);
  }, [eventIds.join("|")]);

  const photosFor = (eventId) => eventPhotos.filter((photo) => photo.event_id === eventId);
  const awardsFor = (eventId) => eventAwards.filter((award) => award.event_id === eventId);
  const publicPhotoUrl = (path) => supabase.storage.from("event-photos").getPublicUrl(path).data.publicUrl;
  const roleStarFor = (member) => member?.role_star_url || (String(member?.role || "").toUpperCase() === "HEAD_ADMIN" ? "/role-star-red.svg" : String(member?.role || "").toUpperCase() === "ADMIN" ? "/role-star-blue.svg" : String(member?.role || "").toUpperCase() === "SUPPORTER" ? "/supporter-star.svg" : null);

  const openEventPhotos = (eventId) => {
    setPhotoUploadError("");
    setPhotoGalleryEventId(eventId);
  };
  const uploadGalleryPhoto = async (file) => {
    if (!file || !photoGalleryEventId || !user?.id || photoUploadBusy) return;
    const accepted = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/avif":"avif" };
    const ext = accepted[file.type];
    if (!ext) return setPhotoUploadError("Bitte ein JPG-, PNG-, WebP- oder AVIF-Bild auswählen.");
    if (!file.size || file.size > 10 * 1024 * 1024) return setPhotoUploadError("Das Foto muss zwischen 1 Byte und 10 MB groß sein.");
    setPhotoUploadBusy(true);
    setPhotoUploadError("");
    const path = `${photoGalleryEventId}/${user.id}/${crypto.randomUUID()}.${ext}`;
    try {
      const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: saveError } = await supabase.from("event_photos").insert({ event_id: photoGalleryEventId, uploaded_by: user.id, storage_path: path });
      if (saveError) {
        await supabase.storage.from("event-photos").remove([path]);
        throw saveError;
      }
      await loadEventExtras();
    } catch (error) {
      setPhotoUploadError(error?.message || "Das Foto konnte nicht hochgeladen werden.");
    } finally {
      setPhotoUploadBusy(false);
    }
  };

  const awardEventPoints = async (event) => {
    if (!canAwardEventPoints) return;
    const draft = awardDrafts[event.id] || {};
    const recipientId = draft.recipientId || event.created_by || "";
    const amount = Math.max(1, Math.min(100, Number(draft.amount || 5) || 5));
    setAwardErrors((current) => ({ ...current, [event.id]: "" }));
    if (!recipientId) {
      const message = "Bitte wähle einen Empfänger für die Eventpunkte.";
      setAwardErrors((current) => ({ ...current, [event.id]: message }));
      return showNotice?.(message);
    }
    const recipient = memberById.get(recipientId);
    if (recipient?.is_primary_head_admin) {
      const message = "Der primäre Head Admin kann keine Eventpunkte erhalten. Bitte wähle ein anderes Mitglied.";
      setAwardErrors((current) => ({ ...current, [event.id]: message }));
      return showNotice?.(message);
    }
    if (!window.confirm(`${amount} Eventpunkte an ${getName(recipient || { nickname: "Mitglied" })} für „${event.title}“ vergeben?`)) return;
    setAwardingEventId(event.id);
    const { error } = await supabase.rpc("award_event_points", {
      p_event_id: event.id,
      p_recipient_id: recipientId,
      p_amount: amount,
      p_reason: `Punkte erhalten für Event · ${event.title}`
    });
    setAwardingEventId("");
    if (error) {
      const message = error.message || "Eventpunkte konnten nicht vergeben werden.";
      setAwardErrors((current) => ({ ...current, [event.id]: message }));
      return showNotice?.(message);
    }
    setAwardErrors((current) => ({ ...current, [event.id]: "" }));
    showNotice?.(`+${amount} Eventpunkte vergeben.`);
    await loadEventExtras();
  };

  const orderedEvents = [...visibleEvents].sort((a,b) => {
    const aPhotos = photosFor(a.id);
    const bPhotos = photosFor(b.id);
    const aRecent = aPhotos.some((photo) => Date.now() - new Date(photo.created_at).getTime() < 72 * 3600000);
    const bRecent = bPhotos.some((photo) => Date.now() - new Date(photo.created_at).getTime() < 72 * 3600000);
    return Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured))
      || Number(bRecent) - Number(aRecent)
      || new Date(a.event_at) - new Date(b.event_at);
  });

  const selectedGalleryEvent = events.find((event) => event.id === photoGalleryEventId);
  const galleryPhotos = photoGalleryEventId ? photosFor(photoGalleryEventId) : [];
  return <section className="events-page">
    {photoGalleryEventId && <div className="modal-overlay" role="presentation" onClick={() => !photoUploadBusy && setPhotoGalleryEventId(null)} style={{position:"fixed",inset:0,zIndex:12000,display:"grid",placeItems:"center",padding:12,background:"rgba(4,14,24,.8)"}}>
      <section className="panel" role="dialog" aria-modal="true" aria-label="Eventfotogalerie" onClick={(e) => e.stopPropagation()} style={{width:"min(100%,900px)",maxHeight:"90dvh",overflowY:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
          <div><span className="eyebrow">EVENTFOTOS</span><h2>{selectedGalleryEvent?.title || "Eventgalerie"}</h2></div>
          <button type="button" disabled={photoUploadBusy} onClick={() => setPhotoGalleryEventId(null)} aria-label="Fotogalerie schließen">✕ Schließen</button>
        </div>
        <label style={{display:"block",margin:"12px 0"}}><strong>Eventfoto hinzufügen</strong><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={photoUploadBusy} onChange={(e) => { const file=e.currentTarget.files?.[0]; e.currentTarget.value=""; void uploadGalleryPhoto(file); }} style={{display:"block",width:"100%",minHeight:44,marginTop:8}}/></label>
        {photoUploadBusy && <p role="status">Foto wird hochgeladen und gespeichert …</p>}
        {photoUploadError && <p role="alert" style={{color:"#b42318"}}>{photoUploadError}</p>}
        <div className="event-photo-gallery" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,180px),1fr))",gap:12}}>
          {galleryPhotos.map((photo) => <a key={photo.id} href={publicPhotoUrl(photo.storage_path)} target="_blank" rel="noreferrer" aria-label="Eventfoto in voller Größe öffnen"><img src={publicPhotoUrl(photo.storage_path)} loading="lazy" alt="Eventfoto" style={{width:"100%",aspectRatio:"1/1",objectFit:"cover",borderRadius:12}}/></a>)}
        </div>
        {!galleryPhotos.length && <p>Noch keine Eventfotos vorhanden. Du kannst das erste Foto hinzufügen.</p>}
      </section>
    </div>}

    <div className="page-heading">
      <div><span className="eyebrow">VERANSTALTUNGEN</span><h1>Events · {activeRegion?.name || "Region"}</h1><p>Veranstaltungen, Eventfotos und öffentliche Eventpunkte an einem Ort.</p></div>
      {canCreateEvent && <button type="button" className="primary-button community-create-event-cta" onClick={() => { document.getElementById("event-create")?.scrollIntoView({ behavior:"smooth", block:"start" }); window.setTimeout(() => document.querySelector("#event-create input[name=title]")?.focus(), 450); }}>＋ Veranstaltung erstellen</button>}
    </div>

    <div className="events-modern-grid">
      {orderedEvents.length ? orderedEvents.map((event) => {
        const responses = eventRsvps.filter((item) => item.event_id === event.id);
        const going = responses.filter((item) => item.status === "GOING").length;
        const interested = responses.filter((item) => item.status === "INTERESTED").length;
        const current = responses.find((item) => item.user_id === user?.id)?.status;
        const author = memberById.get(event.created_by);
        const photos = photosFor(event.id);
        const awards = awardsFor(event.id);
        const latestPhoto = photos[0] || null;
        const hasNewPhotos = photos.some((photo) => Date.now() - new Date(photo.created_at).getTime() < 72 * 3600000);
        const totalPoints = awards.reduce((sum, award) => sum + Number(award.amount || 0), 0);
        const draft = awardDrafts[event.id] || {};
        const recipientId = draft.recipientId || event.created_by || "";
        return <article className={`event-modern-card ${event.is_featured ? `is-featured featured-${event.featured_color || "gold"}` : ""} ${hasNewPhotos ? "has-new-photos" : ""} ${event.status === "CANCELLED" ? "is-cancelled" : ""}`} key={event.id}>
          <div className="event-modern-visual">
            {event.image_url ? <img src={event.image_url} alt=""/> : latestPhoto ? <img src={publicPhotoUrl(latestPhoto.storage_path)} alt=""/> : <div className="event-modern-placeholder">EVENT</div>}
            {(event.image_url || latestPhoto) && <span className="event-card-watermark" aria-hidden="true"><img src="/ennstal-connect-wordmark.svg" alt=""/><b>{latestPhoto && !event.image_url ? "Community Fotograf" : "Ennstal Connect"}</b></span>}
            <div className="event-modern-badges">
              {event.is_featured && <span>★ Hervorgehoben</span>}
              {hasNewPhotos && <span className="new-photos">● Neue Fotos</span>}
            </div>
          </div>

          <div className="event-modern-main">
            <div className="event-modern-title-row">
              <div><h2>{event.title}</h2><p>{new Date(event.event_at).toLocaleString("de-AT")}{event.location && ` · ${event.location}`}</p></div>
              <button type="button" className={`event-photo-status ${photos.length ? "has-photos" : "no-photos"}`} onClick={() => openEventPhotos(event.id)}>
                <strong>{photos.length ? `📷 ${photos.length} Eventfoto${photos.length === 1 ? "" : "s"}` : "📷 Noch keine Fotos"}</strong>
                <span>{photos.length ? "Galerie öffnen →" : "Zu den Eventfotos →"}</span>
              </button>
            </div>

            {photos.length > 0 && <button type="button" className="event-photo-preview-strip" onClick={() => openEventPhotos(event.id)}>
              {photos.slice(0,4).map((photo) => <img key={photo.id} src={publicPhotoUrl(photo.storage_path)} alt="" loading="lazy"/>)}
              {photos.length > 4 && <span>+{photos.length - 4}</span>}
            </button>}

            {author && <small className={`event-author role-author ${author.account_badge === "BUSINESS" ? "business" : roleClass(author.role)}`}>Erstellt von {author.account_badge === "BUSINESS" ? "★" : roleMark(author.role)} {getName(author)}</small>}
            {event.status === "CANCELLED" && <small className="event-cancelled-label">ABGESAGT{event.cancellation_reason ? ` · ${event.cancellation_reason}` : ""}</small>}

            {event.status !== "CANCELLED" && <div className="event-rsvp-actions">
              <small className="event-rsvp-social-proof">{going || interested ? `${going} kommen · ${interested} interessiert` : "Sei die erste Person, die Interesse zeigt."}</small>
              <button type="button" className={current === "INTERESTED" ? "primary-button" : "secondary-button"} onClick={() => onRespondEvent(event,"INTERESTED")}>☆ Interessiert</button>
              <button type="button" className={current === "GOING" ? "primary-button" : "secondary-button"} onClick={() => onRespondEvent(event,"GOING")}>✓ Ich komme</button>
              <button type="button" className="secondary-button" onClick={() => onShareEvent(event)}>↗ Teilen</button>
            </div>}

            <section className="event-points-panel">
              <div className="event-points-heading"><div><span>EVENTPUNKTE</span><strong>{totalPoints > 0 ? `★ ${totalPoints} Punkte vergeben` : "Noch keine Eventpunkte"}</strong></div><small>Für alle Mitglieder sichtbar</small></div>

              {canAwardEventPoints && <div className="event-points-award-form">
                <select value={recipientId} onChange={(e) => setAwardDrafts((current) => ({ ...current, [event.id]: { ...current[event.id], recipientId: e.target.value } }))}>
                  <option value="">Empfänger wählen</option>
                  {members.filter((member) => member.id !== user?.id && !member.is_primary_head_admin).map((member) => <option key={member.id} value={member.id}>{getName(member)}</option>)}
                </select>
                <input type="number" min="1" max="100" value={draft.amount ?? 5} onChange={(e) => setAwardDrafts((current) => ({ ...current, [event.id]: { ...current[event.id], amount: e.target.value } }))}/>
                <button type="button" disabled={awardingEventId === event.id} onClick={() => void awardEventPoints(event)}>{awardingEventId === event.id ? "Vergibt …" : "★ Eventpunkte vergeben"}</button>
                {awardErrors[event.id] && <small className="event-points-error" role="alert">{awardErrors[event.id]}</small>}
              </div>}

              <div className="event-points-history">
                {awards.length ? awards.map((award) => {
                  const actor = memberById.get(award.actor_id);
                  const recipient = memberById.get(award.recipient_id);
                  const star = roleStarFor(actor);
                  return <div className="event-points-history-row" key={award.id}>
                    <span className="event-points-actor">{star && <img src={star} alt="" aria-hidden="true"/>}<strong>{getName(actor || { nickname:"Admin" })}</strong></span>
                    <span>vergibt <b>+{award.amount}</b> an <strong>{getName(recipient || { nickname:"Mitglied" })}</strong></span>
                    <small>{new Date(award.created_at).toLocaleString("de-AT")}</small>
                  </div>;
                }) : <p>Noch keine Punkte für dieses Event vergeben.</p>}
              </div>
            </section>

            {isAdmin(profile?.role) && <div className="event-actions">
              <button type="button" className="secondary-button event-delete-button" onClick={() => onEditEvent(event)}>{event.status === "CANCELLED" ? "Wieder aktivieren" : "✎ Bearbeiten"}</button>
              {event.status !== "CANCELLED" && <button type="button" className="danger-button event-delete-button" onClick={() => onCancelEvent(event)}>Absagen</button>}
              <button type="button" className="danger-button event-delete-button" onClick={() => onDeleteEvent(event)}>Löschen</button>
              <button type="button" className="community-event-feature-toggle" onClick={() => onToggleEventFeatured?.(event)}>{event.is_featured ? "Hervorhebung entfernen" : "★ Hervorheben"}</button>
            </div>}
          </div>
        </article>;
      }) : <div className="panel empty-card">Derzeit sind keine kommenden Termine veröffentlicht.</div>}
    </div>

    {canCreateEvent && <section id="event-create" className="admin-community-tools panel"><div className="admin-community-tools-heading"><div><span className="eyebrow">NEUER TERMIN</span><h2>Veranstaltung erstellen</h2></div><p>Pflicht sind nur Titel sowie Datum & Uhrzeit.</p></div><form className="community-event-create-form" onSubmit={createEvent}><label>Titel<input name="title" placeholder="z. B. Herbstfest Admont" minLength="3" required/></label><div className="community-event-create-row"><label>Datum & Uhrzeit<input name="event_at" type="datetime-local" required/></label><label>Ort<input name="location" placeholder="z. B. Volkshaus"/></label></div><label>Beschreibung<textarea name="description" placeholder="Was erwartet die Besucher?"/></label><label className="content-image-upload">Bild (optional)<input name="image" type="file" accept="image/*"/></label><details className="community-event-create-advanced"><summary>Weitere Option</summary><label>Bild-URL<input name="image_url" placeholder="https://…"/></label></details><button className="primary-button community-event-publish-button">Veranstaltung veröffentlichen</button></form></section>}
  </section>;
}
function AdminCommunityTools({ members, createAd, setBusinessAccount }) { return <section className="admin-community-tools panel"><div className="admin-community-tools-heading"><div><span className="eyebrow">VERWALTUNG</span><h2>Community verwalten</h2></div><p>Werbung und Unternehmenskonten verwalten.</p></div><div className="community-tool-grid"><form onSubmit={createAd}><h3>Werbefläche erstellen</h3><input name="title" placeholder="Firma / Verein" required/><input name="link_url" placeholder="Webseite (optional)"/><input name="image_url" placeholder="Bild-URL (optional)"/><label className="content-image-upload">Werbebild hochladen (optional)<input name="image" type="file" accept="image/*"/></label><textarea name="body" placeholder="Kurztext"/><button className="primary-button">Werbung veröffentlichen</button></form><div><h3>Unternehmenskonto</h3>{members.filter((m) => !m.is_primary_head_admin).map((m) => <p key={m.id}><strong>{getName(m)}</strong><button className="secondary-button" onClick={() => setBusinessAccount(m.id, m.account_badge !== "BUSINESS")}>{m.account_badge === "BUSINESS" ? "Entfernen" : "Vergeben"}</button></p>)}</div></div></section>; }
function RequiredHomeDistrict({ userId, onSaved }) {
  const [district, setDistrict] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (!HOME_DISTRICT_OPTIONS.some(([code]) => code === district) || !userId) return;
    setSaving(true);
    setErrorMessage("");
    const { data, error } = await supabase.from("profiles").update({ district_code: district, show_district: true }).eq("id", userId).select("district_code,show_district").single();
    setSaving(false);
    if (error || !data?.district_code) { setErrorMessage(error?.message || "Speichern fehlgeschlagen. Bitte erneut versuchen."); return; }
    onSaved(data);
  }
  return <div className="rules-acceptance-overlay" role="dialog" aria-modal="true" aria-labelledby="district-required-title">
    <form className="rules-acceptance-dialog" onSubmit={submit}>
      <span className="eyebrow">PROFIL ERGÄNZEN · PFLICHTFELD</span>
      <h1 id="district-required-title">Deinen Heimatbezirk auswählen</h1>
      <p>Bitte wähle deinen Heimatbezirk aus, bevor du die Community weiter verwendest.</p>
      <label htmlFor="required-home-district">Heimatbezirk *</label>
      <select id="required-home-district" required value={district} onChange={(event) => setDistrict(event.target.value)} style={{width:"100%",padding:12,margin:"12px 0",borderRadius:8}}>
        <option value="" disabled>Bitte Heimatbezirk auswählen</option>
        {HOME_DISTRICT_OPTIONS.map(([code,label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <button className="primary-button" disabled={saving || !district}>{saving ? "Wird gespeichert …" : "Heimatbezirk speichern"}</button>
    </form>
  </div>;
}
function RulesAcceptanceModal({ accepting, onAccept }) {
  return <div className="rules-acceptance-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-acceptance-title"><section className="rules-acceptance-dialog"><span className="eyebrow">ERSTE ANMELDUNG · VERPFLICHTEND</span><h1 id="rules-acceptance-title">Community-Regeln bestätigen</h1><p>Bevor du Ennstal Connect verwenden kannst, bestätige bitte die aktuelle Fassung der Community-Regeln.</p><div className="rules-acceptance-summary"><strong>Verbindlich sind unter anderem:</strong><span>Vor- und Nachname vollständig und richtig angeben</span><span>Ein persönliches Profilbild wird ausdrücklich empfohlen, damit die Community vertrauenswürdiger und persönlicher wirkt</span><span>Keine Fake-Accounts oder Identitätstäuschung</span><span>Beleidigungen, Drohungen, Rassismus und Diskriminierung</span><span>Straftaten, Betrug, Hassrede und gefährliche Inhalte</span><span>Veröffentlichung fremder Daten, Nachrichten oder Bilder ohne Berechtigung</span><span>Spam, unerlaubte Werbung und technische Manipulation</span></div><p>Bei Verstößen können Inhalte entfernt, einzelne Funktionen gesperrt, Konten vorübergehend gesperrt oder Mitglieder endgültig ausgeschlossen werden.</p><button className="primary-button" type="button" disabled={accepting} onClick={onAccept}>{accepting ? "Bestätigung wird gespeichert …" : "Ich habe die Community-Regeln gelesen und akzeptiere sie"}</button></section></div>;
}

function CommunityRules() {
  return <section className="legal-page panel"><h1>Community-Regeln</h1><p className="legal-notice">Ennstal Connect soll ein sicherer, respektvoller und ehrlicher Ort für die Menschen im Ennstal und der Obersteiermark sein. Mit der Nutzung der Community sind diese Regeln einzuhalten.</p><h2>1. Respektvoller Umgang</h2><p>Beleidigungen, Drohungen, Mobbing, Belästigung, Nachstellung, Verleumdung, Hassrede sowie rassistische, antisemitische, sexistische, homophobe oder andere diskriminierende Inhalte werden nicht toleriert.</p><h2>2. Keine Straftaten oder gefährlichen Inhalte</h2><p>Verboten sind strafbare Inhalte und Handlungen, Gewaltandrohungen oder Gewaltverherrlichung, Betrug, Erpressung, Aufrufe zu Straftaten, die Verbreitung verbotener Inhalte sowie jede Nutzung, durch die andere Personen gefährdet oder geschädigt werden.</p><h2>3. Echte und ehrliche Konten</h2><p>Jedes Mitglied muss seinen echten Vor- und Nachnamen vollständig und richtig im dafür vorgesehenen Profilfeld angeben. Abkürzungen, einzelne Buchstaben, Fantasienamen oder bewusst falsche Angaben anstelle des tatsächlichen Vor- oder Nachnamens sind nicht zulässig. Der Nickname darf weiterhin frei gewählt werden. Fake-Accounts, Mehrfachkonten zur Umgehung von Sperren, Identitätstäuschung und das Auftreten als eine andere Person oder Organisation sind nicht erlaubt. Testkonten dürfen ausschließlich durch die Administration für technische Prüfungen angelegt und müssen für normale Mitglieder verborgen werden.</p><h2>4. Persönliches Profilbild</h2><p>Ein persönliches Profilbild wird ausdrücklich empfohlen, damit Ennstal Connect vertrauenswürdiger, persönlicher und leichter zuzuordnen bleibt. Mitglieder ohne eigenes Profilbild können im Profil freundlich darauf hingewiesen werden. Administratoren dürfen über die Funktion „Profilbild anfordern“ eine offizielle Ennstal-Connect-Nachricht mit dieser Empfehlung senden. Das Fehlen eines Profilbildes führt nicht automatisch zu einer Kontosperre.</p><h2>5. Schutz von Privatsphäre und Rechten</h2><p>Persönliche Daten, private Nachrichten oder Bilder anderer Personen dürfen nicht ohne Berechtigung veröffentlicht oder weitergegeben werden. Mitglieder dürfen nur Inhalte hochladen, für die sie die notwendigen Rechte und Zustimmungen besitzen. Urheberrechte, Persönlichkeitsrechte, Datenschutz und das Recht am eigenen Bild sind einzuhalten.</p><h2>6. Kein Spam oder Missbrauch</h2><p>Unerwünschte Werbung, massenhafte Nachrichten, manipulierte Links, Schadsoftware, Betrugsversuche, absichtliche Falschmeldungen und die technische Störung oder missbräuchliche Nutzung von Ennstal Connect sind verboten. Regionale Werbung ist nur in den dafür vorgesehenen und freigegebenen Bereichen erlaubt.</p><h2>7. Eigenverantwortung</h2><p>Jedes Mitglied ist für das eigene Verhalten und für selbst hochgeladene, versendete oder veröffentlichte Bilder, Texte, Nachrichten, Kommentare, Links und sonstige Inhalte verantwortlich.</p><h2>8. Freiwillige Moderation</h2><p>Head Admin, Community Admins, Supporter, Moderatoren sowie beteiligte Unternehmer und Vereine wirken freiwillig und grundsätzlich ohne Vergütung, Gewinnbeteiligung oder sonstigen finanziellen Vorteil mit. Sie sind dennoch verpflichtet, ihre freigegebenen Rechte sorgfältig, sachlich und ausschließlich zum Schutz der Community einzusetzen.</p><h2>9. Maßnahmen bei Regelverstößen</h2><p>Abhängig von Schwere, Häufigkeit und Gefahr eines Verstoßes kann die Administration Inhalte entfernen, eine Verwarnung aussprechen, einzelne Rechte oder Funktionen – etwa Nachrichten, Forum, Gruppen oder Uploads – vorübergehend oder dauerhaft sperren, das gesamte Konto zeitweise sperren oder ein Mitglied endgültig aus der Community ausschließen. Schwere Verstöße können unmittelbar zu einer Sperre oder zum Ausschluss führen.</p><h2>10. Meldungen und Behörden</h2><p>Regelwidrige oder möglicherweise rechtswidrige Inhalte können der Administration gemeldet werden. Bei einem konkreten Straftatverdacht arbeitet der Betreiber im gesetzlich zulässigen und erforderlichen Umfang mit Polizei, Staatsanwaltschaft, Gerichten und anderen zuständigen Behörden zusammen.</p><h2>11. Rückfragen</h2><p>Fragen zu einer Moderationsentscheidung oder zu diesen Regeln können an ennstal.connect@gmx.at gerichtet werden.</p></section>;
}

function LegalPage({ type }) {
  const privacy = type === "privacy";
  return <section className="legal-page panel">
    <h1>{privacy ? "Datenschutzerklärung" : "Impressum"}</h1>
    {privacy ? <>
      <p className="legal-notice">Stand: 5. September 2026 · Diese Datenschutzerklärung gilt für Ennstal Connect und richtet sich nach der Datenschutz-Grundverordnung (DSGVO) sowie dem österreichischen Datenschutzgesetz (DSG).</p>
      <h2>1. Verantwortlicher</h2>
      <p>Verantwortlicher Betreiber: Marco Egger, Ennstal Connect<br/>Waidbachstraße 2, 8700 Leoben, Österreich<br/>E-Mail: ennstal.connect@gmx.at</p>
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
      <p>Verantwortlicher Betreiber: Marco Egger<br/>Waidbachstraße 2<br/>8700 Leoben, Österreich<br/>E-Mail: ennstal.connect@gmx.at</p>
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
