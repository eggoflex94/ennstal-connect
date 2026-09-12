import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { loadMemberProfile } from "./memberProfileLoader.js";

const DEFAULT_AVATAR = "/community-default-avatar.png";
const ADMIN_ROLES = new Set(["HEAD_ADMIN", "ADMIN", "GLOBAL_ADMIN", "REGIONAL_ADMIN"]);
const normalized = (value) => String(value || "").trim().toUpperCase();
const displayName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
const isBusiness = (member) => member?.account_badge === "BUSINESS";
const isGlobalAdmin = (member) => normalized(member?.role) === "ADMIN" || normalized(member?.role) === "GLOBAL_ADMIN" || normalized(member?.nickname) === "ROLAND";
const isHeadAdmin = (member) => normalized(member?.role) === "HEAD_ADMIN";

function explicitRegionalRegions(member) {
  if (Array.isArray(member?.regional_admin_regions)) return member.regional_admin_regions.filter(Boolean);
  if (Array.isArray(member?.regional_admin_region_ids)) return member.regional_admin_region_ids.filter(Boolean).map((id) => ({ id }));
  return [];
}

function isAdminMember(member) {
  const role = normalized(member?.role);
  const adminRole = normalized(member?.admin_role || member?.admin_level || member?.admin_type || member?.admin_scope || member?.scope);
  const explicitAdmin = ADMIN_ROLES.has(role) || ["GLOBAL_ADMIN", "REGIONAL_ADMIN", "GLOBAL", "REGIONAL"].includes(adminRole);
  const flags = Boolean(member?.is_global_admin || member?.is_regional_admin || member?.global_admin || member?.regional_admin || member?.community_admin);
  return explicitAdmin || flags || explicitRegionalRegions(member).length > 0 || normalized(member?.nickname) === "ROLAND";
}

function presenceFor(member) {
  const device = normalized(member?.presence_device || member?.presence);
  const mobile = device === "MOBILE" || Boolean(member?.is_mobile_online || member?.mobile_online || member?.online_via_mobile);
  const raw = member?.last_active_at || member?.last_seen_at || member?.last_online_at;
  const lastActive = raw ? new Date(raw).getTime() : NaN;
  const recentlyActive = Number.isFinite(lastActive) && Date.now() - lastActive < 5 * 60 * 1000;
  const online = Boolean(member?.is_online && (!raw || recentlyActive));
  if (online) return { state: mobile ? "mobile" : "online", label: mobile ? "Mobil online" : "Online", detail: "" };
  if (!raw) return { state: "offline", label: "Offline", detail: "" };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { state: "offline", label: "Offline", detail: "" };
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return { state: "offline", label: "Offline", detail: `vor ${minutes} Min.` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { state: "offline", label: "Offline", detail: `vor ${hours} Std.` };
  const days = Math.floor(hours / 24);
  return { state: "offline", label: "Offline", detail: `vor ${days} Tag${days === 1 ? "" : "en"}` };
}

export default function NativeMembersDirectory({ members = [], regions = [], activeRegion, profile, friendships = [], onOpen }) {
  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [regionalAssignments, setRegionalAssignments] = useState([]);
  const [openingMemberId, setOpeningMemberId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadAssignments = async () => {
      const { data, error } = await supabase
        .from("regional_admin_assignments")
        .select("user_id,region_id,active")
        .eq("active", true);
      if (!cancelled && !error) setRegionalAssignments(data || []);
    };
    void loadAssignments();
    const refresh = () => void loadAssignments();
    window.addEventListener("ec:region-change", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ec:region-change", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const regionById = useMemo(() => Object.fromEntries(regions.map((region) => [region.id, region])), [regions]);
  const acceptedFriendIds = useMemo(() => new Set(friendships.filter((item) => normalized(item.status) === "ACCEPTED").map((item) => item.requester_id === profile?.id ? item.receiver_id : item.requester_id)), [friendships, profile?.id]);
  const regionalAdminByUser = useMemo(() => {
    const map = new Map();
    members.forEach((member) => {
      explicitRegionalRegions(member).forEach((region) => {
        const id = region?.id;
        if (!id) return;
        if (!map.has(member.id)) map.set(member.id, []);
        if (!map.get(member.id).includes(id)) map.get(member.id).push(id);
      });
    });
    regionalAssignments.forEach((assignment) => {
      if (!assignment?.user_id || !assignment?.region_id || assignment.active === false) return;
      if (!map.has(assignment.user_id)) map.set(assignment.user_id, []);
      if (!map.get(assignment.user_id).includes(assignment.region_id)) map.get(assignment.user_id).push(assignment.region_id);
    });
    return map;
  }, [members, regionalAssignments]);

  const assignedRegionalIds = (member) => {
    const ids = new Set(explicitRegionalRegions(member).map((region) => region?.id).filter(Boolean));
    (regionalAdminByUser.get(member?.id) || []).forEach((id) => ids.add(id));
    return [...ids];
  };
  const hasRegionalAssignment = (member) => assignedRegionalIds(member).length > 0;
  const regionalAdminRegion = (member) => {
    if (!activeRegion?.id) return null;
    const ids = assignedRegionalIds(member);
    if (!ids.includes(activeRegion.id)) return null;
    const embedded = explicitRegionalRegions(member).find((region) => region?.id === activeRegion.id);
    return embedded?.name ? embedded : regionById[activeRegion.id] || embedded || { id: activeRegion.id };
  };
  const isRegionalAdmin = (member) => Boolean(regionalAdminRegion(member));
  const isSupporterPresentation = (member) => normalized(member?.role) === "SUPPORTER" || hasRegionalAssignment(member);
  const effectiveRoleLabel = (member) => {
    if (isHeadAdmin(member)) return "Hauptadmin";
    if (isGlobalAdmin(member)) return "Global Admin";
    const region = regionalAdminRegion(member);
    if (region) return `Regional Admin${region.short_name ? ` · ${region.short_name}` : region.name ? ` · ${region.name}` : ""}`;
    if (isBusiness(member)) return "Unternehmer";
    if (isSupporterPresentation(member)) return "Supporter";
    return "Mitglied";
  };
  const roleStarSrc = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "/role-star-red.svg" : isBusiness(member) ? "/role-star-blue.svg" : normalized(member?.role) === "SUPPORTER" ? "/supporter-star.svg" : null;
  const cardTone = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "admin" : isBusiness(member) ? "business" : isSupporterPresentation(member) ? "supporter" : "member";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (member) => isHeadAdmin(member) ? 1 : isGlobalAdmin(member) ? 2 : isRegionalAdmin(member) ? 3 : isBusiness(member) ? 4 : isSupporterPresentation(member) ? 5 : 6;
    return members
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || presenceFor(member).state !== "offline")
      .filter((member) => !q || [member.nickname, member.first_name, member.last_name, regionById[member.home_region_id]?.name, effectiveRoleLabel(member), isBusiness(member) ? "Unternehmer" : ""].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b), "de"));
  }, [members, regionId, onlineOnly, query, regionById, regionalAdminByUser, activeRegion?.id]);

  const openMember = async (member) => {
    if (!member || openingMemberId) return;
    setOpeningMemberId(member.id);
    try {
      const freshMember = await loadMemberProfile(member);
      if (onOpen) onOpen(freshMember || member);
      else window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: member.id, nickname: member.nickname }, cancelable: true }));
    } finally {
      setOpeningMemberId(null);
    }
  };

  return <section className="native-members-directory">
    <div className="page-heading native-members-heading">
      <div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Finde Mitglieder in allen Regionen oder grenze die Suche gezielt ein.</p></div>
      <strong>{visible.length} Treffer</strong>
    </div>

    <div className="native-member-search panel">
      <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, Rolle oder Region suchen …" />
      <select value={regionId} onChange={(event) => setRegionId(event.target.value)} aria-label="Region auswählen">
        <option value="ALL">Alle Regionen</option>
        {regions.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}
      </select>
      <label><input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} /> Nur online</label>
      <div className="native-member-quick-filters">
        <button type="button" className={regionId === "ALL" ? "active" : ""} onClick={() => setRegionId("ALL")}>Alle Regionen</button>
        {activeRegion?.id && <button type="button" className={regionId === activeRegion.id ? "active" : ""} onClick={() => setRegionId(activeRegion.id)}>Aktuelle Region: {activeRegion.short_name || activeRegion.name}</button>}
      </div>
    </div>

    <div className="native-member-grid">
      {visible.map((member) => {
        const region = regionById[member.home_region_id];
        const isFriend = acceptedFriendIds.has(member.id);
        const isSelf = member.id === profile?.id;
        const presence = presenceFor(member);
        const star = roleStarSrc(member);
        const tone = cardTone(member);
        const label = effectiveRoleLabel(member);
        const opening = openingMemberId === member.id;
        return <article className={`native-member-card native-member-card--${tone} panel${isSelf ? " is-self" : ""}${opening ? " is-opening" : ""}`} key={member.id} data-member-id={member.id}>
          <button type="button" className="native-member-main" onClick={() => void openMember(member)} aria-label={`${displayName(member)} Profil öffnen`} aria-busy={opening} disabled={Boolean(openingMemberId && !opening)}>
            <span className="native-member-avatar-wrap"><img src={member.avatar_url || DEFAULT_AVATAR} alt="" /><i className={presence.state !== "offline" ? "online" : "offline"} /></span>
            <span className="native-member-copy">
              <strong>{opening ? "Profil wird geladen …" : displayName(member)}</strong>
              <span className="native-member-badges">
                {star && <span className="native-member-role-badge"><img src={star} alt="" aria-hidden="true"/>{isBusiness(member) && !isAdminMember(member) && !isRegionalAdmin(member) ? "Unternehmer" : label}</span>}
                {!star && <span className="native-member-member-badge">Mitglied</span>}
                {isFriend && <span className="native-member-friend-badge" title="Befreundet" aria-label="Befreundet"><img src="/badge-friend.svg?v=20260910c" alt="" aria-hidden="true" /></span>}
              </span>
              <em>{region?.name || "Region nicht angegeben"}</em>
            </span>
          </button>
          <div className="native-member-footer">
            <span className={`native-member-presence native-member-presence--${presence.state}`}><i/><span><b>{presence.label}</b>{presence.detail && <small>{presence.detail}</small>}</span></span>
          </div>
        </article>;
      })}
      {!visible.length && <div className="empty-card">Keine Mitglieder für diese Auswahl gefunden.</div>}
    </div>
  </section>;
}
