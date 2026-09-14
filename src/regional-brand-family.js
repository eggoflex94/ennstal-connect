const brands = {
  ennstal: { name: 'Ennstal', short: 'Ennstal', tag: 'REGIONAL. ECHT. GEMEINSAM.', slogan: 'Menschen. Region. Gemeinschaft.' },
  'leoben-bruck-muerzzuschlag': { name: 'Leoben – Bruck – Mürzzuschlag', short: 'LBM', tag: 'OBERSTEIERMARK. VERNETZT. GEMEINSAM.', slogan: 'Vernetzen. Austauschen. Regional dabei sein.' },
  ueberregional: { name: 'Überregional', short: 'Überregional', tag: 'MEHR REGIONEN. EINE COMMUNITY.', slogan: 'Mehr Regionen. Eine Community.' }
};

const normalize = (slug) => slug === 'salzkammergut' ? 'ueberregional' : (brands[slug] ? slug : 'ennstal');
let activeSlug = normalize(localStorage.getItem('ec-active-region') || 'ennstal');

function make(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function buildLockup(slug) {
  const key = normalize(slug);
  const brand = brands[key];
  const root = make('div', 'ec-brand-family-lockup');
  root.dataset.region = key;
  root.setAttribute('aria-label', `${brand.name} Connect – ${brand.slogan}`);
  root.append(make('span', 'ec-brand-family-mark'));
  const copy = make('span', 'ec-brand-family-copy');
  const word = make('span', 'ec-brand-family-wordmark');
  const region = make('span', 'ec-brand-family-region');
  region.append(make('span', 'ec-brand-family-region-full', brand.name));
  region.append(make('span', 'ec-brand-family-region-short', brand.short));
  word.append(region, make('span', 'ec-brand-family-connect', 'Connect'));
  copy.append(word, make('span', 'ec-brand-family-tagline', brand.tag));
  root.append(copy);
  return root;
}

function syncHeader(slug = activeSlug) {
  const host = document.querySelector('.ec-brand-logo');
  if (!host) return false;
  const key = normalize(slug);
  const existing = host.querySelector('.ec-brand-family-lockup');
  if (existing?.dataset.region !== key) {
    host.querySelectorAll('.ec-brand-family-lockup').forEach((node) => node.remove());
    const image = host.querySelector('.ec-brand-image');
    if (image) image.style.display = 'none';
    host.append(buildLockup(key));
  }
  const claim = document.querySelector('.ec-brand-masthead .ec-brand-claim');
  if (claim && claim.dataset.brandRegion !== key) {
    claim.dataset.brandRegion = key;
    claim.replaceChildren(
      make('span', 'ec-brand-family-umbrella', 'ENNSTAL CONNECT COMMUNITY'),
      make('span', 'ec-brand-family-slogan', brands[key].slogan)
    );
  }
  return true;
}

function selectedAuthSlug() {
  const select = document.querySelector('.auth-page select[name="home_region_slug"]');
  return normalize(select?.value || localStorage.getItem('ec-active-region') || 'ennstal');
}

function syncAuth() {
  const intro = document.querySelector('.auth-page .ec-auth-intro');
  if (!intro) return false;
  const original = intro.querySelector('.ec-auth-logo');
  if (original) original.classList.add('ec-brand-original-hidden');
  let shell = intro.querySelector('.ec-auth-brand-shell');
  if (!shell) {
    shell = make('div', 'ec-auth-brand-shell');
    original ? original.after(shell) : intro.prepend(shell);
  }
  const slug = selectedAuthSlug();
  if (shell.dataset.brandRegion !== slug) {
    shell.dataset.brandRegion = slug;
    const brand = brands[slug];
    const claim = make('div', 'ec-auth-brand-claim');
    claim.append(make('small', '', 'ENNSTAL CONNECT COMMUNITY'), make('strong', '', brand.slogan));
    shell.replaceChildren(buildLockup(slug), claim);
  }
  const select = document.querySelector('.auth-page select[name="home_region_slug"]');
  if (select && !select.dataset.brandBound) {
    select.dataset.brandBound = '1';
    select.addEventListener('change', syncAuth);
  }
  return true;
}

function syncAll() {
  return { header: syncHeader(activeSlug), auth: syncAuth() };
}

function retrySync(left = 16) {
  const result = syncAll();
  if ((result.header || result.auth) || left <= 0) return;
  setTimeout(() => retrySync(left - 1), 120);
}

window.addEventListener('ec:region-change', (event) => {
  activeSlug = normalize(event.detail?.slug || 'ennstal');
  syncHeader(activeSlug);
});
window.addEventListener('ec:navigate', () => setTimeout(() => retrySync(4), 50));

document.addEventListener('DOMContentLoaded', () => retrySync(), { once: true });
if (document.readyState !== 'loading') retrySync();
