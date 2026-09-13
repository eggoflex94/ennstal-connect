import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { loadMemberProfile } from "./memberProfileLoader.js";
import MemberCardView from "./MemberCardView.jsx";

const normalized = (value) => String(value || "").trim().toUpperCase();
const displayName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
const isBusiness = (member) => member?.account_badge === "BUSINESS";
const isHeadAdmin = (member) => normalized(member?.role) === "HEAD_ADMIN";
const isGlobalAdmin = (member) => ["HEAD_ADMIN", "ADMIN", "GLOBAL_ADMIN"].includes(normalized(member?.role));

function explicitRegionalRegions(member) {
  if (Array.isArray(member?.regional_admin_regions)) return member.regional_admin_regions.filter(Boolean);
  if (Array.isArray(member?.regional_admin_region_ids)) return member.regional_admin_region_ids.filter(Boolean).map((id) => ({ id }));
  return [];
}

function presenceOnline(member) {
  if (!member?.is_online) return false;
  const raw = member?.last_active_at || member?.last_seen_at || member?.last_online_at;
  if (!raw) return true;
  const last = new Date(raw).getTime();
  return Number.isFinite(last) && Date.now() - last < 5 * 60 * 1000;
}

function viennaDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
}

function activeInfo(member) {
  const streak = Math.max(0, Number(member?.active_streak) || 0);
  const last = String(member?.last_daily_reward_date || "").slice(0, 10);
  const active = streak > 0 && (last === viennaDate(0) || last === viennaDate(-1));
  return { active, streak };
}

export default function NativeMembersDirectory({ members = [], regions = [], activeRegion, profile, friendships = [], onOpen }) {
  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [regionalAssignments, setRegionalAssignments] = useState([]);
  const [loadingMemberId, setLoadingMemberId] = useState(null);

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

  const regionalAdminByUser = useMemo(() => {
    const map = new Map();
    members.forEach((member) => {
      explicitRegionalRegions(member).forEach((region) => {
        if (!region?.id) return;
        if (!map.has(member.id)) map.set(member.id, new Set());
        map.get(member.id).add(region.id);
      });
    });
    regionalAssignments.forEach((assignment) => {
      if (!assignment?.user_id || !assignment?.region_id || assignment.active === false) return;
      if (!map.has(assignment.user_id)) map.set(assignment.user_id, new Set());
      map.get(assignment.user_id).add(assignment.region_id);
    });
    return map;
  }, [members, regionalAssignments]);

  const isRegionalAdmin = (member) => {
    const assigned = regionalAdminByUser.get(member?.id);
    if (!assigned?.size) return false;
    if (!activeRegion?.id) return true;
    return assigned.has(activeRegion.id);
  };

  const roleStarSrc = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "/role-star-red.svg" : isBusiness(member) ? "/role-star-blue.svg" : normalized(member?.role) === "SUPPORTER" ? "/supporter-star.svg" : null;

  const openFreshMember = async (member) => {
    if (!member?.id || loadingMemberId) return;
    setLoadingMemberId(member.id);
    try {
      const freshMember = await loadMemberProfile(member);
      onOpen?.(freshMember || member);
    } finally {
      setLoadingMemberId(null);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groupRank = (member) => {
      if (isGlobalAdmin(member) || isRegionalAdmin(member)) return 1;
      if (normalized(member?.role) === "SUPPORTER") return 2;
      if (isBusiness(member)) return 3;
      return 4;
    };
    return members
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || presenceOnline(member))
      .filter((member) => {
        if (!q) return true;
        const region = regionById[member.home_region_id]?.name || "";
        const roleWord = isGlobalAdmin(member) || isRegionalAdmin(member) ? "admin" : normalized(member?.role) === "SUPPORTER" ? "supporter" : isBusiness(member) ? "unternehmer" : "mitglied";
        const activityWord = activeInfo(member).active ? "aktiv" : "";
        return [member.nickname, member.first_name, member.last_name, region, roleWord, activityWord].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aRank = groupRank(a);
        const bRank = groupRank(b);
        if (aRank !== bRank) return aRank - bRank;
        const aActive = activeInfo(a);
        const bActive = activeInfo(b);
        if (aActive.active !== bActive.active) return aActive.active ? -1 : 1;
        if (aActive.streak !== bActive.streak) return bActive.streak - aActive.streak;
        return displayName(a).localeCompare(displayName(b), "de", { sensitivity: "base" });
      });
  }, [members, regionId, onlineOnly, query, regionById, regionalAdminByUser, activeRegion?.id]);

  return <section className="native-members-directory">
    <div className="page-heading native-members-heading">
      <div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Nach Rollen sortiert; aktive Mitglieder stehen innerhalb ihrer Rolle zuerst.</p></div>
      <strong>{visible.length} Treffer</strong>
    </div>

    {loadingMemberId && <small className="native-member-loading" aria-live="polite">Profil wird geladen …</small>}

    <div className="native-member-search panel">
      <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, Rolle, Aktivität oder Region suchen …" />
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

    <div className="member-grid native-member-grid">
      {visible.map((member) => {
        const cardMember = isRegionalAdmin(member) && !isGlobalAdmin(member)
          ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member) }
          : { ...member, directory_role_star: roleStarSrc(member) };
        return <MemberCardView
          key={member.id}
          member={cardMember}
          profile={profile}
          friendships={friendships}
          onOpen={openFreshMember}
        />;
      })}
      {!visible.length && <div className="empty-card">Keine Mitglieder für diese Auswahl gefunden.</div>}
    </div>
  </section>;
}
