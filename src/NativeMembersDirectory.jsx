import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import MemberCardView from "./MemberCardView.jsx";

const PAGE_SIZE = 30;
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

export default function NativeMembersDirectory({ members = [], regions = [], activeRegion, profile, friendships = [], onOpen }) {
  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [regionalAssignments, setRegionalAssignments] = useState([]);
  const [page, setPage] = useState(1);

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

  const roleStarSrc = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "/role-star-red.svg" : isBusiness(member) ? "/role-star-blue.svg" : normalized(member?.role) === "MUNICIPALITY" ? "/role-star-green.svg" : normalized(member?.role) === "SUPPORTER" ? "/supporter-star.svg" : null;

  const openMember = (member) => {
    if (!member?.id) return;
    onOpen?.(member);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groupRank = (member) => {
      if (isGlobalAdmin(member) || isRegionalAdmin(member)) return 1;
      if (isBusiness(member)) return 2;
      if (normalized(member?.role) === "MUNICIPALITY") return 3;
      if (normalized(member?.role) === "SUPPORTER") return 4;
      return 5;
    };
    return members
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || presenceOnline(member))
      .filter((member) => {
        if (!q) return true;
        const region = regionById[member.home_region_id]?.name || "";
        const roleWord = isGlobalAdmin(member) || isRegionalAdmin(member) ? "admin" : isBusiness(member) ? "unternehmer" : normalized(member?.role) === "MUNICIPALITY" ? "gemeinde" : normalized(member?.role) === "SUPPORTER" ? "supporter" : "mitglied";
        return [member.nickname, member.first_name, member.last_name, region, roleWord].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aRank = groupRank(a);
        const bRank = groupRank(b);
        if (aRank !== bRank) return aRank - bRank;
        return displayName(a).localeCompare(displayName(b), "de", { sensitivity: "base" });
      });
  }, [members, regionId, onlineOnly, query, regionById, regionalAdminByUser, activeRegion?.id]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pagedVisible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, page]);

  useEffect(() => {
    setPage(1);
  }, [query, regionId, onlineOnly, activeRegion?.id]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const changePage = (nextPage) => {
    const safePage = Math.min(pageCount, Math.max(1, nextPage));
    setPage(safePage);
    window.requestAnimationFrame(() => {
      document.querySelector(".native-members-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return <section className="native-members-directory">
    <div className="page-heading native-members-heading">
      <div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Nach Rollen und Namen sortiert.</p></div>
      <div className="native-members-count"><strong>{visible.length} Treffer</strong>{visible.length > PAGE_SIZE && <small>Seite {page} von {pageCount}</small>}</div>
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

    <div className="member-grid native-member-grid">
      {pagedVisible.map((member) => {
        const cardMember = isRegionalAdmin(member) && !isGlobalAdmin(member)
          ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member) }
          : { ...member, directory_role_star: roleStarSrc(member) };
        return <MemberCardView
          key={member.id}
          member={cardMember}
          profile={profile}
          friendships={friendships}
          onOpen={openMember}
        />;
      })}
      {!visible.length && <div className="empty-card">Keine Mitglieder für diese Auswahl gefunden.</div>}
    </div>

    {pageCount > 1 && <nav className="native-members-pagination" aria-label="Mitgliederseiten">
      <button type="button" onClick={() => changePage(page - 1)} disabled={page === 1}>← Zurück</button>
      <div className="native-members-page-numbers">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) =>
          <button
            type="button"
            key={pageNumber}
            className={pageNumber === page ? "active" : ""}
            aria-current={pageNumber === page ? "page" : undefined}
            onClick={() => changePage(pageNumber)}
          >
            {pageNumber}
          </button>
        )}
      </div>
      <button type="button" onClick={() => changePage(page + 1)} disabled={page === pageCount}>Weiter →</button>
    </nav>}
  </section>;
}
