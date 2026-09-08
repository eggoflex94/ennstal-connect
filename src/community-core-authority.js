import { supabase } from './supabaseClient';

const FONT_OPTIONS = [
  ['modern','Modern'],['montserrat','Montserrat'],['arial','Arial'],['opensans','Open Sans'],['serif','Serif']
];
const FONT_CSS = {
  modern: 'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  montserrat: 'Montserrat,Inter,system-ui,sans-serif',
  arial: 'Arial,Helvetica,sans-serif',
  opensans: '"Open Sans",Arial,sans-serif',
  serif: 'Georgia,"Times New Roman",serif'
};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeSlug = () => document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || '';
const norm = (v) => String(v || '').replace(/\s+/g,' ').trim().toLowerCase();
let timer = null;
let memberCache = null;
let homepageBusy = false;
let lastRegionSlug = '';

function toast(text, error=false) {
  let el = document.querySelector('.ec-core-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'ec-core-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.toggle('is-error', error);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 4500);
}

async function getContext() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{data: profile},{data: regions},{data: assignments}] = await Promise.all([
    supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true)
  ]);
  const region = (regions || []).find((r) => r.slug === activeSlug()) || (regions || [])[0] || null;
  const role = String(profile?.role || '').toUpperCase();
  const head = role === 'HEAD_ADMIN';
  const regionalIds = new Set((assignments || []).map((a) => a.region_id));
  return { user, profile, regions: regions || [], region, head, canEdit: head || Boolean(region && regionalIds.has(region.id)) };
}

async function nextHomepageSortOrder() {
  const { data, error } = await supabase.from('homepage_sections').select('sort_order').order('sort_order',{ascending:false}).limit(1);
  if (error) return 10;
  return Number(data?.[0]?.sort_order || 0) + 10;
}

async function uploadHomepage(file, userId) {
  if (!file || !file.size) return null;
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/homepage/${crypto.randomUUID()}.${ext}`;
  for (const bucket of ['community-media','profile-avatars']) {
    const { error } = await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
    if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
    if (!/bucket not found/i.test(error.message || '')) throw error;
  }
  return null;
}

function selectHtml(name, options, current) {
  return `<select name="${name}">${options.map(([v,l]) => `<option value="${v}"${v===current?' selected':''}>${l}</option>`).join('')}</select>`;
}

function editorValues(form) {
  const d = new FormData(form);
  return {
    title: String(d.get('title') || '').trim(),
    content: String(d.get('content') || '').trim(),
    image_url: String(d.get('image_url') || '').trim() || null,
    frame_style: String(d.get('frame_style') || 'standard'),
    publication_scope: String(d.get('publication_scope') || 'REGION'),
    title_font_family: String(d.get('title_font_family') || 'modern'),
    title_font_size: Number(d.get('title_font_size') || 32),
    title_color: String(d.get('title_color') || '#0f172a'),
    font_family: String(d.get('font_family') || 'modern'),
    font_size: Number(d.get('font_size') || 18),
    text_color: String(d.get('text_color') || '#334155')
  };
}

function updatePreview(form) {
  const preview = form.querySelector('.ec-core-home-preview');
  if (!preview) return;
  const v = editorValues(form);
  const h = preview.querySelector('h3');
  const p = preview.querySelector('p');
  h.textContent = v.title || 'Deine Überschrift';
  p.textContent = v.content || 'Hier siehst du sofort, wie dein Startseiten-Text aussehen wird.';
  h.style.fontFamily = FONT_CSS[v.title_font_family] || FONT_CSS.modern;
  h.style.fontSize = `${v.title_font_size}px`;
  h.style.color = v.title_color;
  p.style.fontFamily = FONT_CSS[v.font_family] || FONT_CSS.modern;
  p.style.fontSize = `${v.font_size}px`;
  p.style.color = v.text_color;
  preview.dataset.style = v.frame_style;
}

async function mountHomepageEditor(ctx) {
  const home = document.querySelector('.home-page');
  if (!home || !ctx?.canEdit) return;

  document.querySelectorAll('.homepage-editor-toggle,.ec-homepage-modern-editor,.ec-home-final-editor').forEach((el) => {
    if (!el.classList.contains('ec-core-home-editor')) el.style.display = 'none';
  });

  let editor = home.querySelector('.ec-core-home-editor');
  if (editor) {
    const regionLabel = editor.querySelector('.ec-core-home-region');
    if (regionLabel) regionLabel.textContent = ctx.region?.name || 'Region';
    const regionOption = editor.querySelector('option[value="REGION"]');
    if (regionOption) regionOption.textContent = `Nur ${ctx.region?.name || 'aktuelle Region'}`;
    return;
  }

  editor = document.createElement('details');
  editor.className = 'ec-core-home-editor panel';
  editor.open = true;
  editor.innerHTML = `<summary>Startseite für <span class="ec-core-home-region">${esc(ctx.region?.name || 'Region')}</span> gestalten</summary><div class="ec-core-home-editor-inner"><div class="ec-core-home-head"><div><span class="eyebrow">STARTSEITE VERWALTEN</span><h2>Inhalt & Design</h2><p>Schriftart, Schriftgröße, Farben, Bild und Veröffentlichungsbereich direkt festlegen.</p></div><b>${ctx.head?'GLOBAL ADMIN':'REGIONAL ADMIN'}</b></div><form class="ec-core-home-form"><div class="ec-core-home-grid"><label>Veröffentlichung${selectHtml('publication_scope',ctx.head?[['REGION',`Nur ${ctx.region?.name || 'aktuelle Region'}`],['GLOBAL','🌍 Global – alle Regionen']]:[['REGION',`Nur ${ctx.region?.name || 'aktuelle Region'}`]],'REGION')}</label><label>Rahmenstil${selectHtml('frame_style',[['standard','Standard'],['accent','Akzent'],['soft','Soft'],['dark','Dunkel']],'standard')}</label><label class="wide">Überschrift<input name="title" required placeholder="Überschrift"></label><label class="wide">Text<textarea name="content" rows="7" required placeholder="Text für die Startseite"></textarea></label></div><div class="ec-core-home-typo"><label>Titel Schriftart${selectHtml('title_font_family',FONT_OPTIONS,'modern')}</label><label>Titel Größe<input type="number" name="title_font_size" min="18" max="64" value="32"></label><label>Titel Farbe<input type="color" name="title_color" value="#0f172a"></label><label>Text Schriftart${selectHtml('font_family',FONT_OPTIONS,'modern')}</label><label>Text Größe<input type="number" name="font_size" min="12" max="48" value="18"></label><label>Text Farbe<input type="color" name="text_color" value="#334155"></label></div><div class="ec-core-home-media"><label>Bild hochladen<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label><label>oder Bild-URL<input name="image_url" placeholder="https://…"></label></div><article class="ec-core-home-preview" data-style="standard"><span>LIVE-VORSCHAU</span><h3>Deine Überschrift</h3><p>Hier siehst du sofort, wie dein Startseiten-Text aussehen wird.</p></article><div class="ec-core-home-actions"><button type="reset" class="secondary-button">Zurücksetzen</button><button type="submit" class="primary-button">Speichern & veröffentlichen</button></div></form></div>`;
  const heading = home.querySelector('.page-heading');
  if (heading) heading.insertAdjacentElement('afterend', editor); else home.prepend(editor);

  const form = editor.querySelector('form');
  form.addEventListener('input', () => updatePreview(form));
  form.addEventListener('change', () => updatePreview(form));
  form.addEventListener('reset', () => setTimeout(() => updatePreview(form),0));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (homepageBusy) return;
    const v = editorValues(form);
    if (v.title.length < 3 || v.content.length < 3) return toast('Bitte Überschrift und Text ausfüllen.', true);
    if (v.publication_scope === 'GLOBAL' && !ctx.head) return toast('Global darf nur der Head Admin veröffentlichen.', true);
    const button = form.querySelector('[type="submit"]');
    homepageBusy = true;
    button.disabled = true;
    button.textContent = 'Wird gespeichert …';
    try {
      const uploaded = await uploadHomepage(form.elements.image?.files?.[0], ctx.user.id);
      const sort_order = await nextHomepageSortOrder();
      const payload = {
        ...v,
        image_url: uploaded || v.image_url,
        region_id: v.publication_scope === 'GLOBAL' ? null : ctx.region?.id,
        created_by: ctx.user.id,
        updated_by: ctx.user.id,
        is_visible: true,
        sort_order
      };
      const { error } = await supabase.from('homepage_sections').insert(payload);
      if (error) throw error;
      form.reset();
      toast(v.publication_scope === 'GLOBAL' ? '✓ Global veröffentlicht.' : `✓ Startseite für ${ctx.region?.name || 'die Region'} gespeichert.`);
      await renderHomepageSections(ctx);
    } catch (error) {
      console.error(error);
      toast(`Speichern fehlgeschlagen: ${error?.message || error}`, true);
    } finally {
      homepageBusy = false;
      button.disabled = false;
      button.textContent = 'Speichern & veröffentlichen';
    }
  });
}

function homepageCard(row, ctx) {
  const a = document.createElement('article');
  a.className = `homepage-frame ${row.frame_style || 'standard'} ec-core-home-card`;
  if (row.image_url) {
    const img = document.createElement('img'); img.src = row.image_url; img.alt = ''; a.appendChild(img);
  }
  const body = document.createElement('div');
  body.innerHTML = `<span class="frame-kicker">${row.publication_scope==='GLOBAL'?'🌍 GLOBAL':esc(ctx.region?.name || 'REGION')}</span><h2></h2><p></p>`;
  const h = body.querySelector('h2'), p = body.querySelector('p');
  h.textContent = row.title || '';
  p.textContent = row.content || '';
  h.style.fontFamily = FONT_CSS[row.title_font_family] || FONT_CSS.modern;
  h.style.fontSize = `${row.title_font_size || 32}px`;
  h.style.color = row.title_color || '#0f172a';
  p.style.fontFamily = FONT_CSS[row.font_family] || FONT_CSS.modern;
  p.style.fontSize = `${row.font_size || 18}px`;
  p.style.color = row.text_color || '#334155';
  if (ctx.canEdit && (ctx.head || row.publication_scope !== 'GLOBAL')) {
    const actions = document.createElement('div');
    actions.className = 'content-manage-actions';
    const remove = document.createElement('button');
    remove.className = 'danger-button'; remove.type = 'button'; remove.textContent = 'Löschen';
    remove.onclick = async () => {
      if (!confirm(`„${row.title}“ wirklich löschen?`)) return;
      const { error } = await supabase.from('homepage_sections').delete().eq('id',row.id);
      if (error) return toast(error.message,true);
      toast('Startseiten-Beitrag gelöscht.'); await renderHomepageSections(ctx);
    };
    actions.appendChild(remove); body.appendChild(actions);
  }
  a.appendChild(body); return a;
}

async function renderHomepageSections(ctx) {
  const home = document.querySelector('.home-page');
  if (!home || !ctx?.region) return;
  document.querySelectorAll('.homepage-sections:not(.ec-core-home-sections),.ec-home-final-sections').forEach((el) => el.style.display='none');
  let box = home.querySelector('.ec-core-home-sections');
  if (!box) { box = document.createElement('div'); box.className='homepage-sections ec-core-home-sections'; home.appendChild(box); }
  const { data, error } = await supabase.from('homepage_sections').select('*').eq('is_visible',true).or(`publication_scope.eq.GLOBAL,region_id.eq.${ctx.region.id}`).order('sort_order',{ascending:true});
  if (error) return console.warn(error.message);
  box.replaceChildren(...(data || []).filter((r) => r.publication_scope==='GLOBAL' || r.region_id===ctx.region.id).map((r) => homepageCard(r,ctx)));
}

async function loadMembers() {
  if (memberCache && lastRegionSlug === activeSlug()) return memberCache;
  const [{data:regions,error:re},{data:profiles,error:pe}] = await Promise.all([
    supabase.from('regions').select('id,slug,name,sort_order').eq('is_active',true).order('sort_order'),
    supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url,role,account_badge,home_region_id,is_online,last_active_at,hide_online_status,account_status,is_test_account').eq('account_status','ACTIVE')
  ]);
  if (re || pe) throw re || pe;
  lastRegionSlug = activeSlug();
  memberCache = { regions: regions || [], profiles: (profiles || []).filter((p) => !p.is_test_account) };
  return memberCache;
}

function memberName(p) { return p.nickname || [p.first_name,p.last_name].filter(Boolean).join(' ') || 'Mitglied'; }
function online(p) { return Boolean(!p.hide_online_status && p.is_online && p.last_active_at && Date.now()-new Date(p.last_active_at).getTime()<5*60*1000); }
function memberCard(p, regionMap) {
  const card = document.createElement('article');
  const role = String(p.role || 'MEMBER').toUpperCase();
  const theme = role==='HEAD_ADMIN'||role==='ADMIN'?'admin':role==='SUPPORTER'?'supporter':p.account_badge==='BUSINESS'?'business':'member';
  card.className = `ec-core-member-card role-theme-${theme}`;
  const n = memberName(p), region = regionMap.get(p.home_region_id)?.name || 'Keine Region';
  card.innerHTML = `<div class="ec-core-member-head"><img src="${esc(p.avatar_url || '/community-default-avatar.png')}" alt="Profilbild von ${esc(n)}"><div><strong>${esc(n)}</strong><span>⌖ ${esc(region)}</span><small class="${online(p)?'online':''}">${p.hide_online_status?'Status verborgen':online(p)?'● Online':'○ Offline'}</small></div></div><button type="button">Profil öffnen</button>`;
  card.querySelector('button').onclick = () => window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:p.id,nickname:p.nickname || ''}}));
  return card;
}

async function mountMembers() {
  const heading = document.querySelector('.content-root .page-heading');
  const title = heading?.querySelector('h1');
  if (!heading || !title || !norm(title.textContent).startsWith('mitglieder')) return;
  const section = heading.parentElement;
  const data = await loadMembers();
  const regionMap = new Map(data.regions.map((r) => [r.id,r]));
  const active = data.regions.find((r) => r.slug === activeSlug()) || data.regions[0];

  title.textContent = 'Mitglieder';
  const subtitle = heading.querySelector('p');
  if (subtitle) subtitle.textContent = 'Durchsuche alle Mitglieder oder filtere gezielt nach einer Region.';
  heading.querySelector('.search-input')?.setAttribute('hidden','');
  section.querySelectorAll('.ec-region-context').forEach((el) => el.style.display='none');
  section.querySelectorAll('.member-grid,.members-grid').forEach((el) => { if (!el.classList.contains('ec-core-member-grid')) el.style.display='none'; });

  let shell = section.querySelector('.ec-core-member-search');
  if (!shell) {
    shell = document.createElement('section'); shell.className='ec-core-member-search panel';
    heading.insertAdjacentElement('afterend',shell);
    shell.innerHTML = `<div class="ec-core-member-search-head"><div><span class="eyebrow">MITGLIEDER FINDEN</span><h2>Community durchsuchen</h2><p>Suche nach Name oder Nickname und wähle optional eine Region.</p></div><b>${data.profiles.length} Mitglieder gesamt</b></div><div class="ec-core-member-controls"><label><span>⌕</span><input type="search" placeholder="Mitglied suchen …"></label><select class="ec-core-member-region"><option value="all">Alle Regionen</option>${data.regions.map((r)=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><label class="online"><input type="checkbox"> Nur online</label></div><div class="ec-core-member-quick"><button type="button" data-scope="all">Alle Regionen</button><button type="button" data-scope="active">${esc(active?.name || 'Aktuelle Region')}</button></div><div class="ec-core-member-meta"></div>`;
  }
  let grid = section.querySelector('.ec-core-member-grid');
  if (!grid) { grid=document.createElement('div'); grid.className='ec-core-member-grid'; shell.insertAdjacentElement('afterend',grid); }

  const qInput=shell.querySelector('input[type=search]'), regionSelect=shell.querySelector('.ec-core-member-region'), onlineInput=shell.querySelector('.online input');
  if (!shell.dataset.bound) {
    shell.dataset.bound='1';
    const render = () => {
      const q=norm(qInput.value), region=regionSelect.value, onlyOnline=onlineInput.checked;
      const rows=data.profiles.filter((p)=>{
        const hay=norm([p.nickname,p.first_name,p.last_name,regionMap.get(p.home_region_id)?.name].filter(Boolean).join(' '));
        return (region==='all'||p.home_region_id===region)&&(!onlyOnline||online(p))&&(!q||hay.includes(q));
      }).sort((a,b)=>memberName(a).localeCompare(memberName(b),'de'));
      shell.querySelector('.ec-core-member-meta').textContent=`${rows.length} ${rows.length===1?'Mitglied':'Mitglieder'} gefunden${region==='all'?' · alle Regionen':` · ${regionMap.get(region)?.name || 'Region'}`}${onlyOnline?' · nur online':''}`;
      grid.replaceChildren(...rows.map((p)=>memberCard(p,regionMap)));
      if (!rows.length) { const empty=document.createElement('div'); empty.className='ec-member-empty'; empty.textContent='Keine Mitglieder gefunden.'; grid.appendChild(empty); }
    };
    qInput.oninput=render; regionSelect.onchange=render; onlineInput.onchange=render;
    shell.querySelector('[data-scope="all"]').onclick=()=>{regionSelect.value='all';render()};
    shell.querySelector('[data-scope="active"]').onclick=()=>{regionSelect.value=active?.id || 'all';render()};
    shell._render=render;
  }
  shell.querySelector('[data-scope="active"]').textContent=active?.name || 'Aktuelle Region';
  shell._render?.();
}

function findOverviewPanel() {
  return [...document.querySelectorAll('.home-page section,.home-page article,.home-page div')].find((el) => norm(el.querySelector(':scope > h2')?.textContent)==='auf einen blick') || [...document.querySelectorAll('.home-page *')].map((h)=>h.tagName==='H2'&&norm(h.textContent)==='auf einen blick'?h.parentElement:null).find(Boolean) || null;
}

async function mountRegionalNextEvent(ctx) {
  if (!ctx?.region || !document.querySelector('.home-page')) return;
  const panel = findOverviewPanel();
  if (!panel) return;
  const { data, error } = await supabase.from('community_events').select('id,title,event_at,status,region_id').eq('region_id',ctx.region.id).eq('status','ACTIVE').gte('event_at',new Date().toISOString()).order('event_at',{ascending:true}).limit(1);
  if (error) return console.warn(error.message);
  const event = data?.[0] || null;

  [...panel.querySelectorAll('*')].forEach((el) => {
    if (el.closest('[data-ec-core-next-event]')) return;
    const t=norm(el.textContent);
    if ((t.includes('nächster termin')||t.includes('naechster termin')) && el.children.length < 5) {
      const target=el.closest('button') || el.parentElement;
      if (target && target!==panel) target.style.display='none';
    }
  });
  let bar=panel.querySelector('[data-ec-core-next-event]');
  if (!bar) { bar=document.createElement('button'); bar.type='button'; bar.dataset.ecCoreNextEvent='1'; bar.className='ec-core-next-event'; panel.appendChild(bar); }
  bar.innerHTML=`<span>NÄCHSTER TERMIN · ${esc(ctx.region.name)}</span><strong>${esc(event?.title || `Derzeit kein kommender Termin in ${ctx.region.name}`)}</strong><time>${event?.event_at ? new Date(event.event_at).toLocaleString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}</time>`;
  bar.disabled=!event?.id;
  bar.onclick=event?.id?()=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'events'}})):null;
}

async function apply() {
  try {
    const ctx = await getContext();
    if (!ctx) return;
    if (document.querySelector('.home-page')) {
      await mountHomepageEditor(ctx);
      await renderHomepageSections(ctx);
      await mountRegionalNextEvent(ctx);
    }
    await mountMembers();
  } catch (error) {
    console.warn('Core community UI could not be applied:', error);
  }
}

function schedule(delay=120) {
  clearTimeout(timer);
  timer=setTimeout(()=>void apply(),delay);
}

new MutationObserver(()=>schedule(160)).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>{memberCache=null;schedule(20)});
window.addEventListener('focus',()=>schedule(80));
if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>schedule(100),{once:true}); else schedule(100);
