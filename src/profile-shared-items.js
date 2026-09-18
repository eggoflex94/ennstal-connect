import { supabase } from './supabaseClient';
import './profile-shared-items.css';

const BUCKET='profile-layout-media';
let timer=null;
let objectUrls=[];

const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=(value)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)};

function clearUrls(){objectUrls.forEach((url)=>URL.revokeObjectURL(url));objectUrls=[];}

async function viewerId(){
  const {data:{user}}=await supabase.auth.getUser();
  return user?.id||'';
}

async function imageUrl(path){
  if(!path)return '';
  if(/^https?:\/\//i.test(path))return path;
  const {data,error}=await supabase.storage.from(BUCKET).download(path);
  if(error||!data)return '';
  const url=URL.createObjectURL(data);
  objectUrls.push(url);
  return url;
}

function openImage(url,caption){
  if(!url)return;
  const box=document.createElement('div');
  box.className='ec-shared-lightbox';
  box.innerHTML=`<button type="button" aria-label="Schließen">×</button><img src="${esc(url)}" alt="${esc(caption||'Geteiltes Foto')}">${caption?`<p>${esc(caption)}</p>`:''}`;
  const close=()=>box.remove();
  box.onclick=(event)=>{if(event.target===box)close()};
  box.querySelector('button').onclick=close;
  document.body.append(box);
}

async function resolveTarget(){
  const memberPage=document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if(memberPage)return {page:memberPage,profileId:memberPage.dataset.profileId||''};
  const ownPage=document.querySelector('.profile-page-layout');
  if(ownPage)return {page:ownPage,profileId:await viewerId()};
  return null;
}

async function render(){
  if(!supabase)return;
  const target=await resolveTarget();
  document.querySelectorAll('.ec-profile-shared-items').forEach((node)=>node.remove());
  clearUrls();
  if(!target?.page||!target.profileId)return;

  const me=await viewerId();
  const mine=me===target.profileId;
  const {data:shares,error}=await supabase.from('profile_shared_items').select('id,profile_id,item_type,item_id,created_at').eq('profile_id',target.profileId).order('created_at',{ascending:false}).limit(40);
  if(error||!(shares||[]).length)return;

  const photoIds=(shares||[]).filter((x)=>x.item_type==='PHOTO').map((x)=>x.item_id);
  const eventIds=(shares||[]).filter((x)=>x.item_type==='EVENT').map((x)=>x.item_id);
  const [{data:photos},{data:events}]=await Promise.all([
    photoIds.length?supabase.from('member_photos').select('id,owner_id,image_url,caption,visibility').in('id',photoIds):Promise.resolve({data:[]}),
    eventIds.length?supabase.from('community_events').select('id,title,description,event_at,location,status,image_url,created_by').in('id',eventIds):Promise.resolve({data:[]})
  ]);
  const photoMap=new Map((photos||[]).map((x)=>[x.id,x]));
  const eventMap=new Map((events||[]).map((x)=>[x.id,x]));

  const cards=[];
  for(const share of shares||[]){
    if(share.item_type==='PHOTO'){
      const photo=photoMap.get(share.item_id);
      if(!photo)continue;
      const url=await imageUrl(photo.image_url);
      cards.push(`<article class="ec-shared-card ec-shared-photo" data-shared-id="${esc(share.id)}"><button type="button" class="ec-shared-photo-open" data-shared-photo-url="${esc(url)}" data-shared-photo-caption="${esc(photo.caption||'')}">${url?`<img src="${esc(url)}" alt="${esc(photo.caption||'Geteiltes Foto')}">`:'<span>Foto nicht verfügbar</span>'}</button><div><span>GETEILTES FOTO</span><strong>${esc(photo.caption||'Foto')}</strong>${mine?`<button type="button" data-remove-share="${esc(share.id)}">Vom Profil entfernen</button>`:''}</div></article>`);
    }else if(share.item_type==='EVENT'){
      const event=eventMap.get(share.item_id);
      if(!event||String(event.status||'').toUpperCase()==='CANCELLED')continue;
      cards.push(`<article class="ec-shared-card ec-shared-event" data-shared-id="${esc(share.id)}"><div><span>GETEILTE VERANSTALTUNG</span><strong>${esc(event.title)}</strong><p>${esc(fmt(event.event_at))}${event.location?` · ${esc(event.location)}`:''}</p>${event.description?`<small>${esc(event.description)}</small>`:''}${mine?`<button type="button" data-remove-share="${esc(share.id)}">Vom Profil entfernen</button>`:''}</div></article>`);
    }
  }
  if(!cards.length)return;

  const section=document.createElement('section');
  section.className='panel ec-profile-shared-items';
  section.innerHTML=`<header><span class="eyebrow">AUF DEM PROFIL GETEILT</span><h2>Fotos & Veranstaltungen</h2></header><div class="ec-shared-grid">${cards.join('')}</div>`;
  const album=target.page.querySelector('.ec-profile-photo-album');
  const anchor=album||target.page.querySelector('.personal-profile-sections')||target.page.querySelector('.member-profile-content')||target.page;
  if(album)album.insertAdjacentElement('beforebegin',section);else anchor.append(section);

  section.querySelectorAll('[data-shared-photo-url]').forEach((button)=>button.onclick=()=>openImage(button.dataset.sharedPhotoUrl,button.dataset.sharedPhotoCaption));
  section.querySelectorAll('[data-remove-share]').forEach((button)=>button.onclick=async()=>{
    const {error:removeError}=await supabase.from('profile_shared_items').delete().eq('id',button.dataset.removeShare).eq('profile_id',me);
    if(removeError)return window.alert(removeError.message);
    window.dispatchEvent(new CustomEvent('ec:profile-shares-changed'));
    schedule(20);
  });
}

function schedule(delay=80){clearTimeout(timer);timer=setTimeout(()=>void render(),delay)}
window.addEventListener('ec:navigate',()=>schedule(80));
window.addEventListener('ec:profile-shares-changed',()=>schedule(20));
window.addEventListener('ec:open-profile',()=>schedule(100));
const observer=new MutationObserver(()=>schedule(120));
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(20),{once:true});else schedule(20);

export {};
