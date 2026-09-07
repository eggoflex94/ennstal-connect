import { supabase } from './supabaseClient';

let announcements=[];
let announcement=null;
let viewer=null;
let regions=[];
let manageableIds=new Set();
let mounted=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isHead=()=>String(viewer?.role||'').toUpperCase()==='HEAD_ADMIN';
const activeSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const seenKey=a=>`ec-community-news-seen:${a.id}:${a.version}`;
const canManage=a=>Boolean(a&&(isHead()||manageableIds.has(a.id)));
const regionFor=id=>regions.find(r=>r.id===id)||null;

async function load(force=false){
  if(!supabase)return;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const [{data:profile},{data:regionRows},{data:rows},{data:manageable}]=await Promise.all([
    supabase.from('profiles').select('id,role,home_region_id').eq('id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
    supabase.rpc('ec_get_community_announcements',{p_region_slug:activeSlug()||null}),
    supabase.rpc('ec_list_manageable_community_announcements',{p_region_slug:activeSlug()||null})
  ]);
  viewer=profile||null;regions=regionRows||[];announcements=rows||[];manageableIds=new Set((manageable||[]).map(a=>a.id));
  selectAnnouncement(force);
}

function selectAnnouncement(force=false,id=null){
  if(mounted)return;
  announcement=id?announcements.find(a=>a.id===id):null;
  if(!announcement){announcement=announcements.find(a=>force||localStorage.getItem(seenKey(a))!=='1')||null}
  if(announcement)render();
}

function iconFor(label=''){
  const l=label.toUpperCase();
  if(l.includes('ROLLEN'))return'👥';
  if(l.includes('HILFE'))return'?';
  if(l.includes('BELOHN'))return'🎁';
  return'◉';
}

function scopeLabel(a){return a?.region_id?`REGION · ${a.region_name||regionFor(a.region_id)?.name||'Region'}`:'GLOBAL'}

function render(){
  mounted=true;
  const overlay=document.createElement('div');
  overlay.className='ec-global-news-overlay';
  overlay.innerHTML=`<section class="ec-global-news-modal" role="dialog" aria-modal="true" aria-labelledby="ec-global-news-title">
    <button class="ec-global-news-close" type="button" aria-label="Schließen">×</button>
    <div class="ec-global-news-hero" style="background-image:url('${esc(announcement.image_url||'/ennstal-community-news-banner.svg')}')"></div>
    <div class="ec-global-news-body">
      <div class="ec-global-news-topline"><div class="ec-global-news-kicker"><span>ENNSTAL CONNECT COMMUNITY NEWS</span><b class="ec-global-news-scope ${announcement.region_id?'regional':'global'}">${esc(scopeLabel(announcement))}</b></div>${canManage(announcement)?`<div class="ec-global-news-admin"><small>🔒 ${isHead()?'Verwaltung':'Regionale Verwaltung'}</small><div><button type="button" data-admin="edit">✎ Bearbeiten</button><button type="button" data-admin="delete">🗑 Löschen</button></div></div>`:''}</div>
      <h1 id="ec-global-news-title">${esc(announcement.title)}</h1>
      <p class="ec-global-news-subtitle">${esc(announcement.subtitle||'')}</p>
      <div class="ec-global-news-sections">${(announcement.sections||[]).map(section=>`<article><div class="ec-global-news-section-icon">${esc(iconFor(section.label))}</div><div><h2>${esc(section.label||'')}</h2><ul>${(section.items||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div></article>`).join('')}</div>
      <footer><div class="ec-global-news-thanks"><span>♥</span><p><strong>Danke, dass du Teil von Ennstal Connect bist.</strong><small>Regional. Echt. Gemeinsam.</small></p></div><div class="ec-global-news-actions"><button type="button" data-action="later">Später</button><button type="button" class="primary" data-action="seen">✓ Verstanden</button></div></footer>
    </div>
  </section>`;
  document.body.appendChild(overlay);document.body.classList.add('ec-global-news-open');
  const close=()=>{overlay.remove();mounted=false;document.body.classList.remove('ec-global-news-open')};
  overlay.querySelector('.ec-global-news-close').onclick=close;
  overlay.querySelector('[data-action="later"]').onclick=close;
  overlay.querySelector('[data-action="seen"]').onclick=()=>{localStorage.setItem(seenKey(announcement),'1');close();setTimeout(()=>selectAnnouncement(false),120)};
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.querySelector('[data-admin="edit"]')?.addEventListener('click',()=>openEditor(overlay));
  overlay.querySelector('[data-admin="delete"]')?.addEventListener('click',deleteAnnouncement);
}

function sectionText(){return (announcement.sections||[]).map(s=>`${s.label}\n${(s.items||[]).map(i=>`- ${i}`).join('\n')}`).join('\n\n')}
function parseSections(raw){return String(raw||'').split(/\n\s*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);return{label:lines.shift()||'BEREICH',items:lines.map(x=>x.replace(/^[-•✓]\s*/,''))}}).filter(x=>x.items.length)}

function scopeControl(){
  const current=regionFor(announcement.region_id);
  if(!isHead())return `<label>Freigabe<input value="${esc(current?`Region · ${current.name}`:'Regional')}" disabled><input type="hidden" name="scope" value="${esc(current?.slug||'')}"></label>`;
  return `<label>Freigabe<select name="scope"><option value="" ${!announcement.region_id?'selected':''}>Global · alle Regionen</option>${regions.map(r=>`<option value="${esc(r.slug)}" ${announcement.region_id===r.id?'selected':''}>Region · ${esc(r.name)}</option>`).join('')}</select></label>`;
}

function openEditor(parent){
  let editor=parent.querySelector('.ec-global-news-editor');if(editor){editor.remove();return}
  editor=document.createElement('div');editor.className='ec-global-news-editor';
  editor.innerHTML=`<div><header><strong>Community-News bearbeiten</strong><button type="button" data-close>×</button></header>${scopeControl()}<label>Titel<input name="title" value="${esc(announcement.title)}"></label><label>Untertitel<input name="subtitle" value="${esc(announcement.subtitle||'')}"></label><label>Bild-URL<input name="image" value="${esc(announcement.image_url||'/ennstal-community-news-banner.svg')}"></label><label>Bereiche <small>Überschrift, darunter je Zeile ein Punkt. Leerzeile trennt Bereiche.</small><textarea name="sections">${esc(sectionText())}</textarea></label><div class="ec-global-news-editor-actions"><button type="button" data-close>Abbrechen</button><button type="button" class="primary" data-save>Speichern</button></div><p class="ec-global-news-editor-status"></p></div>`;
  parent.appendChild(editor);editor.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>editor.remove());
  editor.querySelector('[data-save]').onclick=async()=>{
    const status=editor.querySelector('.ec-global-news-editor-status');status.textContent='Wird gespeichert …';
    const scope=editor.querySelector('[name="scope"]')?.value||null;
    const {error}=await supabase.rpc('ec_save_community_announcement',{p_id:announcement.id,p_title:editor.querySelector('[name="title"]').value,p_subtitle:editor.querySelector('[name="subtitle"]').value,p_sections:parseSections(editor.querySelector('[name="sections"]').value),p_image_url:editor.querySelector('[name="image"]').value,p_region_slug:scope,p_active:true});
    if(error){status.textContent=error.message;return}status.textContent='Gespeichert.';editor.remove();document.querySelector('.ec-global-news-overlay')?.remove();mounted=false;document.body.classList.remove('ec-global-news-open');window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));setTimeout(()=>load(true),180);
  };
}

async function deleteAnnouncement(){
  if(!confirm(`${announcement.region_id?'Regionales':'Globales'} Community-Popup wirklich löschen?`))return;
  const {error}=await supabase.rpc('ec_delete_community_announcement',{p_id:announcement.id});if(error)return alert(error.message);
  document.querySelector('.ec-global-news-overlay')?.remove();mounted=false;document.body.classList.remove('ec-global-news-open');window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));setTimeout(()=>load(false),160);
}

function boot(){
  void load(false);
  window.addEventListener('ec:open-global-community-news',()=>selectAnnouncement(true));
  window.addEventListener('ec:open-community-announcement',e=>{const id=e.detail?.id;if(id){if(mounted){document.querySelector('.ec-global-news-overlay')?.remove();mounted=false;document.body.classList.remove('ec-global-news-open')}void load(true).then(()=>selectAnnouncement(true,id))}});
  window.addEventListener('ec:community-announcements-refresh',()=>setTimeout(()=>void load(false),100));
  window.addEventListener('ec:region-change',()=>setTimeout(()=>void load(false),120));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();