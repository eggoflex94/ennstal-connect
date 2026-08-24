import React, { useEffect, useMemo, useState } from "react";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";

function getName(member) {
  if (!member) return "Mitglied";

  return (
    member.nickname ||
    [member.first_name, member.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Mitglied"
  );
}

function getRoleLabel(role) {
  switch (role) {
    case "HEAD_ADMIN":
      return "Hauptadmin";
    case "ADMIN":
      return "Admin";
    case "SUPPORTER":
      return "Supporter";
    default:
      return "Mitglied";
  }
}

function formatDate(date) {
  if (!date) return "–";

  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return "–";
  }
}

function getAge(birthDate) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  const month =
    today.getMonth() - birth.getMonth();

  if (
    month < 0 ||
    (month === 0 &&
      today.getDate() < birth.getDate())
  ) {
    age--;
  }

  return age;
}

export default function ProfileView({
  profile,
  currentUser,
  members = [],
  friendships = [],
  messages = [],
  activities = [],
  visits = [],
  onSave,
  onBack,
  onOpenMember,
  onMessage,
  onAddFriend,
  onRemoveFriend,
  onBlock,
  onReport,
}) {
  const [activeTab, setActiveTab] =
    useState("about");

  const [editing, setEditing] =
    useState(false);

  const [draft, setDraft] =
    useState(profile || {});

  useEffect(() => {
    setDraft(profile || {});
    setEditing(false);
  }, [profile?.id]);

  const isOwnProfile =
    currentUser?.id === profile?.id;

  const displayName = getName(profile);

  const age = getAge(profile?.birth_date);

  const roleLabel = getRoleLabel(profile?.role);

  const profileFriends = useMemo(() => {
    if (!profile?.id) return [];

    const friendIds = friendships
      .filter(
        (item) =>
          item.status === "ACCEPTED" &&
          (
            item.requester_id === profile.id ||
            item.receiver_id === profile.id
          )
      )
      .map((item) =>
        item.requester_id === profile.id
          ? item.receiver_id
          : item.requester_id
      );

    return members.filter((member) =>
      friendIds.includes(member.id)
    );
  }, [profile?.id, friendships, members]);

  const profileMessages = useMemo(() => {
    if (!profile?.id) return [];

    return messages.filter(
      (message) =>
        message.sender_id === profile.id ||
        message.receiver_id === profile.id
    );
  }, [messages, profile?.id]);

  const profileActivities = useMemo(() => {
    if (!profile?.id) return [];

    return activities.filter(
      (activity) =>
        activity.user_id === profile.id ||
        activity.profile_id === profile.id
    );
  }, [activities, profile?.id]);

  const relationship = useMemo(() => {
    if (!currentUser?.id || !profile?.id) {
      return null;
    }

    return friendships.find(
      (item) =>
        (
          item.requester_id === currentUser.id &&
          item.receiver_id === profile.id
        ) ||
        (
          item.receiver_id === currentUser.id &&
          item.requester_id === profile.id
        )
    );
  }, [
    friendships,
    currentUser?.id,
    profile?.id,
  ]);

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile() {
    if (!draft?.nickname?.trim()) {
      window.alert(
        "Bitte gib einen Nickname ein."
      );
      return;
    }

    if (typeof onSave === "function") {
      await onSave(draft);
    }

    setEditing(false);
  }

  if (!profile) {
    return (
      <div className="ec-profile-empty">
        Profil konnte nicht geladen werden.
      </div>
    );
  }

  return (
    <div
      className="ec-profile-page"
      style={{
        "--profile-accent":
          profile.profile_accent || "#ff6a00",
        "--profile-background":
          profile.profile_background || "#17212c",
        "--nickname-color":
          profile.nickname_color || "#ffffff",
      }}
    >
      <section className="ec-profile-header">
        <div className="ec-profile-header-main">
          <div className="ec-avatar-wrap">
            <img
              src={
                profile.avatar_url ||
                DEFAULT_AVATAR
              }
              alt={displayName}
              className="ec-profile-avatar"
              onError={(event) => {
                event.currentTarget.src =
                  DEFAULT_AVATAR;
              }}
            />

            <span
              className={
                profile.is_online
                  ? "ec-online-dot online"
                  : "ec-online-dot"
              }
            />
          </div>

          <div className="ec-profile-title">
            <div className="ec-name-row">
              <h1>{displayName}</h1>

              {profile.role ===
                "HEAD_ADMIN" && (
                <span className="ec-role-icon">
                  ★
                </span>
              )}

              {profile.role === "ADMIN" && (
                <span className="ec-role-icon">
                  ★
                </span>
              )}

              {profile.role ===
                "SUPPORTER" && (
                <span className="ec-supporter-icon">
                  ★
                </span>
              )}
            </div>

            <div className="ec-role">
              {profile.role ===
                "HEAD_ADMIN" && "👑 "}

              {profile.role === "ADMIN" &&
                "🛡️ "}

              {profile.role ===
                "SUPPORTER" && "💚 "}

              {roleLabel}
            </div>

            <div
              className={
                profile.is_online
                  ? "ec-status online"
                  : "ec-status"
              }
            >
              <span />
              {profile.is_online
                ? "Online"
                : "Offline"}
            </div>
          </div>
        </div>

        <div className="ec-profile-actions">
          {isOwnProfile ? (
            <>
              <button
                type="button"
                className="ec-main-button"
                onClick={() =>
                  setEditing(true)
                }
              >
                ✎ Profil bearbeiten
              </button>

              <button
                type="button"
                className="ec-more-button"
              >
                •••
              </button>
            </>
          ) : (
            <>
              {relationship?.status ===
              "ACCEPTED" ? (
                <button
                  type="button"
                  className="ec-main-button"
                  onClick={() =>
                    onRemoveFriend?.(profile)
                  }
                >
                  ✓ Freunde
                </button>
              ) : (
                <button
                  type="button"
                  className="ec-main-button"
                  onClick={() =>
                    onAddFriend?.(profile)
                  }
                >
                  ＋ Freund hinzufügen
                </button>
              )}

              <button
                type="button"
                className="ec-main-button"
                onClick={() =>
                  onMessage?.(profile)
                }
              >
                💬 Nachricht
              </button>

              <button
                type="button"
                className="ec-more-button"
                onClick={() => {
                  const action =
                    window.prompt(
                      "Aktion:\n1 = Blockieren\n2 = Melden"
                    );

                  if (action === "1") {
                    onBlock?.(profile);
                  }

                  if (action === "2") {
                    onReport?.(profile);
                  }
                }}
              >
                •••
              </button>
            </>
          )}
        </div>

        <div className="ec-profile-stats">
          <div>
            <span>▣</span>

            <section>
              <small>Mitglied seit</small>

              <strong>
                {formatDate(
                  profile.created_at
                )}
              </strong>
            </section>
          </div>

          <div>
            <span>◌</span>

            <section>
              <small>Beiträge</small>

              <strong>
                {profile.post_count ||
                  profile.posts_count ||
                  0}
              </strong>
            </section>
          </div>

          <div>
            <span>♧</span>

            <section>
              <small>Freunde</small>

              <strong>
                {profileFriends.length}
              </strong>
            </section>
          </div>

          <div>
            <span>◉</span>

            <section>
              <small>Profilbesuche</small>

              <strong>
                {isOwnProfile
                  ? visits.length
                  : profile.profile_visits ||
                    0}
              </strong>
            </section>
          </div>
        </div>
      </section>

      <nav className="ec-profile-tabs">
        <button
          className={
            activeTab === "about"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("about")
          }
        >
          Über mich
        </button>

        <button
          className={
            activeTab === "posts"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("posts")
          }
        >
          Beiträge
          <span>
            {profile.post_count ||
              profile.posts_count ||
              0}
          </span>
        </button>

        <button
          className={
            activeTab === "pictures"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("pictures")
          }
        >
          Bilder
        </button>

        <button
          className={
            activeTab === "friends"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("friends")
          }
        >
          Freunde
          <span>
            {profileFriends.length}
          </span>
        </button>

        <button
          className={
            activeTab === "activity"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("activity")
          }
        >
          Aktivitäten
        </button>

        {isOwnProfile && (
          <button
            className={
              activeTab === "settings"
                ? "active"
                : ""
            }
            onClick={() =>
              setActiveTab("settings")
            }
          >
            Einstellungen
          </button>
        )}
      </nav>

      {activeTab === "about" && (
        <div className="ec-profile-content">
          <div className="ec-profile-column">
            <section className="ec-card">
              <h2>Über mich</h2>

              <p className="ec-bio">
                {profile.bio ||
                  "Dieses Mitglied hat noch keinen Über-mich-Text hinzugefügt."}
              </p>
            </section>

            <section className="ec-card">
              <div className="ec-card-title-row">
                <h2>Neueste Beiträge</h2>

                <span>
                  {profileMessages.length}
                </span>
              </div>

              {profileMessages.length === 0 ? (
                <div className="ec-empty-state">
                  Noch keine Beiträge vorhanden.
                </div>
              ) : (
                profileMessages
                  .slice(0, 3)
                  .map((message) => (
                    <article
                      className="ec-post"
                      key={message.id}
                    >
                      <strong>
                        {displayName}
                      </strong>

                      <p>
                        {message.content ||
                          message.text ||
                          "Neuer Beitrag"}
                      </p>
                    </article>
                  ))
              )}
            </section>
          </div>

          <div className="ec-profile-column">
            <section className="ec-card">
              <div className="ec-card-title-row">
                <h2>
                  Persönliche Informationen
                </h2>

                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() =>
                      setEditing(true)
                    }
                  >
                    Bearbeiten
                  </button>
                )}
              </div>

              <div className="ec-info-list">
                <div>
                  <span>Vorname</span>

                  <strong>
                    {profile.first_name || "–"}
                  </strong>
                </div>

                <div>
                  <span>Nachname</span>

                  <strong>
                    {profile.last_name || "–"}
                  </strong>
                </div>

                <div>
                  <span>Geburtsdatum</span>

                  <strong>
                    {profile.birth_date
                      ? `${formatDate(
                          profile.birth_date
                        )}${
                          age !== null
                            ? ` (${age} Jahre)`
                            : ""
                        }`
                      : "–"}
                  </strong>
                </div>

                {isOwnProfile && (
                  <div>
                    <span>E-Mail</span>

                    <strong>
                      {profile.email ||
                        currentUser?.email ||
                        "–"}
                    </strong>
                  </div>
                )}

                <div>
                  <span>Über mich</span>

                  <strong>
                    {profile.bio || "–"}
                  </strong>
                </div>
              </div>
            </section>

            {isOwnProfile && (
              <section className="ec-card">
                <h2>Konto & Sicherheit</h2>

                <button
                  type="button"
                  className="ec-setting-row"
                >
                  🔒 Passwort ändern
                  <span>›</span>
                </button>

                <button
                  type="button"
                  className="ec-setting-row"
                >
                  ✉ E-Mail ändern
                  <span>›</span>
                </button>

                <button
                  type="button"
                  className="ec-setting-row"
                >
                  🔐 Zwei-Faktor-Authentifizierung
                  <strong>Aktiv</strong>
                  <span>›</span>
                </button>
              </section>
            )}
          </div>
        </div>
      )}

      {activeTab === "friends" && (
        <section className="ec-card ec-full-card">
          <h2>Freunde</h2>

          <div className="ec-friends-grid">
            {profileFriends.length === 0 ? (
              <div className="ec-empty-state">
                Noch keine Freunde vorhanden.
              </div>
            ) : (
              profileFriends.map((friend) => (
                <button
                  key={friend.id}
                  className="ec-friend-card"
                  onClick={() =>
                    onOpenMember?.(friend)
                  }
                >
                  <img
                    src={
                      friend.avatar_url ||
                      DEFAULT_AVATAR
                    }
                    alt={getName(friend)}
                    onError={(event) => {
                      event.currentTarget.src =
                        DEFAULT_AVATAR;
                    }}
                  />

                  <div>
                    <strong>
                      {getName(friend)}
                    </strong>

                    <small>
                      {friend.is_online
                        ? "● Online"
                        : "○ Offline"}
                    </small>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === "activity" && (
        <section className="ec-card ec-full-card">
          <h2>Aktivitäten</h2>

          {profileActivities.length === 0 ? (
            <div className="ec-empty-state">
              Noch keine Aktivitäten vorhanden.
            </div>
          ) : (
            <div className="ec-activity-list">
              {profileActivities.map(
                (activity) => (
                  <div
                    className="ec-activity"
                    key={activity.id}
                  >
                    <span>●</span>

                    <div>
                      <strong>
                        {activity.title ||
                          "Neue Aktivität"}
                      </strong>

                      <p>
                        {activity.description ||
                          activity.action ||
                          ""}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "posts" && (
        <section className="ec-card ec-full-card">
          <h2>Beiträge</h2>

          <div className="ec-empty-state">
            Die Beitragsansicht wird direkt
            mit deinem bestehenden News- und
            Beitragssystem verbunden.
          </div>
        </section>
      )}

      {activeTab === "pictures" && (
        <section className="ec-card ec-full-card">
          <h2>Bilder</h2>

          <div className="ec-empty-state">
            Noch keine Bilder vorhanden.
          </div>
        </section>
      )}

      {activeTab === "settings" &&
        isOwnProfile && (
          <section className="ec-card ec-full-card">
            <h2>Profileinstellungen</h2>

            <p>
              Hier kannst du dein Profil
              individuell gestalten.
            </p>

            <button
              className="ec-main-button"
              onClick={() =>
                setEditing(true)
              }
            >
              Profil bearbeiten
            </button>
          </section>
        )}

      {editing && (
        <div className="ec-modal-backdrop">
          <div className="ec-edit-modal">
            <div className="ec-modal-header">
              <div>
                <span>
                  DEIN PROFIL
                </span>

                <h2>
                  Profil gestalten
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing(false)
                }
              >
                ✕
              </button>
            </div>

            <div className="ec-edit-form">
              <label>
                Nickname
                <input
                  value={
                    draft.nickname || ""
                  }
                  onChange={(event) =>
                    updateDraft(
                      "nickname",
                      event.target.value
                    )
                  }
                />
              </label>

              <div className="ec-color-grid">
                <label>
                  Nickname-Farbe

                  <input
                    type="color"
                    value={
                      draft.nickname_color ||
                      "#ffffff"
                    }
                    onChange={(event) =>
                      updateDraft(
                        "nickname_color",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Profil-Akzent

                  <input
                    type="color"
                    value={
                      draft.profile_accent ||
                      "#ff6a00"
                    }
                    onChange={(event) =>
                      updateDraft(
                        "profile_accent",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label>
                  Profil-Hintergrund

                  <input
                    type="color"
                    value={
                      draft.profile_background ||
                      "#17212c"
                    }
                    onChange={(event) =>
                      updateDraft(
                        "profile_background",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>

              <label>
                Über mich

                <textarea
                  rows="6"
                  value={draft.bio || ""}
                  onChange={(event) =>
                    updateDraft(
                      "bio",
                      event.target.value
                    )
                  }
                />
              </label>

              <div className="ec-edit-actions">
                <button
                  type="button"
                  className="ec-cancel-button"
                  onClick={() =>
                    setEditing(false)
                  }
                >
                  Abbrechen
                </button>

                <button
                  type="button"
                  className="ec-main-button"
                  onClick={saveProfile}
                >
                  Änderungen speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isOwnProfile && (
        <button
          type="button"
          className="ec-back-button"
          onClick={onBack}
        >
          ← Zurück
        </button>
      )}
    </div>
  );
}
