import { supabase } from './supabaseClient';

const STYLE_ID = 'ec-member-trust-style';
let activeProfileId = null;
let runToken = 0;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ec-member-trust{margin:12px 0;padding:14px;border:1px solid rgba(31,68,104,.11);border-radius:16px;background:linear-gradient(180deg,#fff,#f7fafc);box-shadow:0 8px 22px rgba(23,55,86,.05)}
    .ec-member-trust-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .ec-member-trust-head>div{min-width:0}.ec-member-trust-head span{display:block;color:#e85b20;font-size:.62rem;font-weight:900;letter-spacing:.12em}.ec-member-trust-head h2{margin:3px 0 2px;color:#29445e;font-size:1rem;line-height:1.2}.ec-member-trust-head p{margin:0;color:#718197;font-size:.7rem;line-height:1.35}.ec-member-trust-note{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eef4f8;color:#66798b;font-size:.62rem;font-weight:800;white-space:nowrap}
    .ec-member-trust-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ec-member-trust-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:center;min-width:0;padding:9px;border:1px solid rgba(31,68,104,.09);border-radius:12px;background:#fff}.ec-member-trust-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#eef4f8;color:#29445e;font-size:.85rem}.ec-member-trust-copy{min-width:0}.ec-member-trust-copy strong{display:block;color:#2e465f;font-size:.72rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec-member-trust-copy small{display:block;margin-top:2px;color:#7a8998;font-size:.62rem;line-height:1.25;overflow-wrap:anywhere}.ec-member-trust-item.good .ec-member-trust-icon{background:#ecf8ef;color:#287a3e}.ec-member-trust-item.warn .ec-member-trust-icon{background:#fff5e9;color:#b96a19}.ec-member-trust-loading{font-size:.7rem;color:#75869a}
    .ec-member-trust-mutuals,.ec-member-trust-context{grid-column:1/-1;display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding-top:2px}.ec-member-trust-mutuals-label,.ec-member-trust-context-label{color:#66798b;font-size:.63rem;font-weight:850}.ec-member-trust-person,.ec-member-trust-chip{display:inline-flex;align-items:center;gap:6px;max-width:190px;padding:4px 7px;border:1px solid rgba(31,68,104,.09);border-radius:999px;background:#fff;color:#344f69;font-size:.64rem;font-weight:800}.ec-member-trust-person{padding-left:4px}.ec-member-trust-person img{width:22px;height:22px;min-width:22px;border-radius:50%;object-fit:cover}.ec-member-trust-person span,.ec-member-trust-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ec-member-trust-chip b{font-size:.72rem;color:#2d5f8f}.ec-member-trust-more{color:#748598;font-size:.62rem;font-weight:800}
    @media(max-width:900px){.ec-member-trust-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){.ec-member-trust{padding:11px}.ec-member-trust-head{display:grid}.ec-member-trust-note{justify-self:start}.ec-member-trust-grid{grid-template-columns:1fr}.ec-member-trust-item{padding:8px}.ec-member-trust-person,.ec-member-trust-chip{max-width:145px}}
  `;
  document.head.appendChild(style);
}

const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function counterpart(row, uid) {
  return row.requester_id === uid ? row.receiver_id : row.requester_id;
}

async function acceptedFriends(uid) {
  if (!uid || !supabase) return [];
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id,receiver_id,status')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`);
  if (error) return [];
  return (data || []).map((row) => counterpart(row, uid)).filter(Boolean);
}

async function profileFacts(profileId) {
  const full = await supabase
    .from('profiles')
    .select('id,created_at,is_verified,account_status,role,account_badge')
    .eq('id', profileId)
    .maybeSingle();
  if (!full.error) return full.data || {};
  const fallback = await supabase
    .from('profiles')
    .select('id,is_verified,account_status,role,account_badge')
    .eq('id', profileId)
    .maybeSingle();
  return fallback.data || {};
}

async function profilesFor(ids) {
  if (!ids?.length || !supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id,nickname,first_name,last_name,avatar_url')
    .in('id', ids.slice(0, 12));
  if (error) return [];
  const byId = new Map((data || []).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function sharedGroups(viewerId, profileId) {
  if (!viewerId || !profileId || viewerId === profileId || !supabase) return [];
  const { data, error } = await supabase
    .from('community_group_members')
    .select('group_id,user_id')
    .in('user_id', [viewerId, profileId]);
  if (error) return [];
  const mine = new Set((data || []).filter((r) => r.user_id === viewerId).map((r) => r.group_id));
  const sharedIds = [...new Set((data || []).filter((r) => r.user_id === profileId && mine.has(r.group_id)).map((r) => r.group_id))];
  if (!sharedIds.length) return [];
  const groups = await supabase.from('community_groups').select('id,name').in('id', sharedIds.slice(0, 12));
  return groups.error ? [] : (groups.data || []);
}

async function sharedEvents(viewerId, profileId) {
  if (!viewerId || !profileId || viewerId === profileId || !supabase) return [];
  const { data, error } = await supabase
    .from('community_event_rsvps')
    .select('event_id,user_id,status')
    .in('user_id', [viewerId, profileId])
    .in('status', ['INTERESTED', 'GOING']);
  if (error) return [];
  const mine = new Set((data || []).filter((r) => r.user_id === viewerId).map((r) => r.event_id));
  const sharedIds = [...new Set((data || []).filter((r) => r.user_id === profileId && mine.has(r.event_id)).map((r) => r.event_id))];
  if (!sharedIds.length) return [];
  const events = await supabase
    .from('community_events')
    .select('id,title,event_at,status')
    .in('id', sharedIds.slice(0, 12))
    .eq('status', 'ACTIVE')
    .order('event_at', { ascending: true });
  return events.error ? [] : (events.data || []);
}

function personName(person) {
  return person?.nickname || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function item(icon, title, detail, tone = '') {
  const box = document.createElement('div');
  box.className = `ec-member-trust-item ${tone}`.trim();
  const ico = document.createElement('span');
  ico.className = 'ec-member-trust-icon';
  ico.textContent = icon;
  const copy = document.createElement('span');
  copy.className = 'ec-member-trust-copy';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const small = document.createElement('small');
  small.textContent = detail;
  copy.append(strong, small);
  box.append(ico, copy);
  return box;
}

function mutualList(people, total) {
  const wrap = document.createElement('div');
  wrap.className = 'ec-member-trust-mutuals';
  const label = document.createElement('span');
  label.className = 'ec-member-trust-mutuals-label';
  label.textContent = total ? 'Gemeinsame Freunde:' : 'Keine gemeinsamen Freunde sichtbar';
  wrap.appendChild(label);
  people.slice(0, 5).forEach((person) => {
    const chip = document.createElement('span');
    chip.className = 'ec-member-trust-person';
    const img = document.createElement('img');
    img.src = person.avatar_url || '/default-avatar.svg';
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = personName(person);
    chip.append(img, name);
    wrap.appendChild(chip);
  });
  if (total > people.slice(0, 5).length) {
    const more = document.createElement('span');
    more.className = 'ec-member-trust-more';
    more.textContent = `+${total - people.slice(0, 5).length} weitere`;
    wrap.appendChild(more);
  }
  return wrap;
}

function contextList(labelText, rows, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'ec-member-trust-context';
  const label = document.createElement('span');
  label.className = 'ec-member-trust-context-label';
  label.textContent = rows.length ? `${labelText}:` : `Keine ${labelText.toLowerCase()} sichtbar`;
  wrap.appendChild(label);
  rows.slice(0, 4).forEach((row) => {
    const chip = document.createElement('span');
    chip.className = 'ec-member-trust-chip';
    const icon = document.createElement('b');
    icon.textContent = kind === 'group' ? '●' : '▣';
    const text = document.createElement('span');
    text.textContent = kind === 'group' ? (row.name || 'Gruppe') : `${row.title || 'Event'}${row.event_at ? ` · ${fmtDate(row.event_at)}` : ''}`;
    chip.append(icon, text);
    wrap.appendChild(chip);
  });
  if (rows.length > 4) {
    const more = document.createElement('span');
    more.className = 'ec-member-trust-more';
    more.textContent = `+${rows.length - 4} weitere`;
    wrap.appendChild(more);
  }
  return wrap;
}

function shell(profileId) {
  const page = document.querySelector(`.member-profile-page[data-profile-id="${CSS.escape(profileId)}"]`);
  if (!page) return null;
  let panel = page.querySelector('.ec-member-trust');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.className = 'ec-member-trust';
  panel.setAttribute('aria-label', 'Vertrauensprofil');
  panel.innerHTML = `<div class="ec-member-trust-head"><div><span>VERTRAUENSPROFIL</span><h2>Hinweise zur Verbindung</h2><p>Öffentliche Vertrauenssignale und gemeinsame Community-Bezüge ohne geheime Bewertung.</p></div><small class="ec-member-trust-note">transparent · keine Bewertung</small></div><div class="ec-member-trust-grid"><span class="ec-member-trust-loading">Vertrauenshinweise werden geladen …</span></div>`;
  const actions = page.querySelector('.member-profile-actions');
  const hero = page.querySelector('.member-profile-hero');
  (actions || hero)?.insertAdjacentElement('afterend', panel);
  return panel;
}

async function render(profileId) {
  if (!supabase || !profileId) return;
  ensureStyles();
  const token = ++runToken;
  const panel = shell(profileId);
  if (!panel) return;
  const grid = panel.querySelector('.ec-member-trust-grid');
  try {
    const { data: auth } = await supabase.auth.getUser();
    const viewerId = auth?.user?.id;
    const [facts, viewerFriends, memberFriends, groups, events] = await Promise.all([
      profileFacts(profileId),
      acceptedFriends(viewerId),
      acceptedFriends(profileId),
      sharedGroups(viewerId, profileId),
      sharedEvents(viewerId, profileId)
    ]);
    if (token !== runToken || !document.body.contains(panel)) return;
    const viewerSet = new Set(viewerFriends);
    const mutualIds = [...new Set(memberFriends.filter((id) => viewerSet.has(id) && id !== viewerId && id !== profileId))];
    const mutualPeople = await profilesFor(mutualIds);
    if (token !== runToken || !document.body.contains(panel)) return;
    const mutualCount = mutualIds.length;
    grid.replaceChildren();

    const verified = facts.is_verified === true;
    grid.append(item(verified ? '✓' : '○', verified ? 'Profil verifiziert' : 'Noch nicht verifiziert', verified ? 'Von der Community-Verwaltung bestätigt.' : 'Für dieses Profil liegt noch keine Bestätigung vor.', verified ? 'good' : 'warn'));

    const joined = fmtDate(facts.created_at);
    grid.append(item('◷', joined ? `Mitglied seit ${joined}` : 'Mitglied der Community', joined ? 'Zeigt nur den Beginn der Mitgliedschaft.' : 'Ein Beitrittsdatum ist nicht öffentlich verfügbar.'));

    grid.append(item('♙', `${mutualCount} gemeinsame Freund${mutualCount === 1 ? '' : 'e'}`, mutualCount ? 'Gemeinsame Kontakte werden direkt darunter angezeigt.' : 'Aktuell keine gemeinsamen Kontakte sichtbar.', mutualCount ? 'good' : ''));

    const active = String(facts.account_status || 'ACTIVE').toUpperCase() === 'ACTIVE';
    grid.append(item(active ? '●' : '○', active ? 'Aktives Konto' : 'Konto eingeschränkt', active ? 'Das Konto ist aktuell normal nutzbar.' : 'Der Kontostatus ist derzeit eingeschränkt.', active ? 'good' : 'warn'));

    grid.append(item('●', `${groups.length} gemeinsame Gruppe${groups.length === 1 ? '' : 'n'}`, groups.length ? 'Ihr seid in denselben Community-Gruppen.' : 'Aktuell keine gemeinsame Gruppe sichtbar.', groups.length ? 'good' : ''));
    grid.append(item('▣', `${events.length} gemeinsame Event${events.length === 1 ? '' : 's'}`, events.length ? 'Ihr seid bei denselben aktiven Events interessiert oder dabei.' : 'Aktuell kein gemeinsames Event sichtbar.', events.length ? 'good' : ''));

    grid.append(mutualList(mutualPeople, mutualCount));
    grid.append(contextList('Gemeinsame Gruppen', groups, 'group'));
    grid.append(contextList('Gemeinsame Events', events, 'event'));
  } catch (error) {
    if (token !== runToken) return;
    grid.textContent = 'Vertrauenshinweise konnten gerade nicht geladen werden.';
    console.warn('Vertrauensprofil konnte nicht geladen werden:', error);
  }
}

function detect(retries = 7) {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) {
    activeProfileId = null;
    if (retries > 0) setTimeout(() => detect(retries - 1), 160);
    return;
  }
  const profileId = page.dataset.profileId;
  if (!profileId) return;
  const hasPanel = !!page.querySelector('.ec-member-trust');
  if (profileId === activeProfileId && hasPanel) return;
  activeProfileId = profileId;
  void render(profileId);
}

window.addEventListener('ec:navigate', () => setTimeout(() => detect(), 0));
window.addEventListener('focus', () => {
  if (document.querySelector('.member-profile-page')) detect(2);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => detect(), { once: true });
else detect();
