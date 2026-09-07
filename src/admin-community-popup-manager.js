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

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;
    const [{data:viewer},{data:regions},{data:assignments},{data:moderation}]=await Promise.all([
      supabase.from('profiles').select('id,role').eq('id',user.id).maybeSingle(),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('user_id',user.id).eq('active',true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('user_id',user.id).eq('active',true)
    ]);
    state.viewer=viewer||null;state.regions=regions||[];state.assignments=assignments||[];state.moderation=moderation||[];
    if(!canManage()){document.querySelector('.ec-popup-admin-manager')?.remove();return}
    const {data:items,error}=await supabase.rpc('ec_list_manageable_community_announcements',{p_region_slug:activeSlug()||null});
    if(error)throw error;state.items=items||[];render();
  }catch(error){console.warn('Community-Popup-Verwaltung konnte nicht geladen werden:',error)}finally{loading=false}
}

function render(){
  const root=document.querySelector('.admin-page');if(!root||!canManage())return;
  let panel=root.querySelector('.ec-popup-admin-manager');
  if(!panel){panel=document.createElement('section');panel.className='ec-popup-admin-manager panel';const anchor=root.querySelector('.ec-hours-statistics,.ec-admin-role-overview,.admin-member-cards');if(anchor)anchor.before(panel);else root.appendChild(panel)}
  const items=state.items.map(item=>`<article class="ec-popup-admin-item" data-id="${esc(item.id)}"><div><span class="ec-popup-scope ${item.region_id?'regional':'global'}">${item.region_id?`REGION · ${esc(item.region_name||'Region')}`:'GLOBAL'}</span><strong>${esc(item.title)}</strong><small>${item.active?'Aktiv':'Inaktiv'} · Version ${Number(item.version||1)}</small></div><div><button type="button" data-action="preview">Ansehen</button><button type="button" data-action="edit">Bearbeiten</button><button type="button" data-action="delete" class="danger">Löschen</button></div></article>`).join('');
  panel.innerHTML=`<header class="ec-popup-admin-head"><div><span class="eyebrow">COMMUNITY-POPUPS</span><h2>Ankündigungen verwalten</h2><p>${isGlobalAdmin()?'Globale oder regionale Popups erstellen und freigeben.':'Du kannst Popups nur für deine freigegebene Region verwalten.'}</p></div><button type="button" class="ec-popup-new">+ Neues Popup</button></header><div class="ec-popup-admin-list">${items||'<p class="ec-popup-admin-empty">Noch keine verwaltbaren Popups vorhanden.</p>'}</div>`;
  panel.querySelector('.ec-popup-new').onclick=()=>openEditor(null);
  panel.querySelectorAll('.ec-popup-admin-item').forEach(row=>{
    const item=state.items.find(x=>x.id===row.dataset.id);if(!item)return;
    row.querySelector('[data-action="preview"]').onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-community-announcement',{detail:{id:item.id}}));
    row.querySelector('[data-action="edit"]').onclick=()=>openEditor(item);
    row.querySelector('[data-action="delete"]').onclick=()=>removeItem(item);
  });
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
    try{const {error}=await supabase.rpc('ec_save_community_announcement',{p_id:item?.id||null,p_title:form.title.value,p_subtitle:form.subtitle.value,p_sections:parseSections(form.sections.value),p_image_url:form.image.value,p_region_slug:form.scope.value||null,p_active:form.active.checked});if(error)throw error;status.textContent='Gespeichert.';window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));close();await load()}catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.'}finally{submit.disabled=false}};
}

async function removeItem(item){
  if(!confirm(`Popup „${item.title}“ wirklich löschen?`))return;
  const {error}=await supabase.rpc('ec_delete_community_announcement',{p_id:item.id});if(error){alert(error.message);return}window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));await load();
}

function boot(){void load();const observer=new MutationObserver(()=>{if(document.querySelector('.admin-page')&&!document.querySelector('.ec-popup-admin-manager')){clearTimeout(window.__ecPopupAdmin);window.__ecPopupAdmin=setTimeout(()=>void load(),140)}});observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>void load(),120));window.addEventListener('ec:community-announcements-refresh',()=>setTimeout(()=>void load(),80))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();