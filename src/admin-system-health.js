import { supabase } from './supabaseClient';

const STYLE_ID = 'ec-admin-system-health-style';
let timer = null;
let mountedFor = null;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ec-system-health{margin:14px 0;padding:14px;border:1px solid rgba(29,68,108,.11);border-radius:16px;background:linear-gradient(180deg,#fff,#f7fafc);box-shadow:0 8px 22px rgba(23,55,86,.05)}
    .ec-system-health-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.ec-system-health-head span{display:block;color:#e85b20;font-size:.61rem;font-weight:900;letter-spacing:.12em}.ec-system-health-head h3{margin:3px 0 2px;color:#29445e;font-size:.98rem}.ec-system-health-head p{margin:0;color:#718197;font-size:.69rem;line-height:1.35}.ec-system-health-state{flex:0 0 auto;padding:5px 8px;border-radius:999px;background:#eaf7ed;color:#26723b;font-size:.62rem;font-weight:900;white-space:nowrap}
    .ec-system-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ec-system-health-card{min-width:0;padding:10px;border:1px solid rgba(29,68,108,.09);border-radius:12px;background:#fff}.ec-system-health-card small{display:block;color:#77879a;font-size:.61rem;line-height:1.2}.ec-system-health-card strong{display:block;margin-top:3px;color:#29445e;font-size:1rem;line-height:1.1}.ec-system-health-card em{display:block;margin-top:3px;color:#8290a0;font-size:.58rem;font-style:normal;line-height:1.25}.ec-system-health-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:9px;color:#7b8998;font-size:.59rem}.ec-system-health-card.hot strong{color:#c4451d}.ec-system-health-card.good strong{color:#287a3e}
    @media(max-width:900px){.ec-system-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){.ec-system-health{padding:11px}.ec-system-health-head{display:grid}.ec-system-health-state{justify-self:start}.ec-system-health-grid{grid-template-columns:1fr 1fr}.ec-system-health-card strong{font-size:.9rem}}
  `;
  document.head.appendChild(style);
}

function fmt(value) {
  if (value === null || value === undefined) return '–';
  return new Intl.NumberFormat('de-AT').format(Number(value || 0));
}

function fmtBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '0 MB';
  return `${(n / 1024 / 1024).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;
}

function card(label, value, note, tone = '') {
  const el = document.createElement('article');
  el.className = `ec-system-health-card ${tone}`.trim();
  const small = document.createElement('small');
  small.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  const em = document.createElement('em');
  em.textContent = note;
  el.append(small, strong, em);
  return el;
}

function ensurePanel(root) {
  let panel = root.querySelector('.ec-system-health');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.className = 'ec-system-health';
  panel.innerHTML = `<div class="ec-system-health-head"><div><span>SYSTEM & AUSLASTUNG</span><h3>Live-Community-Monitor</h3><p>Registrierungen, echte Aktivität und Datenbankzustand auf einen Blick.</p></div><small class="ec-system-health-state">● Live</small></div><div class="ec-system-health-grid"><article class="ec-system-health-card"><small>Status</small><strong>Wird geladen …</strong><em>Live-Abfrage</em></article></div><div class="ec-system-health-foot"><span>Nur für Head Admin sichtbar.</span><span class="ec-system-health-time"></span></div>`;
  const modern = root.querySelector('.ec-admin-modern');
  if (modern) modern.appendChild(panel);
  else root.prepend(panel);
  return panel;
}

async function refresh(panel) {
  if (!supabase || !panel || !document.body.contains(panel)) return;
  const { data, error } = await supabase.rpc('head_admin_system_health');
  const grid = panel.querySelector('.ec-system-health-grid');
  const state = panel.querySelector('.ec-system-health-state');
  const time = panel.querySelector('.ec-system-health-time');
  if (error) {
    state.textContent = 'Nicht verfügbar';
    state.style.background = '#fff1ec';
    state.style.color = '#b34b25';
    grid.replaceChildren(card('Systemmonitor', 'Fehler', error.message || 'Abfrage fehlgeschlagen', 'hot'));
    return;
  }
  const d = data || {};
  const max = Number(d.max_connections || 0);
  const open = Number(d.open_connections || 0);
  const ratio = max ? Math.round(open / max * 100) : 0;
  const connectionTone = ratio >= 80 ? 'hot' : 'good';
  state.textContent = ratio >= 80 ? '● Hohe Last' : '● System normal';
  state.style.background = ratio >= 80 ? '#fff1ec' : '#eaf7ed';
  state.style.color = ratio >= 80 ? '#b34b25' : '#26723b';
  grid.replaceChildren(
    card('Registrierte Mitglieder', fmt(d.registered_users), `${fmt(d.non_test_profiles)} ohne Testkonto`),
    card('Jetzt aktiv · 5 Min.', fmt(d.online_5m), `${fmt(d.online_15m)} in 15 Minuten`, 'good'),
    card('Aktiv · 24 Stunden', fmt(d.active_24h), `${fmt(d.active_1h)} in der letzten Stunde`),
    card('Verifizierte Profile', fmt(d.verified_profiles), `${fmt(d.active_accounts)} aktive Konten`),
    card('Datenbankgröße', fmtBytes(d.database_size_bytes), 'PostgreSQL gesamt'),
    card('DB-Verbindungen', `${fmt(open)} / ${fmt(max)}`, `${ratio}% des Verbindungslimits`, connectionTone),
    card('Aktive DB-Abfragen', fmt(d.active_connections), 'gerade arbeitende Verbindungen', d.active_connections > 10 ? 'hot' : 'good'),
    card('Profile', fmt(d.profiles), 'Profil-Datensätze')
  );
  time.textContent = `Aktualisiert: ${new Date(d.checked_at || Date.now()).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

async function mount(retries = 8) {
  if (!supabase) return;
  const root = document.querySelector('.admin-page');
  if (!root) {
    if (retries > 0) setTimeout(() => mount(retries - 1), 180);
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: me } = await supabase.from('profiles').select('role,account_status').eq('id', user.id).maybeSingle();
  if (me?.role !== 'HEAD_ADMIN' || String(me?.account_status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return;
  ensureStyles();
  const panel = ensurePanel(root);
  mountedFor = user.id;
  await refresh(panel);
  clearInterval(timer);
  timer = setInterval(() => {
    if (!document.body.contains(panel)) {
      clearInterval(timer);
      timer = null;
      mountedFor = null;
      return;
    }
    void refresh(panel);
  }, 60_000);
}

window.addEventListener('ec:navigate', () => setTimeout(() => void mount(), 0));
window.addEventListener('focus', () => {
  if (document.querySelector('.admin-page')) void mount(2);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void mount(), { once: true });
else void mount();
window.addEventListener('pagehide', () => { if (timer) clearInterval(timer); });
