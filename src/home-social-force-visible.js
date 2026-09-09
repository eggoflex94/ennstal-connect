import { supabase } from './supabaseClient';

let refreshTimer = null;
let context = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value) => value ? new Date(value).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

async function loadContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const picker = document.querySelector('.ec-region-picker select');
  const activeSlug = picker?.value || localStorage.getItem('ec-active-region');
  const [{ data: profile }, { data: regions }, { data: permissions }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('id,nickname,role,home_region_id').eq('id', user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active', true),
    supabase.from('user_permissions').select('manage_reports,manage_events').eq('user_id', user.id).maybeSingle(),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true)
  ]);
  const region = (regions || []).find((item) => item.slug === activeSlug) || (regions || []).find((item) => item.id === profile?.home_region_id) || null;
  const role = String(profile?.role || '').toUpperCase();
  return {
    user,
    profile,
    region,
    canModerateActivities: role === 'HEAD_ADMIN' || (role === 'ADMIN' && permissions?.manage_reports === true),
    canManageEvents: role === 'HEAD_ADMIN' || role === 'ADMIN' || permissions?.manage_events === true || (assignments || []).some((item) => item.region_id === region?.id && item.active)
  };
}

function ensureMount() {
  const home = document.querySelector('.home-page');
  if (!home) return null;
  let social = home.querySelector(':scope > .ec-home-social.ec-force-social');
  if (!social) {
    social = document.createElement('section');
    social.className = 'ec-home-social ec-force-social';
    social.dataset.ecForceVisible = '1';
    social.innerHTML = `
      <div class="ec-home-social-grid">
        <article class="ec-status-card panel">
          <span class="eyebrow">AKTIVITÄTEN</span>
          <h2>Was machst du gerade?</h2>
          <p>Teile freiwillig einen kurzen Status mit Freunden, deiner Region oder nur für dich.</p>
          <form class="ec-force-status-form ec-status-form">
            <textarea name="content" maxlength="500" placeholder="z. B. Bin heute in Leoben unterwegs …" required></textarea>
            <div>
              <select name="visibility"><option value="FRIENDS">Nur Freunde</option><option value="REGION">Meine Region</option><option value="PRIVATE">Nur ich</option></select>
              <select name="expires"><option value="24">24 Stunden</option><option value="72">3 Tage</option><option value="168">7 Tage</option><option value="0">Ohne Ablauf</option></select>
              <button class="primary-button">Aktivität teilen</button>
            </div>
          </form>
        </article>
        <article class="ec-reminder-card panel">
          <span class="eyebrow">ERINNERUNGEN</span>
          <h2>Deine kommenden Events</h2>
          <div class="ec-reminder-list"></div>
        </article>
      </div>
      <section class="ec-friend-feed panel">
        <div class="ec-section-head"><div><span class="eyebrow">FREUNDE & REGION</span><h2>Aktuelle Aktivitäten</h2><p>Nur Inhalte, die für dich freigegeben wurden.</p></div></div>
        <div class="ec-friend-feed-list"></div>
      </section>
      <section class="ec-home-events panel">
        <div class="ec-section-head"><div><span class="eyebrow">VERANSTALTUNGEN</span><h2>Aktuelle Events</h2><p>Die nächsten Termine der ausgewählten Region.</p></div></div>
        <div class="ec-home-event-list"></div>
      </section>`;
    const heading = home.querySelector('.page-heading');
    if (heading) heading.insertAdjacentElement('afterend', social);
    else home.prepend(social);

    social.querySelector('.ec-force-status-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { error } = await supabase.rpc('ec_create_activity', {
        p_content: String(form.get('content') || '').trim(),
        p_visibility: String(form.get('visibility') || 'FRIENDS'),
        p_event_id: null,
        p_expires_hours: Number(form.get('expires') || 24)
      });
      if (error) return alert(error.message);
      event.currentTarget.reset();
      queueRefresh();
    };
  }
  return social;
}

function activityMarkup(row) {
  const canModerate = context?.canModerateActivities && !row.is_mine;
  const action = row.is_mine
    ? '<button type="button" class="ec-activity-delete" data-own-delete title="Aktivität löschen">×</button>'
    : canModerate
      ? '<button type="button" class="ec-activity-delete ec-activity-moderate" data-moderate-delete title="Wegen Regelverstoß löschen">⚑</button>'
      : '';
  return `<article class="ec-friend-activity" data-activity-id="${esc(row.id)}">
    <img src="${esc(row.avatar_url || '/community-default-avatar.png')}" alt="">
    <div>
      <div class="ec-friend-activity-head"><strong>${esc(row.nickname || 'Mitglied')}</strong><small>${esc(fmt(row.created_at))}</small></div>
      <p>${esc(row.content)}</p>
      ${row.event_title ? `<button type="button" class="ec-activity-event-link">▣ ${esc(row.event_title)} · ${esc(fmt(row.event_at))}</button>` : ''}
      <small class="ec-activity-visibility">${row.visibility === 'FRIENDS' ? '♥ Freunde' : row.visibility === 'REGION' ? '⌖ Region' : '🔒 Privat'}</small>
    </div>${action}
  </article>`;
}

function eventMarkup(event) {
  const klass = `ec-font-${esc(event.font_family || 'modern')} ec-size-${esc(event.font_size || 'normal')} ec-em-${esc(event.emphasis || 'normal')}`;
  return `<article class="ec-home-event" data-event-id="${esc(event.id)}">
    ${event.image_url ? `<img src="${esc(event.image_url)}" alt="">` : ''}
    <div class="ec-home-event-body ${klass}" style="--event-color:${esc(event.font_color || '#17324a')}">
      <small>AKTUELLES EVENT</small><h3>${esc(event.title)}</h3>
      <p class="ec-home-event-meta">${esc(fmt(event.event_at))}${event.location ? ` · ${esc(event.location)}` : ''}</p>
      ${event.description ? `<p>${esc(event.description)}</p>` : ''}
      <div class="ec-home-event-actions">
        <button type="button" data-share>Aktivität teilen</button>
        <button type="button" data-rsvp="GOING">Ich bin dabei</button>
        <button type="button" data-rsvp="INTERESTED">Interessiert</button>
        ${context?.canManageEvents ? '<button type="button" data-edit>Bearbeiten</button><button type="button" data-delete class="danger">Löschen</button>' : ''}
      </div>
    </div>
  </article>`;
}

async function moderateDelete(activityId) {
  const reason = prompt('Warum wird diese Aktivität wegen eines Regelverstoßes gelöscht?', 'Verstoß gegen die Community-Regeln');
  if (reason === null) return;
  if (reason.trim().length < 5) return alert('Bitte einen nachvollziehbaren Grund mit mindestens 5 Zeichen angeben.');
  const { error } = await supabase.rpc('ec_moderate_delete_activity', { p_activity_id: activityId, p_reason: reason.trim() });
  if (error) return alert(error.message);
  queueRefresh();
}

async function render() {
  context = await loadContext();
  if (!context?.user?.id) return;
  const social = ensureMount();
  if (!social) return;

  const [activityResult, reminderResult, eventResult] = await Promise.all([
    supabase.rpc('ec_activity_feed', { p_region: context.region?.id || null }),
    supabase.rpc('ec_my_event_reminders'),
    (() => {
      let query = supabase.from('community_events').select('*').gte('event_at', new Date().toISOString()).order('event_at', { ascending:true }).limit(8);
      if (context.region?.id) query = query.eq('region_id', context.region.id);
      return query;
    })()
  ]);

  const activities = activityResult.data || [];
  const reminders = reminderResult.data || [];
  const events = eventResult.data || [];

  const feed = social.querySelector('.ec-friend-feed-list');
  feed.innerHTML = activities.length ? activities.map(activityMarkup).join('') : '<div class="ec-empty-state">Noch keine Aktivitäten sichtbar.</div>';
  feed.querySelectorAll('[data-own-delete]').forEach((button) => button.onclick = async () => {
    const id = button.closest('[data-activity-id]')?.dataset.activityId;
    if (!id || !confirm('Diese eigene Aktivität löschen?')) return;
    const { error } = await supabase.rpc('ec_delete_activity', { p_activity_id:id });
    if (error) return alert(error.message);
    queueRefresh();
  });
  feed.querySelectorAll('[data-moderate-delete]').forEach((button) => button.onclick = () => {
    const id = button.closest('[data-activity-id]')?.dataset.activityId;
    if (id) void moderateDelete(id);
  });

  const reminderList = social.querySelector('.ec-reminder-list');
  reminderList.innerHTML = reminders.length ? reminders.map((item) => `<div><strong>${esc(item.title)}</strong><small>${esc(fmt(item.event_at))}${item.location ? ` · ${esc(item.location)}` : ''}</small></div>`).join('') : '<p>Keine anstehenden Erinnerungen.</p>';

  const eventList = social.querySelector('.ec-home-event-list');
  eventList.innerHTML = events.length ? events.map(eventMarkup).join('') : '<div class="ec-empty-state">Derzeit keine kommenden Events in dieser Region.</div>';
  eventList.querySelectorAll('.ec-home-event').forEach((card) => {
    const item = events.find((event) => event.id === card.dataset.eventId);
    if (!item) return;
    card.querySelector('[data-share]')?.addEventListener('click', async () => {
      const text = prompt('Text zur geteilten Aktivität:', `Ich interessiere mich für „${item.title}“`);
      if (text === null || text.trim().length < 2) return;
      const { error } = await supabase.rpc('ec_create_activity', { p_content:text.trim(), p_visibility:'FRIENDS', p_event_id:item.id, p_expires_hours:72 });
      if (error) return alert(error.message);
      queueRefresh();
    });
    card.querySelectorAll('[data-rsvp]').forEach((button) => button.addEventListener('click', async () => {
      const { error } = await supabase.from('community_event_rsvps').upsert({ event_id:item.id, user_id:context.user.id, status:button.dataset.rsvp }, { onConflict:'event_id,user_id' });
      if (error) return alert(error.message);
      queueRefresh();
    }));
    card.querySelector('[data-edit]')?.addEventListener('click', () => {
      card.querySelector('[data-action="edit"]')?.click();
      window.dispatchEvent(new CustomEvent('ec:edit-home-event', { detail:{ eventId:item.id } }));
    });
    card.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!confirm(`Event „${item.title}“ wirklich löschen?`)) return;
      const { error } = await supabase.from('community_events').delete().eq('id', item.id);
      if (error) return alert(error.message);
      queueRefresh();
    });
  });
}

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void render(), 120);
}

window.addEventListener('ec:region-change', queueRefresh);
window.addEventListener('focus', queueRefresh, { passive:true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) queueRefresh(); });
new MutationObserver(() => {
  const home = document.querySelector('.home-page');
  if (home && !home.querySelector('.ec-home-social')) queueRefresh();
}).observe(document.documentElement, { childList:true, subtree:true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queueRefresh, { once:true });
else queueRefresh();
