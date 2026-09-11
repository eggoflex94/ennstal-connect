import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

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
  const mobile = Boolean(member?.is_mobile_online || member?.mobile_online || member?.online_via_mobile || member?.presence === "MOBILE" || member?.presence === "mobile");
  if (member?.is_online) return { state: mobile ? "mobile" : "online", label: mobile ? "Mobil online" : "Online", detail: "" };
  const raw = member?.last_active_at || member?.last_seen_at || member?.last_online_at;
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

  const regionalAdminRegion = (member) => {
    const embedded = explicitRegionalRegions(member);
    if (embedded.length) {
      const active = activeRegion?.id ? embedded.find((region) => region.id === activeRegion.id) : null;
      const home = member?.home_region_id ? embedded.find((region) => region.id === member.home_region_id) : null;
      const picked = active || home || embedded[0];
      return picked?.name ? picked : regionById[picked?.id] || picked;
    }
    const ids = regionalAdminByUser.get(member?.id) || [];
    if (!ids.length) return null;
    const preferred = activeRegion?.id && ids.includes(activeRegion.id) ? activeRegion.id : member?.home_region_id && ids.includes(member.home_region_id) ? member.home_region_id : ids[0];
    return regionById[preferred] || { id: preferred };
  };
  const isRegionalAdmin = (member) => Boolean(regionalAdminRegion(member));
  const effectiveRoleLabel = (member) => {
    if (isHeadAdmin(member)) return "Hauptadmin";
    if (isGlobalAdmin(member)) return "Global Admin";
    const region = regionalAdminRegion(member);
    if (region) return `Regional Admin${region.short_name ? ` · ${region.short_name}` : region.name ? ` · ${region.name}` : ""}`;
    if (isBusiness(member)) return "Unternehmer";
    if (normalized(member?.role) === "SUPPORTER") return "Supporter";
    return "Mitglied";
  };
  const roleStarSrc = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "/role-star-red.svg" : isBusiness(member) ? "/role-star-blue.svg" : normalized(member?.role) === "SUPPORTER" ? "/supporter-star.svg" : null;
  const cardTone = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "admin" : isBusiness(member) ? "business" : normalized(member?.role) === "SUPPORTER" ? "supporter" : "member";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (member) => isHeadAdmin(member) ? 1 : isGlobalAdmin(member) ? 2 : regionalAdminByUser.has(member.id) || explicitRegionalRegions(member).length ? 3 : isBusiness(member) ? 4 : normalized(member?.role) === "SUPPORTER" ? 5 : 6;
    return members
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || member.is_online)
      .filter((member) => !q || [member.nickname, member.first_name, member.last_name, regionById[member.home_region_id]?.name, effectiveRoleLabel(member), isBusiness(member) ? "Unternehmer" : ""].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b), "de"));
  }, [members, regionId, onlineOnly, query, regionById, regionalAdminByUser, activeRegion?.id]);

  const openMember = (member) => {
    if (!member) return;
    if (onOpen) onOpen(member);
    else window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: member.id, nickname: member.nickname }, cancelable: true }));
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
        return <article className={`native-member-card native-member-card--${tone} panel${isSelf ? " is-self" : ""}`} key={member.id}>
          <button type="button" className="native-member-main" onClick={() => openMember(member)} aria-label={`${displayName(member)} Profil öffnen`}>
            <span className="native-member-avatar-wrap"><img src={member.avatar_url || DEFAULT_AVATAR} alt="" /><i className={member.is_online ? "online" : "offline"} /></span>
            <span className="native-member-copy">
              <strong>{displayName(member)}</strong>
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
