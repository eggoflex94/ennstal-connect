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
  const [profileActivities, setProfileActivities] = useState([]);

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

  const [friendsExpanded, setFriendsExpanded] =
    useState(false);

  const [permissionsExpanded, setPermissionsExpanded] =
    useState(true);

  const [permissionTarget, setPermissionTarget] =
    useState("");

  const [permissionDraft, setPermissionDraft] =
    useState({
      manage_members: false,
      manage_points: false,
      manage_messages: false,
      manage_media: false,
      manage_roles: false,
      manage_admins: false,
      view_profile_visits: false,
      manage_news: false,
      manage_groups: false,
      manage_events: false,
      manage_marketplace: false,
      manage_friend_requests: false,
      manage_homepage: false,
      manage_reports: false
    });

  const [selectedMemberGroups, setSelectedMemberGroups] =
    useState([]);

  const [selectedMemberEvents, setSelectedMemberEvents] =
    useState([]);

  const [homepageSections, setHomepageSections] =
    useState([]);

  const [blockedUsers, setBlockedUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [myPermissions, setMyPermissions] = useState({});
  const [suspendedUsers, setSuspendedUsers] = useState([]);

  const [contentEditor, setContentEditor] =
    useState(null);

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

  // Kompatibilitätswert für ältere Profildaten.
  // Wird nur noch für ältere Datenbankeinträge vorgehalten.
  const currentCommunityPoints = Number(
    profile?.community_points ?? profile?.points ?? 0
  ) || 0;

  /* =========================================================
     ALLES LADEN
     ========================================================= */

  async function loadAll() {
    setLoading(true);

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      const currentUser = session?.user || null;
      setUser(currentUser);

      if (currentUser) {
        // Stellt sicher, dass nach E-Mail-Bestätigung immer ein Profil existiert.
        const { error: profileBootstrapError } = await supabase.rpc("ensure_current_profile");
        if (profileBootstrapError) {
          console.warn("Profil-Bootstrap konnte nicht ausgeführt werden:", profileBootstrapError.message);
        }

        // Beim ersten Hauptadmin wird genau einmal automatisch die Besitzerrolle vergeben.
        // Die Prüfung passiert serverseitig in Supabase, nicht im Browser.
        const { error: headAdminError } = await supabase.rpc("claim_initial_head_admin");
        if (headAdminError) {
          console.warn("HEAD_ADMIN-Prüfung konnte nicht ausgeführt werden:", headAdminError.message);
        }
      }

      if (!currentUser) {
        setProfile(null);
        setMembers([]);
        setFriendships([]);
        return;
      }

      const safe = async (label, query, fallback = []) => {
        const { data, error } = await query;
        if (error) {
          console.warn(`Ennstal Connect: ${label} konnte nicht geladen werden.`, error);
          return fallback;
        }
        return data ?? fallback;
      };

      const [
        myProfile,
        allMembers,
        newsData,
        eventData,
        groupData,
        homepageData,
        historyData,
        messageData,
        friendshipData,
        visitData,
        blockData,
        reportData,
        supportTicketData,
        activityData,
        permissionData
      ] = await Promise.all([
        safe("Profil", supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(), null),
        safe("Mitglieder", supabase.from("profiles").select("*")),
        safe("Neuigkeiten", supabase.from("news").select("*").order("created_at", { ascending: false })),
        safe("Events", supabase.from("events").select("*").order("created_at", { ascending: false })),
        safe("Gruppen", supabase.from("groups").select("*").order("created_at", { ascending: false })),
        safe("Startseite", supabase.from("homepage_sections").select("*").eq("is_visible", true).order("sort_order", { ascending: true })),
        safe("Punkteverlauf", supabase.from("point_history").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false })),
        safe("Nachrichten", supabase.from("messages").select("*").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: false })),
        safe("Freundschaften", supabase.from("friendships").select("*").or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)),
        safe("Profilbesuche", supabase.from("profile_visits").select("*").eq("profile_id", currentUser.id).order("visited_at", { ascending: false })),
        safe("Blockierungen", supabase.from("user_blocks").select("*").eq("blocker_id", currentUser.id)),
        safe("Meldungen", supabase.from("user_reports").select("*").order("created_at", { ascending: false })),
        safe("Support-Anfragen", supabase.from("support_tickets").select("*").order("created_at", { ascending: false })),
        safe("Profilaktivitäten", supabase.from("profile_activity").select("*").order("created_at", { ascending: false }).limit(40)),
        safe("Berechtigungen", supabase.from("user_permissions").select("*").eq("user_id", currentUser.id).maybeSingle(), {})
      ]);

      setProfile(myProfile);
      setMembers(allMembers);
      setNews(newsData);
      setEvents(eventData);
      setGroups(groupData);
      setHomepageSections(homepageData);
      setHistory(historyData);
      setMessages(messageData);
      setFriendships(friendshipData);
      setProfileVisits(visitData);
      setBlockedUsers(blockData);
      setReports(reportData);
      setSupportTickets(supportTicketData);
      setProfileActivities(activityData);
      setMyPermissions(permissionData || {});
    } catch (error) {
      console.error("Fehler beim Starten von Ennstal Connect:", error);
      showNotice(`Fehler beim Laden: ${error?.message || "Unbekannter Fehler"}`);
    } finally {
      setLoading(false);
    }
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
     NACHRICHTEN LIVE AKTUALISIEREN
     ========================================================= */

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`messages-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          loadAll();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`friendships-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `receiver_id=eq.${user.id}`
      }, () => loadAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const totalOnlineHours = Number(profile?.total_online_seconds || 0) / 3600;
  const rewardableOnlineSeconds = Math.max(
    0,
    Number(profile?.total_online_seconds || 0) - Number(profile?.last_reward_seconds || 0)
  );
  const onlineHoursUntilReward = Math.max(0, 5 - rewardableOnlineSeconds / 3600);

  async function syncOnlineTime() {
    if (!user?.id || document.visibilityState !== "visible") return;

    const { data, error } = await supabase.rpc("record_online_activity");
    if (error) {
      console.warn("Onlinezeit konnte nicht gespeichert werden:", error);
      return;
    }

    if (data && typeof data === "object") {
      setProfile((current) => current ? { ...current, ...data } : current);
    }
  }

  async function claimOnlineReward() {
    if (!user?.id) return;

    // Vor dem Abholen noch einmal synchronisieren, damit die letzte
    // sichtbare Onlinezeit sicher mitgerechnet wird.
    await syncOnlineTime();

    const { data, error } = await supabase.rpc("claim_online_reward");
    if (error) {
      showNotice(error.message);
      return;
    }

    if (!data?.success) {
      showNotice(data?.message || "Die Belohnung ist noch nicht verfügbar.");
      return;
    }

    showNotice(
      data?.message ||
      `🎁 ${data?.reward_label || "Neue Profilfunktion"} freigeschaltet!`
    );

    // Sofort aktualisieren, damit Mein Bereich, Profil und Belohnungen
    // gleichzeitig den neuen Stand zeigen.
    await loadAll();
  }

  useEffect(() => {
    if (!user?.id) return;

    syncOnlineTime();
    const interval = window.setInterval(syncOnlineTime, 60000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") syncOnlineTime();
    };
    window.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user?.id]);

  /* =========================================================
     SORTIERTE MITGLIEDER
     ADMINS -> SUPPORTER -> NORMALE
     JEWEILS ALPHABETISCH
     ========================================================= */

  const blockedIds = useMemo(
    () => new Set(
      blockedUsers.map((item) => item.blocked_id)
    ),
    [blockedUsers]
  );

  const visibleMembers = useMemo(
  () =>
    members.filter(
      (member) =>
        !blockedUsers.some(
          (block) =>
            block.blocked_id === member.id
        ) &&
        member.account_status !== "SUSPENDED"
    ),
  [members, blockedUsers]
);

const sortedMembers = useMemo(() => {
  const query =
    search.trim().toLowerCase();

  const filtered =
    visibleMembers.filter((member) => {
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
    .filter(
      (member) =>
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
}, [visibleMembers, search]);

  const onlineMembers = useMemo(
    () => visibleMembers.filter((member) => member.is_online),
    [visibleMembers]
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
    if (!user || !member?.id || member.id === user.id) return;

    if (blockedIds.has(member.id)) {
      showNotice("Dieser Nutzer ist blockiert.");
      return;
    }

    const existing = friendshipWith(member.id);

    if (existing) {
      showNotice(
        existing.status === "ACCEPTED"
          ? "Ihr seid bereits Freunde."
          : "Freundschaftsanfrage ist bereits vorhanden."
      );
      return;
    }

    const { data: blockedByOther } = await supabase
      .from("user_blocks")
      .select("id")
      .eq("blocker_id", member.id)
      .eq("blocked_id", user.id)
      .maybeSingle();

    if (blockedByOther) {
      showNotice("Du kannst diesem Nutzer keine Anfrage senden.");
      return;
    }

    const { error } = await supabase
      .from("friendships")
      .insert({
        requester_id: user.id,
        receiver_id: member.id,
        status: "PENDING"
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Freundschaftsanfrage gesendet.");
    await loadAll();
  }


  async function removeFriend(member) {
    if (!user || !member?.id) return;
    const relation = friendshipWith(member.id);
    if (!relation) {
      showNotice("Keine Freundschaft vorhanden.");
      return;
    }
    if (!window.confirm(`Freundschaft mit ${getName(member)} wirklich entfernen?`)) return;

    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", relation.id);

    if (error) {
      showNotice(error.message);
      return;
    }
    showNotice("Freundschaft wurde entfernt.");
    await loadAll();
  }

  async function submitSupportTicket(event) {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") || "").trim();
    const category = String(form.get("category") || "ALLGEMEIN");
    const description = String(form.get("description") || "").trim();
    if (!subject || !description) {
      showNotice("Bitte Betreff und Anliegen ausfüllen.");
      return;
    }
    const { error } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      subject,
      category,
      description,
      status: "OPEN"
    });
    if (error) { showNotice(error.message); return; }
    event.currentTarget.reset();
    showNotice("Deine Support-Anfrage wurde direkt an das Admin-Team weitergeleitet.");
    await loadAll();
  }

  async function updateSupportTicketStatus(ticket, status) {
    const { error } = await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticket.id);
    if (error) { showNotice(error.message); return; }
    showNotice(status === "RESOLVED" ? "Anfrage als erledigt markiert." : "Status der Anfrage aktualisiert.");
    await loadAll();
  }

  async function changeMemberRole(member, newRole) {
    if (!member?.id) return;
    if (member.id === user?.id) {
      showNotice("Die eigene Rolle kann hier nicht geändert werden.");
      return;
    }
    if (member.role === "HEAD_ADMIN") {
      showNotice("Die Rolle eines Hauptadmins kann nicht entfernt werden.");
      return;
    }
    if (newRole === "ADMIN" && !isHeadAdmin(profile?.role)) {
      showNotice("Nur der Hauptadmin kann Admins ernennen.");
      return;
    }

    const { error } = await supabase.rpc("admin_set_role", {
      target_user: member.id,
      new_role: newRole
    });

    if (error) {
      showNotice(error.message);
      return;
    }

    const label = newRole === "MEMBER" ? "Mitglied" : newRole === "SUPPORTER" ? "Supporter" : "Admin";
    showNotice(`${getName(member)} ist jetzt ${label}.`);
    setSelectedMember(current =>
      current?.id === member.id ? { ...current, role: newRole } : current
    );
    await loadAll();
  }

  const incomingFriendRequests = useMemo(
    () => friendships.filter((item) => item.status === "PENDING" && item.receiver_id === user?.id),
    [friendships, user?.id]
  );

  const sentFriendRequests = useMemo(
    () => friendships.filter((item) => item.status === "PENDING" && item.requester_id === user?.id),
    [friendships, user?.id]
  );

  async function cancelFriendRequest(request) {
    if (!user || !request || request.requester_id !== user.id || request.status !== "PENDING") return;
    const { error } = await supabase.from("friendships").delete().eq("id", request.id).eq("requester_id", user.id).eq("status", "PENDING");
    if (error) { showNotice(error.message); return; }
    showNotice("Freundschaftsanfrage wurde zurückgezogen.");
    await loadAll();
  }

  async function respondToFriendRequest(request, accept) {
    if (!user || request?.receiver_id !== user.id) return;

    const { error } = await supabase
      .from("friendships")
      .update({ status: accept ? "ACCEPTED" : "DECLINED" })
      .eq("id", request.id)
      .eq("receiver_id", user.id)
      .eq("status", "PENDING");

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(accept ? "Freundschaftsanfrage angenommen." : "Freundschaftsanfrage abgelehnt.");
    await loadAll();
  }

  async function blockUser(member) {
    if (!user || !member?.id || member.id === user.id) return;

    if (!window.confirm(
      `${getName(member)} wirklich blockieren?\n\nDer Nutzer wird aus deinen Kontakt- und Mitgliederansichten ausgeblendet.`
    )) return;

    const { error } = await supabase
      .from("user_blocks")
      .insert({
        blocker_id: user.id,
        blocked_id: member.id
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    await supabase
      .from("friendships")
      .delete()
      .or(
        `and(requester_id.eq.${user.id},receiver_id.eq.${member.id}),and(requester_id.eq.${member.id},receiver_id.eq.${user.id})`
      );

    setSelectedMember(null);
    showNotice(`${getName(member)} wurde blockiert.`);
    await loadAll();
  }

  async function unblockUser(blockedId) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedId);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Nutzer wurde entsperrt.");
    await loadAll();
  }

  async function reportUser(member) {
    if (!user || !member?.id || member.id === user.id) return;

    const reason = window.prompt(
      `Warum möchtest du ${getName(member)} melden?\n\nBitte nenne einen konkreten Grund.`
    );

    if (reason === null) return;

    if (reason.trim().length < 10) {
      showNotice(
        "Eine Meldung muss begründet sein und mindestens 10 Zeichen enthalten."
      );
      return;
    }

    const { error } = await supabase.rpc(
      "submit_user_report",
      {
        target_user: member.id,
        reason_text: reason.trim()
      }
    );

    if (error) {
      showNotice(error.message);
      return;
    }

    setSelectedMember(null);
    showNotice("Meldung wurde an die Administration gesendet.");
    await loadAll();
  }

  async function resolveReport(reportId, resolution) {
    if (!myAdminPermission("manage_reports")) {
      showNotice("Keine Berechtigung für Nutzer-Meldungen.");
      return;
    }

    const note = window.prompt(
      resolution === "UNFOUNDED"
        ? "Warum ist die Meldung unbegründet?"
        : "Begründung der Entscheidung:"
    );

    if (note === null || note.trim().length < 3) {
      showNotice("Bitte eine begründete Entscheidung eingeben.");
      return;
    }

    let penaltyPoints = 0;

    if (resolution === "UNFOUNDED") {
      const value = window.prompt(
        "Wie viele Minuspunkte bekommt der Meldende?\nStandard: 2",
        "2"
      );

      if (value === null) return;

      penaltyPoints = Number(value);

      if (!Number.isInteger(penaltyPoints) || penaltyPoints < 0) {
        showNotice("Ungültige Minuspunkte.");
        return;
      }
    }

    const { error } = await supabase.rpc(
      "admin_resolve_user_report",
      {
        report_id: reportId,
        resolution,
        admin_note: note.trim(),
        penalty_points: penaltyPoints
      }
    );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice(
      resolution === "UNFOUNDED"
        ? `Meldung unbegründet. ${penaltyPoints} Minuspunkte wurden vergeben.`
        : "Meldung wurde bearbeitet."
    );

    await loadAll();
  }

  async function openMember(member) {
    setSelectedMember(member);

    const [{ data: groupData }, { data: eventData }] =
      await Promise.all([
        supabase
          .from("group_members")
          .select("groups(*)")
          .eq("user_id", member.id),

        supabase
          .from("event_members")
          .select("events(*)")
          .eq("user_id", member.id)
      ]);

    setSelectedMemberGroups(
      (groupData || [])
        .map((row) => row.groups)
        .filter(Boolean)
    );

    setSelectedMemberEvents(
      (eventData || [])
        .map((row) => row.events)
        .filter(Boolean)
    );

    if (user && member.id !== user.id) {
      const { error } = await supabase.rpc(
        "record_profile_visit",
        { target_profile: member.id }
      );

      if (error) {
        await supabase
          .from("profile_visits")
          .insert({
            visitor_id: user.id,
            profile_id: member.id
          });
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
          // Wichtig für Vercel: Bestätigungslinks gehen zurück zur aktuell geöffneten
          // Deployment-Domain und nicht mehr auf localhost:3000.
          emailRedirectTo: `${window.location.origin}/`,
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

  async function loadPermissionDraft(userId) {
    if (!userId) return;

    const { data, error } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      showNotice(error.message);
      return;
    }

    setPermissionTarget(userId);

    setPermissionDraft({
      manage_members: !!data?.manage_members,
      manage_points: !!data?.manage_points,
      manage_messages: !!data?.manage_messages,
      manage_media: !!data?.manage_media,
      manage_roles: !!data?.manage_roles,
      manage_admins: !!data?.manage_admins,
      view_profile_visits: !!data?.view_profile_visits,
      manage_news: !!data?.manage_news,
      manage_groups: !!data?.manage_groups,
      manage_events: !!data?.manage_events,
      manage_marketplace: !!data?.manage_marketplace,
      manage_friend_requests: !!data?.manage_friend_requests,
      manage_homepage: !!data?.manage_homepage,
      manage_reports: !!data?.manage_reports
    });
  }

  async function saveAdminPermissions() {
    if (!isHeadAdmin(profile?.role) || !permissionTarget) {
      showNotice("Nur der Hauptadmin darf Admin-Rechte ändern.");
      return;
    }

    const { error } = await supabase.rpc(
      "admin_set_permissions",
      {
        target_user: permissionTarget,
        ...Object.fromEntries(
          Object.entries(permissionDraft).map(
            ([key, value]) => [`p_${key}`, value]
          )
        )
      }
    );

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Admin-Rechte wurden gespeichert.");
    await loadAll();
  }


  const memberById = (id) =>
    members.find((member) => member.id === id) || null;

  const actorLabel = (id) => {
    const actor = memberById(id);
    if (!actor) return "Mitglied";
    return getName(actor);
  };

  const canManageNewsItem = (item) =>
    item?.author_id === user?.id ||
    myAdminPermission("manage_news");

  const canManageGroupItem = (item) =>
    item?.created_by === user?.id ||
    myAdminPermission("manage_groups");

  const canManageEventItem = (item) =>
    (item?.created_by || item?.creator_id) === user?.id ||
    myAdminPermission("manage_events");

  async function createHomepageSection(event) {
    event.preventDefault();

    if (!isHeadAdmin(profile?.role) && !myAdminPermission("manage_homepage")) {
      showNotice("Keine Berechtigung zum Gestalten der Hauptseite.");
      return;
    }

    const form = new FormData(event.currentTarget);

    const { error } = await supabase
      .from("homepage_sections")
      .insert({
        title: String(form.get("title") || "").trim(),
        content: String(form.get("content") || "").trim(),
        frame_style: form.get("frame_style") || "standard",
        created_by: user.id,
        updated_by: user.id,
        sort_order: homepageSections.length
      });

    if (error) {
      showNotice(error.message);
      return;
    }

    event.currentTarget.reset();
    showNotice("Hauptrahmen wurde erstellt.");
    await loadAll();
  }

  async function editHomepageSection(section) {
    if (!isHeadAdmin(profile?.role) && !myAdminPermission("manage_homepage")) return;

    const title = window.prompt("Rahmen-Überschrift:", section.title || "");
    if (title === null) return;
    const content = window.prompt("Rahmen-Text:", section.content || "");
    if (content === null) return;

    const { error } = await supabase
      .from("homepage_sections")
      .update({
        title: title.trim(),
        content: content.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", section.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Hauptrahmen wurde gespeichert.");
    await loadAll();
  }

  async function deleteHomepageSection(section) {
    if (!isHeadAdmin(profile?.role) && !myAdminPermission("manage_homepage")) return;
    if (!window.confirm("Diesen Rahmen wirklich löschen?")) return;

    const { error } = await supabase
      .from("homepage_sections")
      .delete()
      .eq("id", section.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Hauptrahmen wurde gelöscht.");
    await loadAll();
  }

  async function editNews(item) {
    if (!canManageNewsItem(item)) return;

    const title = window.prompt("Überschrift:", item.title || "");
    if (title === null) return;

    const content = window.prompt("Beitrag:", item.content || "");
    if (content === null) return;

    const { error } = await supabase
      .from("news")
      .update({
        title: title.trim(),
        content: content.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Beitrag wurde gespeichert.");
    await loadAll();
  }

  async function deleteNews(item) {
    if (!canManageNewsItem(item)) return;
    if (!window.confirm("Diesen Beitrag wirklich löschen?")) return;

    const { error } = await supabase
      .from("news")
      .delete()
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Beitrag wurde gelöscht.");
    await loadAll();
  }

  async function editGroup(item) {
    if (!canManageGroupItem(item)) return;

    const name = window.prompt("Gruppenname:", item.name || "");
    if (name === null) return;

    const description = window.prompt("Beschreibung:", item.description || "");
    if (description === null) return;

    const imageUrl = window.prompt("Bild-URL:", item.image_url || "");
    if (imageUrl === null) return;

    const { error } = await supabase
      .from("groups")
      .update({
        name: name.trim(),
        description: description.trim(),
        image_url: imageUrl.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Gruppe wurde gespeichert.");
    await loadAll();
  }

  async function deleteGroup(item) {
    if (!canManageGroupItem(item)) return;
    if (!window.confirm("Diese Gruppe wirklich löschen?")) return;

    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Gruppe wurde gelöscht.");
    await loadAll();
  }

  async function logProfileActivity(
    activityText,
    activityType = "PROFILE"
  ) {
    if (!user?.id) return;

    const { error } =
      await supabase
        .from("profile_activity")
        .insert({
          actor_id: user.id,
          target_user_id: user.id,
          activity_type: activityType,
          text: activityText
        });

    if (error) {
      console.warn(
        "Profilaktivität konnte nicht gespeichert werden:",
        error.message
      );
    }
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

  await logProfileActivity(
    "hat sein Profilbild geändert",
    "AVATAR"
  );

  await loadAll();
}
  async function saveProfile(event) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    let avatarUrl =
      form.get("avatar_url")?.trim() ||
      profile?.avatar_url ||
      null;

    const avatarFile =
      form.get("avatar_file");

    if (
      avatarFile &&
      avatarFile.size > 0
    ) {
      await uploadProfileImage(
        avatarFile
      );

      const refreshed =
        await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .single();

      avatarUrl =
        refreshed.data?.avatar_url ||
        avatarUrl;
    }

    // Vorname, Nachname und Geburtsdatum bleiben nach der Registrierung unveränderbar.
    const gender = form.get("gender");
    if (!gender) { showNotice("Bitte ein Geschlecht auswählen."); return; }

    const updateData = {
      nickname:
        form.get("nickname")?.trim(),

      nickname_color:
        form.get("nickname_color"),

      avatar_url:
        avatarUrl,

      gender,

      bio:
        form.get("bio")?.trim(),

      location:
        form.get("location")?.trim(),

      interests:
        form.get("interests")?.trim(),

      website:
        form.get("website")?.trim(),

      profile_accent:
        form.get("profile_accent") ||
        "#ff6b25",

      profile_background:
        form.get("profile_background") ||
        "#171b22",

      profile_layout:
        form.get("profile_layout") ||
        "standard"
    };

    let result =
      await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

    if (result.error) {
      const fallbackData = {
        nickname: updateData.nickname,
        nickname_color: updateData.nickname_color,
        avatar_url: updateData.avatar_url,
        gender: updateData.gender,
        bio: updateData.bio,
        location: updateData.location,
        interests: updateData.interests,
        website: updateData.website
      };

      result =
        await supabase
          .from("profiles")
          .update(fallbackData)
          .eq("id", user.id);

      if (result.error) {
        showNotice(
          result.error.message
        );
        return;
      }

      showNotice(
        "Profil gespeichert. Die Designfelder brauchen noch die SQL-Erweiterung."
      );
    } else {
      showNotice(
        "Profil wurde gespeichert."
      );
    }

    const changes = [];

    if (
      profile?.nickname !==
      updateData.nickname
    ) {
      changes.push(
        "hat seinen Nicknamen geändert"
      );
    }

    if (
      profile?.bio !== updateData.bio ||
      profile?.location !== updateData.location ||
      profile?.interests !== updateData.interests ||
      profile?.website !== updateData.website ||
      profile?.first_name !== updateData.first_name ||
      profile?.last_name !== updateData.last_name
    ) {
      changes.push(
        "hat sein Profil bearbeitet"
      );
    }

    if (
      profile?.profile_accent !==
        updateData.profile_accent ||
      profile?.profile_background !==
        updateData.profile_background ||
      profile?.profile_layout !==
        updateData.profile_layout
    ) {
      changes.push(
        "hat sein Profil gestaltet"
      );
    }

    for (const entry of [
      ...new Set(changes)
    ]) {
      await logProfileActivity(
        entry,
        "PROFILE"
      );
    }

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
        .from("news")
        .insert({
          title: String(form.get("title") || "").trim(),
          content: String(form.get("content") || "").trim(),
          author_id: user.id
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

      event_date:
        form.get("event_date"),

      creator_id:
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

  async function editEvent(item) {
    if (!canManageEventItem(item)) return;

    const title = window.prompt("Event-Titel:", item.title || "");
    if (title === null) return;
    const description = window.prompt("Beschreibung:", item.description || "");
    if (description === null) return;
    const location = window.prompt("Ort:", item.location || "");
    if (location === null) return;

    const { error } = await supabase
      .from("events")
      .update({
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Event wurde gespeichert.");
    await loadAll();
  }

  async function deleteEvent(item) {
    if (!canManageEventItem(item)) return;
    if (!window.confirm("Dieses Event wirklich löschen?")) return;

    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", item.id);

    if (error) {
      showNotice(error.message);
      return;
    }

    showNotice("Event wurde gelöscht.");
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

    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("receiver_id", user.id)
      .eq("sender_id", member.id)
      .eq("is_read", false);

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
            "PRIVATE",

          is_read:
            false
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
    String(form.get("user_id") || "");

  const amount =
    Number(form.get("points"));

  const reason =
    String(
      form.get("reason") || ""
    ).trim();

  if (!targetUser) {
    showNotice(
      "Bitte ein Mitglied auswählen."
    );
    return;
  }

  if (
    !Number.isFinite(amount) ||
    amount === 0
  ) {
    showNotice(
      "Bitte eine gültige Punktezahl eingeben."
    );
    return;
  }

  if (reason.length < 3) {
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
          Math.trunc(amount),

        change_kind:
          amount > 0
            ? "ADD"
            : "REMOVE",

        reason_text:
          reason
      }
    );

  if (error) {
    showNotice(
      error.message
    );
    return;
  }

  event.currentTarget.reset();

  showNotice(
    amount > 0
      ? `+${Math.trunc(amount)} Punkte vergeben.`
      : `${Math.abs(Math.trunc(amount))} Minuspunkte vergeben.`
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

  function myAdminPermission(permission) {
    if (profile?.role === "HEAD_ADMIN") return true;
    return !!myPermissions?.[permission];
  }

  /* =========================================================
     LADEN
     ========================================================= */

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="text-logo" aria-label="Ennstal Connect">ENNSTAL CONNECT</div>

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
        <div className="auth-page">

          <div className="auth-brand">
            <div className="text-logo" aria-label="Ennstal Connect">ENNSTAL CONNECT</div>
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
        <div className="suspended-page">

          <div className="suspended-box">

            <div className="text-logo" aria-label="Ennstal Connect">ENNSTAL CONNECT</div>

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
                Belohnungsstufe
              </span>

              <strong>
                {
                  profile.reward_level ||
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

  const unreadMessages =
    inboxMessages.filter((message) => !message.is_read);

  const friendIds =
    friendships
      .filter((friendship) => friendship.status === "ACCEPTED")
      .map((friendship) =>
        friendship.requester_id === user.id
          ? friendship.receiver_id
          : friendship.requester_id
      );

  const sidebarFriends =
    members
      .filter((member) => friendIds.includes(member.id))
      .slice(0, 5);

  return (
    <>
      <div className="app">

        {/* DASHBOARD-SHELL */}

        <header className="topbar modern-topbar">
          <div className="topbar-brand" onClick={() => setPage("home")}>
            <div className="brand-mark">★</div>
            <div><strong>ennstal</strong><span>connect</span></div>
          </div>
          <div className="breadcrumb">ENNSTAL.CONNECT <b>›</b> {page === "home" ? "Startseite" : page === "members" ? "Mitglieder" : page === "forum" ? "Forum" : page === "news" ? "News & Beiträge" : page === "admin" ? "Admin-Bereich" : page === "logs" ? "Admin-Logbuch" : page === "rewards" ? "Belohnungen" : "Community"}</div>
          <div className="topbar-user" onClick={() => setPage("profile")}>
            <img src={profile?.avatar_url || DEFAULT_AVATAR} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
            <strong>{getName(profile)}</strong>
          </div>
        </header>

        <div className="dashboard-layout">
          <aside className="modern-sidebar">
            <div className="sidebar-profile" onClick={() => setPage("profile")}>
              <img src={profile?.avatar_url || DEFAULT_AVATAR} alt="" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
              <div><strong>{getName(profile)}</strong><span className={isHeadAdmin(profile?.role) ? "role-badge head" : profile?.role === "ADMIN" ? "role-badge admin" : profile?.role === "SUPPORTER" ? "role-badge supporter" : "role-badge"}>{isHeadAdmin(profile?.role) ? "♕ Head Admin" : profile?.role === "ADMIN" ? "★ Admin" : profile?.role === "SUPPORTER" ? "★ Supporter" : "Mitglied"}</span></div>
            </div>
            <nav className="modern-nav">
              <button className={page === "home" ? "active" : ""} onClick={() => setPage("home")}>⌂ <span>Startseite</span></button>
              <button className={page === "members" ? "active" : ""} onClick={() => setPage("members")}>♙ <span>Mitglieder</span></button>
              <button className={page === "friends" ? "active" : ""} onClick={() => setPage("friends")}>♧ <span>Freunde</span></button>
              <button className={page === "forum" ? "active" : ""} onClick={() => setPage("forum")}>◯ <span>Forum</span></button>
              <button className={page === "news" ? "active" : ""} onClick={() => setPage("news")}>▤ <span>News & Beiträge</span></button>
              <button className={page === "messages" ? "active" : ""} onClick={() => setPage("messages")}>☏ <span>Nachrichten</span>{unreadMessages.length > 0 && <em>{unreadMessages.length}</em>}</button>
              <button className={page === "rewards" ? "active" : ""} onClick={() => setPage("rewards")}>♜ <span>Belohnungen</span></button>
              <button className={page === "profile" ? "active" : ""} onClick={() => setPage("profile")}>⚙ <span>Mein Profil</span></button>
              {isAdmin(profile?.role) && <button className={page === "admin" ? "active admin-link" : "admin-link"} onClick={() => setPage("admin")}>♛ <span>Admin-Bereich</span></button>}
              {isHeadAdmin(profile?.role) && <button className={page === "logs" ? "active admin-link" : "admin-link"} onClick={() => setPage("logs")}>♕ <span>Admin-Logbuch</span></button>}
            </nav>
            <button className="sidebar-logout" onClick={logout}>⇥ <span>Abmelden</span></button>
          </aside>
          <main className="modern-main">
        {notice && (
          <div className="toast">
            {notice}
          </div>
        )}

        <div className="content-root">

          {/* =================================================
              STARTSEITE
              ================================================= */}

          {page === "home" && (
            <section>

              <div className="hero">

                <img
                  src="/banner.png"
                  alt="Ennstal Connect – Panorama"
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
                  <h2>Deine Admin-Übersicht</h2>
                  <div className="admin-tool-grid">
                    <button type="button" onClick={() => setPage("admin")}>
                      <span>👥</span>
                      Mitglieder verwalten
                    </button>
                    <button type="button" onClick={() => setPage("admin")}>
                      <span>🛡️</span>
                      Moderation & Funktionen
                    </button>
                    <button type="button" onClick={() => setPage("news")}>
                      <span>📰</span>
                      News verwalten
                    </button>
                    <button type="button" onClick={() => setPage("forum")}>
                      <span>💬</span>
                      Forum verwalten
                    </button>
                    {isHeadAdmin(profile?.role) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const { data, error } = await supabase.rpc("head_admin_get_suspended_users");
                          if (error) {
                            showNotice(error.message);
                            return;
                          }
                          setSuspendedUsers(data || []);
                          setPage("suspended-users");
                        }}
                      >
                        <span>🔒</span>
                        Gesperrte Konten
                      </button>
                    )}
                  </div>
                </section>
              )}

              {(isHeadAdmin(profile?.role) || myAdminPermission("manage_homepage")) && (
                <section className="homepage-builder panel">
                  <div className="homepage-builder-heading">
                    <div>
                      <span className="eyebrow">HAUPTSEITE</span>
                      <h2>Eigene Rahmen gestalten</h2>
                      <p>Eigene Infoboxen auf der Startseite erstellen und veröffentlichen.</p>
                    </div>
                  </div>

                  <form onSubmit={createHomepageSection} className="homepage-builder-form">
                    <input name="title" placeholder="Rahmen-Überschrift" required />
                    <textarea name="content" placeholder="Text für den Rahmen" required />
                    <select name="frame_style" defaultValue="standard">
                      <option value="standard">Standard</option>
                      <option value="accent">Hervorgehoben</option>
                      <option value="soft">Soft</option>
                      <option value="dark">Dunkel</option>
                    </select>
                    <button className="primary-button">Rahmen veröffentlichen</button>
                  </form>
                </section>
              )}

              {homepageSections.length > 0 && (
                <section className="homepage-sections">
                  {homepageSections.map((section) => (
                    <article className={`homepage-frame ${section.frame_style || "standard"}`} key={section.id}>
                      <h2>{section.title}</h2>
                      <p>{section.content}</p>
                      <small>
                        Erstellt von {actorLabel(section.created_by)}
                        {section.updated_by && section.updated_by !== section.created_by && (
                          <> · Bearbeitet von {actorLabel(section.updated_by)}{["ADMIN", "HEAD_ADMIN"].includes(memberById(section.updated_by)?.role) ? " ★" : ""}</>
                        )}
                      </small>

                      {(isHeadAdmin(profile?.role) || myAdminPermission("manage_homepage")) && (
                        <div className="content-manage-actions">
                          <button type="button" onClick={() => editHomepageSection(section)}>Bearbeiten</button>
                          <button type="button" onClick={() => deleteHomepageSection(section)} className="danger-link">Löschen</button>
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}

              <section>

                <h2>
                  Neuigkeiten
                </h2>

                {(user && (isAdmin(profile?.role) || myAdminPermission("manage_news"))) && (

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
                        Erstellt von {actorLabel(item.author_id)}
                        {item.updated_by && item.updated_by !== item.author_id && (
                          <> · Bearbeitet von {actorLabel(item.updated_by)}{["ADMIN", "HEAD_ADMIN"].includes(memberById(item.updated_by)?.role) ? " ★" : ""}</>
                        )}
                        <br />
                        {new Date(item.created_at).toLocaleString("de-AT")}
                      </small>

                      {canManageNewsItem(item) && (
                        <div className="content-manage-actions">
                          <button type="button" onClick={() => editNews(item)}>Bearbeiten</button>
                          <button type="button" onClick={() => deleteNews(item)} className="danger-link">Löschen</button>
                        </div>
                      )}

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

          {page === "friends" && (
            <section>
              <div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>Freunde</h1><p>Deine Freundschaften und Kontakte auf einen Blick.</p></div></div>
              {!sidebarFriends.length ? <div className="empty-card">Noch keine Freunde. Öffne ein Mitglied und sende eine Freundschaftsanfrage.</div> : (
                <MemberSection title="Meine Freunde" members={sidebarFriends} profile={profile} onOpen={openMember} onMessage={openChat} friendships={friendships} onFriend={requestFriend} />
              )}
            </section>
          )}

          {page === "news" && (
            <section>
              <div className="page-heading"><div><span className="eyebrow">COMMUNITY</span><h1>News & Beiträge</h1><p>Aktuelle Informationen und Beiträge aus deiner Community.</p></div></div>
              {(isAdmin(profile?.role) || myAdminPermission("manage_news")) && (
                <form className="panel" onSubmit={createNews}>
                  <h2>Neue News veröffentlichen</h2>
                  <input name="title" placeholder="Überschrift" required />
                  <textarea name="content" placeholder="Text" required />
                  <button className="primary-button">Veröffentlichen</button>
                </form>
              )}
              <div className="news-grid">
                {news.map((item) => <article className="news-card" key={item.id}>
                  <h2>{item.title}</h2><p>{item.content}</p>
                  <small>Erstellt von {actorLabel(item.author_id)}<br />{new Date(item.created_at).toLocaleString("de-AT")}</small>
                  {canManageNewsItem(item) && <div className="content-manage-actions"><button type="button" onClick={() => editNews(item)}>Bearbeiten</button><button type="button" className="danger-link" onClick={() => deleteNews(item)}>Löschen</button></div>}
                </article>)}
                {!news.length && <div className="empty-card">Noch keine Beiträge veröffentlicht.</div>}
              </div>
            </section>
          )}

          {/* =================================================
              GRUPPEN
              ================================================= */}

          {page === "forum" && (
            <section>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">
                    GEMEINSCHAFT
                  </span>

                  <h1>
                    Forum
                  </h1>
                  <p>Diskutiere regionale Themen. Neue Bereiche werden von der Moderation freigegeben.</p>

                </div>

              </div>

              {(isAdmin(profile?.role) || myAdminPermission("manage_groups")) && (
                <form
                  className="panel"
                  onSubmit={createGroup}
                >

                  <input
                    name="name"
                    placeholder="Thema / Forenbereich"
                    required
                  />

                  <textarea
                    name="description"
                    placeholder="Beschreibung des Themas"
                  />

                  <input
                    name="image_url"
                    placeholder="Bild URL"
                  />

                  <button className="primary-button">
                    Forenbereich erstellen
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

                      <small className="content-attribution">
                        Erstellt von {actorLabel(group.created_by)}
                        {group.updated_by && group.updated_by !== group.created_by && (
                          <> · Bearbeitet von {actorLabel(group.updated_by)}{["ADMIN", "HEAD_ADMIN"].includes(memberById(group.updated_by)?.role) ? " ★" : ""}</>
                        )}
                      </small>

                      {canManageGroupItem(group) && (
                        <div className="content-manage-actions">
                          <button type="button" onClick={() => editGroup(group)}>Bearbeiten</button>
                          <button type="button" onClick={() => deleteGroup(group)} className="danger-link">Löschen</button>
                        </div>
                      )}

                    </div>

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

          {page === "friend-requests" && (
            <section>
              <div className="page-heading">
                <div>
                  <button className="back-button" onClick={() => setPage("profile")}>← Zurück</button>
                  <h1>Freundschaftsanfragen</h1>
                  <p>Hier kommen deine eingehenden Freundschaftsanfragen an.</p>
                </div>
              </div>

              <div className="cards">
                {incomingFriendRequests.map((request) => {
                  const sender = memberById(request.requester_id);
                  return (
                    <article className="member-card" key={request.id}>
                      <img src={sender?.avatar_url || DEFAULT_AVATAR} alt="" />
                      <div>
                        <h2>{sender ? getName(sender) : "Mitglied"}</h2>
                        <p>möchte mit dir befreundet sein.</p>
                        <div className="content-manage-actions">
                          <button className="primary-button" onClick={() => respondToFriendRequest(request, true)}>✓ Annehmen</button>
                          <button className="danger-button" onClick={() => respondToFriendRequest(request, false)}>Ablehnen</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!incomingFriendRequests.length && (<div className="empty-card">Keine eingehenden Freundschaftsanfragen.</div>)}
              </div>
              <h2 style={{marginTop:24}}>Gesendete Anfragen</h2>
              <div className="cards">
                {sentFriendRequests.map((request) => {
                  const receiver = memberById(request.receiver_id);
                  return <article className="member-card" key={request.id}><img src={receiver?.avatar_url || DEFAULT_AVATAR} alt="" /><div><h2>{receiver ? getName(receiver) : "Mitglied"}</h2><p>Deine Anfrage wartet auf eine Antwort.</p><button className="danger-button" onClick={() => cancelFriendRequest(request)}>Anfrage abbrechen</button></div></article>;
                })}
                {!sentFriendRequests.length && <div className="empty-card">Keine gesendeten Anfragen.</div>}
              </div>
            </section>
          )}

          {page === "profile-visits" && (
            <section><div className="page-heading"><div><button className="back-button" onClick={() => setPage("profile")}>← Zurück</button><span className="eyebrow">DEIN PROFIL</span><h1>Letzte Profilbesucher</h1><p>Hier siehst du deine letzten Profilbesucher.</p></div></div>
              <div className="cards">{profileVisits.map((visit) => { const visitor = memberById(visit.visitor_id); if (!visitor) return null; return <article className="member-card" key={visit.id}><img src={visitor.avatar_url || DEFAULT_AVATAR} alt="" /><div><h2>{getName(visitor)}</h2><p>{visit.visited_at ? new Date(visit.visited_at).toLocaleString("de-AT") : "Gerade eben"}</p></div><button className="secondary-button" onClick={() => openMember(visitor)}>Profil öffnen</button></article>; })}{!profileVisits.length && <div className="empty-card">Noch keine Profilbesuche vorhanden.</div>}</div>
            </section>
          )}

          {page === "support" && (
            <section className="support-page">
              <div className="page-heading"><div><span className="eyebrow">DIREKT AN DAS ADMIN-TEAM</span><h1>Support & Fehlermeldung</h1><p>Beschreibe dein Anliegen. Die Anfrage wird in Supabase gespeichert und für Administratoren sichtbar.</p></div></div>
              <form className="support-form panel" onSubmit={submitSupportTicket}>
                <label>Betreff</label><input name="subject" maxLength={160} required placeholder="Worum geht es?" />
                <label>Kategorie</label><select name="category" defaultValue="ALLGEMEIN"><option value="ALLGEMEIN">Allgemeine Anfrage</option><option value="FEHLER">Fehlermeldung</option><option value="KONTO">Konto / Anmeldung</option><option value="FUNKTION">Funktion funktioniert nicht</option><option value="DATENSCHUTZ">Datenschutz / Daten</option></select>
                <label>Anliegen oder Fehlermeldung</label><textarea name="description" rows="8" required placeholder="Bitte so genau wie möglich beschreiben, was passiert ist und was du erwartet hast." />
                <button className="primary-button" type="submit">An Admin-Team senden</button>
              </form>
              <h2 style={{marginTop:24}}>Meine Support-Anfragen</h2>
              <div className="support-ticket-list">{supportTickets.filter(t => t.user_id === user?.id).map(ticket => <article className="support-ticket" key={ticket.id}><div><strong>{ticket.subject}</strong><p>{ticket.category} · {ticket.status === "OPEN" ? "Offen" : ticket.status === "IN_PROGRESS" ? "In Bearbeitung" : "Erledigt"}</p><p>{ticket.description}</p></div></article>)}{!supportTickets.some(t => t.user_id === user?.id) && <div className="empty-card">Du hast noch keine Support-Anfrage gesendet.</div>}</div>
            </section>
          )}

          {page === "support-admin" && isAdmin(profile?.role) && (
            <section className="support-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ADMIN</span>
                  <h1>Support-Anfragen</h1>
                  <p>Hier erscheinen alle direkt eingereichten Anliegen und Fehlermeldungen.</p>
                </div>
              </div>

              <div className="support-ticket-list">
                {supportTickets.length === 0 ? (
                  <div className="empty-card">Keine Support-Anfragen vorhanden.</div>
                ) : (
                  supportTickets.map((ticket) => {
                    const sender = members.find((member) => member.id === ticket.user_id);
                    const statusLabel =
                      ticket.status === "OPEN"
                        ? "Offen"
                        : ticket.status === "IN_PROGRESS"
                        ? "In Bearbeitung"
                        : "Erledigt";

                    return (
                      <article className="support-ticket" key={ticket.id}>
                        <div>
                          <strong>{ticket.subject}</strong>
                          <p>
                            Von: {sender ? getName(sender) : ticket.user_id} · {ticket.category}
                          </p>
                          <p>{ticket.description}</p>
                        </div>

                        <div className="support-ticket-actions">
                          <span>{statusLabel}</span>

                          {ticket.status === "OPEN" && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => updateSupportTicketStatus(ticket, "IN_PROGRESS")}
                            >
                              In Bearbeitung
                            </button>
                          )}

                          {ticket.status !== "RESOLVED" && (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() => updateSupportTicketStatus(ticket, "RESOLVED")}
                            >
                              Erledigt
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {page === "impressum" && (
            <section className="legal-page panel"><h1>Impressum</h1><p><strong>Ennstal Connect</strong></p><p>Waidbachstraße<br/>8700 Leoben<br/>Österreich</p><p>Verantwortlich für die Inhalte dieser Community: der jeweils eingetragene Hauptadministrator von Ennstal Connect.</p><p>Für Support-Anfragen und technische Fehlermeldungen nutze bitte den Bereich „Support“ innerhalb der Community.</p><button className="secondary-button" onClick={() => setPage("support")}>Zum Support</button></section>
          )}

          {page === "privacy" && (
            <section className="legal-page panel"><h1>Datenschutzhinweise</h1><p>Ennstal Connect verarbeitet die Daten, die für Registrierung, Anmeldung und die Nutzung der Community erforderlich sind. Weitere Inhalte und konkrete Aufbewahrungsfristen hängen von den aktivierten Community-Funktionen und der Supabase-Konfiguration ab.</p><p>Bei Fragen zur Verarbeitung deiner Daten kannst du eine Anfrage über den Support-Bereich an das Admin-Team senden.</p><button className="secondary-button" onClick={() => setPage("support")}>Datenschutz-Anfrage senden</button></section>
          )}

          {page === "profile" && (
            <section>
              <div
                className="my-area-layout"
                style={{
                  "--profile-accent":
                    profile?.profile_accent ||
                    "#ff6b25"
                }}
              >

                <div
                  className={
                    `my-profile-card profile-showcase ${
                      isAdmin(profile?.role)
                        ? "admin-profile"
                        : profile?.role === "SUPPORTER"
                        ? "supporter-profile"
                        : ""
                    }`
                  }
                  style={{
                    background:
                      profile?.profile_background ||
                      "#1b1f26",
                    borderColor:
                      isAdmin(profile?.role)
                        ? "#dd5c5c"
                        : profile?.profile_accent ||
                          "#58616d"
                  }}
                >

                  <div className="my-profile-top">
                    {isAdmin(profile?.role) && (
                      <span className="role-stack"><img className="role-symbol role-symbol-large" src="/Admin-star.png" alt="Admin" /><img className="friend-symbol" src="/freunde-logo" alt="Freund" /></span>
                    )}

                    {profile?.role === "SUPPORTER" && (
                      <img
                        className="role-symbol role-symbol-large"
                        src="/supporter-star.png"
                        alt="Supporter"
                      />
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

                  <p className="profile-showcase-role">
                    {profile?.role === "HEAD_ADMIN"
                      ? "Hauptadmin"
                      : profile?.role === "ADMIN"
                      ? "Admin"
                      : profile?.role === "SUPPORTER"
                      ? "Supporter"
                      : "Mitglied"}
                  </p>

                  <h2>
                    {[
                      profile?.first_name,
                      profile?.last_name
                    ]
                      .filter(Boolean)
                      .join(" ")}

                    {getAge(profile?.birth_date) !== null && (
                      <>
                        {" · "}
                        {getAge(profile?.birth_date)} Jahre
                      </>
                    )}
                  </h2>

                  <div className="profile-status online">
                    <span />
                    Online
                  </div>
                  <div className="profile-rewards-card">
                    <button type="button" onClick={() => setPage("rewards")}>
                      <span>🎁</span>
                      <strong>Belohnungen</strong>
                      <small>
                        Stufe {profile?.reward_level || 0} · {totalOnlineHours.toFixed(2)} Std. online
                      </small>
                    </button>
                  </div>

                  <div className="profile-self-preview">
                    <small>Über mich</small>
                    <p>
                      {profile?.bio ||
                        "Gestalte dein Profil mit einem persönlichen Über-mich-Text."}
                    </p>
                  </div>
                </div>

                <form
                  className="panel profile-form profile-builder"
                  onSubmit={saveProfile}
                >
                  <div className="profile-builder-heading">
                    <span className="eyebrow">
                      DEIN PROFIL
                    </span>
                    <h2>Profil gestalten</h2>
                    <p>
                      Farben, Profilbild, Texte und Layout kannst du
                      selbst festlegen.
                    </p>
                  </div>

                  <label>Nickname *</label>
                  <input
                    name="nickname"
                    defaultValue={
                      profile?.nickname || ""
                    }
                    required
                  />

                  <div className="profile-design-grid">
                    <div>
                      <label>Nickname-Farbe</label>
                      <input
                        type="color"
                        name="nickname_color"
                        defaultValue={
                          profile?.nickname_color ||
                          "#ffffff"
                        }
                      />
                    </div>

                    <div>
                      <label>Profil-Akzent</label>
                      <input
                        type="color"
                        name="profile_accent"
                        defaultValue={
                          profile?.profile_accent ||
                          "#ff6b25"
                        }
                      />
                    </div>

                    <div>
                      <label>Profil-Hintergrund</label>
                      <input
                        type="color"
                        name="profile_background"
                        defaultValue={
                          profile?.profile_background ||
                          "#171b22"
                        }
                      />
                    </div>

                    <div>
                      <label>Profil-Layout</label>
                      <select
                        name="profile_layout"
                        defaultValue={
                          profile?.profile_layout ||
                          "standard"
                        }
                      >
                        <option value="standard">
                          Standard
                        </option>
                        <option value="showcase">
                          Showcase
                        </option>
                        <option value="compact">
                          Kompakt
                        </option>
                      </select>
                    </div>
                  </div>

                  <label>Profilbild</label>

                  <div className="profile-upload-box">
                    <div className="profile-upload-preview">
                      <img
                        src={
                          profile?.avatar_url ||
                          DEFAULT_AVATAR
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
                          const file =
                            event.target.files?.[0];

                          if (file) {
                            await uploadProfileImage(
                              file
                            );
                          }

                          event.target.value = "";
                        }}
                      />
                    </label>

                    <small className="form-help">
                      JPG, PNG, WEBP oder GIF · maximal 5 MB
                    </small>
                  </div>

                  <label>Vorname *</label>
                  <input
                    name="first_name"
                    defaultValue={profile?.first_name || ""}
                    readOnly
                  />

                  <label>Nachname *</label>
                  <input
                    name="last_name"
                    defaultValue={profile?.last_name || ""}
                    readOnly
                  />

                  <label>Geburtsdatum *</label>
                  <input
                    type="date"
                    name="birth_date"
                    defaultValue={profile?.birth_date || ""}
                    readOnly
                  />

                  <label>Geschlecht *</label>
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

                  <label>Über mich</label>
                  <textarea
                    name="bio"
                    defaultValue={
                      profile?.bio || ""
                    }
                    placeholder="Was sollen andere über dich wissen?"
                  />

                  <label>Interessen</label>
                  <input
                    name="interests"
                    defaultValue={
                      profile?.interests || ""
                    }
                  />

                  <label>Wohnort</label>
                  <input
                    name="location"
                    defaultValue={
                      profile?.location || ""
                    }
                  />

                  <label>Website</label>
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
              BLOCKIERTE NUTZER
              ================================================= */}

          {page === "blocked" && (
            <section>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SICHERHEIT</span>
                  <h1>Blockierte Nutzer</h1>
                  <p>Von dir blockierte Mitglieder verwalten.</p>
                </div>
              </div>

              {!blockedUsers.length ? (
                <div className="empty-card">
                  Du hast derzeit keine Nutzer blockiert.
                </div>
              ) : (
                <div className="member-grid">
                  {blockedUsers.map((block) => {
                    const member = memberById(block.blocked_id);
                    if (!member) return null;

                    return (
                      <article className="member-card" key={block.id}>
                        <img
                          src={member.avatar_url || DEFAULT_AVATAR}
                          alt={getName(member)}
                          className="member-avatar"
                        />
                        <div className="member-name">
                          {getName(member)}
                        </div>
                        <button
                          className="secondary-button"
                          onClick={() => unblockUser(member.id)}
                        >
                          Entsperren
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* =================================================
              NUTZER-MELDUNGEN
              ================================================= */}

          {page === "reports" &&
            (isHeadAdmin(profile?.role) ||
              myAdminPermission("manage_reports")) && (
              <section className="admin-page">
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">MODERATION</span>
                    <h1>Nutzer-Meldungen</h1>
                    <p>Gemeldete Nutzer begründet prüfen und entscheiden.</p>
                  </div>
                </div>

                <div className="report-list">
                  {reports.map((report) => (
                    <article
                      className={`report-card ${
                        report.status === "PENDING"
                          ? "pending"
                          : report.status === "CONFIRMED"
                          ? "confirmed"
                          : "unfounded"
                      }`}
                      key={report.id}
                    >
                      <div className="report-header">
                        <strong>🚩 {report.status}</strong>
                        <small>
                          {new Date(report.created_at).toLocaleString("de-AT")}
                        </small>
                      </div>

                      <p>
                        <strong>Gemeldet von:</strong>{" "}
                        {actorLabel(report.reporter_id)}
                      </p>

                      <p>
                        <strong>Gemeldetes Mitglied:</strong>{" "}
                        {actorLabel(report.reported_user_id)}
                      </p>

                      <div className="report-reason">
                        {report.reason}
                      </div>

                      {report.status === "PENDING" ? (
                        <div className="content-manage-actions">
                          <button
                            type="button"
                            onClick={() =>
                              resolveReport(report.id, "CONFIRMED")
                            }
                          >
                            Meldung bestätigen
                          </button>

                          <button
                            type="button"
                            className="danger-link"
                            onClick={() =>
                              resolveReport(report.id, "UNFOUNDED")
                            }
                          >
                            Unbegründet / Minuspunkte
                          </button>
                        </div>
                      ) : (
                        <small>
                          Entscheidung: {report.admin_note || "—"}
                        </small>
                      )}
                    </article>
                  ))}

                  {!reports.length && (
                    <div className="empty-card">
                      Keine Meldungen vorhanden.
                    </div>
                  )}
                </div>
              </section>
            )}

          {/* =================================================
              PUNKTE
              ================================================= */}

          {page === "rewards" && (
            <section className="rewards-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DEINE AKTIVITÄT</span>
                  <h1>Belohnungen</h1>
                  <p>Mit deiner aktiven Zeit in der Community schaltest du schrittweise zusätzliche Profilfunktionen frei.</p>
                </div>
              </div>

              <div className="reward-hero panel">
                <div className="reward-level">
                  <span>Aktuelle Belohnungsstufe</span>
                  <strong>{profile?.reward_level || 0}</strong>
                </div>
                <div className="reward-progress">
                  <span>Gespeicherte Onlinezeit</span>
                  <strong>{totalOnlineHours.toFixed(2)} Stunden</strong>
                  <div className="reward-progress-track">
                    <i style={{ width: `${Math.min(100, Math.max(0, ((5 - onlineHoursUntilReward) / 5) * 100))}%` }} />
                  </div>
                  <small>
                    {onlineHoursUntilReward <= 0
                      ? "Deine nächste Belohnung ist bereit."
                      : `Noch ${onlineHoursUntilReward.toFixed(2)} Stunden bis zur nächsten Freischaltung.`}
                  </small>
                </div>
                <button
                  className="primary-button"
                  disabled={onlineHoursUntilReward > 0}
                  onClick={claimOnlineReward}
                >
                  🎁 Belohnung freischalten
                </button>
              </div>

              <div className="reward-info-grid">
                <article className="panel">
                  <span>01</span>
                  <h2>Profil erweitern</h2>
                  <p>Durch aktive Teilnahme können zusätzliche Profiloptionen freigeschaltet werden.</p>
                </article>
                <article className="panel">
                  <span>02</span>
                  <h2>Community-Funktionen</h2>
                  <p>Belohnungen können neue persönliche Funktionen und Gestaltungsmöglichkeiten aktivieren.</p>
                </article>
                <article className="panel">
                  <span>03</span>
                  <h2>Ohne Punktesystem</h2>
                  <p>Es gibt keine Kauf- oder Strafpunkte. Die Belohnung basiert ausschließlich auf aktiver Community-Zeit.</p>
                </article>
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

                <section className="admin-members-panel">
  <div className="admin-members-heading">
    <div>
      <span className="eyebrow">COMMUNITY</span>
      <h2>Mitglieder verwalten</h2>
      <p>Übersichtliche Karten mit direkten Aktionen.</p>
    </div>

    <div className="admin-member-count">
      {members.length}
      <small>Mitglieder</small>
    </div>
  </div>

  <div className="admin-member-cards">
    {members
      .slice()
      .sort((a, b) => {
        const rank = (member) => {
          if (member.role === "HEAD_ADMIN") return 1;
          if (member.role === "ADMIN") return 2;
          if (member.role === "SUPPORTER") return 3;
          return 4;
        };

        const diff = rank(a) - rank(b);

        return diff !== 0
          ? diff
          : getName(a).localeCompare(
              getName(b),
              "de"
            );
      })
      .map((member) => (
        <article
          className={
            `admin-member-card ${
              member.role === "HEAD_ADMIN"
                ? "head-admin-card"
                : member.role === "ADMIN"
                ? "admin-card"
                : member.role === "SUPPORTER"
                ? "supporter-card"
                : ""
            }`
          }
          key={member.id}
        >
          <div className="admin-member-card-top">
            <button
              type="button"
              className="admin-member-person-button"
              onClick={() => openMember(member)}
            >
              <img
                src={
                  member.avatar_url ||
                  DEFAULT_AVATAR
                }
                alt=""
                className="admin-member-avatar"
              />

              <span>
                <strong>
                  {isAdmin(member.role) && (
                    <img
                      className="inline-role-symbol"
                      src="/Admin-star.png"
                      alt=""
                    />
                  )}

                  {member.role === "SUPPORTER" && (
                    <img
                      className="inline-role-symbol"
                      src="/supporter-star.png"
                      alt=""
                    />
                  )}

                  {getName(member)}
                </strong>

                <small>
                  {member.role === "HEAD_ADMIN"
                    ? "Hauptadmin"
                    : member.role === "ADMIN"
                    ? "Admin"
                    : member.role === "SUPPORTER"
                    ? "Supporter"
                    : "Mitglied"}
                </small>
              </span>
            </button>

            <div
              className={
                `admin-member-status ${
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
          </div>

          <div className="admin-member-card-info">
            <div>
              <span>Rolle</span>
              <strong>
                {member.role === "HEAD_ADMIN" ? "Head Admin" : member.role === "ADMIN" ? "Admin" : member.role === "SUPPORTER" ? "Supporter" : "Mitglied"}
              </strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                {member.account_status === "SUSPENDED"
                  ? "Gesperrt"
                  : "Aktiv"}
              </strong>
            </div>

            <div>
              <span>Alter</span>
              <strong>
                {getAge(member.birth_date) ?? "—"}
              </strong>
            </div>
          </div>

          <div className="admin-member-card-actions">
            <button
              type="button"
              onClick={() => openMember(member)}
            >
              👤 Profil
            </button>

            {(isHeadAdmin(profile?.role) ||
              myAdminPermission("manage_roles")) && (
              <button
                type="button"
                onClick={async () => {
                  const { error } =
                    await supabase.rpc(
                      "admin_set_role",
                      {
                        target_user:
                          member.id,
                        new_role:
                          "SUPPORTER"
                      }
                    );

                  if (error) {
                    showNotice(
                      error.message
                    );
                    return;
                  }

                  showNotice(
                    "Supporter-Rolle wurde gespeichert."
                  );

                  await loadAll();
                }}
              >
                🟢 Supporter
              </button>
            )}

            {isHeadAdmin(profile?.role) && (
              <button
                type="button"
                onClick={async () => {
                  const { error } =
                    await supabase.rpc(
                      "admin_set_role",
                      {
                        target_user:
                          member.id,
                        new_role:
                          "ADMIN"
                      }
                    );

                  if (error) {
                    showNotice(
                      error.message
                    );
                    return;
                  }

                  showNotice(
                    "Admin-Rolle wurde gespeichert."
                  );

                  await loadAll();
                }}
              >
                ★ Admin
              </button>
            )}
          </div>
        </article>
      ))}

    {!members.length && (
      <div className="empty-card">
        Keine Mitglieder vorhanden.
      </div>
    )}
  </div>
</section>

              </section>
            )}

          </div>
        </main>
        </div>

        {/* =====================================================
            PROFIL MODAL
            ===================================================== */}

        {page === "logs" && isHeadAdmin(profile?.role) && (
          <section>
            <div className="page-heading">
              <div>
                <span className="eyebrow">HEAD ADMIN</span>
                <h1>Admin-Logbuch</h1>
                <p>Übersicht über wichtige Aktivitäten, Profiländerungen und offene Meldungen.</p>
              </div>
            </div>

            <div className="admin-log-grid">
              <article className="panel admin-log-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">AKTIVITÄTEN</span>
                    <h2>Letzte Änderungen</h2>
                  </div>
                  <button type="button" className="secondary" onClick={loadAll}>Aktualisieren</button>
                </div>

                {profileActivities.length === 0 ? (
                  <div className="empty-card">Noch keine Aktivitäten vorhanden.</div>
                ) : (
                  <div className="admin-log-list">
                    {profileActivities.slice(0, 40).map((item) => {
                      const actor = memberById(item.user_id || item.actor_id || item.profile_id);
                      return (
                        <div className="admin-log-row" key={item.id}>
                          <div>
                            <strong>{actor ? getName(actor) : "System"}</strong>
                            <span>{item.action || item.activity_type || item.type || "Profilaktivität"}</span>
                            {item.details && <small>{typeof item.details === "string" ? item.details : JSON.stringify(item.details)}</small>}
                          </div>
                          <time>{item.created_at ? new Date(item.created_at).toLocaleString("de-AT") : "—"}</time>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>

              <article className="panel admin-log-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">MODERATION</span>
                    <h2>Offene Meldungen</h2>
                  </div>
                  <strong>{reports.filter((item) => item.status === "PENDING").length}</strong>
                </div>

                {reports.filter((item) => item.status === "PENDING").length === 0 ? (
                  <div className="empty-card">Keine offenen Meldungen.</div>
                ) : (
                  <div className="admin-log-list">
                    {reports.filter((item) => item.status === "PENDING").map((item) => {
                      const target = memberById(item.reported_id || item.target_id || item.user_id);
                      return (
                        <button type="button" className="admin-report-row" key={item.id} onClick={() => setPage("admin")}>
                          <span>
                            <strong>{target ? getName(target) : "Gemeldetes Mitglied"}</strong>
                            <small>{item.reason || item.description || "Meldung ohne Begründung"}</small>
                          </span>
                          <em>Im Admin-Bereich öffnen →</em>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            </div>
          </section>
        )}

        {selectedMember && (

          <div
            className="modal-overlay"
            onClick={() =>
              setSelectedMember(null)
            }
          >

            <div
              className={`profile-modal ${
                selectedMember?.profile_layout === "compact"
                  ? "profile-layout-compact"
                  : selectedMember?.profile_layout === "showcase"
                  ? "profile-layout-showcase"
                  : ""
              }`}
              style={{
                "--profile-accent":
                  selectedMember?.profile_accent ||
                  "#ff6b25",
                background:
                  selectedMember?.profile_background ||
                  "#1a1e25"
              }}
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
                <section className="public-profile-data">

  <div className="public-profile-data-item">
    <span>Vorname</span>
    <strong>
      {selectedMember.first_name || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Nachname</span>
    <strong>
      {selectedMember.last_name || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Alter</span>
    <strong>
      {getAge(selectedMember.birth_date) !== null
        ? `${getAge(selectedMember.birth_date)} Jahre`
        : "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Geburtsdatum</span>
    <strong>
      {selectedMember.birth_date || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Geschlecht</span>
    <strong>
      {selectedMember.gender || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Wohnort</span>
    <strong>
      {selectedMember.location || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Interessen</span>
    <strong>
      {selectedMember.interests || "—"}
    </strong>
  </div>

  <div className="public-profile-data-item">
    <span>Website</span>
    <strong>
      {selectedMember.website || "—"}
    </strong>
  </div>

</section>

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

                <div className="profile-memberships-grid">
                  <section className="profile-membership-box">
                    <h3>💬 Forum</h3>
                    {selectedMemberGroups.length ? (
                      selectedMemberGroups.map((group) => (
                        <div className="profile-membership-card" key={group.id}>
                          {group.image_url && (
                            <img src={group.image_url} alt="" />
                          )}
                          <span>{group.name}</span>
                        </div>
                      ))
                    ) : (
                      <small>Noch keinem Forenbereich gefolgt.</small>
                    )}
                  </section>
                </div>
{isAdmin(profile?.role) &&
  selectedMember.id !== user.id && (
                
    <section className="profile-admin-tools">

      <div className="profile-admin-tools-title">
        <span>MODERATION</span>
        <h3>
          ★ Admin-Werkzeuge
        </h3>
      </div>

      <div className="profile-admin-tools-grid">

        {(isHeadAdmin(profile?.role) ||
          myAdminPermission("manage_media")) && (
          <button
            type="button"
            className="profile-admin-button danger"
            onClick={async () => {

              if (
                !window.confirm(
                  `Profilbild von ${getName(selectedMember)} löschen?`
                )
              ) {
                return;
              }

              const { error } =
                await supabase.rpc(
                  "admin_remove_profile_avatar",
                  {
                    target_user:
                      selectedMember.id
                  }
                );

              if (error) {
                showNotice(
                  error.message
                );
                return;
              }

              setSelectedMember(
                (current) =>
                  current
                    ? {
                        ...current,
                        avatar_url: null
                      }
                    : current
              );

              showNotice(
                "Profilbild wurde gelöscht."
              );

              await loadAll();
            }}
          >
            🖼 Profilbild löschen
          </button>
        )}

        {(isHeadAdmin(profile?.role) ||
          myAdminPermission("manage_roles")) && (
          <button
            type="button"
            className="profile-admin-button supporter"
            onClick={() => changeMemberRole(selectedMember, "SUPPORTER")}
          >
            🟢 Supporter ernennen
          </button>
        )}

       {isHeadAdmin(profile?.role) && (
  <button
    type="button"
    className="profile-admin-button admin"
    onClick={() => changeMemberRole(selectedMember, "ADMIN")}
  >
    ★ Zum Admin ernennen
  </button>
)}

{selectedMember.id !== user?.id &&
  selectedMember.role !== "MEMBER" &&
  selectedMember.role !== "HEAD_ADMIN" &&
  (isHeadAdmin(profile?.role) || myAdminPermission("manage_roles")) && (
    <button
      type="button"
      className="profile-admin-button remove-role"
      onClick={() => changeMemberRole(selectedMember, "MEMBER")}
    >
      ↩ Rolle entfernen · Zum Mitglied
    </button>
  )}
     </div>
    </section>
  )}

 {selectedMember.id !== user?.id && (
    <div className="profile-actions">
                    <button
                      className="primary-button"
                      onClick={() => {
                        setSelectedMember(null);
                        openChat(selectedMember);
                      }}
                    >
                      💬 Nachricht senden
                    </button>

                    <button
                      className="secondary-button"
                      onClick={() => requestFriend(selectedMember)}
                    >
                      {friendshipWith(selectedMember.id)?.status === "ACCEPTED"
                        ? "✓ Bereits befreundet"
                        : friendshipWith(selectedMember.id)?.status === "PENDING"
                        ? "⏳ Anfrage vorhanden"
                        : "🤝 Freundschaftsanfrage senden"}
                    </button>

                    {friendshipWith(selectedMember.id)?.status === "ACCEPTED" && (
                      <button
                        className="secondary-button remove-friend-button"
                        onClick={() => removeFriend(selectedMember)}
                      >
                        ✕ Freund entfernen
                      </button>
                    )}

                    <button
                      className="secondary-button"
                      onClick={() => blockUser(selectedMember)}
                    >
                      🚫 Nutzer blockieren
                    </button>

                    <button
                      className="danger-button"
                      onClick={() => reportUser(selectedMember)}
                    >
                      🚩 Nutzer melden
                    </button>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        <footer className="site-footer"><div className="footer-brand"><div className="text-logo">ENNSTAL CONNECT</div></div><div><strong>Rechtliches</strong><p>Alle rechtlichen Hinweise sind direkt in der Community aufrufbar.</p></div><div><strong>Support</strong><p>Fragen und Fehlermeldungen können direkt an das Admin-Team gesendet werden.</p></div><div className="footer-links"><button onClick={() => setPage("impressum")}>Impressum</button><button onClick={() => setPage("privacy")}>Datenschutzhinweise</button><button onClick={() => setPage("support")}>Support / Fehlermeldung</button>{isAdmin(profile?.role) && <button onClick={() => setPage("support-admin")}>Admin: Support-Anfragen</button>}</div></footer>
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
              {isFriend ? "♥" : "♡"}
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

function Auth({ login, register }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="auth-box">
      {mode === "login" ? (
        <form className="panel" onSubmit={login}>
          <h1>Anmelden</h1>

          <input
            name="email"
            type="email"
            placeholder="E-Mail *"
            required
          />

          <input
            name="password"
            type="password"
            placeholder="Passwort *"
            required
          />

          <button className="primary-button">
            Anmelden
          </button>

          <button
            type="button"
            className="text-button"
            onClick={() => setMode("register")}
          >
            Noch kein Konto? Jetzt registrieren
          </button>
        </form>
      ) : (
        <form className="panel" onSubmit={register}>
          <h1>Registrieren</h1>

          <input
            name="nickname"
            placeholder="Nickname *"
            minLength={3}
            maxLength={30}
            required
          />

          <input
            name="first_name"
            placeholder="Vorname *"
            required
          />

          <input
            name="last_name"
            placeholder="Nachname *"
            required
          />

          <label>Geburtsdatum *</label>
          <input
            name="birth_date"
            type="date"
            required
          />

          <label>Geschlecht *</label>
          <select name="gender" defaultValue="" required>
            <option value="" disabled>
              Bitte auswählen
            </option>
            <option value="männlich">Männlich</option>
            <option value="weiblich">Weiblich</option>
            <option value="divers">Divers</option>
          </select>

          <input
            name="email"
            type="email"
            placeholder="E-Mail *"
            required
          />

          <input
            name="password"
            type="password"
            minLength={6}
            placeholder="Passwort * (mind. 6 Zeichen)"
            required
          />

          <button className="primary-button">
            Konto erstellen
          </button>

          <button
            type="button"
            className="text-button"
            onClick={() => setMode("login")}
          >
            Bereits registriert? Anmelden
          </button>
        </form>
      )}
    </div>
  );
}
