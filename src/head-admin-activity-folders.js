import { supabase } from './supabaseClient';

const ROOT_CLASS = 'ec-team-activity-shell';
let refreshTimer = null;
let generation = 0;
let observerQueued = false;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const roleLabel = (role) => {
  const value = String(role || '').toUpperCase();
  if (value === 'HEAD_ADMIN') return 'Head Admin';
  if (value === 'ADMIN') return 'Community Admin';
  if (value === 'SUPPORTER') return 'Supporter';
  return value || 'Teammitglied';
};

const AREA_LABELS = {
  messages: 'Private Nachrichten',
  forum_posts: 'Forumbeiträge',
  forum_replies: 'Forenantworten',
  group_forum_posts: 'Gruppenforum-Beiträge',
  group_forum_replies: 'Gruppenforum-Antworten',
  community_groups: 'Gruppen',
  groups: 'Gruppen',
  group_members: 'Gruppenmitglieder',
  community_group_members: 'Gruppenmitglieder',
  user_reports: 'Meldungen',
  reports: 'Meldungen',
  point_transactions: 'Punkte',
  point_history: 'Punkte',
  user_permissions: 'Berechtigungen',
  admin_permissions: 'Admin-Berechtigungen',
  regional_admin_assignments: 'Regionale Adminrechte',
  regional_moderation_assignments: 'Regionale Moderationsrechte',
  profiles: 'Mitgliederverwaltung',
  user_feature_locks: 'Funktionssperren',
  news: 'Neuigkeiten',
  events: 'Veranstaltungen',
  community_events: 'Veranstaltungen',
  homepage_sections: 'Startseite'
};

const FIELD_LABELS = {
  is_read: 'Lesestatus',
  content: 'Inhalt',
  title: 'Titel',
  description: 'Beschreibung',
  name: 'Name',
  status: 'Status',
  role: 'Rolle',
  account_status: 'Kontostatus',
  forum_moderator: 'Forum-Moderationsrecht',
  image_url: 'Bild',
  owner_id: 'Gruppenleitung',
  region_id: 'Region',
  reason: 'Begründung',
  points: 'Punktestand',
  community_points: 'Community-Punkte',
  purchase_points: 'Kaufpunkte',
  permissions: 'Berechtigungen',
  active: 'Aktiv-Status',
  is_locked: 'Sperrstatus',
  resolution: 'Entscheidung',
  admin_note: 'Admin-Notiz'
};

const formatLastUse = (value) => {
  if (!value) return 'Noch keine protokollierte Nutzung';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Zeitpunkt unbekannt';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = date.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Heute, ${time} Uhr` : `${date.toLocaleDateString('de-AT')}, ${time} Uhr`;
};

const formatExactTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Zeitpunkt unbekannt';
  return date.toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
};

const prettyJson = (value) => {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) return '';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const areaLabel = (area) => AREA_LABELS[String(area || '').toLowerCase()] || String(area || 'Administration').replaceAll('_', ' ');
const fieldLabel = (field) => FIELD_LABELS[String(field || '').toLowerCase()] || String(field || '').replaceAll('_', ' ');

function operationLabel(operation, area) {
  const op = String(operation || '').toUpperCase();
  const name = areaLabel(area);
  if (op === 'INSERT') return `${name} erstellt`;
  if (op === 'UPDATE') return `${name} geändert`;
  if (op === 'DELETE') return `${name} gelöscht`;
  return name;
}

function describeEntry(entry) {
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const changes = Array.isArray(details.changes) ? details.changes : [];
  const first = changes[0] || {};
  const rawAction = String(entry?.action_label || entry?.action_key || '').trim();
  const looksGeneric = /verwaltungsaktion|admin_(insert|update|delete)|automatic/i.test(rawAction);
  const primaryArea = first.area || details.area || entry?.area_label || 'Administration';
  const primaryOperation = first.operation || details.operation || '';
  const fields = [...new Set(changes.flatMap((change) => Array.isArray(change.changed_fields) ? change.changed_fields : []))];

  let title = rawAction || 'Administrative Aktion';
  if (looksGeneric && (first.area || primaryOperation)) title = operationLabel(primaryOperation, primaryArea);

  let changeText = '';
  if (fields.length) {
    const readable = fields.map(fieldLabel);
    changeText = readable.length === 1
      ? `${readable[0]} geändert`
      : `Geändert: ${readable.join(', ')}`;
  } else if (primaryOperation) {
    changeText = operationLabel(primaryOperation, primaryArea);
  }

  if (String(first.area || '').toLowerCase() === 'messages' && fields.includes('is_read')) {
    title = 'Private Nachricht aktualisiert';
    changeText = 'Lesestatus der Nachricht geändert';
  }

  const recordId = first.record_id || details.record_id || entry?.object_id || null;
  const automatic = details.automatic_audit === true;
  return {
    title,
    area: areaLabel(primaryArea),
    changeText,
    recordId,
    automatic,
    changeCount: changes.length
  };
}

function reasonDisplay(entry) {
  const value = String(entry?.reason || '').trim();
  if (!value || /historischen eintrag nicht separat gespeichert/i.test(value)) {
    return {
      text: 'Für diesen älteren Eintrag wurde damals noch keine separate Pflichtbegründung gespeichert.',
      historical: true
    };
  }
  return { text: value, historical: false };
}

function stopRefreshWhenClosed() {
  const root = document.querySelector(`.${ROOT_CLASS}`);
  if (root?.isConnected) return;
  clearInterval(refreshTimer);
  refreshTimer = null;
}

async function loadDetails(root, folder) {
  const currentGeneration = ++generation;
  const details = root.querySelector('.ec-activity-details');
  if (!details) return;
  details.innerHTML = '<div class="ec-activity-loading">Aktivitäten werden geladen …</div>';

  const { data, error } = await supabase.rpc('head_admin_team_activity_details', {
    p_actor: folder.actor_id,
    p_limit: 500
  });
  if (currentGeneration !== generation || !root.isConnected) return;
  if (error) {
    details.innerHTML = `<div class="ec-activity-error">${escapeHtml(error.message || 'Die Details konnten nicht geladen werden.')}</div>`;
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  const regionText = Array.isArray(folder.regions) && folder.regions.length
    ? folder.regions.join(' · ')
    : 'Überregional / keine feste Region';

  details.innerHTML = `
    <div class="ec-activity-details-head">
      <div>
        <span class="ec-activity-eyebrow">GEÖFFNETER ORDNER</span>
        <h2>${escapeHtml(folder.nickname)}</h2>
        <p>${escapeHtml(roleLabel(folder.actor_role))} · ${escapeHtml(regionText)}</p>
      </div>
      <button type="button" class="ec-activity-close">Ordner schließen</button>
    </div>
    <div class="ec-activity-history">
      ${rows.length ? rows.map((entry) => {
        const pointText = Number.isFinite(Number(entry.points_delta)) && entry.points_delta !== null
          ? `${Number(entry.points_delta) > 0 ? '+' : ''}${Number(entry.points_delta)} Punkte`
          : '';
        const before = prettyJson(entry.before_data);
        const after = prettyJson(entry.after_data);
        const raw = prettyJson(entry.details);
        const hasExtended = before || after || raw;
        const readable = describeEntry(entry);
        const reason = reasonDisplay(entry);
        return `
          <article class="ec-activity-entry">
            <div class="ec-activity-entry-time">
              <strong>${escapeHtml(formatExactTime(entry.created_at))}</strong>
              <span>${escapeHtml(readable.area || entry.area_label || 'Administration')}</span>
            </div>
            <div class="ec-activity-entry-main">
              <div class="ec-activity-entry-title">
                <strong>${escapeHtml(readable.title)}</strong>
                ${pointText ? `<b class="ec-activity-points ${Number(entry.points_delta) < 0 ? 'minus' : 'plus'}">${escapeHtml(pointText)}</b>` : ''}
              </div>
              <div class="ec-activity-readable-summary">
                ${readable.changeText ? `<p><span>Änderung</span><strong>${escapeHtml(readable.changeText)}</strong></p>` : ''}
                ${entry.target_nickname ? `<p><span>Betroffen</span><strong>${escapeHtml(entry.target_nickname)}</strong></p>` : ''}
                ${readable.recordId ? `<p><span>Vorgang / Datensatz</span><strong>${escapeHtml(readable.recordId)}</strong></p>` : ''}
                ${readable.automatic ? '<p><span>Erfassung</span><strong>Automatisch protokolliert</strong></p>' : ''}
              </div>
              <p class="ec-activity-reason${reason.historical ? ' is-historical' : ''}"><b>${reason.historical ? 'Historischer Hinweis:' : 'Grund:'}</b> ${escapeHtml(reason.text)}</p>
              <small>Quelle: ${escapeHtml(entry.source || 'Audit')}</small>
              ${hasExtended ? `
                <details class="ec-activity-more">
                  <summary>Technische Details anzeigen</summary>
                  ${before ? `<div><b>Vorher</b><pre>${escapeHtml(before)}</pre></div>` : ''}
                  ${after ? `<div><b>Nachher</b><pre>${escapeHtml(after)}</pre></div>` : ''}
                  ${raw ? `<div><b>Technische Rohdaten</b><pre>${escapeHtml(raw)}</pre></div>` : ''}
                </details>` : ''}
            </div>
          </article>`;
      }).join('') : '<div class="ec-activity-empty">Für dieses Teammitglied wurden noch keine Rechte-Aktionen protokolliert.</div>'}
    </div>`;

  details.querySelector('.ec-activity-close')?.addEventListener('click', () => {
    generation++;
    details.innerHTML = '';
    root.querySelectorAll('.ec-activity-folder.is-open').forEach((item) => item.classList.remove('is-open'));
  });
}

function renderFolders(root, folders) {
  const list = root.querySelector('.ec-activity-folder-grid');
  const search = root.querySelector('.ec-activity-search');
  if (!list || !search) return;

  const draw = () => {
    const needle = search.value.trim().toLocaleLowerCase('de');
    const visible = folders.filter((folder) => {
      const haystack = [folder.nickname, roleLabel(folder.actor_role), ...(folder.regions || [])].join(' ').toLocaleLowerCase('de');
      return !needle || haystack.includes(needle);
    });
    list.innerHTML = visible.length ? visible.map((folder) => {
      const regions = Array.isArray(folder.regions) && folder.regions.length
        ? folder.regions.join(' · ')
        : 'Überregional / keine feste Region';
      const moderation = folder.forum_moderator ? '<span>Forum-Moderation</span>' : '';
      return `
        <button type="button" class="ec-activity-folder" data-actor-id="${escapeHtml(folder.actor_id)}">
          <span class="ec-activity-folder-icon" aria-hidden="true">📁</span>
          <span class="ec-activity-folder-copy">
            <strong>${escapeHtml(folder.nickname)}</strong>
            <span>${escapeHtml(roleLabel(folder.actor_role))}${moderation ? ' · Forum-Moderation' : ''}</span>
            <small>${escapeHtml(regions)}</small>
          </span>
          <span class="ec-activity-folder-last">
            <small>Zuletzt Sonderrechte genutzt</small>
            <strong>${escapeHtml(formatLastUse(folder.last_used_at))}</strong>
            <span>${Number(folder.action_count || 0).toLocaleString('de-AT')} protokollierte Aktionen</span>
          </span>
          <span class="ec-activity-folder-arrow" aria-hidden="true">›</span>
        </button>`;
    }).join('') : '<div class="ec-activity-empty">Keine Teammitglieder für diese Suche gefunden.</div>';

    list.querySelectorAll('.ec-activity-folder').forEach((button) => {
      button.addEventListener('click', () => {
        const folder = folders.find((item) => item.actor_id === button.dataset.actorId);
        if (!folder) return;
        list.querySelectorAll('.ec-activity-folder.is-open').forEach((item) => item.classList.remove('is-open'));
        button.classList.add('is-open');
        void loadDetails(root, folder);
        root.querySelector('.ec-activity-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  search.oninput = draw;
  draw();
}

async function loadFolders(root, { quiet = false } = {}) {
  if (!root?.isConnected) return;
  const list = root.querySelector('.ec-activity-folder-grid');
  if (!quiet && list) list.innerHTML = '<div class="ec-activity-loading">Teamordner werden geladen …</div>';

  const { data, error } = await supabase.rpc('head_admin_team_activity_folders');
  if (!root.isConnected) return;
  if (error) {
    if (list) list.innerHTML = `<div class="ec-activity-error">${escapeHtml(error.message || 'Das Admin-Logbuch konnte nicht geladen werden.')}</div>`;
    return;
  }
  renderFolders(root, Array.isArray(data) ? data : []);
  const stamp = root.querySelector('.ec-activity-refreshed');
  if (stamp) stamp.textContent = `Aktualisiert: ${new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

function mountActivityFolders() {
  const legacy = document.querySelector('.admin-log-panel');
  if (!legacy || legacy.dataset.activityFoldersMounted === 'true') return;
  legacy.dataset.activityFoldersMounted = 'true';
  legacy.hidden = true;

  const root = document.createElement('section');
  root.className = `${ROOT_CLASS} panel`;
  root.innerHTML = `
    <div class="ec-activity-heading">
      <div>
        <span class="ec-activity-eyebrow">VERTRAULICH · NUR HEAD ADMIN</span>
        <h1>Team-Aktivitäten</h1>
        <p>Jedes Teammitglied mit Moderations- oder Adminrechten hat einen eigenen Ordner. Außen siehst du nur die letzte Nutzung der Sonderrechte; im Ordner steht die vollständige nachvollziehbare Chronik.</p>
      </div>
      <div class="ec-activity-heading-status">
        <span class="ec-activity-live-dot"></span>
        <span class="ec-activity-refreshed">Wird geladen …</span>
      </div>
    </div>
    <div class="ec-activity-toolbar">
      <label>
        <span>Teammitglied suchen</span>
        <input class="ec-activity-search" type="search" placeholder="Name, Rolle oder Region …" autocomplete="off" />
      </label>
      <button type="button" class="ec-activity-refresh">Jetzt aktualisieren</button>
    </div>
    <div class="ec-activity-folder-grid"></div>
    <div class="ec-activity-details"></div>`;

  legacy.insertAdjacentElement('beforebegin', root);
  root.querySelector('.ec-activity-refresh')?.addEventListener('click', () => void loadFolders(root));
  void loadFolders(root);

  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!root.isConnected) return stopRefreshWhenClosed();
    void loadFolders(root, { quiet: true });
  }, 60000);
}

new MutationObserver(() => {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    mountActivityFolders();
    stopRefreshWhenClosed();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('focus', () => {
  const root = document.querySelector(`.${ROOT_CLASS}`);
  if (root) void loadFolders(root, { quiet: true });
});
window.addEventListener('ec:navigate', () => setTimeout(mountActivityFolders, 0));

mountActivityFolders();
