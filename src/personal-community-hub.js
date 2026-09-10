import { supabase } from './supabaseClient';

const STYLE_ID = 'ec-personal-community-hub-style';
let activeUserId = null;
let refreshTimer = null;
let requestBusy = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ec-personal-hub{display:grid;gap:12px;margin:14px 0 18px}.ec-personal-hub-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:15px 16px;border:1px solid rgba(27,64,99,.1);border-radius:17px;background:linear-gradient(135deg,#fff,#f5f9fc);box-shadow:0 8px 22px rgba(25,55,87,.05)}.ec-personal-hub-head span{display:block;color:#e85a21;font-size:.61rem;font-weight:900;letter-spacing:.13em}.ec-personal-hub-head h2{margin:4px 0 3px;color:#25435e;font-size:1.08rem}.ec-personal-hub-head p{margin:0;color:#718397;font-size:.71rem;line-height:1.4}.ec-personal-hub-badge{flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#edf4f8;color:#536d83;font-size:.61rem;font-weight:900;white-space:nowrap}
    .ec-personal-hub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.ec-personal-card{min-width:0;padding:13px;border:1px solid rgba(28,65,101,.1);border-radius:15px;background:#fff;box-shadow:0 7px 18px rgba(23,55,86,.04)}.ec-personal-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.ec-personal-card-head span{color:#6e8194;font-size:.59rem;font-weight:900;letter-spacing:.1em}.ec-personal-card-head button{border:0;background:transparent;color:#0b69c7;font-size:.64rem;font-weight:900;cursor:pointer}.ec-personal-list{display:grid;gap:7px}.ec-personal-empty{margin:0;padding:10px;border-radius:10px;background:#f6f8fa;color:#8190a0;font-size:.66rem;line-height:1.4}
    .ec-match{display:grid;grid-template-columns:34px minmax(0,1fr);gap:8px;align-items:center;padding:7px;border:1px solid rgba(28,65,101,.07);border-radius:11px;background:#fafcfd}.ec-match img{width:34px;height:34px;border-radius:10px;object-fit:cover}.ec-match strong,.ec-match small{display:block;min-width:0}.ec-match strong{color:#304b65;font-size:.71rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ec-match small{margin-top:2px;color:#7a8a9a;font-size:.59rem;line-height:1.25}.ec-match-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.ec-match-tags b{padding:3px 6px;border-radius:999px;background:#edf5fb;color:#3b678b;font-size:.55rem;font-weight:850}
    .ec-for-you{display:grid;gap:7px}.ec-for-you button{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;width:100%;padding:8px;border:1px solid rgba(28,65,101,.07);border-radius:11px;background:#fafcfd;color:#304b65;text-align:left;cursor:pointer}.ec-for-you button>i{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:#edf3f7;font-style:normal}.ec-for-you strong,.ec-for-you small{display:block}.ec-for-you strong{font-size:.7rem;line-height:1.25}.ec-for-you small{margin-top:2px;color:#7a8a9a;font-size:.59rem;line-height:1.3}
    .ec-spontan-form{display:grid;gap:7px}.ec-spontan-form input,.ec-spontan-form textarea{width:100%;box-sizing:border-box;border:1px solid rgba(28,65,101,.14);border-radius:10px;background:#fbfcfd;color:#304b65;font:inherit;font-size:.66rem;padding:8px 9px;outline:none}.ec-spontan-form textarea{min-height:66px;resize:vertical}.ec-spontan-form input:focus,.ec-spontan-form textarea:focus{border-color:rgba(11,105,199,.45);box-shadow:0 0 0 3px rgba(11,105,199,.07)}.ec-spontan-form button{min-height:34px;border:0;border-radius:10px;background:#17324a;color:#fff;font-size:.66rem;font-weight:900;cursor:pointer}.ec-spontan-form button:disabled{opacity:.55;cursor:wait}.ec-spontan-feed{display:grid;gap:6px;margin-top:8px}.ec-spontan-entry{padding:8px;border-radius:10px;background:#f7f9fb;border:1px solid rgba(28,65,101,.07)}.ec-spontan-entry strong,.ec-spontan-entry small{display:block}.ec-spontan-entry strong{color:#314c65;font-size:.68rem}.ec-spontan-entry small{margin-top:2px;color:#7c8b9a;font-size:.58rem;line-height:1.3}.ec-spontan-notice{min-height:16px;color:#477089;font-size:.58rem;font-weight:750}
    @media(max-width:1000px){.ec-personal-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ec-personal-card.ec-spontan-card{grid-column:1/-1}}
    @media(max-width:650px){.ec-personal-hub-head{display:grid;padding:12px}.ec-personal-hub-badge{justify-self:start}.ec-personal-hub-grid{grid-template-columns:1fr}.ec-personal-card.ec-spontan-card{grid-column:auto}.ec-personal-card{padding:11px}}
  `;
  document.head.appendChild(style);
}

function normalizeInterests(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function nameOf(member) {
  return member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function parseRows(rows) {
  return (rows || []).map((row) => typeof row === 'string' ? JSON.parse(row) : row).filter(Boolean);
}

function commonInterests(me, other) {
  const mine = new Set(normalizeInterests(me?.interests).map((x) => x.toLocaleLowerCase('de-AT')));
  return normalizeInterests(other?.interests).filter((x) => mine.has(x.toLocaleLowerCase('de-AT')));
}

function nav(page) {
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
}

async function loadData(userId) {
  const { data: me } = await supabase.from('profiles').select('id,nickname,interests,home_region_id').eq('id', userId).maybeSingle();
  if (!me) return null;

  const [directoryRes, eventsRes, groupsRes, spontaneousRes] = await Promise.all([
    supabase.rpc('community_member_directory'),
    me.home_region_id ? supabase.from('community_events').select('id,title,description,event_at,location,region_id,status').eq('region_id', me.home_region_id).gte('event_at', new Date().toISOString()).order('event_at', { ascending: true }).limit(4) : Promise.resolve({ data: [], error: null }),
    me.home_region_id ? supabase.from('community_groups').select('id,name,description,region_id,member_count').eq('region_id', me.home_region_id).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
    me.home_region_id ? supabase.from('community_requests').select('id,author_id,title,content,created_at,region_id,status').eq('region_id', me.home_region_id).eq('category', 'SPONTAN').eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(5) : Promise.resolve({ data: [], error: null })
  ]);

  const directory = parseRows(directoryRes.data);
  const matches = directory
    .filter((member) => member.id !== userId && (!me.home_region_id || member.home_region_id === me.home_region_id))
    .map((member) => ({ member, shared: commonInterests(me, member) }))
    .filter((entry) => entry.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length || nameOf(a.member).localeCompare(nameOf(b.member), 'de'))
    .slice(0, 4);

  const mine = normalizeInterests(me.interests).map((x) => x.toLocaleLowerCase('de-AT'));
  const groups = (groupsRes.data || []).map((group) => {
    const haystack = `${group.name || ''} ${group.description || ''}`.toLocaleLowerCase('de-AT');
    const score = mine.filter((interest) => haystack.includes(interest)).length;
    return { ...group, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);

  return { me, matches, events: eventsRes.data || [], groups, spontaneous: spontaneousRes.data || [], directory };
}

function makeMatch(entry) {
  const row = document.createElement('div');
  row.className = 'ec-match';
  const img = document.createElement('img');
  img.src = entry.member.avatar_url || '/default-avatar.svg';
  img.alt = '';
  const copy = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = nameOf(entry.member);
  const small = document.createElement('small');
  small.textContent = `${entry.shared.length} gemeinsame${entry.shared.length === 1 ? 's' : ''} Interesse${entry.shared.length === 1 ? '' : 'n'}`;
  const tags = document.createElement('div');
  tags.className = 'ec-match-tags';
  entry.shared.slice(0, 3).forEach((interest) => {
    const tag = document.createElement('b');
    tag.textContent = interest;
    tags.appendChild(tag);
  });
  copy.append(strong, small, tags);
  row.append(img, copy);
  return row;
}

function forYouButton(icon, title, detail, page) {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `<i aria-hidden="true">${icon}</i><span><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>`;
  button.addEventListener('click', () => nav(page));
  return button;
}

function render(root, data) {
  let hub = root.querySelector('.ec-personal-hub');
  if (!hub) {
    hub = document.createElement('section');
    hub.className = 'ec-personal-hub';
    const heading = root.querySelector('.page-heading');
    heading?.insertAdjacentElement('afterend', hub);
  }
  hub.replaceChildren();

  const head = document.createElement('div');
  head.className = 'ec-personal-hub-head';
  head.innerHTML = `<div><span>FÜR DICH</span><h2>Deine Community auf einen Blick</h2><p>Menschen, Gruppen, Termine und spontane Aktivitäten passend zu deinen Interessen und deiner Region.</p></div><small class="ec-personal-hub-badge">persönlich · regional</small>`;

  const grid = document.createElement('div');
  grid.className = 'ec-personal-hub-grid';

  const matchCard = document.createElement('article');
  matchCard.className = 'ec-personal-card';
  matchCard.innerHTML = `<div class="ec-personal-card-head"><span>INTERESSEN-MATCHING</span><button type="button">Alle Mitglieder →</button></div><div class="ec-personal-list"></div>`;
  matchCard.querySelector('button').onclick = () => nav('members');
  const matchList = matchCard.querySelector('.ec-personal-list');
  if (data.matches.length) data.matches.forEach((entry) => matchList.appendChild(makeMatch(entry)));
  else matchList.innerHTML = '<p class="ec-personal-empty">Noch keine passenden Interessen gefunden. Ergänze deine Interessen im Profil oder schau später wieder vorbei.</p>';

  const forYouCard = document.createElement('article');
  forYouCard.className = 'ec-personal-card';
  forYouCard.innerHTML = '<div class="ec-personal-card-head"><span>EMPFOHLEN FÜR DICH</span></div><div class="ec-for-you"></div>';
  const forYou = forYouCard.querySelector('.ec-for-you');
  const event = data.events.find((x) => String(x.status || 'ACTIVE').toUpperCase() !== 'CANCELLED');
  if (event) forYou.appendChild(forYouButton('▣', event.title, `${new Date(event.event_at).toLocaleString('de-AT')}${event.location ? ` · ${event.location}` : ''}`, 'events'));
  const bestGroup = data.groups[0];
  if (bestGroup) forYou.appendChild(forYouButton('●', bestGroup.name, bestGroup.score ? 'Passt zu deinen Interessen.' : 'Neue Gruppe aus deiner Region.', 'groups'));
  if (data.matches[0]) forYou.appendChild(forYouButton('♙', `Entdecke ${nameOf(data.matches[0].member)}`, `${data.matches[0].shared.slice(0, 2).join(' · ')} gemeinsam`, 'members'));
  if (!forYou.children.length) forYou.innerHTML = '<p class="ec-personal-empty">Sobald neue Gruppen, Events oder passende Mitglieder dazukommen, erscheinen sie hier.</p>';

  const spontanCard = document.createElement('article');
  spontanCard.className = 'ec-personal-card ec-spontan-card';
  spontanCard.innerHTML = `<div class="ec-personal-card-head"><span>SPONTAN WAS MACHEN?</span><button type="button" class="ec-spontan-community">Community öffnen →</button></div><form class="ec-spontan-form"><input name="title" maxlength="140" minlength="5" placeholder="z. B. Heute 18 Uhr spazieren?" required><textarea name="content" maxlength="1500" minlength="10" placeholder="Kurz Ort, Uhrzeit und was du vorhast …" required></textarea><button type="submit">Spontane Aktivität veröffentlichen</button><div class="ec-spontan-notice" aria-live="polite"></div></form><div class="ec-spontan-feed"></div>`;
  spontanCard.querySelector('.ec-spontan-community').onclick = () => nav('community');
  const feed = spontanCard.querySelector('.ec-spontan-feed');
  const authorById = new Map(data.directory.map((m) => [m.id, m]));
  if (data.spontaneous.length) {
    data.spontaneous.slice(0, 3).forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'ec-spontan-entry';
      const author = authorById.get(entry.author_id);
      row.innerHTML = `<strong>${esc(entry.title)}</strong><small>${esc(nameOf(author))} · ${esc(entry.content)} · ${new Date(entry.created_at).toLocaleString('de-AT')}</small>`;
      feed.appendChild(row);
    });
  } else feed.innerHTML = '<p class="ec-personal-empty">Noch nichts Spontanes geplant. Du kannst den ersten Aufruf starten.</p>';

  const form = spontanCard.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (requestBusy || !data.me.home_region_id) return;
    const button = form.querySelector('button[type="submit"]');
    const notice = form.querySelector('.ec-spontan-notice');
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const content = String(fd.get('content') || '').trim();
    requestBusy = true;
    button.disabled = true;
    notice.textContent = 'Wird veröffentlicht …';
    const { error } = await supabase.from('community_requests').insert({
      author_id: activeUserId,
      category: 'SPONTAN',
      title,
      content,
      status: 'ACTIVE',
      region_id: data.me.home_region_id
    });
    requestBusy = false;
    button.disabled = false;
    if (error) {
      notice.textContent = `Konnte nicht veröffentlicht werden: ${error.message}`;
      return;
    }
    form.reset();
    notice.textContent = '✓ Veröffentlicht';
    setTimeout(() => void mount(true), 250);
  });

  grid.append(matchCard, forYouCard, spontanCard);
  hub.append(head, grid);
}

async function mount(force = false, retries = 7) {
  if (!supabase) return;
  const root = document.querySelector('.home-page');
  if (!root) {
    if (retries > 0) setTimeout(() => void mount(force, retries - 1), 170);
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  activeUserId = user.id;
  if (!force && root.querySelector('.ec-personal-hub[data-ready="1"]')) return;
  ensureStyles();
  const data = await loadData(user.id);
  if (!data || !document.body.contains(root)) return;
  render(root, data);
  root.querySelector('.ec-personal-hub')?.setAttribute('data-ready', '1');
}

function schedule(force = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void mount(force), 40);
}

window.addEventListener('ec:navigate', () => schedule(true));
window.addEventListener('ec:region-change', () => schedule(true));
window.addEventListener('focus', () => {
  if (document.querySelector('.home-page')) schedule(true);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
else schedule();
