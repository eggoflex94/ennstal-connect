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

function ensureMemberBenefits(page) {
  const intro = page.querySelector('.ec-auth-intro');
  if (!intro || intro.querySelector('.ec-auth-member-benefits')) return;

  const block = document.createElement('section');
  block.className = 'ec-auth-member-benefits';
  block.innerHTML = `
    <span class="eyebrow">DEIN MEHRWERT ALS MITGLIED</span>
    <h2>Mehr aus deiner Region herausholen.</h2>
    <p class="ec-auth-benefits-lead">Die öffentlichen Inhalte zeigen dir, was Ennstal Connect ist. Nach der kostenlosen Anmeldung kannst du selbst Teil der Community werden.</p>
    <div class="ec-auth-benefit-grid">
      <article><b>💬</b><strong>Nachrichten schreiben</strong><span>Direkt und privat mit Menschen aus deiner Region Kontakt aufnehmen.</span></article>
      <article><b>👥</b><strong>Regionale Mitglieder entdecken</strong><span>Menschen, Interessen und neue Kontakte in deiner Nähe finden.</span></article>
      <article><b>●</b><strong>Gruppen beitreten</strong><span>Vereine, Freizeit, Hobbys und lokale Themen gemeinsam erleben.</span></article>
      <article><b>▣</b><strong>Events merken</strong><span>Veranstaltungen entdecken, teilnehmen und nichts Wichtiges verpassen.</span></article>
      <article><b>✓</b><strong>Mitreden & abstimmen</strong><span>Bei regionalen Umfragen, Forum und Community-Themen mitmachen.</span></article>
      <article><b>＋</b><strong>Selbst etwas starten</strong><span>Beiträge, Aktivitäten und – je nach Freigabe – Events oder Gruppen erstellen.</span></article>
    </div>
    <button type="button" class="ec-auth-benefits-cta">Kostenlos Mitglied werden</button>
    <small>Profile und private Inhalte bleiben geschützt und sind erst nach der Anmeldung sichtbar.</small>`;

  const regions = intro.querySelector('.ec-auth-regions');
  if (regions) regions.insertAdjacentElement('afterend', block);
  else intro.appendChild(block);

  block.querySelector('.ec-auth-benefits-cta')?.addEventListener('click', () => {
    const registerSwitch = [...page.querySelectorAll('.ec-auth-box button')].find((button) => /registrieren/i.test(button.textContent || ''));
    registerSwitch?.click();
    page.querySelector('.ec-auth-box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => page.querySelector('.ec-auth-box input[name="nickname"]')?.focus(), 180);
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

  page.querySelectorAll('.ec-auth-community-intro, .ec-auth-current-news, .ec-auth-reward-news').forEach((node) => node.remove());
  syncIntroRegionCopy(page);
  ensureMemberBenefits(page);
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
