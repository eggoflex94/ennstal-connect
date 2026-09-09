import React, { useMemo, useState } from "react";

const DEFAULT_AVATAR = "/community-default-avatar.png";
const roleLabel = (role) => role === "HEAD_ADMIN" ? "Hauptadmin" : role === "ADMIN" ? "Community Admin" : role === "SUPPORTER" ? "Supporter" : "Mitglied";
const displayName = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
const isBusiness = (member) => member?.account_badge === "BUSINESS";
const roleStarSrc = (member) => member?.role === "HEAD_ADMIN" || member?.role === "ADMIN" ? "/role-star-red.svg" : member?.role === "SUPPORTER" ? "/supporter-star.svg" : isBusiness(member) ? "/role-star-blue.svg" : null;
const cardTone = (member) => member?.role === "HEAD_ADMIN" || member?.role === "ADMIN" ? "admin" : member?.role === "SUPPORTER" ? "supporter" : isBusiness(member) ? "business" : "member";

function presenceFor(member) {
  const mobile = Boolean(member?.is_mobile_online || member?.mobile_online || member?.online_via_mobile || member?.presence === "MOBILE" || member?.presence === "mobile");
  if (member?.is_online) return { state: mobile ? "mobile" : "online", label: "Online", detail: mobile ? "am Handy" : "" };
  const raw = member?.last_active_at || member?.last_seen_at || member?.last_online_at;
  if (!raw) return { state: "offline", label: "Offline", detail: "" };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { state: "offline", label: "Offline", detail: "" };
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return { state: "offline", label: "Offline", detail: `zuletzt vor ${minutes} Min.` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { state: "offline", label: "Offline", detail: `zuletzt vor ${hours} Std.` };
  const days = Math.floor(hours / 24);
  return { state: "offline", label: "Offline", detail: `zuletzt vor ${days} Tag${days === 1 ? "" : "en"}` };
}

export default function NativeMembersDirectory({ members = [], regions = [], activeRegion, profile, friendships = [], onOpen, onMessage }) {
  const [query, setQuery] = useState("");
  const [regionId, setRegionId] = useState("ALL");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const regionById = useMemo(() => Object.fromEntries(regions.map((region) => [region.id, region])), [regions]);
  const acceptedFriendIds = useMemo(() => new Set(friendships.filter((item) => item.status === "ACCEPTED").map((item) => item.requester_id === profile?.id ? item.receiver_id : item.requester_id)), [friendships, profile?.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (member) => member.role === "HEAD_ADMIN" ? 1 : member.role === "ADMIN" ? 2 : member.role === "SUPPORTER" ? 3 : isBusiness(member) ? 4 : 5;
    return members
      .filter((member) => member && member.account_status !== "SUSPENDED" && !member.is_test_account)
      .filter((member) => regionId === "ALL" || member.home_region_id === regionId)
      .filter((member) => !onlineOnly || member.is_online)
      .filter((member) => !q || [member.nickname, member.first_name, member.last_name, regionById[member.home_region_id]?.name, roleLabel(member.role), isBusiness(member) ? "Unternehmer" : ""].filter(Boolean).join(" ").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b), "de"));
  }, [members, regionId, onlineOnly, query, regionById]);

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
        return <article className={`native-member-card native-member-card--${tone} panel${isSelf ? " is-self" : ""}`} key={member.id}>
          <button type="button" className="native-member-main" onClick={() => onOpen?.(member)}>
            <span className="native-member-avatar-wrap"><img src={member.avatar_url || DEFAULT_AVATAR} alt="" /><i className={member.is_online ? "online" : "offline"} /></span>
            <span className="native-member-copy">
              <strong>{displayName(member)}</strong>
              <span className="native-member-badges">
                {star && <span className="native-member-role-badge"><img src={star} alt="" aria-hidden="true"/>{isBusiness(member) && !["HEAD_ADMIN","ADMIN","SUPPORTER"].includes(member.role) ? "Unternehmer" : roleLabel(member.role)}</span>}
                {!star && <span className="native-member-member-badge">Mitglied</span>}
                {isFriend && <span className="native-member-friend-badge">Freund</span>}
              </span>
              <em>{region?.name || "Region nicht angegeben"}</em>
            </span>
          </button>
          <div className="native-member-footer">
            <span className={`native-member-presence native-member-presence--${presence.state}`}><i/><span><b>{presence.label}</b>{presence.detail && <small>{presence.detail}</small>}</span></span>
            <div className={`native-member-actions${isSelf ? " native-member-actions-self" : ""}`}>
              <button type="button" className="secondary-button" onClick={() => onOpen?.(member)}>{isSelf ? "Mein Profil" : "Profil"}</button>
              {!isSelf && <button type="button" className="primary-button" onClick={() => onMessage?.(member)}>Nachricht</button>}
            </div>
          </div>
        </article>;
      })}
      {!visible.length && <div className="empty-card">Keine Mitglieder für diese Auswahl gefunden.</div>}
    </div>
  </section>;
}
