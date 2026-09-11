import { supabase } from './supabaseClient';

let queued = false;
let viewer = null;
let viewerPromise = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·');
};

const categoryLabel = (value) => ({
  RULE_VIOLATION: 'Regelverstoß',
  ADMIN_BONUS: 'Bonus',
  FORUM_HELPFUL: 'Hilfreicher Forenbeitrag',
  COMMUNITY_HELPFUL: 'Community-Hilfe',
  EVENT_HELP: 'Event-Hilfe',
  ADMIN_ADJUSTMENT: 'Admin-Anpassung',
  ONLINE_TIME: 'Onlinezeit',
  FORUM_POST: 'Forenbeitrag',
  FORUM_REPLY: 'Forum-Antwort',
  OTHER: 'Sonstiges'
}[String(value || '').toUpperCase()] || String(value || 'Punkte'));

async function loadViewer() {
  if (viewer) return viewer;
  if (viewerPromise) return viewerPromise;
  viewerPromise = (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
    const current = data || { id: user.id, role: 'MEMBER' };
    if (String(current.role || '').toUpperCase() === 'SUPPORTER') {
      const { data: assignments } = await supabase
        .from('regional_admin_assignments')
        .select('region_id')
        .eq('user_id', user.id)
        .eq('active', true);
      current.isRegionalAdmin = Boolean(assignments?.length);
      current.regionalAdminRegions = (assignments || []).map((row) => row.region_id);
    } else {
      current.isRegionalAdmin = false;
      current.regionalAdminRegions = [];
    }
    viewer = current;
    return viewer;
  })().finally(() => { viewerPromise = null; });
  return viewerPromise;
}

function isAdminLike(profile) {
  const role = String(profile?.role || '').toUpperCase();
  return role === 'HEAD_ADMIN' || role === 'ADMIN' || Boolean(profile?.isRegionalAdmin);
}

function closeModal() {
  document.querySelector('.ec-points-modal')?.remove();
}

function actorMarkup(entry) {
  if (entry.automated || !entry.actor_id) return '<span class="ec-points-actor is-system">System</span>';
  const star = entry.actor_star ? `<img src="${esc(entry.actor_star)}" alt="" aria-hidden="true">` : '';
  const nickname = esc(entry.actor_nickname || 'Admin');
  return `<span class="ec-points-actor">${star}<b>${nickname}</b></span>`;
}

function historyMarkup(history = []) {
  if (!history.length) return '<div class="ec-points-empty">Noch keine Punktebuchungen vorhanden.</div>';
  return history.map((entry) => {
    const amount = Number(entry.amount || 0);
    const positive = amount > 0;
    return `<article class="ec-points-history-row ${positive ? 'is-plus' : amount < 0 ? 'is-minus' : ''}">
      <div class="ec-points-history-amount">${positive ? '+' : ''}${amount}</div>
      <div class="ec-points-history-copy">
        <div class="ec-points-history-top"><strong>${esc(categoryLabel(entry.category))}</strong>${actorMarkup(entry)}</div>
        <span>${esc(entry.reason || 'Keine Begründung')}</span>
        <small>${esc(fmtDate(entry.created_at))}${entry.automated ? ' · automatisch' : ''}</small>
      </div>
    </article>`;
  }).join('');
}

async function openPoints(targetUserId, { suspensionMode = false, focusAdminForm = false } = {}) {
  if (!targetUserId) return;
  const current = await loadViewer();
  if (!isAdminLike(current)) return;

  const { data, error } = await supabase.rpc('profile_point_feed', { p_user_id: targetUserId });
  if (error) {
    console.warn('Punkteliste konnte nicht geladen werden:', error.message);
    return;
  }

  const canManage = current?.id !== targetUserId;
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = `ec-points-modal${suspensionMode ? ' is-suspension' : ''}`;
  overlay.innerHTML = `<section class="ec-points-dialog" role="dialog" aria-modal="true" aria-label="Punkteliste">
    <header class="ec-points-head">
      <div><span>PUNKTESYSTEM</span><h2>${suspensionMode ? 'Konto gesperrt' : 'Punkteliste'}</h2></div>
      ${suspensionMode ? '' : '<button type="button" class="ec-points-close" aria-label="Schließen">×</button>'}
    </header>
    ${suspensionMode ? `<div class="ec-points-suspension-reason"><strong>Sperrgrund</strong><span>${esc(data.suspension_reason || 'Automatische Sperre wegen Punktestand unter -10.')}</span></div>` : ''}
    <div class="ec-points-summary">
      <div><span>GESAMTPUNKTE</span><strong>${Number(data.score || 0)}</strong></div>
      <div><span>ADMIN-ÄNDERUNGEN</span><strong>${Number(data.manual_adjustment || 0)}</strong></div>
    </div>
    ${canManage ? `<form class="ec-points-admin-form">
      <div class="ec-points-form-title"><strong>Punkte vergeben oder abziehen</strong><span>Jede Änderung wird mit Begründung protokolliert und dem Mitglied automatisch mitgeteilt.</span></div>
      <label>Änderung<input name="delta" type="number" min="-100" max="100" step="1" required placeholder="z. B. 5 oder -3"></label>
      <label>Kategorie<select name="category">
        <option value="ADMIN_BONUS">Bonus</option>
        <option value="RULE_VIOLATION">Regelverstoß</option>
        <option value="FORUM_HELPFUL">Hilfreicher Forenbeitrag</option>
        <option value="COMMUNITY_HELPFUL">Community-Hilfe</option>
        <option value="EVENT_HELP">Event-Hilfe</option>
        <option value="ADMIN_ADJUSTMENT">Admin-Anpassung</option>
        <option value="OTHER">Sonstiges</option>
      </select></label>
      <label class="is-wide">Begründung<textarea name="reason" rows="3" minlength="3" maxlength="500" required placeholder="Begründung für die Punkteänderung"></textarea></label>
      <button type="submit">Punkte buchen</button>
      <div class="ec-points-form-status" aria-live="polite"></div>
    </form>` : ''}
    <div class="ec-points-list-title"><strong>Verlauf</strong><span>Plus- und Minuspunkte mit Vergabe durch und Begründung</span></div>
    <div class="ec-points-history">${historyMarkup(data.history)}</div>
    ${suspensionMode ? '<p class="ec-points-suspension-note">Der Zugang zur Community bleibt gesperrt, solange dein Konto gesperrt ist.</p>' : ''}
  </section>`;
  document.body.appendChild(overlay);

  if (focusAdminForm) {
    const deltaInput = overlay.querySelector('.ec-points-admin-form input[name="delta"]');
    if (deltaInput) {
      deltaInput.focus();
      deltaInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  overlay.querySelector('.ec-points-close')?.addEventListener('click', closeModal);
  if (!suspensionMode) overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });

  const form = overlay.querySelector('.ec-points-admin-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('.ec-points-form-status');
    const submit = form.querySelector('button[type="submit"]');
    const values = new FormData(form);
    const delta = Number(values.get('delta'));
    const reason = String(values.get('reason') || '').trim();
    const category = String(values.get('category') || 'ADMIN_ADJUSTMENT');
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100 || reason.length < 3) return;
    submit.disabled = true;
    status.textContent = 'Wird gespeichert …';
    const { data: result, error: awardError } = await supabase.rpc('award_member_points', {
      target_user: targetUserId,
      point_delta: delta,
      reason_text: reason,
      category_text: category,
      notify_member: true,
      source_type_text: 'PROFILE_ADMIN',
      source_id_value: null
    });
    if (awardError) {
      status.textContent = awardError.message;
      submit.disabled = false;
      return;
    }
    status.textContent = result?.suspended ? `Gespeichert. Konto wurde bei ${result.score} Punkten automatisch gesperrt.` : `Gespeichert. Neuer Punktestand: ${result?.score ?? ''}`;
    window.dispatchEvent(new CustomEvent('ec:activity-progress-refresh'));
    window.dispatchEvent(new CustomEvent('ec:points-updated', { detail: { userId: targetUserId } }));
    window.setTimeout(() => void openPoints(targetUserId), 500);
  });
}

async function bindSidebarPoints() {
  const score = document.querySelector('.ec-dock-reward-card .ec-dock-reward-head b');
  if (!score) return;
  const current = await loadViewer();
  const allowed = isAdminLike(current);
  if (!allowed) {
    score.classList.remove('ec-points-clickable');
    score.removeAttribute('role');
    score.removeAttribute('tabindex');
    score.removeAttribute('title');
    return;
  }
  if (score.dataset.ecPointsBound === '1') return;
  score.dataset.ecPointsBound = '1';
  score.classList.add('ec-points-clickable');
  score.setAttribute('role', 'button');
  score.setAttribute('tabindex', '0');
  score.setAttribute('title', 'Punkteliste öffnen');
  const openOwn = () => void openPoints(current.id);
  score.addEventListener('click', openOwn);
  score.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOwn(); } });
}

async function bindProfilePoints() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) return;
  const id = page.dataset.profileId;
  if (!id) return;

  const current = await loadViewer();
  const admin = isAdminLike(current);
  const actions = page.querySelector('.member-profile-actions, .profile-original-actions');
  let listButton = page.querySelector('.ec-profile-points-button');
  let awardButton = page.querySelector('.ec-profile-award-points-button');

  if (!admin || !actions) {
    listButton?.remove();
    awardButton?.remove();
    return;
  }

  if (!listButton) {
    listButton = document.createElement('button');
    listButton.type = 'button';
    listButton.className = 'ec-profile-points-button';
    listButton.textContent = '★ Punkteliste';
  }
  if (listButton.parentElement !== actions) actions.appendChild(listButton);
  if (listButton.dataset.ecPointsBound !== '1') {
    listButton.dataset.ecPointsBound = '1';
    listButton.addEventListener('click', () => void openPoints(id));
  }

  if (current?.id === id) {
    awardButton?.remove();
    return;
  }

  if (!awardButton) {
    awardButton = document.createElement('button');
    awardButton.type = 'button';
    awardButton.className = 'ec-profile-award-points-button';
    awardButton.textContent = '✚ Punkte vergeben';
  }
  if (awardButton.parentElement !== actions) actions.appendChild(awardButton);
  if (awardButton.dataset.ecPointsBound !== '1') {
    awardButton.dataset.ecPointsBound = '1';
    awardButton.addEventListener('click', () => void openPoints(id, { focusAdminForm: true }));
  }
}

async function checkSuspension(session) {
  if (!session?.user?.id) return;
  try {
    const { data, error } = await supabase.rpc('my_suspension_details');
    if (error || data?.account_status !== 'SUSPENDED') return;
    sessionStorage.setItem('ec:suspension-details', JSON.stringify({ ...data, userId: session.user.id, capturedAt: Date.now() }));
    showSuspension(data);
  } catch (error) {
    console.warn('Sperrstatus konnte nicht geprüft werden:', error?.message || error);
  }
}

function showSuspension(data) {
  document.querySelector('.ec-points-modal')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ec-points-modal is-suspension';
  overlay.innerHTML = `<section class="ec-points-dialog" role="dialog" aria-modal="true">
    <header class="ec-points-head"><div><span>KONTOSTATUS</span><h2>Konto gesperrt</h2></div></header>
    <div class="ec-points-suspension-reason"><strong>Sperrgrund</strong><span>${esc(data?.suspension_reason || 'Automatische Sperre wegen Punktestand unter -10.')}</span></div>
    <div class="ec-points-summary"><div><span>GESAMTPUNKTE</span><strong>${Number(data?.score || 0)}</strong></div></div>
    <div class="ec-points-list-title"><strong>Punkteliste</strong><span>Alle Buchungen, die zu deinem Punktestand geführt haben</span></div>
    <div class="ec-points-history">${historyMarkup(data?.history || [])}</div>
    <p class="ec-points-suspension-note">Ein Zugang zur Community ist mit diesem gesperrten Konto nicht möglich.</p>
  </section>`;
  document.body.appendChild(overlay);
}

function restoreSuspensionScreen() {
  try {
    const raw = sessionStorage.getItem('ec:suspension-details');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.userId || Date.now() - Number(saved.capturedAt || 0) > 15 * 60 * 1000) {
      sessionStorage.removeItem('ec:suspension-details');
      return;
    }
    showSuspension(saved);
  } catch {}
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void bindSidebarPoints();
    void bindProfilePoints();
  });
}

async function boot() {
  restoreSuspensionScreen();
  schedule();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) void checkSuspension(session);
}

supabase.auth.onAuthStateChange((_event, session) => {
  viewer = null;
  if (session?.user) window.setTimeout(() => void checkSuspension(session), 0);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot(), { once: true });
else void boot();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:points-updated', schedule);
