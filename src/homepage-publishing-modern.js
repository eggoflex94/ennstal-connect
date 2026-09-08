import { supabase } from './supabaseClient';

const FONT_MAP = {
  modern: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  montserrat: 'Montserrat, Inter, system-ui, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  opensans: '"Open Sans", Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif'
};

let busy = false;
let editorState = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const activeSlug = () => document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || '';
const onHome = () => Boolean(document.querySelector('.home-page'));
const notice = (text, error = false) => {
  let box = document.querySelector('.ec-homepage-save-notice');
  if (!box) {
    box = document.createElement('div');
    box.className = 'ec-homepage-save-notice';
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.classList.toggle('is-error', error);
  box.classList.add('is-visible');
  clearTimeout(box.__timer);
  box.__timer = setTimeout(() => box.classList.remove('is-visible'), 4200);
};

async function context() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: regions }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name,short_name,sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true)
  ]);
  const region = (regions || []).find((r) => r.slug === activeSlug()) || (regions || [])[0] || null;
  const role = String(profile?.role || '').toUpperCase();
  const headAdmin = role === 'HEAD_ADMIN';
  const adminRegionIds = new Set((assignments || []).map((a) => a.region_id));
  return { user, profile, regions: regions || [], region, headAdmin, canRegional: headAdmin || (region && adminRegionIds.has(region.id)) };
}

function field(label, control, cls = '') {
  const wrap = document.createElement('label');
  wrap.className = `ec-home-field ${cls}`.trim();
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

function optionSelect(name, items, value) {
  const select = document.createElement('select');
  select.name = name;
  items.forEach(([v, label]) => {
    const option = document.createElement('option');
    option.value = v;
    option.textContent = label;
    select.appendChild(option);
  });
  select.value = value;
  return select;
}

function colorInput(name, value) {
  const input = document.createElement('input');
  input.type = 'color';
  input.name = name;
  input.value = value;
  return input;
}

function numberInput(name, value, min, max) {
  const input = document.createElement('input');
  input.type = 'number';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  return input;
}

function applyPreview(preview, values) {
  const title = preview.querySelector('h3');
  const text = preview.querySelector('p');
  title.textContent = values.title || 'Deine Überschrift';
  text.textContent = values.content || 'Hier erscheint dein Startseitentext als Vorschau.';
  title.style.fontFamily = FONT_MAP[values.title_font_family] || FONT_MAP.modern;
  title.style.fontSize = `${values.title_font_size}px`;
  title.style.color = values.title_color;
  text.style.fontFamily = FONT_MAP[values.font_family] || FONT_MAP.modern;
  text.style.fontSize = `${values.font_size}px`;
  text.style.color = values.text_color;
  preview.className = `ec-home-live-preview style-${values.frame_style}`;
}

function readForm(form) {
  const data = new FormData(form);
  return {
    title: String(data.get('title') || '').trim(),
    content: String(data.get('content') || '').trim(),
    image_url: String(data.get('image_url') || '').trim() || null,
    frame_style: String(data.get('frame_style') || 'standard'),
    publication_scope: String(data.get('publication_scope') || 'REGION'),
    title_font_family: String(data.get('title_font_family') || 'modern'),
    title_font_size: Number(data.get('title_font_size') || 32),
    title_color: String(data.get('title_color') || '#0f172a'),
    font_family: String(data.get('font_family') || 'modern'),
    font_size: Number(data.get('font_size') || 18),
    text_color: String(data.get('text_color') || '#334155')
  };
}

async function uploadImage(file, userId) {
  if (!file || !file.name || file.size === 0) return null;
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/homepage/${crypto.randomUUID()}.${ext}`;
  let bucket = 'community-media';
  let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error && /bucket not found/i.test(error.message || '')) {
    bucket = 'profile-avatars';
    ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type }));
  }
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

function buildEditor(ctx) {
  const native = document.querySelector('.homepage-editor-toggle');
  if (!native || !ctx.canRegional) return;
  if (document.querySelector('.ec-homepage-modern-editor')) {
    native.hidden = true;
    return;
  }
  native.hidden = true;
  const section = document.createElement('section');
  section.className = 'ec-homepage-modern-editor panel';
  section.innerHTML = `<div class="ec-home-editor-head"><div><span class="eyebrow">STARTSEITE VERWALTEN</span><h2>Startseite gestalten & veröffentlichen</h2><p>Texte, Bilder und Typografie anpassen. ${ctx.headAdmin ? 'Du kannst regional oder global veröffentlichen.' : `Du veröffentlichst für ${esc(ctx.region?.name || 'deine Region')}.`}</p></div><span class="ec-home-scope-badge">${ctx.headAdmin ? 'GLOBAL ADMIN' : 'REGIONAL ADMIN'}</span></div>`;
  const form = document.createElement('form');
  form.className = 'ec-home-modern-form';

  const title = document.createElement('input'); title.name = 'title'; title.required = true; title.placeholder = 'Überschrift';
  const content = document.createElement('textarea'); content.name = 'content'; content.required = true; content.rows = 7; content.placeholder = 'Startseitentext';
  const imageUrl = document.createElement('input'); imageUrl.name = 'image_url'; imageUrl.placeholder = 'Bild-URL (optional)';
  const image = document.createElement('input'); image.name = 'image'; image.type = 'file'; image.accept = 'image/png,image/jpeg,image/webp,image/gif';
  const scope = optionSelect('publication_scope', ctx.headAdmin ? [['REGION', `Nur ${ctx.region?.name || 'aktuelle Region'}`], ['GLOBAL', '🌍 Global – alle Regionen']] : [['REGION', `Nur ${ctx.region?.name || 'aktuelle Region'}`]], 'REGION');
  const frame = optionSelect('frame_style', [['standard','Standard'],['accent','Akzent'],['soft','Soft'],['dark','Dunkel']], 'standard');
  const titleFont = optionSelect('title_font_family', [['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']], 'modern');
  const textFont = optionSelect('font_family', [['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']], 'modern');
  const titleSize = numberInput('title_font_size', 32, 18, 64);
  const textSize = numberInput('font_size', 18, 12, 48);
  const titleColor = colorInput('title_color', '#0f172a');
  const textColor = colorInput('text_color', '#334155');

  const topGrid = document.createElement('div'); topGrid.className = 'ec-home-form-grid';
  topGrid.append(field('Veröffentlichung', scope), field('Rahmenstil', frame), field('Überschrift', title, 'wide'), field('Text', content, 'wide'));
  const typeGrid = document.createElement('div'); typeGrid.className = 'ec-home-type-grid';
  typeGrid.append(field('Titel-Schriftart', titleFont), field('Titel-Größe', titleSize), field('Titel-Farbe', titleColor), field('Text-Schriftart', textFont), field('Text-Größe', textSize), field('Text-Farbe', textColor));
  const imageGrid = document.createElement('div'); imageGrid.className = 'ec-home-image-grid';
  imageGrid.append(field('Bild hochladen', image), field('oder Bild-URL', imageUrl));
  const preview = document.createElement('article'); preview.className = 'ec-home-live-preview style-standard'; preview.innerHTML = '<span>LIVE-VORSCHAU</span><h3>Deine Überschrift</h3><p>Hier erscheint dein Startseitentext als Vorschau.</p>';
  const actions = document.createElement('div'); actions.className = 'ec-home-editor-actions';
  const save = document.createElement('button'); save.className = 'primary-button'; save.type = 'submit'; save.textContent = 'Veröffentlichen';
  const reset = document.createElement('button'); reset.className = 'secondary-button'; reset.type = 'reset'; reset.textContent = 'Zurücksetzen';
  actions.append(save, reset);
  form.append(topGrid, typeGrid, imageGrid, preview, actions);
  section.appendChild(form);
  native.insertAdjacentElement('afterend', section);

  const refresh = () => applyPreview(preview, readForm(form));
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('reset', () => setTimeout(refresh, 0));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = readForm(form);
    if (values.title.length < 3 || values.content.length < 3) return notice('Bitte Überschrift und Text ausfüllen.', true);
    if (values.publication_scope === 'GLOBAL' && !ctx.headAdmin) return notice('Global veröffentlichen darf nur der Head Admin.', true);
    busy = true; save.disabled = true; save.textContent = 'Wird gespeichert …';
    try {
      const uploaded = await uploadImage(image.files?.[0], ctx.user.id);
      const payload = {
        ...values,
        image_url: uploaded || values.image_url,
        region_id: values.publication_scope === 'GLOBAL' ? null : ctx.region?.id,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
        is_visible: true,
        sort_order: Date.now()
      };
      const { error } = await supabase.from('homepage_sections').insert(payload);
      if (error) throw error;
      form.reset();
      notice(values.publication_scope === 'GLOBAL' ? '✓ Globaler Startseiten-Beitrag veröffentlicht.' : `✓ Startseite für ${ctx.region?.name || 'die Region'} gespeichert.`);
      await renderPublished(ctx, true);
    } catch (error) {
      console.error(error);
      notice(`Startseite konnte nicht gespeichert werden: ${error?.message || 'Unbekannter Fehler'}`, true);
    } finally {
      busy = false; save.disabled = false; save.textContent = 'Veröffentlichen';
    }
  });
}

function styledCard(item, ctx) {
  const article = document.createElement('article');
  article.className = `homepage-frame ${item.frame_style || 'standard'} ec-homepage-runtime-card`;
  article.dataset.id = item.id;
  if (item.image_url) {
    const img = document.createElement('img'); img.src = item.image_url; img.alt = '';
    article.appendChild(img);
  }
  const body = document.createElement('div');
  const kicker = document.createElement('span'); kicker.className = 'frame-kicker'; kicker.textContent = item.publication_scope === 'GLOBAL' ? '🌍 ENNSTAL CONNECT · GLOBAL' : (ctx.region?.name || 'REGION');
  const title = document.createElement('h2'); title.textContent = item.title;
  title.style.fontFamily = FONT_MAP[item.title_font_family] || FONT_MAP.modern;
  title.style.fontSize = `${item.title_font_size || 32}px`;
  title.style.color = item.title_color || '#0f172a';
  const text = document.createElement('p'); text.textContent = item.content;
  text.style.fontFamily = FONT_MAP[item.font_family] || FONT_MAP.modern;
  text.style.fontSize = `${item.font_size || 18}px`;
  text.style.color = item.text_color || '#334155';
  body.append(kicker, title, text);
  if (ctx.canRegional && (ctx.headAdmin || item.publication_scope !== 'GLOBAL')) {
    const actions = document.createElement('div'); actions.className = 'content-manage-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Bearbeiten';
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = 'Löschen';
    edit.onclick = () => openEdit(item, ctx);
    remove.onclick = async () => {
      if (!confirm(`„${item.title}“ wirklich löschen?`)) return;
      const { error } = await supabase.from('homepage_sections').delete().eq('id', item.id);
      if (error) return notice(error.message, true);
      notice('Startseiten-Beitrag gelöscht.'); await renderPublished(ctx, true);
    };
    actions.append(edit, remove); body.appendChild(actions);
  }
  article.appendChild(body);
  return article;
}

async function openEdit(item, ctx) {
  if (editorState) editorState.remove();
  const overlay = document.createElement('div'); overlay.className = 'ec-home-edit-overlay'; editorState = overlay;
  const dialog = document.createElement('form'); dialog.className = 'ec-home-edit-dialog';
  dialog.innerHTML = `<header><div><span class="eyebrow">BEARBEITEN</span><h2>Startseiten-Beitrag</h2></div><button type="button" data-close>×</button></header>`;
  const title = document.createElement('input'); title.name='title'; title.value=item.title || ''; title.required=true;
  const content = document.createElement('textarea'); content.name='content'; content.value=item.content || ''; content.rows=8; content.required=true;
  const scope = optionSelect('publication_scope', ctx.headAdmin ? [['REGION', `Nur ${ctx.region?.name || 'aktuelle Region'}`],['GLOBAL','🌍 Global – alle Regionen']] : [['REGION',`Nur ${ctx.region?.name || 'aktuelle Region'}`]], item.publication_scope || 'REGION');
  const titleFont = optionSelect('title_font_family', [['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']], item.title_font_family || 'modern');
  const textFont = optionSelect('font_family', [['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']], item.font_family || 'modern');
  const frame = optionSelect('frame_style', [['standard','Standard'],['accent','Akzent'],['soft','Soft'],['dark','Dunkel']], item.frame_style || 'standard');
  const grid = document.createElement('div'); grid.className='ec-home-form-grid';
  grid.append(field('Veröffentlichung',scope),field('Rahmenstil',frame),field('Überschrift',title,'wide'),field('Text',content,'wide'));
  const type = document.createElement('div'); type.className='ec-home-type-grid';
  type.append(field('Titel-Schriftart',titleFont),field('Titel-Größe',numberInput('title_font_size',item.title_font_size||32,18,64)),field('Titel-Farbe',colorInput('title_color',item.title_color||'#0f172a')),field('Text-Schriftart',textFont),field('Text-Größe',numberInput('font_size',item.font_size||18,12,48)),field('Text-Farbe',colorInput('text_color',item.text_color||'#334155')));
  const imageUrl = document.createElement('input'); imageUrl.name='image_url'; imageUrl.value=item.image_url||'';
  grid.append(field('Bild-URL',imageUrl,'wide'));
  const actions=document.createElement('div'); actions.className='ec-home-editor-actions';
  actions.innerHTML='<button type="button" class="secondary-button" data-cancel>Abbrechen</button><button class="primary-button">Änderungen speichern</button>';
  dialog.append(grid,type,actions); overlay.appendChild(dialog); document.body.appendChild(overlay);
  const close=()=>{overlay.remove();if(editorState===overlay)editorState=null};
  dialog.querySelector('[data-close]').onclick=close; dialog.querySelector('[data-cancel]').onclick=close; overlay.onclick=(e)=>{if(e.target===overlay)close()};
  dialog.onsubmit=async(e)=>{e.preventDefault();const values=readForm(dialog);if(values.publication_scope==='GLOBAL'&&!ctx.headAdmin)return notice('Global veröffentlichen darf nur der Head Admin.',true);const {error}=await supabase.from('homepage_sections').update({...values,region_id:values.publication_scope==='GLOBAL'?null:ctx.region?.id,updated_by:ctx.user.id,updated_at:new Date().toISOString()}).eq('id',item.id);if(error)return notice(`Speichern fehlgeschlagen: ${error.message}`,true);close();notice('✓ Änderungen gespeichert.');await renderPublished(ctx,true)};
}

async function renderPublished(ctx, force = false) {
  const home = document.querySelector('.home-page');
  if (!home || !ctx.region) return;
  let container = home.querySelector('.ec-homepage-combined-sections');
  if (!container) {
    container = document.createElement('div');
    container.className = 'homepage-sections ec-homepage-combined-sections';
    const native = home.querySelector('.homepage-sections:not(.ec-homepage-combined-sections)');
    if (native) native.insertAdjacentElement('afterend', container); else home.appendChild(container);
  }
  const native = home.querySelector('.homepage-sections:not(.ec-homepage-combined-sections)');
  if (native) native.hidden = true;
  const { data, error } = await supabase.from('homepage_sections').select('*').eq('is_visible', true).or(`publication_scope.eq.GLOBAL,region_id.eq.${ctx.region.id}`).order('sort_order', { ascending: true });
  if (error) { if (force) notice(error.message, true); return; }
  const rows = (data || []).filter((row) => row.publication_scope === 'GLOBAL' || row.region_id === ctx.region.id);
  const signature = rows.map((r) => `${r.id}:${r.updated_at || ''}`).join('|');
  if (!force && container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren(...rows.map((item) => styledCard(item, ctx)));
}

async function render() {
  if (!onHome()) return;
  const ctx = await context();
  if (!ctx) return;
  buildEditor(ctx);
  await renderPublished(ctx);
}

let timer;
function schedule() { clearTimeout(timer); timer = setTimeout(() => void render(), 120); }
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:region-change', schedule);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true }); else schedule();
