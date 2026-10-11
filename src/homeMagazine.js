// Stored in the existing homepage_sections table; no schema or permission changes.
export const MAGAZINE_SETTINGS_TITLE = '__ec_home_magazine_v1__';
export const MAGAZINE_BLOCKS = ['hero', 'categories', 'events', 'content'];
export const MAGAZINE_LABELS = { hero: 'Großes Titelbild', categories: 'Bilder-Kategorien', events: 'Veranstaltungen', content: 'Freier Inhaltsbereich' };
export const MAGAZINE_PAGES = { events: 'Veranstaltungen', groups: 'Gruppen', forum: 'Forum', marketplace: 'Marktplatz', community: 'Community', members: 'Mitglieder' };
export const isMagazineSettings = row => row?.title === MAGAZINE_SETTINGS_TITLE;

export function safeImageUrl(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (['/community-hero.png', '/hero.jpg'].includes(url.split(/[?#]/)[0])) return fallback;
  if (/^\/(?!\/)/.test(url) || /^https:\/\//i.test(url) || /^blob:/.test(url)) return url;
  return fallback;
}

export function normalizeMagazine(input = {}) {
  const text = (value, fallback, max = 300) => typeof value === 'string' ? value.slice(0, max) : fallback;
  const order = Array.isArray(input.order) ? [...new Set(input.order.filter(key => MAGAZINE_BLOCKS.includes(key)))] : [];
  return {
    version: 1, layout: 'magazine',
    title: text(input.title, 'Gemeinsam mehr erleben.', 120),
    intro: text(input.intro, 'Menschen, Erlebnisse und Geschichten aus deiner Region.'),
    heroImage: safeImageUrl(input.heroImage),
    heroTextX: coverCoordinate(input.heroTextX, 0),
    heroTextY: coverCoordinate(input.heroTextY, 100),
    heroFontSize: typeof input.heroFontSize === 'number' && Number.isFinite(input.heroFontSize) ? Math.max(24, Math.min(88, input.heroFontSize)) : 61,
    heroTextColor: /^#[\da-f]{6}$/i.test(input.heroTextColor || '') ? input.heroTextColor : '#ffffff',
    heroTextAlign: ['left', 'center', 'right'].includes(input.heroTextAlign) ? input.heroTextAlign : 'left',
    heroFontWeight: [400, 600, 800].includes(input.heroFontWeight) ? input.heroFontWeight : 800,
    heroPosition: ['top', 'center', 'bottom'].includes(input.heroPosition) ? input.heroPosition : 'center',
    heroHeight: ['compact', 'large'].includes(input.heroHeight) ? input.heroHeight : 'large',
    accent: /^#[\da-f]{6}$/i.test(input.accent || '') ? input.accent : '#ed682f',
    order: ['hero', ...order.filter(key => key !== 'hero'), ...MAGAZINE_BLOCKS.filter(key => key !== 'hero' && !order.includes(key))],
    visible: Object.fromEntries(MAGAZINE_BLOCKS.map(key => [key, input.visible?.[key] !== false])),
    contentTitle: text(input.contentTitle, 'Aus deiner Region', 120),
    categories: ['events', 'groups', 'forum', 'marketplace'].map((page, index) => {
      const item = input.categories?.[index] || {};
      return { page: Object.hasOwn(MAGAZINE_PAGES, item.page) ? item.page : page,
        title: text(item.title, MAGAZINE_PAGES[page], 70), image: safeImageUrl(item.image),
        subtitle: text(item.subtitle, ['Gemeinsam erleben', 'Menschen verbinden', 'Ins Gespräch kommen', 'Regional entdecken'][index], 100) };
    })
  };
}

export function readMagazineSettings(rows, regionId) {
  const row = rows.find(item => isMagazineSettings(item) && item.region_id === regionId);
  try { return { row, config: normalizeMagazine(row ? JSON.parse(row.content) : {}) }; }
  catch { return { row, config: normalizeMagazine() }; }
}

export function upcomingMagazineEvents(events, regionId, now = Date.now()) {
  return events.filter(event => event.region_id === regionId &&
    String(event.status || 'ACTIVE').toUpperCase() !== 'CANCELLED' &&
    Number.isFinite(Date.parse(event.event_at)) && Date.parse(event.event_at) >= now)
    .sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at)).slice(0, 3);
}

export function coverCoordinate(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}

export function magazineWithImage(config, target, url, index) {
  const image = safeImageUrl(url);
  if (!image || image.startsWith('blob:')) throw new Error('Das Bild wurde nicht dauerhaft hochgeladen. Bitte erneut versuchen.');
  if (target === 'hero') return normalizeMagazine({ ...config, heroImage: image });
  if (target !== 'category' || !Number.isInteger(index) || index < 0 || index > 3) throw new Error('Ungültiger Bildbereich.');
  return normalizeMagazine({ ...config, categories: config.categories.map((item, i) => i === index ? { ...item, image } : item) });
}
