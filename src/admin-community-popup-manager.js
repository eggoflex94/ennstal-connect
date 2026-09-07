import { supabase } from './supabaseClient';

let state={viewer:null,regions:[],assignments:[],moderation:[],items:[]};
let loading=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=()=>String(state.viewer?.role||'').toUpperCase();
const isGlobalAdmin=()=>['HEAD_ADMIN','ADMIN'].includes(role());
const activeSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const managedRegionIds=()=>new Set(state.moderation.filter(m=>m.active&&Array.isArray(m.permissions)&&m.permissions.includes('ANNOUNCEMENTS')&&state.assignments.some(a=>a.active&&a.user_id===state.viewer?.id&&a.region_id===m.region_id)).map(m=>m.region_id));
const manageableRegions=()=>isGlobalAdmin()?state.regions:state.regions.filter(r=>managedRegionIds().has(r.id));
const canManage=()=>isGlobalAdmin()||manageableRegions().length>0;
const regionForId=id=>state.regions.find(r=>r.id===id)||null;

function sectionText(item){return (item?.sections||[]).map(s=>`${s.label}\n${(s.items||[]).map(i=>`- ${i}`).join('\n')}`).join('\n\n')}
function parseSections(raw){return String(raw||'').split(/\n\s*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);return{label:lines.shift()||'BEREICH',items:lines.map(x=>x.replace(/^[-•✓]\s*/,''))}}).filter(x=>x.items.length)}

async function hydrate(){
  if(!supabase)return false;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  const [{data:viewer},{data:regions},{data:assignments},{data:moderation}]=await Promise.all([
    supabase.from('profiles').select('id,role').eq('id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('user_id',user.id).eq('active',true),
    supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('user_id',user.id).eq('active',true)
  ]);
  state.viewer=viewer||null;state.regions=regions||[];state.assignments=assignments||[];state.moderation=moderation||[];
  return canManage();
}

async function loadItems(){
  const allowed=await hydrate();if(!allowed){state.items=[];return false}
  const {data:items,error}=await supabase.rpc('ec_list_manageable_community_announcements',{p_region_slug:activeSlug()||null});
  if(error)throw error;state.items=items||[];return true;
}

function panelMarkup(){
  const items=state.items.map(item=>`<article class="ec-popup-admin-item" data-id="${esc(item.id)}"><div><span class="ec-popup-scope ${item.region_id?'regional':'global'}">${item.region_id?`REGION · ${esc(item.region_name||'Region')}`:'GLOBAL'}</span><strong>${esc(item.title)}</strong><small>${item.active?'Aktiv':'Inaktiv'} · Version ${Number(item.version||1)}</small></div><div><button type="button" data-action="preview">Ansehen</button><button type="button" data-action="edit">Bearbeiten</button><button type="button" data-action="delete" class="danger">Löschen</button></div></article>`).join('');
  return `<header class="ec-popup-admin-head"><div><span class="eyebrow">COMMUNITY-POPUPS</span><h2>Ankündigungen verwalten</h2><p>${isGlobalAdmin()?'Globale oder regionale News-Popups erstellen, prüfen und freigeben.':'Du verwaltest nur die Popups deiner freigegebenen Region.'}</p></div><button type="button" class="ec-popup-new">+ Neues Popup</button></header><div class="ec-popup-admin-list">${items||'<p class="ec-popup-admin-empty">Noch keine verwaltbaren Popups vorhanden.</p>'}</div>`;
}

function wirePanel(panel){
  panel.querySelector('.ec-popup-new')?.addEventListener('click',()=>openEditor(null));
  panel.querySelectorAll('.ec-popup-admin-item').forEach(row=>{
    const item=state.items.find(x=>x.id===row.dataset.id);if(!item)return;
    row.querySelector('[data-action="preview"]').onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-community-announcement',{detail:{id:item.id}}));
    row.querySelector('[data-action="edit"]').onclick=()=>openEditor(item);
    row.querySelector('[data-action="delete"]').onclick=()=>removeItem(item);
  });
}

function closePage(){
  document.querySelector('.ec-popup-manager-page')?.remove();
  document.body.classList.remove('ec-popup-manager-page-open');
  window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
}

async function renderPage(){
  const root=document.querySelector('.content-root');if(!root)return;
  let page=root.querySelector('.ec-popup-manager-page');
  if(!page){
    page=document.createElement('section');
    page.className='ec-popup-manager-page';
    root.appendChild(page);
  }
  document.body.classList.add('ec-popup-manager-page-open');
  page.innerHTML='<div class="ec-tool-page-head"><button type="button" class="ec-tool-page-back">← Zurück</button><div><span class="eyebrow">ADMIN TOOLS</span><h1>News-Popups</h1><p>Erstelle und verwalte Community-Ankündigungen direkt auf einer eigenen Seite.</p></div></div><section class="ec-popup-admin-manager panel"><p class="ec-admin-tool-loading">Popup-Verwaltung wird geladen …</p></section>';
  page.querySelector('.ec-tool-page-back').onclick=()=>{closePage();window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'admin'}}))};
  try{
    const allowed=await loadItems();
    const panel=page.querySelector('.ec-popup-admin-manager');
    if(!allowed){panel.innerHTML='<p class="ec-admin-tool-error">Keine Berechtigung für Community-Popups.</p>';return}
    panel.innerHTML=panelMarkup();wirePanel(panel);
  }catch(error){page.querySelector('.ec-popup-admin-manager').innerHTML=`<p class="ec-admin-tool-error">Popup-Verwaltung konnte nicht geladen werden: ${esc(error.message||error)}</p>`}
  window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
}

function scopeOptions(item){
  const regions=manageableRegions();
  const global=isGlobalAdmin()?`<option value="" ${!item?.region_id?'selected':''}>Global · alle Regionen</option>`:'';
  return global+regions.map(r=>`<option value="${esc(r.slug)}" ${item?.region_id===r.id?'selected':''}>Region · ${esc(r.name)}</option>`).join('');
}

function openEditor(item){
  document.querySelector('.ec-popup-admin-editor')?.remove();
  const overlay=document.createElement('div');overlay.className='ec-popup-admin-editor';
  const defaultRegion=item?.region_id?regionForId(item.region_id)?.slug:(isGlobalAdmin()?'':manageableRegions()[0]?.slug||'');
  overlay.innerHTML=`<form class="ec-popup-admin-editor-box"><header><div><span>${item?'POPUP BEARBEITEN':'NEUES POPUP'}</span><h2>${item?esc(item.title):'Community-Ankündigung erstellen'}</h2></div><button type="button" data-close aria-label="Schließen">×</button></header><label>Freigabe<select name="scope">${scopeOptions(item)}</select></label><label>Titel<input name="title" required minlength="3" value="${esc(item?.title||'')}"></label><label>Untertitel<input name="subtitle" value="${esc(item?.subtitle||'')}"></label><label>Bild-URL<input name="image" value="${esc(item?.image_url||'/ennstal-community-news-banner.svg')}"></label><label>Inhalte<small>Erste Zeile = Bereichsüberschrift, darunter je ein Punkt. Leerzeile startet einen neuen Bereich.</small><textarea name="sections">${esc(sectionText(item))}</textarea></label><label class="ec-popup-active"><input type="checkbox" name="active" ${item?.active===false?'':'checked'}> Popup aktiv anzeigen</label><div class="ec-popup-admin-editor-actions"><button type="button" data-close>Abbrechen</button><button type="submit" class="primary">${item?'Änderungen speichern':'Popup erstellen'}</button></div><p class="ec-popup-admin-status"></p></form>`;
  document.body.appendChild(overlay);document.body.classList.add('ec-popup-admin-editing');
  const form=overlay.querySelector('form');if(defaultRegion&&!form.scope.value)form.scope.value=defaultRegion;
  const close=()=>{overlay.remove();document.body.classList.remove('ec-popup-admin-editing')};overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);overlay.onclick=e=>{if(e.target===overlay)close()};
  form.onsubmit=async e=>{e.preventDefault();const status=form.querySelector('.ec-popup-admin-status');const submit=form.querySelector('[type="submit"]');submit.disabled=true;status.textContent='Wird gespeichert …';
    try{const {error}=await supabase.rpc('ec_save_community_announcement',{p_id:item?.id||null,p_title:form.title.value,p_subtitle:form.subtitle.value,p_sections:parseSections(form.sections.value),p_image_url:form.image.value,p_region_slug:form.scope.value||null,p_active:form.active.checked});if(error)throw error;status.textContent='Gespeichert.';window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));close();await renderPage()}catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.'}finally{submit.disabled=false}};
}

async function removeItem(item){
  if(!confirm(`Popup „${item.title}“ wirklich löschen?`))return;
  const {error}=await supabase.rpc('ec_delete_community_announcement',{p_id:item.id});if(error){alert(error.message);return}window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));await renderPage();
}

function boot(){
  window.addEventListener('ec:open-community-popup-manager',()=>void renderPage());
  window.addEventListener('ec:region-change',()=>{if(document.body.classList.contains('ec-popup-manager-page-open'))setTimeout(()=>void renderPage(),120)});
  window.addEventListener('ec:community-announcements-refresh',()=>{if(document.body.classList.contains('ec-popup-manager-page-open'))setTimeout(()=>void renderPage(),80)});
  window.addEventListener('ec:navigate',()=>{if(document.body.classList.contains('ec-popup-manager-page-open'))closePage()});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.ec-popup-admin-editor'))document.querySelector('.ec-popup-admin-editor [data-close]')?.click()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();