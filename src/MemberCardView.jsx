import { useState } from "react";
import { loadMemberProfile } from "./memberProfileLoader.js";

const DEFAULT_AVATAR = "/community-default-avatar.png";

function getAge(date) {
  if (!date) return null;
  const birth = new Date(date);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

function getName(member) {
  return member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || "Mitglied";
}

function isRecentlyActive(member) {
  if (!member?.is_online || !member?.last_active_at) return false;
  const lastActive = new Date(member.last_active_at).getTime();
  return Number.isFinite(lastActive) && Date.now() - lastActive < 5 * 60 * 1000;
}

function rewardDateKey(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
}

function activeMemberInfo(member) {
  const streak = Math.max(0, Number(member?.active_streak) || 0);
  const last = rewardDateKey(member?.last_daily_reward_date);
  if (!streak || !last) return { active: false, streak: 0 };
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = yesterdayDate.toLocaleDateString("en-CA", { timeZone: "Europe/Vienna" });
  return { active: last === today || last === yesterday, streak };
}

function rolePresentation(member) {
  const role = String(member?.role || "MEMBER").toUpperCase();
  const adminPresentation = ["HEAD_ADMIN", "ADMIN", "GLOBAL_ADMIN", "REGIONAL_ADMIN"].includes(role) || member?.directory_admin === true;
  if (adminPresentation) {
    return { key: role === "HEAD_ADMIN" ? "head-admin" : "admin", theme: "admin", label: role === "HEAD_ADMIN" ? "Hauptadmin" : "Admin", star: "/role-star-red.svg" };
  }
  if (role === "SUPPORTER") return { key: "supporter", theme: "supporter", label: "Supporter", star: "/supporter-star.svg" };
  if (member?.account_badge === "BUSINESS") return { key: "business", theme: "business", label: "Unternehmer", star: "/role-star-blue.svg" };
  return { key: "member", theme: "member", label: "Mitglied", star: null };
}

export default function MemberCardView({ member, profile, friendships, onOpen, interactive = true }) {
  const [opening, setOpening] = useState(false);
  const presentation = rolePresentation(member);
  const baseRole = String(member?.role || "MEMBER").toUpperCase();
  const friendship = (friendships || []).find((item) => (item.requester_id === profile?.id && item.receiver_id === member.id) || (item.receiver_id === profile?.id && item.requester_id === member.id));
  const friend = friendship?.status === "ACCEPTED";
  const online = isRecentlyActive(member);
  const activeInfo = activeMemberInfo(member);
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || getName(member);
  const age = getAge(member.birth_date);
  const statusLabel = online ? "Online" : "Offline";

  const openFresh = async () => {
    if (!interactive || opening) return;
    setOpening(true);
    try {
      const freshMember = await loadMemberProfile(member);
      if (onOpen) onOpen(freshMember || member);
    } finally {
      setOpening(false);
    }
  };

  return (
    <article
      className={`member-card ${presentation.key} role-theme-${presentation.theme}${activeInfo.active ? " ec-active-member" : ""}${opening ? " is-opening" : ""}`}
      data-member-id={member.id}
      data-base-role={baseRole}
      data-home-region-id={member.home_region_id || ""}
      data-role-theme={presentation.theme}
      data-active-streak={activeInfo.streak}
      onClick={interactive ? () => void openFresh() : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void openFresh();
        }
      } : undefined}
      role={interactive ? "button" : "group"}
      tabIndex={interactive ? 0 : undefined}
      aria-busy={interactive ? opening : undefined}
      aria-label={interactive ? `Profil von ${getName(member)} öffnen` : `Vorschau der Mitgliederkarte von ${getName(member)}`}
    >
      <span className={`ec-role-surface ec-role-surface-${presentation.theme}`} aria-hidden="true" />

      <div className="ec-card-badge-rail" aria-label="Profilkennzeichnungen">
        {presentation.star && (
          <span className={`ec-card-badge-icon ec-card-badge-role ec-card-badge-role-${presentation.theme}`} title={presentation.label} aria-label={presentation.label}>
            <img className="ec-card-badge-img ec-card-badge-role-img" src={presentation.star} alt="" aria-hidden="true" />
          </span>
        )}
        {activeInfo.active && (
          <span className="ec-card-badge-icon ec-card-badge-active" title={`Aktives Mitglied · ${activeInfo.streak} Tag${activeInfo.streak === 1 ? "" : "e"}`} aria-label={`Aktives Mitglied, ${activeInfo.streak} Tage Serie`}>
            <span aria-hidden="true">🔥</span>
          </span>
        )}
        {friend && (
          <span className="ec-card-badge-icon ec-card-badge-friend" title="Befreundet" aria-label="Befreundet">
            <img className="ec-card-badge-img ec-card-badge-friend-img" src="/badge-friendship.svg" alt="" aria-hidden="true" />
          </span>
        )}
      </div>

      <strong className={`member-nickname ec-native-nickname ${presentation.theme}`}>
        {opening ? "Profil wird geladen …" : getName(member)}
      </strong>

      <div className="ec-member-avatar-wrap">
        <img
          className={`member-avatar ec-native-avatar ${presentation.theme}`}
          src={member.avatar_url || DEFAULT_AVATAR}
          alt={`Profilbild von ${getName(member)}`}
          loading="lazy"
          decoding="async"
          onError={(event) => { event.currentTarget.onerror = null; if (!event.currentTarget.src.endsWith(DEFAULT_AVATAR)) event.currentTarget.src = DEFAULT_AVATAR; }}
        />
        {!member.hide_online_status && <span className={`ec-avatar-presence ${online ? "online" : "offline"}`} aria-hidden="true" />}
      </div>

      <div className="member-meta ec-member-meta">
        <div className="member-name ec-native-member-name">
          <span className="ec-member-realname">{fullName}</span>
          {age !== null && <small className="ec-member-age">{age} Jahre</small>}
        </div>
        {activeInfo.active && <span className="ec-active-member-label">🔥 Aktiv · {activeInfo.streak} Tag{activeInfo.streak === 1 ? "" : "e"}</span>}
      </div>

      {!member.hide_online_status && (
        <div className={`member-status ${online ? "online" : "offline"}`}>
          <div className="ec-member-presence-line">
            <span className="ec-member-presence-dot" aria-hidden="true" />
            <span className="ec-member-presence-label">{statusLabel}</span>
          </div>
        </div>
      )}
    </article>
  );
}
