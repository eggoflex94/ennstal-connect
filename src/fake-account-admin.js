import { supabase } from "./supabaseClient";

let portal = null;
let activeRoot = null;
let currentRows = [];
let loading = false;
let resizeTimer = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt = (value) => value ? new Date(value).toLocaleString("de-AT") : "–";

function ensureStyles() {
  if (document.getElementById('ec-fake-portal-style')) return;
  const style = document.createElement('style');
  style.id = 'ec-fake-portal-style';
  style.textContent = `
    .ec-fake-portal{position:absolute;z-index:20;box-sizing:border-box;background:#fff;border:1px solid rgba(14,62,115,.16);border-radius:16px;box-shadow:0 10px 28px rgba(13,48,86,.12);color:#18344f;min-height:220px}
    .ec-fake-portal[hidden]{display:none!important}
    .ec-fake-portal .ec-fake-intro{display:flex;flex-direction:column;gap:3px;margin-bottom:12px}.ec-fake-portal .ec-fake-intro strong{font-size:1.15rem}.ec-fake-portal .ec-fake-intro small{opacity:.72}
    .ec-fake-device-box{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:10px 0;padding:10px;border:1px solid rgba(14,62,115,.12);border-radius:12px;background:rgba(14,62,115,.035)}
    .ec-fake-device-box span{display:flex;flex-direction:column;gap:2px}.ec-fake-device-box b{font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;opacity:.72}.ec-fake-device-box small{font-size:.9rem}
    @media(max-width:900px){.ec-fake-portal{position:fixed!important;left:12px!important;right:12px!important;top:120px!important;width:auto!important;max-height:calc(100vh - 140px);overflow:auto}}
  `;
  document.head.appendChild(style);
}

function ensurePortal() {
  ensureStyles();
  if (portal?.isConnected) return portal;
  portal = document.createElement("section");
  portal.className = "ec-fake-portal";
  portal.hidden = true;
  portal.innerHTML = `
    <div class="ec-fake-body">
      <div class="ec-fake-intro"><strong>Fake-Account-Prüfung</strong><small>Nur Head Admin · Verhalten, IP-Abgleich & Geräteklasse</small></div>
      <p class="ec-fake-note">Die Prüfpriorität ist kein Beweis für ein Fake-Konto. Gemeinsame IP-Adressen können z. B. durch Familien, Firmen, Mobilfunk oder öffentliches WLAN entstehen. Es gibt keine automatische Sperre.</p>
      <div class="ec-fake-toolbar">
        <input class="ec-fake-search" type="search" placeholder="Nickname oder Name suchen" aria-label="Nickname oder Name suchen">
        <select class="ec-fake-filter" aria-label="Prüffilter"><option value="priority">Erhöhte Priorität (ab 40)</option><option value="unreviewed">Noch nicht geprüft</option><option value="all">Alle Konten</option></select>
        <button type="button" class="primary-button ec-fake-refresh">Neu prüfen</button>
      </div>
      <p class="ec-fake-summary" role="status"></p>
      <div class="ec-fake-list" aria-live="polite"></div>
    </div>`;
  document.body.appendChild(portal);
  portal.querySelector('.ec-fake-refresh').onclick = () => void load();
  portal.querySelector('.ec-fake-filter').onchange = renderRows;
  portal.querySelector('.ec-fake-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') void load(); });
  return portal;
}

function positionPortal() {
  if (!activeRoot || !portal?.isConnected || portal.hidden) return;
  const rect = activeRoot.getBoundingClientRect();
  const heading = activeRoot.querySelector('.page-heading');
  const headingRect = heading?.getBoundingClientRect();
  const top = Math.max(rect.top + window.scrollY + 115, (headingRect?.bottom || rect.top) + window.scrollY + 20);
  portal.style.left = `${Math.max(16, rect.left + window.scrollX + 28)}px`;
  portal.style.top = `${top}px`;
  portal.style.width = `${Math.max(340, rect.width - 56)}px`;
}

function riskClass(score) { return score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'; }

function filteredRows() {
  const filter = portal?.querySelector('.ec-fake-filter')?.value || 'priority';
  return currentRows.filter((row) => filter === 'all' || (filter === 'unreviewed' && String(row.review_state || 'REVIEW') === 'REVIEW') || (filter === 'priority' && Number(row.risk_score || 0) >= 40));
}

function renderRows() {
  if (!portal) return;
  const list = portal.querySelector('.ec-fake-list');
  const summary = portal.querySelector('.ec-fake-summary');
  const rows = filteredRows();
  summary.textContent = `${currentRows.filter((row) => Number(row.risk_score || 0) >= 40).length} mit erhöhter Prüfpriorität · ${rows.length} angezeigt`;
  list.replaceChildren();
  if (!rows.length) {
    list.innerHTML = '<p class="ec-fake-empty">Keine Konten für diesen Filter gefunden.</p>';
    return;
  }

  rows.forEach((row) => {
    const card = document.createElement('article');
    card.className = `ec-fake-card risk-${riskClass(Number(row.risk_score || 0))}`;
    const signals = Array.isArray(row.signals) ? row.signals : [];
    const devices = Array.isArray(row.device_labels) ? row.device_labels : [];
    const reviewLabel = row.review_state === 'SAFE' ? 'Manuell als unauffällig eingestuft' : row.review_state === 'FAKE' ? 'Als Fake gesperrt' : 'Noch nicht geprüft';
    card.innerHTML = `
      <div class="ec-fake-top"><div><strong>${esc(row.nickname || 'Ohne Nickname')}</strong><small>${esc([row.first_name,row.last_name].filter(Boolean).join(' ') || 'Name nicht angegeben')}</small></div><span class="ec-fake-score">Prüfpriorität ${Number(row.risk_score || 0)}/100</span></div>
      <div class="ec-fake-meta"><span>Konto: ${esc(row.account_status || '–')}</span><span>Erstellt: ${fmt(row.created_at)}</span><span>Letzter Login: ${fmt(row.last_sign_in_at)}</span><span>${row.email_confirmed ? '✓ E-Mail bestätigt' : '⚠ E-Mail offen'}</span><span>${row.is_verified ? '✓ Profil verifiziert' : 'Profil nicht verifiziert'}</span></div>
      <div class="ec-fake-device-box"><span><b>Letztes Gerät</b><small>${esc(row.latest_device || 'Keine Sitzungsdaten')}</small></span><span><b>Geräte / Browser (90 Tage)</b><small>${devices.length ? devices.map(esc).join(' · ') : 'Keine Daten'}</small></span><span><b>Verschiedene IPs</b><small>${Number(row.ip_count_90d || 0)}</small></span><span><b>Höchster IP-Abgleich</b><small>${Number(row.shared_ip_accounts || 0) > 1 ? `${Number(row.shared_ip_accounts)} Konten auf derselben IP` : 'Keine Mehrfachnutzung erkannt'}</small></span></div>
      <ul class="ec-fake-signals">${signals.length ? signals.map((s)=>`<li>${esc(s)}</li>`).join('') : '<li>Keine starken Auffälligkeiten erkannt.</li>'}</ul>
      <div class="ec-fake-stats"><span>${Number(row.open_reports || 0)} Meldungen/30 Tage</span><span>${Number(row.friend_requests_24h || 0)} Freundschaftsanfragen/24h</span><span>${Number(row.messages_24h || 0)} Nachrichten/24h</span><span>${Number(row.forum_posts || 0)} Forumsbeiträge</span></div>
      <div class="ec-fake-review"><b>${esc(reviewLabel)}</b>${row.review_note ? `<small>${esc(row.review_note)}</small>` : ''}</div>
      <div class="ec-fake-actions"></div>`;

    const actions = card.querySelector('.ec-fake-actions');
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'secondary-button'; open.textContent = 'Profil öffnen';
    open.onclick = () => window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:row.user_id}}));
    actions.append(open);

    const safe = document.createElement('button');
    safe.type='button'; safe.className='secondary-button'; safe.textContent='Als unauffällig markieren';
    safe.onclick = async () => { const note=prompt('Optionaler Prüfvermerk:',row.review_note||'Profil manuell geprüft.'); if(note===null)return; const {error}=await supabase.rpc('head_admin_set_fake_account_review',{p_target_user:row.user_id,p_state:'SAFE',p_note:note}); if(error)return alert(error.message); void load(); };
    actions.append(safe);

    if (String(row.account_status || '').toUpperCase() === 'SUSPENDED') {
      const restore = document.createElement('button');
      restore.type='button'; restore.className='secondary-button'; restore.textContent='Konto entsperren';
      restore.onclick = async () => { const note=prompt('Grund für die Entsperrung:','Nachprüfung abgeschlossen.'); if(note===null)return; const {error}=await supabase.rpc('head_admin_restore_fake_account',{p_target_user:row.user_id,p_note:note}); if(error)return alert(error.message); void load(); };
      actions.append(restore);
    } else {
      const suspend = document.createElement('button');
      suspend.type='button'; suspend.className='danger-button'; suspend.textContent='Als Fake sperren';
      suspend.onclick = async () => { if(!confirm(`Konto „${row.nickname || 'ohne Nickname'}“ wirklich als Fake sperren?`))return; const note=prompt('Begründung für die Sperre:','Verdacht auf Fake-Account nach manueller Prüfung.'); if(!note?.trim())return; const {error}=await supabase.rpc('head_admin_set_fake_account_review',{p_target_user:row.user_id,p_state:'FAKE',p_note:note.trim()}); if(error)return alert(error.message); void load(); };
      actions.append(suspend);
    }
    list.append(card);
  });
}

async function load() {
  const p = ensurePortal();
  if (loading || p.hidden) return;
  loading = true;
  const list = p.querySelector('.ec-fake-list');
  const summary = p.querySelector('.ec-fake-summary');
  list.textContent = 'Konten werden geprüft …';
  summary.textContent = '';
  try {
    const { data, error } = await supabase.rpc('head_admin_fake_account_candidates', { p_search: p.querySelector('.ec-fake-search')?.value || '', p_limit: 250 });
    if (error) throw error;
    currentRows = Array.isArray(data) ? data : [];
    renderRows();
  } catch (error) {
    currentRows = [];
    list.innerHTML = `<p class="ec-fake-empty"><strong>Fake-Erkennung konnte nicht geladen werden.</strong><br>${esc(error?.message || 'Unbekannter Fehler')}</p>`;
  } finally {
    loading = false;
  }
}

function sync() {
  const root = document.querySelector('.fake-account-page');
  if (!root) {
    activeRoot = null;
    if (portal) portal.hidden = true;
    return;
  }

  const p = ensurePortal();
  activeRoot = root;
  p.hidden = false;
  positionPortal();
  if (!p.dataset.loaded) {
    p.dataset.loaded = '1';
    void load();
  }
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; sync(); });
}).observe(document.documentElement, { childList:true, subtree:true });

window.addEventListener('resize',()=>{ clearTimeout(resizeTimer); resizeTimer=setTimeout(positionPortal,50); });
window.addEventListener('scroll',positionPortal,{passive:true});
window.addEventListener('ec:navigate',()=>setTimeout(sync,0));
window.addEventListener('focus',sync);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',sync,{once:true}); else sync();
