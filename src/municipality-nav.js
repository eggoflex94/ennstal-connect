import { supabase } from './supabaseClient';

let items = [];
let loading = false;
let timer = null;
let channel = null;
let menuOpen = false;

const activeRegionSlug = () =>
  document.querySelector('.ec-region-picker select')?.value ||
  document.documentElement.dataset.ecRegion ||
  localStorage.getItem('ec-active-region') ||
  'ennstal';

function ensureHost() {
  const nav = document.querySelector('.ec-top-nav');
  if (!nav) return null;
  let host = nav.querySelector('.ec-municipality-nav');
  if (host) return host;
  host = document.createElement('div');
  host.className = 'ec-municipality-nav';
  host.setAttribute('aria-label', 'Gemeinden der aktiven Region');
  const picker = nav.querySelector('.ec-region-picker');
  if (picker) picker.before(host);
  else nav.appendChild(host);
  return host;
}

function render() {
  const host = ensureHost();
  if (!host) return;
  host.replaceChildren();
  host.hidden = false;

  const totalNew = items.reduce((sum, item) => sum + Number(item.new_total || 0), 0);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ec-municipality-nav-trigger';
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');

  const icon = document.createElement('span');
  icon.className = 'ec-municipality-nav-trigger-icon';
  icon.textContent = '◆';

  const label = document.createElement('span');
  label.className = 'ec-municipality-nav-trigger-label';
  label.textContent = 'Gemeinden';

  const chevron = document.createElement('span');
  chevron.className = 'ec-municipality-nav-chevron';
  chevron.textContent = '▾';

  trigger.append(icon, label);

  if (totalNew > 0) {
    const badge = document.createElement('em');
    badge.className = 'ec-municipality-nav-badge';
    badge.textContent = totalNew > 99 ? '99+' : String(totalNew);
    badge.setAttribute('aria-label', totalNew + ' neue Gemeinde-Aktivitäten');
    trigger.appendChild(badge);
  }

  trigger.appendChild(chevron);

  const menu = document.createElement('div');
  menu.className = 'ec-municipality-nav-menu';
  menu.hidden = !menuOpen;
  menu.setAttribute('role', 'menu');

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'ec-municipality-nav-empty';
    const strong = document.createElement('strong');
    strong.textContent = 'Noch keine Gemeinden';
    const small = document.createElement('small');
    small.textContent = 'Für diese Region wurde noch kein Gemeindebereich angelegt.';
    empty.append(strong, small);
    menu.appendChild(empty);
  } else {
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ec-municipality-nav-button';
      button.dataset.municipalityId = item.id;
      button.style.setProperty('--ec-municipality-accent', item.accent_color || '#20a866');
      button.setAttribute('role', 'menuitem');

      const mark = document.createElement('span');
      mark.className = 'ec-municipality-nav-mark';
      mark.textContent = '◆';

      const copy = document.createElement('span');
      copy.className = 'ec-municipality-nav-copy';

      const name = document.createElement('strong');
      name.className = 'ec-municipality-nav-label';
      name.textContent = item.nav_label || item.official_name || 'Gemeinde';

      const detail = document.createElement('small');
      detail.textContent = item.verified ? 'Verifizierter Gemeindebereich' : 'Gemeindebereich';

      copy.append(name, detail);
      button.append(mark, copy);

      const total = Number(item.new_total || 0);
      if (total > 0) {
        const badge = document.createElement('em');
        badge.className = 'ec-municipality-nav-badge';
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.setAttribute('aria-label', total + ' neue Gemeinde-Aktivitäten');
        button.appendChild(badge);
      }

      button.addEventListener('click', () => {
        menuOpen = false;
        window.dispatchEvent(new CustomEvent('ec:navigate', {
          detail: { page: 'municipality', municipalityId: item.id }
        }));
      });
      menu.appendChild(button);
    });
  }

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    menuOpen = !menuOpen;
    render();
  });

  host.append(trigger, menu);
}

async function refresh() {
  if (loading || !supabase) return;
  loading = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      items = [];
      render();
      return;
    }
    const { data, error } = await supabase.rpc('ec_municipality_directory', {
      p_region_slug: activeRegionSlug()
    });
    if (error) throw error;
    items = Array.isArray(data) ? data : [];
    render();
  } catch (error) {
    console.warn('Gemeindenavigation konnte nicht geladen werden:', error?.message || error);
    items = [];
    render();
  } finally {
    loading = false;
  }
}

function schedule(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), delay);
}

function startRealtime() {
  if (channel || !supabase) return;
  channel = supabase.channel('ec-municipality-nav-v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'municipality_notices' }, () => schedule(60))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'citizen_requests' }, () => schedule(60))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'municipality_profiles' }, () => schedule(60))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'municipality_staff' }, () => schedule(60))
    .subscribe();
}

function boot() {
  ensureHost();
  render();
  void refresh();
  startRealtime();
  window.addEventListener('ec:region-change', () => {
    menuOpen = false;
    schedule(40);
  });
  window.addEventListener('ec:municipality-seen', () => schedule(40));
  window.addEventListener('focus', () => schedule(40));
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.ec-municipality-nav') && menuOpen) {
      menuOpen = false;
      render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(40);
  });
  new MutationObserver(() => {
    if (!document.querySelector('.ec-municipality-nav')) {
      ensureHost();
      render();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
