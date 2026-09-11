import { supabase } from './supabaseClient';

let queued = false;
let viewer = null;

function isAdminLike(profile) {
  const role = String(profile?.role || '').toUpperCase();
  return role === 'HEAD_ADMIN' || role === 'ADMIN' || Boolean(profile?.isRegionalAdmin);
}

async function loadViewer() {
  if (viewer) return viewer;
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
  }
  viewer = current;
  return viewer;
}

function closeModal() {
  document.querySelector('.ec-self-points-modal')?.remove();
}

function openSelfAward(userId) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'ec-points-modal ec-self-points-modal';
  overlay.innerHTML = `<section class="ec-points-dialog" role="dialog" aria-modal="true" aria-label="Eigene Punkte vergeben">
    <header class="ec-points-head">
      <div><span>PUNKTESYSTEM</span><h2>Eigene Punkte vergeben</h2></div>
      <button type="button" class="ec-points-close" aria-label="Schließen">×</button>
    </header>
    <form class="ec-points-admin-form">
      <div class="ec-points-form-title"><strong>Punkte vergeben oder abziehen</strong><span>Auch die Selbstvergabe wird mit Begründung protokolliert und automatisch als Nachricht dokumentiert.</span></div>
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
    </form>
  </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('input[name="delta"]')?.focus();
  overlay.querySelector('.ec-points-close')?.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeModal(); });

  const form = overlay.querySelector('form');
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
    const { data, error } = await supabase.rpc('award_member_points', {
      target_user: userId,
      point_delta: delta,
      reason_text: reason,
      category_text: category,
      notify_member: true,
      source_type_text: 'PROFILE_ADMIN_SELF',
      source_id_value: null
    });

    if (error) {
      status.textContent = error.message;
      submit.disabled = false;
      return;
    }

    status.textContent = `Gespeichert. Neuer Punktestand: ${data?.score ?? ''}`;
    window.dispatchEvent(new CustomEvent('ec:activity-progress-refresh'));
    window.dispatchEvent(new CustomEvent('ec:points-updated', { detail: { userId } }));
    form.reset();
    submit.disabled = false;
  });
}

async function bind() {
  const current = await loadViewer();
  if (!current || !isAdminLike(current)) return;
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector('.member-profile-actions, .profile-original-actions');
  if (!page || !actions || page.dataset.profileId !== current.id) return;

  let button = actions.querySelector('.ec-profile-self-award-points-button');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-profile-award-points-button ec-profile-self-award-points-button';
    button.textContent = '✚ Punkte vergeben';
    actions.appendChild(button);
  }
  if (button.dataset.ecSelfPointsBound === '1') return;
  button.dataset.ecSelfPointsBound = '1';
  button.addEventListener('click', () => openSelfAward(current.id));
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void bind();
  });
}

supabase.auth.onAuthStateChange(() => { viewer = null; schedule(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', schedule);
