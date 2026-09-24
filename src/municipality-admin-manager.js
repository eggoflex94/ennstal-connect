import { supabase } from './supabaseClient';

let viewer = null;
let regions = [];
let municipalities = [];
let members = [];
let busy = false;
let timer = null;
let observedAdminPage = null;

function text(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

async function loadAll() {
  if (busy || !supabase) return;
  busy = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const [viewerResult, regionResult, memberResult] = await Promise.all([
      supabase.from('profiles').select('id,role,account_status').eq('id', session.user.id).maybeSingle(),
      supabase.from('regions').select('id,slug,name,sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('profiles').select('id,nickname,role,account_status,role_display_label,role_star_url,role_accent_color').eq('account_status', 'ACTIVE')
    ]);

    viewer = viewerResult.data || null;
    if (String(viewer?.role || '').toUpperCase() !== 'HEAD_ADMIN') return;

    regions = regionResult.data || [];
    members = memberResult.data || [];

    const collected = [];
    for (const region of regions) {
      const { data, error } = await supabase.rpc('ec_municipality_directory', { p_region_slug: region.slug });
      if (!error && Array.isArray(data)) {
        data.forEach((item) => collected.push({
          ...item,
          region_slug: region.slug,
          region_name: region.name
        }));
      }
    }
    municipalities = collected;
    renderPanel();
    decorateMemberCards();
  } catch (error) {
    console.warn('Gemeindeverwaltung konnte nicht geladen werden:', error?.message || error);
  } finally {
    busy = false;
  }
}

function makeButton(label, className) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (className) button.className = className;
  return button;
}

function renderPanel() {
  const root = document.querySelector('.admin-page');
  if (!root || String(viewer?.role || '').toUpperCase() !== 'HEAD_ADMIN') return;

  let panel = root.querySelector('.ec-head-municipality-manager');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'ec-head-municipality-manager panel';
    const cards = root.querySelector('.admin-member-cards');
    if (cards) cards.before(panel);
    else root.appendChild(panel);
  }

  panel.replaceChildren();

  const header = document.createElement('header');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'HEAD ADMIN · GEMEINDEN';
  const h2 = document.createElement('h2');
  h2.textContent = 'Gemeindebereiche';
  const p = document.createElement('p');
  p.textContent = 'Mehrere Gemeinden pro Region anlegen, Reihenfolge und Darstellung steuern und Gemeindekonten zuordnen.';
  copy.append(eyebrow, h2, p);

  const add = makeButton('+ Gemeinde');
  add.addEventListener('click', () => openMunicipalityEditor(null));
  header.append(copy, add);
  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'ec-head-municipality-list';

  if (!municipalities.length) {
    const empty = document.createElement('p');
    empty.className = 'ec-municipality-empty';
    empty.textContent = 'Noch keine Gemeinden angelegt.';
    list.appendChild(empty);
  } else {
    municipalities.forEach((item) => {
      const article = document.createElement('article');
      article.style.setProperty('--municipality-accent', item.accent_color || '#20a866');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'ec-municipality-admin-star';
      const img = document.createElement('img');
      img.src = item.role_star_url || '/role-star-green.svg';
      img.alt = '';
      iconWrap.appendChild(img);

      const details = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = item.official_name || 'Gemeinde';
      const small = document.createElement('small');
      small.textContent = (item.region_name || 'Region') + ' · Navigation: ' + (item.nav_label || item.official_name || 'Gemeinde');
      details.append(strong, small);

      const edit = makeButton('Bearbeiten');
      edit.addEventListener('click', () => openMunicipalityEditor(item));

      article.append(iconWrap, details, edit);
      list.appendChild(article);
    });
  }

  panel.appendChild(list);
}

function labeledField(labelText, input) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(span, input);
  return label;
}

function openMunicipalityEditor(item) {
  document.querySelector('.ec-municipality-admin-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ec-municipality-admin-overlay';

  const form = document.createElement('form');
  form.className = 'ec-municipality-admin-dialog';

  const header = document.createElement('header');
  const headCopy = document.createElement('div');
  const kicker = document.createElement('span');
  kicker.textContent = 'GEMEINDEBEREICH';
  const title = document.createElement('h2');
  title.textContent = item ? 'Gemeinde bearbeiten' : 'Gemeinde anlegen';
  headCopy.append(kicker, title);
  const closeTop = makeButton('×');
  closeTop.setAttribute('aria-label', 'Schließen');
  header.append(headCopy, closeTop);
  form.appendChild(header);

  const regionSelect = document.createElement('select');
  regionSelect.name = 'region_slug';
  regionSelect.required = true;
  regions.forEach((region) => {
    const option = document.createElement('option');
    option.value = region.slug;
    option.textContent = region.name;
    option.selected = region.slug === item?.region_slug;
    regionSelect.appendChild(option);
  });

  const name = document.createElement('input');
  name.name = 'official_name';
  name.required = true;
  name.minLength = 2;
  name.maxLength = 180;
  name.value = item?.official_name || '';

  const navLabel = document.createElement('input');
  navLabel.name = 'nav_label';
  navLabel.required = true;
  navLabel.maxLength = 80;
  navLabel.value = item?.nav_label || item?.official_name || '';

  const slug = document.createElement('input');
  slug.name = 'slug';
  slug.required = true;
  slug.maxLength = 80;
  slug.value = item?.slug || '';

  const roleLabel = document.createElement('input');
  roleLabel.name = 'role_label';
  roleLabel.maxLength = 80;
  roleLabel.value = item?.role_label || 'Gemeinde';

  const roleStar = document.createElement('input');
  roleStar.name = 'role_star_url';
  roleStar.maxLength = 1000;
  roleStar.value = item?.role_star_url || '/role-star-green.svg';

  const color = document.createElement('input');
  color.name = 'accent_color';
  color.type = 'color';
  color.value = item?.accent_color || '#20a866';

  const sort = document.createElement('input');
  sort.name = 'sort_order';
  sort.type = 'number';
  sort.min = '0';
  sort.max = '9999';
  sort.value = String(item?.sort_order ?? 100);

  const description = document.createElement('textarea');
  description.name = 'short_description';
  description.maxLength = 1000;
  description.value = item?.short_description || '';

  const verified = document.createElement('input');
  verified.name = 'verified';
  verified.type = 'checkbox';
  verified.checked = item?.verified !== false;

  const active = document.createElement('input');
  active.name = 'active';
  active.type = 'checkbox';
  active.checked = item?.active !== false;

  form.append(
    labeledField('Region', regionSelect),
    labeledField('Offizieller Name', name),
    labeledField('Kurzname in der Navigation', navLabel),
    labeledField('Slug', slug),
    labeledField('Rollenbezeichnung', roleLabel),
    labeledField('Rollenstern / Icon URL', roleStar),
    labeledField('Akzentfarbe', color),
    labeledField('Sortierung', sort),
    labeledField('Kurzbeschreibung', description)
  );

  const verifiedLabel = labeledField('Verifiziert', verified);
  verifiedLabel.className = 'check';
  const activeLabel = labeledField('Aktiv', active);
  activeLabel.className = 'check';
  form.append(verifiedLabel, activeLabel);

  const actions = document.createElement('div');
  actions.className = 'ec-municipality-admin-actions';
  const cancel = makeButton('Abbrechen');
  const save = makeButton('Speichern');
  save.className = 'primary';
  save.type = 'submit';
  actions.append(cancel, save);

  const status = document.createElement('p');
  status.className = 'ec-municipality-admin-status';
  form.append(actions, status);

  overlay.appendChild(form);
  document.body.appendChild(overlay);

  let slugTouched = Boolean(item);
  let navTouched = Boolean(item);
  name.addEventListener('input', () => {
    if (!slugTouched) slug.value = slugify(name.value);
    if (!navTouched) navLabel.value = name.value.slice(0, 80);
  });
  slug.addEventListener('input', () => { slugTouched = true; });
  navLabel.addEventListener('input', () => { navTouched = true; });

  const close = () => overlay.remove();
  closeTop.addEventListener('click', close);
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    status.textContent = 'Wird gespeichert …';
    try {
      const { error } = await supabase.rpc('ec_head_save_municipality', {
        p_id: item?.id || null,
        p_region_slug: regionSelect.value,
        p_official_name: name.value,
        p_slug: slug.value,
        p_nav_label: navLabel.value,
        p_role_label: roleLabel.value || 'Gemeinde',
        p_role_star_url: roleStar.value || '/role-star-green.svg',
        p_accent_color: color.value || '#20a866',
        p_short_description: description.value || '',
        p_active: active.checked,
        p_verified: verified.checked,
        p_sort_order: Number(sort.value || 100)
      });
      if (error) throw error;
      close();
      await loadAll();
      window.dispatchEvent(new CustomEvent('ec:region-change', { detail: { reason: 'municipality-admin-update' } }));
    } catch (error) {
      status.textContent = error?.message || 'Speichern fehlgeschlagen.';
    } finally {
      save.disabled = false;
    }
  });
}

function decorateMemberCards() {
  if (String(viewer?.role || '').toUpperCase() !== 'HEAD_ADMIN') return;

  document.querySelectorAll('.admin-member-card').forEach((card) => {
    const name = text(card.querySelector('.admin-member-person-button strong')?.textContent);
    const member = members.find((item) => text(item.nickname) === name);
    if (!member || String(member.role || '').toUpperCase() === 'HEAD_ADMIN') return;

    card.querySelector('.ec-municipality-account-manager')?.remove();

    const details = document.createElement('details');
    details.className = 'ec-municipality-account-manager';

    const summary = document.createElement('summary');
    summary.textContent = 'Gemeindekonto';

    const fields = document.createElement('div');
    fields.className = 'ec-municipality-account-fields';

    const municipalitySelect = document.createElement('select');
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Gemeinde wählen';
    municipalitySelect.appendChild(emptyOption);
    municipalities.forEach((municipality) => {
      const option = document.createElement('option');
      option.value = municipality.id;
      option.textContent = (municipality.region_name || 'Region') + ' · ' + (municipality.official_name || 'Gemeinde');
      municipalitySelect.appendChild(option);
    });

    const roleLabel = document.createElement('input');
    roleLabel.maxLength = 80;
    roleLabel.value = member.role_display_label || 'Gemeinde';

    const roleStar = document.createElement('input');
    roleStar.maxLength = 1000;
    roleStar.value = member.role_star_url || '/role-star-green.svg';

    const roleColor = document.createElement('input');
    roleColor.type = 'color';
    roleColor.value = member.role_accent_color || '#20a866';

    const primary = document.createElement('input');
    primary.type = 'checkbox';
    primary.checked = true;

    fields.append(
      labeledField('Gemeinde', municipalitySelect),
      labeledField('Rollenname', roleLabel),
      labeledField('Rollenstern / Icon URL', roleStar),
      labeledField('Akzentfarbe', roleColor)
    );

    const primaryLabel = labeledField('Primäre Gemeinde', primary);
    primaryLabel.className = 'check';
    fields.appendChild(primaryLabel);

    const save = makeButton('Als Gemeindekonto zuordnen');
    const status = document.createElement('p');
    fields.append(save, status);

    save.addEventListener('click', async () => {
      if (!municipalitySelect.value) {
        status.textContent = 'Bitte Gemeinde wählen.';
        return;
      }
      save.disabled = true;
      status.textContent = 'Wird gespeichert …';
      try {
        const { error } = await supabase.rpc('ec_head_set_municipality_staff_v2', {
          p_municipality_id: municipalitySelect.value,
          p_user_id: member.id,
          p_staff_role: 'OWNER',
          p_active: true,
          p_is_primary: primary.checked,
          p_set_municipality_role: true,
          p_role_label: roleLabel.value || 'Gemeinde',
          p_role_star_url: roleStar.value || '/role-star-green.svg',
          p_role_accent_color: roleColor.value || '#20a866'
        });
        if (error) throw error;
        status.textContent = 'Gemeindekonto gespeichert.';
        await loadAll();
        window.dispatchEvent(new CustomEvent('ec:region-change', { detail: { reason: 'municipality-account-update' } }));
      } catch (error) {
        status.textContent = error?.message || 'Speichern fehlgeschlagen.';
      } finally {
        save.disabled = false;
      }
    });

    details.append(summary, fields);
    card.appendChild(details);
  });
}

function schedule(delay = 100) {
  clearTimeout(timer);
  timer = setTimeout(() => void loadAll(), delay);
}

function boot() {
  void loadAll();
  new MutationObserver(() => {
    const root = document.querySelector('.admin-page');
    if (root && root !== observedAdminPage) {
      observedAdminPage = root;
      schedule(120);
    }
    if (!root) observedAdminPage = null;
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('ec:navigate', (event) => {
    if (event.detail?.page === 'admin') schedule(80);
  });
  window.addEventListener('ec:region-change', () => schedule(80));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
