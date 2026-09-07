import { supabase } from './supabaseClient';

const MAX_BYTES=5*1024*1024;
const ALLOWED=new Map([
  ['image/png','png'],
  ['image/jpeg','jpg'],
  ['image/webp','webp'],
  ['image/gif','gif']
]);
let busy=false;

function messageFor(error,stage){
  const raw=String(error?.message||error||'').trim();
  if(/failed to fetch|networkerror|network request failed/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Verbindung zum Bildspeicher fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.';
  if(/row-level security|policy|permission|not authorized|unauthorized/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Keine Speicherberechtigung. Bitte neu anmelden und erneut versuchen.';
  if(/payload too large|too large|maximum|size/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Die Datei ist zu groß. Maximal 5 MB.';
  if(/mime|content.?type|unsupported|invalid.*image/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Erlaubt sind PNG, JPG/JPEG, WebP und GIF.';
  return `Profilbild konnte nicht ${stage==='profile'?'im Profil gespeichert':'hochgeladen'} werden${raw?`: ${raw}`:'.'}`;
}

function toast(text,ok=false){
  document.querySelector('.ec-profile-upload-toast')?.remove();
  const node=document.createElement('div');
  node.className=`ec-profile-upload-toast${ok?' is-success':' is-error'}`;
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  node.textContent=text;
  document.body.appendChild(node);
  clearTimeout(window.__ecProfileUploadToast);
  window.__ecProfileUploadToast=setTimeout(()=>node.remove(),ok?3200:7000);
}

function isProfileAvatarInput(input){
  if(!(input instanceof HTMLInputElement)||input.type!=='file')return false;
  const label=input.closest('label');
  const text=String(label?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  return label?.classList.contains('profile-upload-field')&&text.startsWith('profilbild');
}

async function upload(file,input){
  if(busy)return;
  if(!supabase){toast('Profilbild konnte nicht hochgeladen werden: Bildspeicher ist derzeit nicht verfügbar.');return}
  const mime=String(file?.type||'').toLowerCase();
  if(!file||!ALLOWED.has(mime)){toast('Bitte PNG, JPG/JPEG, WebP oder GIF auswählen.');input.value='';return}
  if(file.size>MAX_BYTES){toast('Das Profilbild ist zu groß. Maximal 5 MB.');input.value='';return}

  busy=true;input.disabled=true;toast('Profilbild wird hochgeladen …',true);
  let path='';
  try{
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError)throw userError;
    if(!user?.id)throw new Error('Keine aktive Anmeldung gefunden.');

    const ext=ALLOWED.get(mime);
    path=`${user.id}/${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await supabase.storage.from('profile-avatars').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'});
    if(uploadError)throw uploadError;

    const {data:urlData}=supabase.storage.from('profile-avatars').getPublicUrl(path);
    const publicUrl=urlData?.publicUrl;
    if(!publicUrl)throw new Error('Öffentliche Bildadresse konnte nicht erzeugt werden.');

    const {error:updateError}=await supabase.from('profiles').update({avatar_url:publicUrl}).eq('id',user.id);
    if(updateError){
      try{await supabase.storage.from('profile-avatars').remove([path])}catch{}
      throw Object.assign(updateError,{__stage:'profile'});
    }

    document.querySelectorAll('img.my-avatar,img[alt="Profil"]').forEach(img=>{img.src=`${publicUrl}${publicUrl.includes('?')?'&':'?'}v=${Date.now()}`});
    toast('Profilbild wurde gespeichert.',true);
    window.dispatchEvent(new CustomEvent('ec:profile-image-updated',{detail:{avatarUrl:publicUrl}}));
    setTimeout(()=>window.location.reload(),650);
  }catch(error){
    console.error('Profilbild-Upload fehlgeschlagen:',error);
    toast(messageFor(error,error?.__stage||'upload'));
  }finally{
    busy=false;input.disabled=false;input.value='';
  }
}

function onChange(event){
  const input=event.target;
  if(!isProfileAvatarInput(input))return;
  const file=input.files?.[0];
  if(!file)return;
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void upload(file,input);
}

document.addEventListener('change',onChange,true);
