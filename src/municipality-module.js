import { supabase } from './supabaseClient';

let currentContext=null;
let pageRoot=null;
let loading=false;

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeRegionSlug=()=>document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region')||'ennstal';
const categoryLabel=(v)=>({
  INFO:'Information',TRAFFIC:'Verkehr',WATER:'Wasser',WASTE:'Abfall',EVENT:'Veranstaltung',EMERGENCY:'Dringend',OTHER:'Sonstiges',
  ROAD:'Straße',LIGHTING:'Beleuchtung',PLAYGROUND:'Spielplatz',GREENSPACE:'Grünraum',PUBLIC_SPACE:'Öffentlicher Raum'
}[v]||String(v||'').replaceAll('_',' '));
const requestStatusLabel=(v)=>({NEW:'Neu',REVIEWING:'In Prüfung',IN_PROGRESS:'In Bearbeitung',DONE:'Erledigt',REJECTED:'Nicht übernommen'}[v]||v);
const date=(v)=>v?new Date(v).toLocaleString('de-AT',{dateStyle:'medium',timeStyle:'short'}):'';

async function loadContext(){
  if(!supabase)return null;
  const {data,error}=await supabase.rpc('ec_municipality_context',{p_region_slug:activeRegionSlug()});
  if(error)throw error;
  currentContext=data||null;
  return currentContext;
}

function removePage(){
  document.querySelector('.ec-municipality-page')?.remove();
  document.body.classList.remove('ec-municipality-open');
  pageRoot=null;
}

function ensureNavButton(){
  const nav=document.querySelector('.ec-top-nav');
  if(!nav)return false;
  let button=nav.querySelector('[data-ec-page="municipality"]');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.dataset.ecPage='municipality';
    button.className='ec-municipality-nav';
    button.textContent='Gemeinde';
    button.onclick=()=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'municipality',source:'municipality-module'}}));
    nav.appendChild(button);
  }
  return true;
}

function noticeCard(item,canManage){
  return `<article class="ec-municipality-notice" data-priority="${esc(item.priority)}" data-id="${esc(item.id)}">
    <div class="ec-municipality-notice-meta"><span>${esc(categoryLabel(item.category))}</span><time>${esc(date(item.published_at||item.created_at))}</time></div>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.body)}</p>
    ${item.pinned?'<strong class="ec-municipality-pin">Angeheftet</strong>':''}
    ${canManage?`<div class="ec-municipality-actions"><button type="button" data-edit-notice>Bearbeiten</button><button type="button" class="danger" data-delete-notice>Löschen</button></div>`:''}
  </article>`;
}

function requestCard(item,staff=false){
  return `<article class="ec-citizen-request" data-id="${esc(item.id)}">
    <div class="ec-citizen-request-meta"><span>${esc(categoryLabel(item.category))}</span><strong data-status="${esc(item.status)}">${esc(requestStatusLabel(item.status))}</strong></div>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.description)}</p>
    ${item.location_text?`<small>Ort: ${esc(item.location_text)}</small>`:''}
    ${staff&&item.reporter_nickname?`<small>Gemeldet von: ${esc(item.reporter_nickname)}</small>`:''}
    ${item.municipality_note?`<div class="ec-municipality-response"><b>Rückmeldung der Gemeinde</b><p>${esc(item.municipality_note)}</p></div>`:''}
    <time>${esc(date(item.updated_at||item.created_at))}</time>
    ${staff?`<div class="ec-municipality-request-controls"><select data-request-status>
      ${['NEW','REVIEWING','IN_PROGRESS','DONE','REJECTED'].map(s=>`<option value="${s}" ${s===item.status?'selected':''}>${esc(requestStatusLabel(s))}</option>`).join('')}
    </select><input type="text" data-request-note maxlength="3000" placeholder="Rückmeldung an Bürger" value="${esc(item.municipality_note||'')}"><button type="button" data-save-request>Speichern</button></div>`:''}
  </article>`;
}

function profileBlock(ctx){
  const m=ctx.municipality||{},r=ctx.region||{};
  return `<section class="ec-municipality-hero">
    <div class="ec-municipality-logo">${m.logo_url?`<img src="${esc(m.logo_url)}" alt="">`:'<span>🏛</span>'}</div>
    <div><span class="eyebrow">${m.verified?'VERIFIZIERTE GEMEINDE':'REGIONALER GEMEINDEBEREICH'}</span>
      <h1>${esc(m.official_name||r.name||'Gemeinde')}</h1>
      <p>${esc(m.short_description||'Offizielle Informationen und Anliegen aus deiner Region.')}</p>
      <div class="ec-municipality-contact">
        ${m.website?`<a href="${esc(m.website)}" target="_blank" rel="noopener noreferrer">Website</a>`:''}
        ${m.contact_email?`<a href="mailto:${esc(m.contact_email)}">${esc(m.contact_email)}</a>`:''}
        ${m.phone?`<span>${esc(m.phone)}</span>`:''}
        ${m.address?`<span>${esc(m.address)}</span>`:''}
      </div>
    </div>
  </section>`;
}

function pageMarkup(ctx){
  const notices=(ctx.notices||[]).map(n=>noticeCard(n,ctx.can_manage)).join('')||'<p class="ec-municipality-empty">Noch keine offiziellen Hinweise veröffentlicht.</p>';
  const requests=(ctx.my_requests||[]).map(r=>requestCard(r,false)).join('')||'<p class="ec-municipality-empty">Du hast noch keine Anliegen gemeldet.</p>';
  const counts=ctx.counts||{};
  return `<section class="ec-municipality-page">
    ${profileBlock(ctx)}
    <div class="ec-municipality-grid">
      <section class="ec-municipality-panel ec-municipality-official"><header><div><span class="eyebrow">OFFIZIELL</span><h2>Gemeinde-Informationen</h2></div>${ctx.can_manage?'<button type="button" class="primary" data-new-notice>+ Hinweis</button>':''}</header><div class="ec-municipality-notices">${notices}</div></section>
      <section class="ec-municipality-panel ec-citizen-center"><header><div><span class="eyebrow">BÜRGERANLIEGEN</span><h2>Ein Anliegen melden</h2></div></header>
        <form class="ec-citizen-form">
          <label>Kategorie<select name="category"><option value="ROAD">Straße</option><option value="LIGHTING">Beleuchtung</option><option value="WASTE">Abfall</option><option value="PLAYGROUND">Spielplatz</option><option value="GREENSPACE">Grünraum</option><option value="TRAFFIC">Verkehr</option><option value="PUBLIC_SPACE">Öffentlicher Raum</option><option value="OTHER">Sonstiges</option></select></label>
          <label>Titel<input name="title" minlength="3" maxlength="180" required placeholder="Worum geht es?"></label>
          <label>Beschreibung<textarea name="description" minlength="5" maxlength="4000" required placeholder="Bitte kurz und sachlich beschreiben."></textarea></label>
          <label>Ort / Bereich<input name="location" maxlength="500" placeholder="z. B. Hauptplatz, Bushaltestelle, Straße"></label>
          <button type="submit" class="primary">Anliegen senden</button><p class="ec-municipality-form-status"></p>
        </form>
        <div class="ec-municipality-request-summary"><span>Offen <b>${Number(counts.open_total||0)}</b></span><span>Neu <b>${Number(counts.new_total||0)}</b></span><span>In Bearbeitung <b>${Number(counts.in_progress_total||0)}</b></span><span>Erledigt <b>${Number(counts.done_total||0)}</b></span></div>
        <div class="ec-municipality-my-requests"><h3>Meine Anliegen</h3>${requests}</div>
      </section>
    </div>
    ${ctx.can_manage?'<section class="ec-municipality-panel ec-municipality-admin"><header><div><span class="eyebrow">GEMEINDE-VERWALTUNG</span><h2>Anliegen bearbeiten</h2></div><button type="button" data-refresh-staff>Aktualisieren</button></header><div class="ec-municipality-staff-requests"><p class="ec-municipality-empty">Wird geladen …</p></div></section>':''}
  </section>`;
}

async function render(){
  if(loading)return;
  loading=true;
  try{
    const ctx=await loadContext();
    const host=document.querySelector('.content-root')||document.querySelector('main')||document.body;
    removePage();
    const wrap=document.createElement('div');
    wrap.innerHTML=pageMarkup(ctx);
    pageRoot=wrap.firstElementChild;
    host.appendChild(pageRoot);
    document.body.classList.add('ec-municipality-open');
    wirePage();
    if(ctx.can_manage)void loadStaffRequests();
  }catch(error){
    const host=document.querySelector('.content-root')||document.querySelector('main')||document.body;
    removePage();
    const p=document.createElement('section');p.className='ec-municipality-page ec-municipality-error';p.innerHTML=`<h2>Gemeindebereich nicht verfügbar</h2><p>${esc(error.message||error)}</p>`;host.appendChild(p);pageRoot=p;
  }finally{loading=false}
}

async function submitRequest(form){
  const status=form.querySelector('.ec-municipality-form-status');
  const submit=form.querySelector('[type="submit"]');
  submit.disabled=true;status.textContent='Wird gesendet …';
  try{
    const {error}=await supabase.rpc('ec_submit_citizen_request',{
      p_region_slug:activeRegionSlug(),p_category:form.category.value,p_title:form.title.value,
      p_description:form.description.value,p_location_text:form.location.value||null
    });
    if(error)throw error;
    form.reset();status.textContent='Anliegen wurde übermittelt.';await render();
  }catch(error){status.textContent=error.message||'Anliegen konnte nicht gesendet werden.'}
  finally{submit.disabled=false}
}

function openNoticeEditor(item=null){
  document.querySelector('.ec-municipality-editor')?.remove();
  const overlay=document.createElement('div');overlay.className='ec-municipality-editor';
  overlay.innerHTML=`<form class="ec-municipality-editor-box"><header><div><span>OFFIZIELLER HINWEIS</span><h2>${item?'Hinweis bearbeiten':'Hinweis erstellen'}</h2></div><button type="button" data-close>×</button></header>
    <label>Titel<input name="title" required minlength="3" maxlength="180" value="${esc(item?.title||'')}"></label>
    <label>Kategorie<select name="category">${['INFO','TRAFFIC','WATER','WASTE','EVENT','EMERGENCY','OTHER'].map(v=>`<option value="${v}" ${v===item?.category?'selected':''}>${esc(categoryLabel(v))}</option>`).join('')}</select></label>
    <label>Priorität<select name="priority">${['NORMAL','IMPORTANT','URGENT'].map(v=>`<option value="${v}" ${v===item?.priority?'selected':''}>${v==='NORMAL'?'Normal':v==='IMPORTANT'?'Wichtig':'Dringend'}</option>`).join('')}</select></label>
    <label>Text<textarea name="body" required minlength="3" maxlength="5000">${esc(item?.body||'')}</textarea></label>
    <label class="check"><input type="checkbox" name="pinned" ${item?.pinned?'checked':''}> Anheften</label>
    <label class="check"><input type="checkbox" name="published" ${item?.published===false?'':'checked'}> Veröffentlichen</label>
    <div class="ec-municipality-editor-actions"><button type="button" data-close>Abbrechen</button><button type="submit" class="primary">Speichern</button></div><p class="ec-municipality-form-status"></p></form>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);overlay.onclick=e=>{if(e.target===overlay)close()};
  const form=overlay.querySelector('form');
  form.onsubmit=async e=>{e.preventDefault();const status=form.querySelector('.ec-municipality-form-status'),btn=form.querySelector('[type="submit"]');btn.disabled=true;status.textContent='Wird gespeichert …';try{
    const {error}=await supabase.rpc('ec_municipality_save_notice',{
      p_region_slug:activeRegionSlug(),p_id:item?.id||null,p_title:form.title.value,p_body:form.body.value,
      p_category:form.category.value,p_priority:form.priority.value,p_pinned:form.pinned.checked,p_published:form.published.checked
    });
    if(error)throw error;close();await render();
  }catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.'}finally{btn.disabled=false}};
}

async function deleteNotice(id){
  if(!confirm('Diesen offiziellen Hinweis wirklich löschen?'))return;
  const {error}=await supabase.rpc('ec_municipality_delete_notice',{p_id:id});
  if(error)return alert(error.message);
  await render();
}

async function loadStaffRequests(){
  const host=pageRoot?.querySelector('.ec-municipality-staff-requests');if(!host)return;
  host.innerHTML='<p class="ec-municipality-empty">Wird geladen …</p>';
  const {data,error}=await supabase.rpc('ec_municipality_staff_requests',{p_region_slug:activeRegionSlug(),p_status:'ALL'});
  if(error){host.innerHTML=`<p class="ec-municipality-empty">${esc(error.message)}</p>`;return}
  host.innerHTML=(data||[]).map(r=>requestCard(r,true)).join('')||'<p class="ec-municipality-empty">Keine Bürgeranliegen vorhanden.</p>';
  host.querySelectorAll('[data-save-request]').forEach(button=>button.onclick=()=>void saveStaffRequest(button.closest('.ec-citizen-request')));
}

async function saveStaffRequest(card){
  const button=card.querySelector('[data-save-request]');button.disabled=true;
  const {error}=await supabase.rpc('ec_municipality_update_request',{
    p_id:card.dataset.id,p_status:card.querySelector('[data-request-status]').value,p_note:card.querySelector('[data-request-note]').value||null
  });
  button.disabled=false;
  if(error)return alert(error.message);
  await loadStaffRequests();
}

function wirePage(){
  const form=pageRoot?.querySelector('.ec-citizen-form');if(form)form.onsubmit=e=>{e.preventDefault();void submitRequest(form)};
  pageRoot?.querySelector('[data-new-notice]')?.addEventListener('click',()=>openNoticeEditor());
  pageRoot?.querySelectorAll('[data-edit-notice]').forEach(button=>button.onclick=()=>{
    const id=button.closest('.ec-municipality-notice').dataset.id;
    openNoticeEditor((currentContext?.notices||[]).find(x=>x.id===id)||null);
  });
  pageRoot?.querySelectorAll('[data-delete-notice]').forEach(button=>button.onclick=()=>void deleteNotice(button.closest('.ec-municipality-notice').dataset.id));
  pageRoot?.querySelector('[data-refresh-staff]')?.addEventListener('click',()=>void loadStaffRequests());
}

function boot(){
  ensureNavButton();
  const observer=new MutationObserver(()=>ensureNavButton());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:navigate',event=>{
    if(event?.detail?.page==='municipality')void render();
    else if(document.body.classList.contains('ec-municipality-open'))removePage();
  });
  window.addEventListener('ec:region-change',()=>{
    if(document.body.classList.contains('ec-municipality-open'))void render();
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
