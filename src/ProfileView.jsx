import React, { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./ProfileView.css";

const DEFAULT_AVATAR = "/default-avatar.svg";

function getName(member) {
  if (!member) return "Mitglied";
  return (
    member.nickname ||
    [member.first_name, member.last_name].filter(Boolean).join(" ") ||
    "Mitglied"
  );
}

function getAge(date) {
  if (!date) return null;
  const birth = new Date(`${date}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function formatDate(date) {
  if (!date) return "Nicht angegeben";
  const value = new Date(`${date}T12:00:00`);
  if (Number.isNaN(value.getTime())) return "Nicht angegeben";
  return value.toLocaleDateString("de-AT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function roleLabel(role) {
  if (role === "HEAD_ADMIN") return "HEAD ADMIN";
  if (role === "ADMIN") return "ADMIN";
  if (role === "SUPPORTER") return "SUPPORTER";
  return "MITGLIED";
}

function roleClass(role) {
  if (role === "HEAD_ADMIN" || role === "ADMIN") return "admin";
  if (role === "SUPPORTER") return "supporter";
  return "member";
}

export default function ProfileView({
  member,
  currentUserId,
  onClose,
  onProfileSaved,
  onMessage
}) {
  const ownProfile = member?.id === currentUserId;
  const [tab, setTab] = useState("about");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(
    member?.avatar_url || DEFAULT_AVATAR
  );

  const [form, setForm] = useState(() => ({
    nickname: member?.nickname || "",
    first_name: member?.first_name || "",
    last_name: member?.last_name || "",
    birth_date: member?.birth_date || "",
    gender: member?.gender || "",
    bio: member?.bio || "",
    location: member?.location || "",
    interests: member?.interests || "",
    website: member?.website || "",
    nickname_color: member?.nickname_color || "#f4f7fb"
  }));

  const age = useMemo(() => getAge(member?.birth_date), [member?.birth_date]);

  const stats = {
    posts: Number(member?.posts_count ?? member?.post_count ?? 0),
    friends: Number(member?.friends_count ?? member?.friend_count ?? 0),
    visits: Number(member?.profile_visits_count ?? member?.visit_count ?? 0)
  };

  const showNotice = (text) => {
    setNotice(text);
    window.clearTimeout(window.__profileNoticeTimer);
    window.__profileNoticeTimer = window.setTimeout(() => setNotice(""), 3500);
  };

  const changeField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showNotice("Bitte wähle eine Bilddatei aus.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotice("Das Profilbild darf maximal 5 MB groß sein.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreview(localPreview);

    if (!ownProfile) return;

    try {
      setSaving(true);
      const extension = file.name.split(".").pop() || "jpg";
      const path = `${currentUserId}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        showNotice("Bildvorschau geändert. Für den Upload fehlt eventuell der Storage-Bucket „avatars“.");
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatar_url = data?.publicUrl;

      if (avatar_url) {
        setAvatarPreview(avatar_url);
        setForm((current) => ({ ...current, avatar_url }));
        showNotice("Profilbild wurde hochgeladen.");
      }
    } catch {
      showNotice("Das Profilbild konnte nicht hochgeladen werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!ownProfile || !currentUserId) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();

    if (!firstName || !lastName) {
      showNotice("Vorname und Nachname dürfen nicht leer sein.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        nickname: form.nickname.trim() || `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        birth_date: form.birth_date || null,
        gender: form.gender || null,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        interests: form.interests.trim() || null,
        website: form.website.trim() || null,
        nickname_color: form.nickname_color || "#f4f7fb",
        avatar_url: form.avatar_url || member?.avatar_url || null
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", currentUserId)
        .select("*")
        .single();

      if (error) throw error;

      onProfileSaved?.(data);
      setEditing(false);
      showNotice("Dein Profil wurde erfolgreich gespeichert.");
    } catch (error) {
      showNotice(error?.message || "Profil konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = () => {
    if (ownProfile) return;
    onMessage?.(member);
  };

  return (
    <section className="ec-profile-page">
      {notice && <div className="ec-profile-notice">{notice}</div>}

      <article className="ec-profile-hero">
        <div className="ec-profile-avatar-wrap">
          <img
            className="ec-profile-avatar"
            src={avatarPreview || DEFAULT_AVATAR}
            alt={getName(member)}
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR;
            }}
          />
          <span className={`ec-online-dot ${member?.is_online ? "online" : ""}`} />
        </div>

        <div className="ec-profile-main">
          <div className="ec-profile-name-row">
            <div>
              <h1 style={{ color: member?.nickname_color || undefined }}>
                {getName(member)}
              </h1>

              <div className="ec-role-line">
                <span className={`ec-role-star ${roleClass(member?.role)}`}>★</span>
                <strong>{roleLabel(member?.role)}</strong>
              </div>

              <div className="ec-online-line">
                <span className={member?.is_online ? "online" : ""} />
                {member?.is_online ? "Online" : "Offline"}
              </div>
            </div>

            <div className="ec-profile-actions">
              {ownProfile ? (
                <button
                  type="button"
                  className="ec-outline-button"
                  onClick={() => setEditing((value) => !value)}
                >
                  ✎ {editing ? "Bearbeiten schließen" : "Profil bearbeiten"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ec-primary-button"
                    onClick={sendMessage}
                  >
                    💬 Nachricht
                  </button>
                  {onClose && (
                    <button
                      type="button"
                      className="ec-icon-button"
                      onClick={onClose}
                      aria-label="Zurück"
                    >
                      ←
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="ec-profile-stats">
            <div>
              <span>▣</span>
              <small>Mitglied seit</small>
              <strong>
                {member?.created_at
                  ? new Date(member.created_at).toLocaleDateString("de-AT")
                  : "–"}
              </strong>
            </div>
            <div>
              <span>◌</span>
              <small>Beiträge</small>
              <strong>{stats.posts}</strong>
            </div>
            <div>
              <span>♧</span>
              <small>Freunde</small>
              <strong>{stats.friends}</strong>
            </div>
            <div>
              <span>◉</span>
              <small>Profilbesuche</small>
              <strong>{stats.visits}</strong>
            </div>
          </div>
        </div>
      </article>

      <nav className="ec-profile-tabs">
        {[
          ["about", "Über mich"],
          ["posts", "Beiträge", stats.posts],
          ["photos", "Bilder", member?.photos_count || 0],
          ["friends", "Freunde", stats.friends],
          ["activity", "Aktivitäten"]
        ].map(([id, label, count]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {count !== undefined && <em>{count}</em>}
          </button>
        ))}
        {ownProfile && (
          <button
            type="button"
            className={editing ? "active" : ""}
            onClick={() => setEditing(true)}
          >
            Einstellungen
          </button>
        )}
      </nav>

      {editing && ownProfile && (
        <form className="ec-profile-edit-card" onSubmit={saveProfile}>
          <div className="ec-edit-heading">
            <div>
              <span>MEIN PROFIL</span>
              <h2>Persönliche Informationen bearbeiten</h2>
              <p>Ändere deine Angaben und speichere sie direkt in deinem Profil.</p>
            </div>
          </div>

          <div className="ec-avatar-editor">
            <img src={avatarPreview || DEFAULT_AVATAR} alt="" />
            <div>
              <strong>Profilbild</strong>
              <small>JPG, PNG oder WebP · maximal 5 MB</small>
              <label className="ec-upload-button">
                Bild auswählen
                <input type="file" accept="image/*" onChange={handleAvatar} />
              </label>
            </div>
          </div>

          <div className="ec-form-grid">
            <label>
              Vorname
              <input name="first_name" value={form.first_name} onChange={changeField} />
            </label>
            <label>
              Nachname
              <input name="last_name" value={form.last_name} onChange={changeField} />
            </label>
            <label>
              Anzeigename
              <input name="nickname" value={form.nickname} onChange={changeField} />
            </label>
            <label>
              Geburtsdatum
              <input type="date" name="birth_date" value={form.birth_date} onChange={changeField} />
            </label>
            <label>
              Geschlecht
              <select name="gender" value={form.gender} onChange={changeField}>
                <option value="">Nicht angegeben</option>
                <option value="MALE">Männlich</option>
                <option value="FEMALE">Weiblich</option>
                <option value="DIVERSE">Divers</option>
              </select>
            </label>
            <label>
              Wohnort
              <input name="location" value={form.location} onChange={changeField} />
            </label>
            <label>
              Interessen
              <input name="interests" value={form.interests} onChange={changeField} />
            </label>
            <label>
              Website
              <input name="website" value={form.website} onChange={changeField} />
            </label>
            <label className="full">
              Über mich
              <textarea name="bio" rows="5" value={form.bio} onChange={changeField} />
            </label>
          </div>

          <div className="ec-form-actions">
            <button
              type="button"
              className="ec-outline-button"
              onClick={() => setEditing(false)}
            >
              Abbrechen
            </button>
            <button type="submit" className="ec-primary-button" disabled={saving}>
              {saving ? "Speichert..." : "Änderungen speichern"}
            </button>
          </div>
        </form>
      )}

      {!editing && (
        <div className="ec-profile-content">
          <div className="ec-profile-left">
            {tab === "about" && (
              <>
                <article className="ec-content-card">
                  <h2>Über mich</h2>
                  <p className="ec-bio">
                    {member?.bio || "Dieses Mitglied hat noch keine Beschreibung hinterlegt."}
                  </p>
                  {(member?.location || member?.interests || member?.website) && (
                    <div className="ec-extra-info">
                      {member?.location && <p><span>⌖</span>{member.location}</p>}
                      {member?.interests && <p><span>✦</span>{member.interests}</p>}
                      {member?.website && (
                        <p>
                          <span>↗</span>
                          <a href={member.website.startsWith("http") ? member.website : `https://${member.website}`} target="_blank" rel="noreferrer">
                            {member.website}
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </article>

                <article className="ec-content-card">
                  <div className="ec-card-heading">
                    <h2>Neueste Beiträge</h2>
                    <button type="button" onClick={() => setTab("posts")}>Alle anzeigen</button>
                  </div>
                  <div className="ec-empty-state">
                    <strong>Noch keine Beiträge geladen</strong>
                    <span>Beiträge dieses Mitglieds erscheinen hier, sobald deine Beitragsdaten verbunden sind.</span>
                  </div>
                </article>
              </>
            )}

            {tab !== "about" && (
              <article className="ec-content-card ec-tab-placeholder">
                <h2>
                  {tab === "posts" && "Beiträge"}
                  {tab === "photos" && "Bilder"}
                  {tab === "friends" && "Freunde"}
                  {tab === "activity" && "Aktivitäten"}
                </h2>
                <p>
                  Dieser Bereich gehört vollständig zum Profil von {getName(member)}.
                  Die Daten können später direkt aus deinen vorhandenen Tabellen geladen werden.
                </p>
              </article>
            )}
          </div>

          <aside className="ec-profile-right">
            <article className="ec-content-card ec-personal-card">
              <div className="ec-card-heading">
                <h2>Persönliche Informationen</h2>
                {ownProfile && (
                  <button type="button" onClick={() => setEditing(true)}>
                    Bearbeiten
                  </button>
                )}
              </div>

              <dl>
                <div>
                  <dt>Vorname</dt>
                  <dd>{member?.first_name || "–"}</dd>
                </div>
                <div>
                  <dt>Nachname</dt>
                  <dd>{member?.last_name || "–"}</dd>
                </div>
                <div>
                  <dt>Geburtsdatum</dt>
                  <dd>
                    {formatDate(member?.birth_date)}
                    {age !== null ? ` (${age} Jahre)` : ""}
                  </dd>
                </div>
                {ownProfile && (
                  <div>
                    <dt>E-Mail</dt>
                    <dd>{member?.email || "In deinem Konto hinterlegt"}</dd>
                  </div>
                )}
                <div>
                  <dt>Über mich</dt>
                  <dd className="ec-info-bio">
                    {member?.bio || "Noch keine Beschreibung."}
                  </dd>
                </div>
              </dl>
            </article>

            {ownProfile && (
              <article className="ec-content-card ec-security-card">
                <h2>Konto & Sicherheit</h2>
                <button type="button" className="ec-setting-row">
                  <span>⌑</span> Passwort ändern <b>›</b>
                </button>
                <button type="button" className="ec-setting-row">
                  <span>✉</span> E-Mail ändern <b>›</b>
                </button>
                <button type="button" className="ec-setting-row">
                  <span>◉</span> Zwei-Faktor-Authentifizierung <em>Aktiv</em><b>›</b>
                </button>
              </article>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
