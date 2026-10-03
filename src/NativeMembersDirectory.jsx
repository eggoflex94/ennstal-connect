import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const [regionId, setRegionId] = useState(profile?.home_region_id || "ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [memberType, setMemberType] = useState("ALL");
  const [newOnly, setNewOnly] = useState(false);
  const [regionalAssignments, setRegionalAssignments] = useState([]);
  const [presenceUpdates, setPresenceUpdates] = useState({});
  const [page, setPage] = useState(1);
  const defaultRegionApplied = useRef(Boolean(profile?.home_region_id));

  useEffect(() => {
    if (defaultRegionApplied.current) return;
    const preferredRegionId = profile?.home_region_id || activeRegion?.id;
    if (!preferredRegionId) return;
    setRegionId(preferredRegionId);
    defaultRegionApplied.current = true;
  }, [profile?.home_region_id, activeRegion?.id]);

  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase.channel("ec-native-member-presence")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new;
        if (!row?.id) return;
        const patch = {};
        ["is_online", "last_active_at", "last_seen_at", "hide_online_status", "presence_device"].forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(row, key)) patch[key] = row[key];
        });
        setPresenceUpdates((current) => ({ ...current, [row.id]: { ...(current[row.id] || {}), ...patch } }));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

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
  const liveMembers = useMemo(
    () => members.map((member) => ({ ...member, ...(presenceUpdates[member?.id] || {}) })),
    [members, presenceUpdates]
  );
  const homeRegionId = profile?.home_region_id || activeRegion?.id || null;
  const homeRegion = homeRegionId ? regionById[homeRegionId] : null;
  const onlineHomeMembers = useMemo(
    () => liveMembers.filter((member) =>
      member
      && member.account_status !== "SUSPENDED"
      && !member.is_test_account
      && member.home_region_id === homeRegionId
      && !member.hide_online_status
      && presenceOnline(member)
    ),
    [liveMembers, homeRegionId]
  );

  const regionalAdminByUser = useMemo(() => {
    const map = new Map();
    liveMembers.forEach((member) => {
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
  }, [liveMembers, regionalAssignments]);

  const isRegionalAdmin = (member) => {
    const assigned = regionalAdminByUser.get(member?.id);
    if (!assigned?.size) return false;
    if (!activeRegion?.id) return true;
    return assigned.has(activeRegion.id);
  };

  const roleStarSrc = (member) => isHeadAdmin(member) || isGlobalAdmin(member) || isRegionalAdmin(member) ? "/role-star-red.svg" : normalized(member?.role) === "MUNICIPALITY" ? "/role-star-green.svg" : isBusiness(member) ? "/role-star-blue.svg" : normalized(member?.role) === "SUPPORTER" ? "/supporter-star.svg" : null;

  const openMember = (member) => {
    if (!member?.id) return;
    onOpen?.(member);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groupRank = (member) => {
      if (isGlobalAdmin(member) || isRegionalAdmin(member)) return 1;
      if (normalized(member?.role) === "MUNICIPALITY") return 3;
      if (isBusiness(member)) return 2;
      if (normalized(member?.role) === "SUPPORTER") return 4;
      return 5;
    };
    return liveMembers
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || (!member.hide_online_status && presenceOnline(member)))
      .filter((member) => {
        if (memberType === "ALL") return true;
        if (memberType === "ADMIN") return isGlobalAdmin(member) || isRegionalAdmin(member);
        if (memberType === "MUNICIPALITY") return normalized(member?.role) === "MUNICIPALITY";
        if (memberType === "BUSINESS") return isBusiness(member);
        if (memberType === "SUPPORTER") return normalized(member?.role) === "SUPPORTER";
        return normalized(member?.role) === "MEMBER" && !isBusiness(member);
      })
      .filter((member) => {
        if (!newOnly) return true;
        const created = new Date(member?.created_at || 0).getTime();
        return Number.isFinite(created) && Date.now() - created <= 30 * 24 * 60 * 60 * 1000;
      })
      .filter((member) => {
        if (!q) return true;
        const region = regionById[member.home_region_id]?.name || "";
        const roleWord = isHeadAdmin(member) || member?.is_primary_head_admin ? "hauptadmin hauptverantwortlicher alle regionen" : isGlobalAdmin(member) || isRegionalAdmin(member) ? "admin" : normalized(member?.role) === "MUNICIPALITY" ? "gemeinde" : isBusiness(member) ? "unternehmer" : normalized(member?.role) === "SUPPORTER" ? "supporter" : "mitglied";
        const interests = Array.isArray(member?.interests) ? member.interests.join(" ") : String(member?.interests || "");
        return [member.nickname, member.first_name, member.last_name, member.location, member.company_name, interests, region, roleWord].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aRank = groupRank(a);
        const bRank = groupRank(b);
        if (aRank !== bRank) return aRank - bRank;
        return displayName(a).localeCompare(displayName(b), "de", { sensitivity: "base" });
      });
  }, [liveMembers, regionId, onlineOnly, memberType, newOnly, query, regionById, regionalAdminByUser, activeRegion?.id]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pagedVisible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, page]);

  useEffect(() => {
    setPage(1);
  }, [query, regionId, onlineOnly, memberType, newOnly, activeRegion?.id]);

  // Do not mutate React-owned member-directory children from effects.
  // Older cleanup code removed text/element nodes behind React's back, which
  // could make the next reconciliation fail with insertBefore NotFoundError.
  const regionMode = regionId === "ALL" ? "all" : "region";

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const showHomeRegionOnline = () => {
    if (!homeRegionId) return;
    setQuery("");
    setRegionId(homeRegionId);
    setOnlineOnly(true);
    setPage(1);
    window.requestAnimationFrame(() => {
      document.querySelector(".native-members-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const changePage = (nextPage) => {
    const safePage = Math.min(pageCount, Math.max(1, nextPage));
    setPage(safePage);
    window.requestAnimationFrame(() => {
      document.querySelector(".native-members-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return <section className="native-members-directory" data-region-mode={regionMode}>
    <div className="page-heading native-members-heading">
      <div><span className="eyebrow">COMMUNITY</span><h1>Mitglieder</h1><p>Nach Rollen und Namen sortiert.</p></div>
      <div className="native-members-heading-actions">
        <button
          type="button"
          className="native-members-online-summary"
          onClick={showHomeRegionOnline}
          disabled={!homeRegionId}
          title={homeRegion ? `Online-Mitglieder in ${homeRegion.name} anzeigen` : "Heimatregion noch nicht festgelegt"}
        >
          <span className="native-members-online-dot" aria-hidden="true" />
          <strong>{onlineHomeMembers.length} online</strong>
          <small>{homeRegion?.short_name || homeRegion?.name || "Heimatregion"}</small>
        </button>
        <div className="native-members-count"><strong>{visible.length} Treffer</strong>{visible.length > PAGE_SIZE && <small>Seite {page} von {pageCount}</small>}</div>
      </div>
    </div>


    <div className="native-member-search panel">
      <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, Ort, Interesse, Unternehmen oder Rolle suchen …" />
      <select value={regionId} onChange={(event) => setRegionId(event.target.value)} aria-label="Region auswählen">
        <option value="ALL">Alle Regionen</option>
        {regions.map((region) => <option value={region.id} key={region.id}>{region.name}</option>)}
      </select>
      <select value={memberType} onChange={(event) => setMemberType(event.target.value)} aria-label="Mitgliedertyp auswählen">
        <option value="ALL">Alle Typen</option>
        <option value="MEMBER">Mitglieder</option>
        <option value="BUSINESS">Unternehmenskonten</option>
        <option value="SUPPORTER">Supporter</option>
        <option value="MUNICIPALITY">Gemeinden</option>
        <option value="ADMIN">Administration</option>
      </select>
      <label><input type="checkbox" checked={onlineOnly} onChange={(event) => setOnlineOnly(event.target.checked)} /> Nur online</label>
      <label><input type="checkbox" checked={newOnly} onChange={(event) => setNewOnly(event.target.checked)} /> Neu seit 30 Tagen</label>
      <div className="native-member-quick-filters">
        <button type="button" className={regionId === "ALL" ? "active" : ""} onClick={() => setRegionId("ALL")}>Alle Regionen</button>
        {homeRegionId && <button type="button" className={regionId === homeRegionId && !onlineOnly ? "active" : ""} onClick={() => { setRegionId(homeRegionId); setOnlineOnly(false); }}>Heimatregion: {homeRegion?.short_name || homeRegion?.name || "Region"}</button>}
        {activeRegion?.id && activeRegion.id !== homeRegionId && <button type="button" className={regionId === activeRegion.id && !onlineOnly ? "active" : ""} onClick={() => { setRegionId(activeRegion.id); setOnlineOnly(false); }}>Aktuelle Region: {activeRegion.short_name || activeRegion.name}</button>}
        {(query || regionId === "ALL" || onlineOnly || memberType !== "ALL" || newOnly) && <button type="button" className="native-member-reset-filter" onClick={() => { setQuery(""); setRegionId(homeRegionId || "ALL"); setOnlineOnly(false); setMemberType("ALL"); setNewOnly(false); }}>Filter zurücksetzen</button>}
      </div>
    </div>

    <div className="member-grid native-member-grid">
      {pagedVisible.map((member) => {
        const headRegionLabel = regionById[member.home_region_id]?.name || "Hauptregion";
        const cardMember = member?.is_primary_head_admin
          ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member), directory_responsibility_label: `Hauptverantwortlich · zuständig für Region ${headRegionLabel}` }
          : isHeadAdmin(member)
            ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member), directory_responsibility_label: `Hauptverantwortlich · zuständig für Region ${headRegionLabel}` }
            : normalized(member?.role) === "ADMIN"
              ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member), directory_responsibility_label: "Global Admin · alle Regionen" }
              : isRegionalAdmin(member)
                ? { ...member, directory_admin: true, directory_role_star: roleStarSrc(member), directory_responsibility_label: `Regional Admin · zuständig für Region ${regionById[member.home_region_id]?.name || activeRegion?.name || "Hauptregion"}` }
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
