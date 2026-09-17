import { supabase } from './supabaseClient';

let timer = null;
let bannerIndex = 0;
let rotationTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function dedupeHomeSocial(home) {
  const socialBlocks = [...home.querySelectorAll(':scope > .ec-home-social')];
  if (socialBlocks.length < 2) {
    if (socialBlocks[0]) socialBlocks[0].classList.add('ec-force-social', 'ec-home-social-primary');
    return;
  }

  const keep = socialBlocks.find((node) => !node.classList.contains('ec-force-social')) || socialBlocks[0];
  keep.classList.add('ec-force-social', 'ec-home-social-primary');
  socialBlocks.forEach((node) => { if (node !== keep) node.remove(); });
}

function currentRegionName(home) {
  const eyebrow = home.querySelector(':scope > .page-heading .eyebrow')?.textContent || '';
  return eyebrow.replace(/^REGION\s+/i, '').trim() || 'deiner Region';
}

function ensureHomeHero(home) {
  const heading = home.querySelector(':scope > .page-heading');
  if (!heading) return;

  const copy = heading.querySelector(':scope > div');
  const title = copy?.querySelector('h1');
  const intro = copy?.querySelector('p');
  const regionName = currentRegionName(home);

  if (title) title.textContent = 'Ennstal Heute';
  if (intro) intro.textContent = `Was heute in ${regionName} passiert – Aktivitäten, Gruppen und Veranstaltungen auf einen Blick.`;

  let actions = copy?.querySelector('.ec-home-hero-actions');
  if (!actions && copy) {
    actions = document.createElement('div');
    actions.className = 'ec-home-hero-actions';
    actions.innerHTML = '<button type="button" class="primary-button" data-home-action="activity">Aktivitäten entdecken</button><button type="button" class="secondary-button" data-home-action="groups">Gruppen entdecken</button>';
    copy.appendChild(actions);
    actions.querySelector('[data-home-action="activity"]')?.addEventListener('click', () => {
      const target = home.querySelector(':scope > .ec-home-social, :scope > .engagement-grid');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    actions.querySelector('[data-home-action="groups"]')?.addEventListener('click', () => {
      const candidates = [...document.querySelectorAll('button')];
      candidates.find((button) => /^\s*(?:●|•|.)?\s*Gruppen\s*$/i.test(button.textContent || '') || (button.textContent || '').trim() === 'Gruppen')?.click();
    });
  }
}

function softenLoadStatus() {
  const status = document.querySelector('.content-root > aside[role="status"]');
  if (!status || !/Noch nicht aktualisiert:/i.test(status.textContent || '')) return;
  status.classList.add('ec-home-load-status');
  const message = [...status.querySelectorAll('p')].find((node) => /Noch nicht aktualisiert:/i.test(node.textContent || ''));
  if (message) message.textContent = 'Ein Teil der regionalen Inhalte wird gerade aktualisiert. Bereits geladene Inhalte bleiben verfügbar.';
}

function reorderHome(home) {
  const heading = home.querySelector(':scope > .page-heading');
  const social = home.querySelector(':scope > .ec-home-social');
  const engagement = home.querySelector(':scope > .engagement-grid');
  const ad = home.querySelector(':scope > .ec-home-ad-shell');

  if (heading && social) heading.insertAdjacentElement('afterend', social);
  if (social && engagement) social.insertAdjacentElement('afterend', engagement);
  else if (heading && engagement) heading.insertAdjacentElement('afterend', engagement);

  const anchor = engagement || social;
  if (ad && anchor) anchor.insertAdjacentElement('afterend', ad);
}

function tidyHome(home) {
  home.classList.add('ec-home-modern-final');
  dedupeHomeSocial(home);
  ensureHomeHero(home);
  softenLoadStatus();

  const heading = home.querySelector(':scope > .page-heading');
  if (heading) heading.classList.add('ec-home-compact-heading');

  const engagement = home.querySelector(':scope > .engagement-grid');
  if (engagement) engagement.classList.add('ec-home-dashboard-grid');

  const frames = home.querySelector(':scope > .homepage-sections');
  if (frames) frames.classList.add('ec-home-content-grid');

  const editor = home.querySelector(':scope > .homepage-editor-toggle');
  if (editor) editor.classList.add('ec-home-editor-compact');

  reorderHome(home);
}

async function resolveRegionId() {
  const picker = document.querySelector('.ec-region-picker select');
  const slug = picker?.value || localStorage.getItem('ec-active-region');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const [{ data: profile }, { data: regions }] = await Promise.all([
    supabase.from('profiles').select('home_region_id').eq('id', user.id).maybeSingle(),
    supabase.from('regions').select('id,slug').eq('is_active', true)
  ]);
  return (regions || []).find((region) => region.slug === slug)?.id || profile?.home_region_id || null;
}

function bannerMarkup(ad) {
  const inner = `${ad.image_url ? `<img src="${esc(ad.image_url)}" alt="Werbung von ${esc(ad.title || 'regionalem Anbieter')}">` : '<div class="ec-home-ad-fallback">REGIONAL</div>'}<div class="ec-home-ad-copy"><small>REGIONALE WERBUNG</small><strong>${esc(ad.title || 'Werbeanzeige')}</strong>${ad.body ? `<span>${esc(ad.body)}</span>` : ''}</div><span class="ec-home-ad-arrow" aria-hidden="true">→</span>`;
  return ad.link_url
    ? `<a href="${esc(ad.link_url)}" target="_blank" rel="noreferrer sponsored">${inner}</a>`
    : `<div class="ec-home-ad-static">${inner}</div>`;
}

function renderBanner(home, ads) {
  let shell = home.querySelector(':scope > .ec-home-ad-shell');
  if (!ads.length) {
    shell?.remove();
    clearInterval(rotationTimer);
    rotationTimer = null;
    return;
  }

  if (!shell) {
    shell = document.createElement('aside');
    shell.className = 'ec-home-ad-shell';
    shell.setAttribute('aria-label', 'Regionale Werbung');
    const anchor = home.querySelector(':scope > .engagement-grid') || home.querySelector(':scope > .ec-home-social');
    if (anchor) anchor.insertAdjacentElement('afterend', shell);
    else {
      const heading = home.querySelector(':scope > .page-heading');
      if (heading) heading.insertAdjacentElement('afterend', shell);
      else home.prepend(shell);
    }
  }

  bannerIndex %= ads.length;
  shell.innerHTML = `<div class="ec-home-ad-banner">${bannerMarkup(ads[bannerIndex])}</div>${ads.length > 1 ? `<div class="ec-home-ad-dots">${ads.map((_, index) => `<button type="button" data-index="${index}" class="${index === bannerIndex ? 'active' : ''}" aria-label="Werbung ${index + 1} anzeigen"></button>`).join('')}</div>` : ''}`;
  shell.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => {
    bannerIndex = Number(button.dataset.index || 0);
    renderBanner(home, ads);
  }));

  clearInterval(rotationTimer);
  if (ads.length > 1) {
    rotationTimer = window.setInterval(() => {
      const currentHome = document.querySelector('.home-page');
      if (!currentHome) return;
      bannerIndex = (bannerIndex + 1) % ads.length;
      renderBanner(currentHome, ads);
    }, 8000);
  }
}

async function syncBanner(home) {
  const regionId = await resolveRegionId();
  const query = supabase.from('community_ads').select('id,title,body,image_url,link_url,region_id,is_active,created_at').eq('is_active', true).order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) {
    console.error('Startseiten-Werbung konnte nicht geladen werden:', error);
    return;
  }
  const ads = (data || []).filter((ad) => !ad.region_id || !regionId || ad.region_id === regionId);
  renderBanner(home, ads);
  reorderHome(home);
}

async function apply() {
  const home = document.querySelector('.home-page');
  if (!home) {
    clearInterval(rotationTimer);
    rotationTimer = null;
    return false;
  }
  tidyHome(home);
  await syncBanner(home);
  return true;
}

function schedule(delay = 80) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void apply(), delay);
}

window.addEventListener('ec:navigate', () => schedule());
window.addEventListener('ec:region-change', () => { bannerIndex = 0; schedule(120); });
window.addEventListener('focus', () => { if (document.querySelector('.home-page')) schedule(60); });
new MutationObserver(() => {
  const home = document.querySelector('.home-page');
  if (!home) return;
  const socialCount = home.querySelectorAll(':scope > .ec-home-social').length;
  if (socialCount > 1 || !home.classList.contains('ec-home-modern-final') || !home.querySelector(':scope > .ec-home-ad-shell') || !home.querySelector('.ec-home-hero-actions')) schedule(60);
}).observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
else schedule();
