import { supabase } from './supabaseClient';
import './auth-professional-final.css';

let regionPromise = null;
let retryTimer = null;

async function loadRegions() {
  if (!supabase) return [];
  if (!regionPromise) {
    regionPromise = supabase
      .from('regions')
      .select('slug,name,sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => error ? [] : (data || []))
      .catch(() => []);
  }
  return regionPromise;
}

function normalizedRegions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const realOverregional = list.find((region) => region.slug === 'ueberregional');
  const legacySalzkammergut = list.find((region) => region.slug === 'salzkammergut');
  const core = list.filter((region) => !['salzkammergut', 'ueberregional'].includes(region.slug));
  if (realOverregional) return [...core, { ...realOverregional, name: 'Überregional' }];
  if (legacySalzkammergut) return [...core, { ...legacySalzkammergut, name: 'Überregional', legacyAlias: true }];
  return [...core, { slug: 'ueberregional', name: 'Überregional', sort_order: 30, frontendOnly: true }];
}

function syncIntroRegionCopy(page) {
  page.querySelectorAll('.ec-auth-regions article').forEach((article) => {
    const title = article.querySelector('strong');
    if (!title || title.textContent.trim().toLowerCase() !== 'salzkammergut') return;
    title.textContent = 'Überregional';
    const copy = article.querySelector('span');
    if (copy) copy.textContent = 'Für Mitglieder aus allen anderen Bundesländern und Regionen.';
  });
}

async function syncRegistrationRegions() {
  const select = document.querySelector('.auth-page select[name="home_region_slug"]');
  if (!select) return false;

  const regions = normalizedRegions(await loadRegions());
  if (!regions.length) return true;

  const rawCurrent = select.value || 'ennstal';
  const selected = rawCurrent === 'salzkammergut' ? 'ueberregional' : rawCurrent;
  const signature = regions.map((region) => `${region.slug}:${region.name}:${region.legacyAlias ? 'legacy' : 'real'}`).join('|');

  if (select.dataset.ecRegions !== signature) {
    select.replaceChildren(...regions.map((region) => {
      const option = document.createElement('option');
      option.value = region.slug;
      option.textContent = region.slug === 'ueberregional' || region.legacyAlias
        ? 'Überregional – für alle Bundesländer und Regionen'
        : region.name;
      if (region.legacyAlias) option.dataset.ecLegacyOverregional = '1';
      return option;
    }));
    select.dataset.ecRegions = signature;
  }

  const real = regions.find((region) => region.slug === 'ueberregional');
  const legacy = regions.find((region) => region.legacyAlias);
  const wanted = selected === 'ueberregional'
    ? (real?.slug || legacy?.slug || 'ueberregional')
    : selected;
  select.value = regions.some((region) => region.slug === wanted)
    ? wanted
    : (regions.some((region) => region.slug === 'ennstal') ? 'ennstal' : regions[0].slug);

  const label = select.closest('.region-register-label');
  if (label && !label.querySelector('.ec-overregional-note')) {
    const note = document.createElement('small');
    note.className = 'ec-overregional-note';
    note.textContent = '„Überregional“ gilt für alle Bundesländer und Regionen.';
    label.appendChild(note);
  }
  return true;
}

function prepareAuthPage() {
  const page = document.querySelector('.auth-page');
  if (!page) return false;
  page.classList.add('ec-auth-page-clean');

  // Older versions injected several large promotional sections after React had
  // already rendered the login page. That caused layout jumps, duplicate
  // content and focus/navigation instability. React now remains the sole owner
  // of the visible auth structure; this helper only synchronizes region data
  // and retires the last legacy region label until the React copy is removed.
  page.querySelectorAll('.ec-auth-community-intro, .ec-auth-current-news, .ec-auth-reward-news').forEach((node) => node.remove());
  syncIntroRegionCopy(page);
  void syncRegistrationRegions();
  return true;
}

function schedule(retries = 8) {
  clearTimeout(retryTimer);
  const run = (left) => {
    if (prepareAuthPage() || left <= 0) return;
    retryTimer = setTimeout(() => run(left - 1), 160);
  };
  requestAnimationFrame(() => run(retries));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
} else {
  schedule();
}

window.addEventListener('ec:navigate', () => schedule(2));
