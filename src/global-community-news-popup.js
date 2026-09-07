import { supabase } from './supabaseClient';

let announcement=null;
let viewer=null;
let mounted=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isHead=()=>String(viewer?.role||'').toUpperCase()==='HEAD_ADMIN';
const seenKey=a=>`ec-global-news-seen:${a.id}:${a.version}`;

async function load(){
  if(!supabase)return;
  const [{data:{user}},{data:rows}]=await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('ec_get_global_community_announcement')
  ]);
  if(!user||!rows?.length)return;
  const {data:profile}=await supabase.from('profiles').select('id,role').eq('id',user.id).maybeSingle();
  viewer=profile||null;
  announcement=rows[0];
  maybeOpen();
}

function maybeOpen(force=false){
  if(!announcement||mounted)return;
  if(!force&&!isHead()&&localStorage.getItem(seenKey(announcement))==='1')return;
  render();
}

function iconFor(label=''){
  const l=label.toUpperCase();
  if(l.includes('ROLLEN'))return'👥';
  if(l.includes('HILFE'))return'?';
  if(l.includes('BELOHN'))return'🎁';
  return'◉';
}

function render(){
  mounted=true;
  const overlay=document.createElement('div');
  overlay.className='ec-global-news-overlay';
  overlay.innerHTML=`<section class="ec-global-news-modal" role="dialog" aria-modal="true" aria-labelledby="ec-global-news-title">
    <button class="ec-global-news-close" type="button" aria-label="Schließen">×</button>
    <div class="ec-global-news-hero" style="background-image:url('${esc(announcement.image_url||'/ennstal-community-news-banner.svg')}')"></div>
    <div class="ec-global-news-body">
      <div class="ec-global-news-topline"><span>ENNSTAL CONNECT COMMUNITY NEWS</span>${isHead()?`<div class="ec-global-news-admin"><small>🔒 Nur für Head-Admin</small><div><button type="button" data-admin="edit">✎ Bearbeiten</button><button type="button" data-admin="delete">🗑 Löschen</button></div></div>`:''}</div>
      <h1 id="ec-global-news-title">${esc(announcement.title)}</h1>
      <p class="ec-global-news-subtitle">${esc(announcement.subtitle||'')}</p>
      <div class="ec-global-news-sections">${(announcement.sections||[]).map(section=>`<article><div class="ec-global-news-section-icon">${esc(iconFor(section.label))}</div><div><h2>${esc(section.label||'')}</h2><ul>${(section.items||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div></article>`).join('')}</div>
      <footer><div class="ec-global-news-thanks"><span>♥</span><p><strong>Danke, dass du Teil von Ennstal Connect bist.</strong><small>Regional. Echt. Gemeinsam.</small></p></div><div class="ec-global-news-actions"><button type="button" data-action="later">Später</button><button type="button" class="primary" data-action="seen">✓ Verstanden</button></div></footer>
    </div>
  </section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('ec-global-news-open');
  const close=()=>{overlay.remove();mounted=false;document.body.classList.remove('ec-global-news-open')};
  overlay.querySelector('.ec-global-news-close').onclick=close;
  overlay.querySelector('[data-action="later"]').onclick=close;
  overlay.querySelector('[data-action="seen"]').onclick=()=>{localStorage.setItem(seenKey(announcement),'1');close()};
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.querySelector('[data-admin="edit"]')?.addEventListener('click',()=>openEditor(overlay));
  overlay.querySelector('[data-admin="delete"]')?.addEventListener('click',deleteAnnouncement);
}

function sectionText(){return (announcement.sections||[]).map(s=>`${s.label}\n${(s.items||[]).map(i=>`- ${i}`).join('\n')}`).join('\n\n')}
function parseSections(raw){return String(raw||'').split(/\n\s*\n/).map(block=>{const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);return{label:lines.shift()||'BEREICH',items:lines.map(x=>x.replace(/^[-•✓]\s*/,''))}}).filter(x=>x.items.length)}

function openEditor(parent){
  let editor=parent.querySelector('.ec-global-news-editor');
  if(editor){editor.remove();return}
  editor=document.createElement('div');editor.className='ec-global-news-editor';
  editor.innerHTML=`<div><header><strong>Community-News bearbeiten</strong><button type="button" data-close>×</button></header><label>Titel<input name="title" value="${esc(announcement.title)}"></label><label>Untertitel<input name="subtitle" value="${esc(announcement.subtitle||'')}"></label><label>Bild-URL<input name="image" value="${esc(announcement.image_url||'/ennstal-community-news-banner.svg')}"></label><label>Bereiche <small>Überschrift, darunter je Zeile ein Punkt. Leerzeile trennt Bereiche.</small><textarea name="sections">${esc(sectionText())}</textarea></label><div class="ec-global-news-editor-actions"><button type="button" data-close>Abbrechen</button><button type="button" class="primary" data-save>Speichern</button></div><p class="ec-global-news-editor-status"></p></div>`;
  parent.appendChild(editor);
  editor.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>editor.remove());
  editor.querySelector('[data-save]').onclick=async()=>{
    const status=editor.querySelector('.ec-global-news-editor-status');status.textContent='Wird gespeichert …';
    const {data,error}=await supabase.rpc('ec_save_global_community_announcement',{p_id:announcement.id,p_title:editor.querySelector('[name="title"]').value,p_subtitle:editor.querySelector('[name="subtitle"]').value,p_sections:parseSections(editor.querySelector('[name="sections"]').value),p_image_url:editor.querySelector('[name="image"]').value,p_active:true});
    if(error){status.textContent=error.message;return}
    status.textContent='Gespeichert.';announcement={...announcement,id:data,title:editor.querySelector('[name="title"]').value,subtitle:editor.querySelector('[name="subtitle"]').value,image_url:editor.querySelector('[name="image"]').value,sections:parseSections(editor.querySelector('[name="sections"]').value),version:(announcement.version||1)+1};
    setTimeout(()=>location.reload(),300);
  };
}

async function deleteAnnouncement(){
  if(!confirm('Globale Community-News wirklich löschen?'))return;
  const {error}=await supabase.rpc('ec_delete_global_community_announcement',{p_id:announcement.id});
  if(error)return alert(error.message);
  document.querySelector('.ec-global-news-overlay')?.remove();mounted=false;document.body.classList.remove('ec-global-news-open');
}

function boot(){void load();window.addEventListener('ec:open-global-community-news',()=>maybeOpen(true));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
