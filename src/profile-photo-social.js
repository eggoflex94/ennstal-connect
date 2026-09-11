import { supabase } from './supabaseClient';

let observer;
let syncing=false;

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function getUser(){ const {data}=await supabase.auth.getUser(); return data?.user||null; }
async function loadMeta(photoId){
  const [likes,comments]=await Promise.all([
    supabase.from('member_photo_likes').select('user_id').eq('photo_id',photoId),
    supabase.from('member_photo_comments').select('id,author_id,content,created_at,profiles:author_id(nickname,avatar_url)').eq('photo_id',photoId).order('created_at',{ascending:true})
  ]);
  return {likes:likes.data||[],comments:comments.data||[]};
}

async function toggleLike(photoId,userId,button,countEl){
  const {data:existing}=await supabase.from('member_photo_likes').select('photo_id').eq('photo_id',photoId).eq('user_id',userId).maybeSingle();
  if(existing){ await supabase.from('member_photo_likes').delete().eq('photo_id',photoId).eq('user_id',userId); button.classList.remove('is-liked'); }
  else { await supabase.from('member_photo_likes').insert({photo_id:photoId,user_id:userId}); button.classList.add('is-liked'); }
  const {count}=await supabase.from('member_photo_likes').select('*',{count:'exact',head:true}).eq('photo_id',photoId);
  countEl.textContent=String(count||0);
}

async function addComment(photoId,userId,input,list){
  const value=input.value.trim(); if(!value)return;
  const {error}=await supabase.from('member_photo_comments').insert({photo_id:photoId,author_id:userId,content:value});
  if(error)return alert(error.message);
  input.value='';
  await renderComments(photoId,list);
}

async function renderComments(photoId,list){
  const {comments}=await loadMeta(photoId); list.innerHTML='';
  comments.forEach(c=>{
    const p=c.profiles||{}; const row=document.createElement('div'); row.className='ec-photo-comment';
    row.innerHTML=`<img src="${esc(p.avatar_url||'/community-default-avatar.png')}" alt=""><div><strong>${esc(p.nickname||'Mitglied')}</strong><p>${esc(c.content)}</p><small>${esc(new Date(c.created_at).toLocaleString('de-AT'))}</small></div>`;
    list.append(row);
  });
  if(!comments.length)list.innerHTML='<p class="ec-photo-empty">Noch keine Kommentare.</p>';
}

async function reportPhoto(photoId){
  const reason=prompt('Warum möchtest du dieses Foto melden?');
  if(!reason?.trim())return;
  const {error}=await supabase.rpc('report_member_photo',{p_photo_id:photoId,p_reason:reason.trim()});
  alert(error?error.message:'Foto wurde gemeldet.');
}

async function openLightbox(photo,ownerId){
  const user=await getUser(); if(!user)return;
  document.querySelector('.ec-photo-social-lightbox')?.remove();
  const meta=await loadMeta(photo.id);
  const liked=meta.likes.some(x=>x.user_id===user.id);
  const box=document.createElement('div'); box.className='ec-photo-social-lightbox';
  box.innerHTML=`<div class="ec-photo-social-dialog" role="dialog" aria-modal="true">
    <button type="button" class="ec-photo-social-close" aria-label="Schließen">×</button>
    <div class="ec-photo-social-image"><img src="${esc(photo.image_url)}" alt="${esc(photo.caption||'Profilfoto')}">${photo.caption?`<p>${esc(photo.caption)}</p>`:''}</div>
    <aside class="ec-photo-social-side">
      <div class="ec-photo-social-actions"><button type="button" class="ec-photo-like ${liked?'is-liked':''}">♥ <span>${meta.likes.length}</span></button>${ownerId!==user.id?'<button type="button" class="ec-photo-report">Melden</button>':''}</div>
      <div class="ec-photo-comments-list"></div>
      <form class="ec-photo-comment-form"><input type="text" maxlength="500" placeholder="Kommentar schreiben …"><button type="submit">Senden</button></form>
    </aside>
  </div>`;
  const list=box.querySelector('.ec-photo-comments-list'); await renderComments(photo.id,list);
  box.querySelector('.ec-photo-social-close').onclick=()=>box.remove(); box.onclick=e=>{if(e.target===box)box.remove();};
  box.querySelector('.ec-photo-like').onclick=e=>void toggleLike(photo.id,user.id,e.currentTarget,e.currentTarget.querySelector('span'));
  box.querySelector('.ec-photo-report')?.addEventListener('click',()=>void reportPhoto(photo.id));
  box.querySelector('.ec-photo-comment-form').onsubmit=e=>{e.preventDefault();void addComment(photo.id,user.id,e.currentTarget.querySelector('input'),list);};
  document.body.append(box);
}

async function decoratePublicFolder(folder){
  if(folder.dataset.ecPhotoSocial==='1')return; folder.dataset.ecPhotoSocial='1';
  const page=folder.closest('.member-profile-page'); const ownerId=page?.dataset?.profileId||'';
  const figs=[...folder.querySelectorAll('figure')];
  if(!figs.length)return;
  const {data:photos}=await supabase.from('member_photos').select('id,owner_id,image_url,caption,visibility').eq('owner_id',ownerId).order('created_at',{ascending:false});
  figs.forEach(fig=>{
    const img=fig.querySelector('img'); if(!img)return;
    const photo=(photos||[]).find(p=>p.image_url===img.src||p.image_url===img.getAttribute('src')); if(!photo)return;
    fig.dataset.photoId=photo.id;
    const open=fig.querySelector('.public-photo-enlarge')||img;
    open.style.cursor='zoom-in';
    open.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void openLightbox(photo,ownerId);},true);
    if(!fig.querySelector('.ec-photo-inline-actions')){
      const actions=document.createElement('div'); actions.className='ec-photo-inline-actions';
      actions.innerHTML='<button type="button">Vergrößern · Liken · Kommentieren</button>';
      actions.querySelector('button').onclick=()=>void openLightbox(photo,ownerId);
      fig.append(actions);
    }
  });
}

async function decorateOwnAlbum(gallery){
  if(gallery.dataset.ecPhotoSocial==='1')return; gallery.dataset.ecPhotoSocial='1';
  const figs=[...gallery.querySelectorAll('.profile-photo-grid figure')];
  const user=await getUser(); if(!user)return;
  const {data:photos}=await supabase.from('member_photos').select('id,owner_id,image_url,caption,visibility').eq('owner_id',user.id).order('created_at',{ascending:false});
  figs.forEach(fig=>{
    const img=fig.querySelector('img'); if(!img)return;
    const photo=(photos||[]).find(p=>p.image_url===img.src||p.image_url===img.getAttribute('src')); if(!photo)return;
    img.style.cursor='zoom-in';
    img.onclick=()=>void openLightbox(photo,user.id);
  });
}

function sync(){ if(syncing)return; syncing=true; Promise.all([
  ...[...document.querySelectorAll('.public-photo-folder')].map(decoratePublicFolder),
  ...[...document.querySelectorAll('.profile-gallery')].map(decorateOwnAlbum)
]).finally(()=>{syncing=false;}); }

observer=new MutationObserver(()=>setTimeout(sync,50)); observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
window.addEventListener('ec:navigate',()=>setTimeout(sync,80));

export {};
