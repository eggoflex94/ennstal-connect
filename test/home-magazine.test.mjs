import test from 'node:test';
import assert from 'node:assert/strict';
import { MAGAZINE_SETTINGS_TITLE, normalizeMagazine, readMagazineSettings, upcomingMagazineEvents, safeImageUrl, magazineWithImage, coverCoordinate } from '../src/homeMagazine.js';

test('magazine defaults include exactly the four agreed sections', () => {
  const config = normalizeMagazine();
  assert.deepEqual(config.order, ['hero', 'categories', 'events', 'content']);
  assert.equal(config.layout, 'magazine');
  assert.equal(config.categories.length, 4);
  assert.ok(Object.values(config.visible).every(Boolean));
});

test('region settings do not leak and malformed saved content falls back safely', () => {
  const rows = [
    { title: MAGAZINE_SETTINGS_TITLE, region_id: 'ennstal', content: JSON.stringify({ title: 'Ennstal', visible: { events: false }, order: ['content', 'hero'] }) },
    { title: MAGAZINE_SETTINGS_TITLE, region_id: 'alpenraum', content: '{broken' }
  ];
  const ennstal = readMagazineSettings(rows, 'ennstal').config;
  assert.equal(ennstal.title, 'Ennstal');
  assert.equal(ennstal.visible.events, false);
  assert.deepEqual(ennstal.order, ['hero', 'content', 'categories', 'events']);
  assert.equal(readMagazineSettings(rows, 'alpenraum').config.title, normalizeMagazine().title);
  assert.equal(readMagazineSettings(rows, 'other').row, undefined);
});

test('stored options cannot introduce arbitrary navigation or executable URLs', () => {
  const config = normalizeMagazine({ order: ['hero', 'hero', 'unknown'], accent: 'url(evil)', categories: [{ page: '__proto__', image: 'javascript:alert(1)' }] });
  assert.equal(config.categories[0].page, 'events');
  assert.equal(config.categories[0].image, '');
  assert.equal(config.accent, '#ed682f');
  assert.equal(config.order.length, 4);
  assert.equal(safeImageUrl('//unknown.example/image.jpg'), '');
  assert.equal(safeImageUrl('https://example.com/image.jpg'), 'https://example.com/image.jpg');
});

test('only future, active events in the selected region appear, ordered and capped', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const events = [
    { id: 'other', region_id: 'other', event_at: '2026-10-12T12:00:00Z' },
    { id: 'past', region_id: 'ennstal', event_at: '2026-10-10T12:00:00Z' },
    { id: 'cancelled', region_id: 'ennstal', status: 'CANCELLED', event_at: '2026-10-12T12:00:00Z' },
    { id: 'invalid', region_id: 'ennstal', event_at: 'bad date' },
    ...[16, 14, 12, 13].map(day => ({ id: String(day), region_id: 'ennstal', event_at: `2026-10-${day}T12:00:00Z` }))
  ];
  assert.deepEqual(upcomingMagazineEvents(events, 'ennstal', now).map(event => event.id), ['12', '13', '14']);
});


test('no unselected stock photos are used, including old saved defaults', () => {
  assert.equal(normalizeMagazine().heroImage, '');
  assert.equal(normalizeMagazine({ heroImage: '/community-hero.png' }).heroImage, '');
  assert.equal(normalizeMagazine({ heroImage: '/hero.jpg?v=1' }).heroImage, '');
  assert.ok(normalizeMagazine().categories.every(category => category.image === ''));
  assert.equal(normalizeMagazine({ heroImage: 'https://example.com/my-upload.webp' }).heroImage, 'https://example.com/my-upload.webp');
});

test('hero stays first even when earlier saved layouts placed it lower', () => {
  assert.deepEqual(normalizeMagazine({ order: ['events', 'content', 'hero', 'categories'] }).order, ['hero', 'events', 'content', 'categories']);
});

// Parent refreshes produce new config objects while uploads are in flight.
test('editor preserves pending uploads and unsaved drafts across parent refreshes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/HomeMagazine.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(dirty\.current\) return;/);
  assert.match(source, /\}, \[configSnapshot\]\);/);
  assert.doesNotMatch(source, /\}, \[config\]\);/);
  assert.match(source, /dirty\.current = true; const token = generation\.current/);
  assert.match(source, /await onSave\(normalizeMagazine\(draft\)\); dirty\.current = false/);
});

test('each category image survives saving and loading in its own region', () => {
  let config = normalizeMagazine({ heroImage: 'https://example.com/cover.png', title: 'Mein Ennstal', heroTextX: 67, heroTextY: 24 });
  for (let i = 0; i < 4; i++) config = magazineWithImage(config, 'category', `https://example.com/category-${i}.png`, i);
  const rows = [{ title: MAGAZINE_SETTINGS_TITLE, region_id: 'ennstal', content: JSON.stringify(config) }];
  const loaded = readMagazineSettings(rows, 'ennstal').config;
  assert.deepEqual(loaded.categories.map(item => item.image), Array.from({ length: 4 }, (_, i) => `https://example.com/category-${i}.png`));
  assert.equal(loaded.heroImage, 'https://example.com/cover.png');
  assert.equal(loaded.title, 'Mein Ennstal');
  assert.equal(loaded.heroTextX, 67);
  assert.equal(loaded.heroTextY, 24);
  assert.ok(readMagazineSettings(rows, 'other').config.categories.every(item => item.image === ''));
});

test('image saves reject temporary previews and preserve other category images', () => {
  const config = magazineWithImage(normalizeMagazine(), 'category', 'https://example.com/groups.png', 1);
  const next = magazineWithImage(config, 'category', 'https://example.com/events.png', 0);
  assert.equal(next.categories[1].image, config.categories[1].image);
  assert.equal(config.categories[0].image, '');
  assert.throws(() => magazineWithImage(config, 'hero', 'blob:temporary'));
  assert.throws(() => magazineWithImage(config, 'category', 'https://example.com/a.png', 9));
});

test('cover text positions remain inside the cover and older layouts retain their position', () => {
  assert.equal(normalizeMagazine().heroTextX, 0);
  assert.equal(normalizeMagazine().heroTextY, 100);
  assert.equal(coverCoordinate(-25), 0);
  assert.equal(coverCoordinate(130), 100);
  assert.equal(coverCoordinate(NaN, 100), 100);
  assert.equal(coverCoordinate(33.5), 33.5);
});

test('cover typography persists with the regional layout and rejects invalid styles', () => {
  const config = normalizeMagazine({ heroFontSize: 48, heroTextColor: '#f08b35', heroTextAlign: 'right', heroFontWeight: 600 });
  const saved = readMagazineSettings([{ title: MAGAZINE_SETTINGS_TITLE, region_id: 'ennstal', content: JSON.stringify(config) }], 'ennstal').config;
  assert.equal(saved.heroFontSize, 48);
  assert.equal(saved.heroTextColor, '#f08b35');
  assert.equal(saved.heroTextAlign, 'right');
  assert.equal(saved.heroFontWeight, 600);
  const invalid = normalizeMagazine({ heroFontSize: Infinity, heroTextColor: 'url(evil)', heroTextAlign: 'arbitrary', heroFontWeight: 999 });
  assert.equal(invalid.heroFontSize, 61);
  assert.equal(invalid.heroTextColor, '#ffffff');
  assert.equal(invalid.heroTextAlign, 'left');
  assert.equal(invalid.heroFontWeight, 800);
  assert.equal(normalizeMagazine({ heroFontSize: 4 }).heroFontSize, 24);
  assert.equal(normalizeMagazine({ heroFontSize: 900 }).heroFontSize, 88);
});
