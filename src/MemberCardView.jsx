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

function isVerified(member) {
  const role = String(member?.role || "").toUpperCase();
  return role === "HEAD_ADMIN" || role === "ADMIN" || member?.is_verified === true || member?.verified === true || String(member?.verification_status || "").toUpperCase() === "VERIFIED";
}

function rolePresentation(member) {
  const role = String(member?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN" || role === "ADMIN") {
    return { key: role === "HEAD_ADMIN" ? "head-admin" : "admin", theme: "admin", label: role === "HEAD_ADMIN" ? "Global Admin" : "Community Admin", star: "/role-star-red.svg" };
  }
  if (role === "SUPPORTER") return { key: "supporter", theme: "supporter", label: "Supporter", star: "/supporter-star.svg" };
  if (member?.account_badge === "BUSINESS") return { key: "business", theme: "business", label: "Unternehmenskonto", star: "/role-star-blue.svg" };
  return { key: "member", theme: "member", label: "Mitglied", star: "/role-star-member.svg" };
}

export default function MemberCardView({ member, profile, friendships, onOpen, onMessage }) {
  const presentation = rolePresentation(member);
  const friendship = friendships.find((item) => (item.requester_id === profile?.id && item.receiver_id === member.id) || (item.receiver_id === profile?.id && item.requester_id === member.id));
  const friend = friendship?.status === "ACCEPTED";
  const verified = isVerified(member);
  const online = isRecentlyActive(member);
  const fullName = [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || getName(member);
  const age = getAge(member.birth_date);
  const statusLabel = online ? (member.presence_device === "MOBILE" ? "Mobil online" : "Online") : "Offline";

  return (
    <article
      className={`member-card ${presentation.key} role-theme-${presentation.theme}`}
      data-role-theme={presentation.theme}
      onClick={() => onOpen(member)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(member);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Profil von ${getName(member)} öffnen`}
    >
      <span className={`ec-role-surface ec-role-surface-${presentation.theme}`} aria-hidden="true" />

      <div className="ec-card-badge-rail" aria-label="Profilkennzeichnungen">
        <span className={`ec-card-badge-icon ec-card-badge-role ec-card-badge-role-${presentation.theme}`} title={presentation.label}>
          <img src={presentation.star} alt="" aria-hidden="true" />
        </span>
        {friend && (
          <span className="ec-card-badge-icon ec-card-badge-friend" title="Befreundet">
            <img className="ec-pro-friend-badge ec-native-friend-badge" src="/badge-friendship.svg" alt="" aria-hidden="true" />
          </span>
        )}
        {verified && (
          <span className="ec-card-badge-icon ec-card-badge-verified" title="Verifiziert">
            <img className="ec-pro-verified-badge ec-native-verified-badge" src="/badge-verified.svg" alt="" aria-hidden="true" />
          </span>
        )}
      </div>

      <strong className={`member-nickname ec-native-nickname ${presentation.theme}`}>{getName(member)}</strong>

      <img
        className={`member-avatar ec-native-avatar ${presentation.theme}`}
        src={member.avatar_url || DEFAULT_AVATAR}
        alt={`Profilbild von ${getName(member)}`}
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.src = DEFAULT_AVATAR; }}
      />

      <div className="member-meta ec-member-meta">
        <div className="member-name ec-native-member-name">
          <span className="ec-member-realname">{fullName}</span>
          {age !== null && <small className="ec-member-age">({age} Jahre)</small>}
        </div>

        {!member.hide_online_status && (
          <div className={`member-status ${online ? "online" : "offline"}`}>
            <div className="ec-member-presence-line">
              <span className="ec-member-presence-dot" aria-hidden="true" />
              <span className="ec-member-presence-label">{statusLabel}</span>
            </div>
            {!online && member.last_active_at && (
              <small className="ec-member-last-active">zuletzt aktiv {new Date(member.last_active_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</small>
            )}
          </div>
        )}
      </div>

      {member.id !== profile?.id && (
        <button
          className="member-message"
          type="button"
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
