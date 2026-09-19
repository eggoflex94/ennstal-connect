import { supabase } from './supabaseClient';
import './business-profile-extended.css';

const BUCKET='business-profile-documents';
const ALLOWED=new Set(['application/pdf','image/jpeg','image/png','image/webp']);
const MAX_BYTES=10*1024*1024;
let timer=null;

const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function toast(text){
  document.querySelector('.ec-business-extended-toast')?.remove();
  const node=document.createElement('div');
  node.className='ec-business-extended-toast';
  node.textContent=text;
  document.body.append(node);
  setTimeout(()=>node.remove(),4000);
}

async function viewer(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return null;
  const {data:profile}=await supabase.from('profiles').select('id,account_badge,company_description,company_website,company_opening_hours,company_category,company_address,company_phone,company_email').eq('id',user.id).maybeSingle();
  return profile?{user,profile}:null;
}

async function openDocument(path){
  if(!path)return;
  const {data,error}=await supabase.storage.from(BUCKET).download(path);
  if(error||!data)return toast(error?.message||'Dokument konnte nicht geöffnet werden.');
  const url=URL.createObjectURL(data);
  window.open(url,'_blank','noopener,noreferrer');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

function documentList(documents,mine){
  if(!(documents||[]).length)return '<p class="ec-business-doc-empty">Noch keine Speisekarten oder Dokumente vorhanden.</p>';
  return (documents||[]).map((doc)=>`<article class="ec-business-doc-row"><div><span>${doc.document_type==='MENU'?'SPEISEKARTE':doc.document_type==='PRICE_LIST'?'PREISLISTE':'DOKUMENT'}</span><strong>${esc(doc.title)}</strong>${!mine?`<small class="ec-business-doc-audience">${doc.visibility==='PUBLIC'?'Öffentlich':'Nur Mitglieder'}</small>`:''}</div><div><button type="button" data-business-doc-open="${esc(doc.file_path)}">Öffnen</button>${mine?`<button type="button" data-business-doc-delete="${esc(doc.id)}" data-business-doc-path="${esc(doc.file_path)}">Löschen</button>`:''}</div></article>`).join('');
}

function bindDocumentButtons(root,ownerId,mine){
  root.querySelectorAll('[data-business-doc-open]').forEach((button)=>button.onclick=()=>void openDocument(button.dataset.businessDocOpen));
  if(!mine)return;
  root.querySelectorAll('[data-business-doc-delete]').forEach((button)=>button.onclick=async()=>{
    if(!confirm('Dieses Dokument wirklich löschen?'))return;
    const {error}=await supabase.from('business_profile_documents').delete().eq('id',button.dataset.businessDocDelete).eq('owner_id',ownerId);
    if(error)return toast(error.message);
    const path=button.dataset.businessDocPath;
    if(path)await supabase.storage.from(BUCKET).remove([path]);
    button.closest('article')?.remove();
    toast('Dokument gelöscht.');
  });
}

async function renderOwn(){
  const page=document.querySelector('.profile-page-layout');
  if(!page||page.querySelector('.ec-business-extended-own'))return;
  const ctx=await viewer();
  if(!ctx||String(ctx.profile.account_badge||'').toUpperCase()!=='BUSINESS')return;

  const {data:documents}=await supabase.from('business_profile_documents').select('id,title,document_type,file_path,mime_type,created_at').eq('owner_id',ctx.user.id).order('created_at',{ascending:false});
  const panel=document.createElement('section');
  panel.className='panel ec-business-extended-own';
  panel.innerHTML=`<span class="eyebrow">UNTERNEHMENSPROFIL · ERWEITERT</span><h2>Kontaktdaten, Speisekarten & Dokumente</h2><p>Ergänze dein Unternehmen um weitere Informationen und lade Speisekarten, Preislisten oder andere Dokumente hoch.</p>
    <form class="ec-business-extra-form">
      <label>Branche / Kategorie<input name="category" maxlength="100" placeholder="z. B. Gastronomie, Handwerk" value="${esc(ctx.profile.company_category||'')}"></label>
      <label>Adresse<input name="address" maxlength="220" placeholder="Straße, PLZ, Ort" value="${esc(ctx.profile.company_address||'')}"></label>
      <label>Telefon<input name="phone" maxlength="80" placeholder="+43 …" value="${esc(ctx.profile.company_phone||'')}"></label>
      <label>E-Mail<input name="email" type="email" maxlength="180" placeholder="kontakt@firma.at" value="${esc(ctx.profile.company_email||'')}"></label>
      <button class="primary-button">Unternehmensdaten speichern</button>
    </form>
    <hr>
    <form class="ec-business-document-upload">
      <h3>Speisekarte oder Dokument hochladen</h3>
      <select name="document_type"><option value="MENU">Speisekarte</option><option value="PRICE_LIST">Preisliste</option><option value="DOCUMENT">Dokument</option></select>
      <input name="title" maxlength="120" placeholder="Titel, z. B. Abendkarte Herbst 2026" required>
      <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required>
      <small>PDF, JPG, PNG oder WebP · maximal 10 MB</small>
      <button class="primary-button">Hochladen</button>
    </form>
    <div class="ec-business-doc-list"><h3>Deine Dateien</h3>${documentList(documents||[],true)}</div>`;

  const anchor=page.querySelector('.ec-own-business-tools')||page.querySelector('.my-area-layout')||page;
  anchor.insertAdjacentElement('afterend',panel);

  panel.querySelector('.ec-business-extra-form').onsubmit=async(event)=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const {error}=await supabase.rpc('update_my_business_profile_extended',{
      p_description:ctx.profile.company_description||'',
      p_website:ctx.profile.company_website||'',
      p_opening_hours:ctx.profile.company_opening_hours||'',
      p_category:String(data.get('category')||''),
      p_address:String(data.get('address')||''),
      p_phone:String(data.get('phone')||''),
      p_email:String(data.get('email')||'')
    });
    if(error)return toast(error.message);
    toast('Unternehmensdaten gespeichert.');
  };

  panel.querySelector('.ec-business-document-upload').onsubmit=async(event)=>{
    event.preventDefault();
    const form=event.currentTarget;
    const file=form.elements.file?.files?.[0];
    const title=String(form.elements.title?.value||'').trim();
    const documentType=String(form.elements.document_type?.value||'DOCUMENT');
    if(!file||!title)return;
    if(!ALLOWED.has(file.type)||file.size>MAX_BYTES)return toast('Erlaubt sind PDF, JPG, PNG oder WebP bis 10 MB.');
    const ext=file.name.includes('.')?file.name.split('.').pop().toLowerCase():(file.type==='application/pdf'?'pdf':'bin');
    const path=`${ctx.user.id}/${crypto.randomUUID()}.${ext}`;
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true;
    try{
      const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:insertError}=await supabase.from('business_profile_documents').insert({owner_id:ctx.user.id,title,document_type:documentType,file_path:path,mime_type:file.type});
      if(insertError){await supabase.storage.from(BUCKET).remove([path]);throw insertError;}
      panel.remove();
      toast('Dokument hochgeladen.');
      schedule(20);
    }catch(error){
      toast(error?.message||'Dokument konnte nicht hochgeladen werden.');
    }finally{
      submit.disabled=false;
    }
  };

  bindDocumentButtons(panel,ctx.user.id,true);
}

async function renderPublic(){
  const page=document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if(!page||page.querySelector('.ec-business-extended-public'))return;
  const id=page.dataset.profileId;
  if(!id)return;
  const [{data:member},{data:documents}]=await Promise.all([
    supabase.from('profiles').select('id,account_badge,company_category,company_address,company_phone,company_email').eq('id',id).maybeSingle(),
    supabase.from('business_profile_documents').select('id,title,document_type,file_path,mime_type,visibility,created_at').eq('owner_id',id).order('created_at',{ascending:false})
  ]);
  if(!member||String(member.account_badge||'').toUpperCase()!=='BUSINESS')return;
  const hasInfo=member.company_category||member.company_address||member.company_phone||member.company_email||(documents||[]).length;
  if(!hasInfo)return;

  const panel=document.createElement('section');
  panel.className='panel ec-business-extended-public';
  const meta=[
    member.company_category?`<span><b>Branche</b>${esc(member.company_category)}</span>`:'',
    member.company_address?`<span><b>Adresse</b>${esc(member.company_address)}</span>`:'',
    member.company_phone?`<span><b>Telefon</b>${esc(member.company_phone)}</span>`:'',
    member.company_email?`<span><b>E-Mail</b><a href="mailto:${esc(member.company_email)}">${esc(member.company_email)}</a></span>`:''
  ].filter(Boolean).join('');
  panel.innerHTML=`<span class="eyebrow">UNTERNEHMENSINFO</span><h2>Weitere Informationen</h2><div class="ec-business-extra-meta">${meta}</div><div class="ec-business-doc-list"><h3>Speisekarten & Dokumente</h3>${documentList(documents||[],false)}</div>`;
  const existing=page.querySelector('.ec-business-profile-panel');
  const hero=page.querySelector('.member-profile-hero');
  (existing||hero||page).insertAdjacentElement(existing||hero?'afterend':'afterbegin',panel);
  bindDocumentButtons(panel,id,false);
}

async function render(){
  if(!supabase)return;
  await renderPublic();
}

function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void render(),delay)}
window.addEventListener('ec:navigate',()=>schedule(100));
window.addEventListener('ec:open-profile',()=>schedule(120));
window.addEventListener('ec:business-account-changed',()=>schedule(60));
window.addEventListener('focus',()=>schedule(80));
const observer=new MutationObserver(()=>schedule(120));
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});else schedule(20);

export {};
