import { supabase } from './supabaseClient';

const MAX_BYTES=8*1024*1024;
const ALLOWED=new Map([
  ['image/png','png'],
  ['image/jpeg','jpg'],
  ['image/webp','webp'],
  ['image/gif','gif']
]);
let busy=false;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const withTimeout=(promise,ms,message)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(message)),ms);
  Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
});
const isNetworkError=error=>/failed to fetch|networkerror|network request failed|load failed|zeitüberschreitung|timeout|aborted/i.test(String(error?.message||error||''));

function messageFor(error,stage){
  const raw=String(error?.message||error||'').trim();
  if(isNetworkError(error))return 'Profilbild konnte nicht hochgeladen werden: Die Verbindung zum Bildspeicher wurde unterbrochen. Bitte nochmals versuchen.';
  if(/row-level security|policy|permission|not authorized|unauthorized/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Keine Speicherberechtigung. Bitte einmal ab- und wieder anmelden.';
  if(/payload too large|too large|maximum|size/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Die Datei ist zu groß. Maximal 8 MB.';
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
  window.__ecProfileUploadToast=setTimeout(()=>node.remove(),ok?3200:8000);
}

function isProfileAvatarInput(input){
  if(!(input instanceof HTMLInputElement)||input.type!=='file')return false;
  const label=input.closest('label');
  const text=String(label?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  return Boolean(label)&&(
    label.classList.contains('profile-avatar-upload-field')||
    (label.classList.contains('profile-upload-field')&&text.startsWith('profilbild'))
  );
}

function setInlineStatus(text){
  const panel=document.querySelector('.profile-edit-panel');
  if(!panel)return;
  let status=panel.querySelector('.profile-upload-status');
  if(!status){
    status=document.createElement('div');
    status.className='profile-upload-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    const field=panel.querySelector('.profile-avatar-upload-field,.profile-upload-field');
    field?.insertAdjacentElement('afterend',status);
  }
  if(status)status.textContent=text;
}

async function getUser(){
  let result;
  for(let attempt=0;attempt<2;attempt+=1){
    try{
      result=await withTimeout(supabase.auth.getUser(),8000,'Zeitüberschreitung beim Prüfen der Anmeldung.');
      if(!result.error)break;
      if(!isNetworkError(result.error))throw result.error;
    }catch(error){
      if(!isNetworkError(error)||attempt===1)throw error;
    }
    await sleep(500);
  }
  if(result?.error)throw result.error;
  if(!result?.data?.user?.id)throw new Error('Keine aktive Anmeldung gefunden.');
  return result.data.user;
}

async function uploadObject(userId,file,mime){
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt+=1){
    const path=`${userId}/${Date.now()}-${crypto.randomUUID()}.${ALLOWED.get(mime)}`;
    try{
      const status=attempt===1?'Profilbild wird hochgeladen …':`Verbindung wird erneut aufgebaut … Versuch ${attempt}/3`;
      setInlineStatus(status);
      if(attempt>1)toast(status,true);
      const result=await withTimeout(
        supabase.storage.from('profile-avatars').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'}),
        60000,
        'Zeitüberschreitung beim Bild-Upload.'
      );
      if(!result.error)return path;
      lastError=result.error;
      if(!isNetworkError(lastError))throw lastError;
    }catch(error){
      lastError=error;
      if(!isNetworkError(error))throw error;
    }
    if(attempt<3)await sleep(700*attempt);
  }
  throw lastError||new Error('Bildspeicher nicht erreichbar.');
}

async function saveAvatar(userId,publicUrl){
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt+=1){
    try{
      setInlineStatus('Profilbild wird im Profil gespeichert …');
      const result=await withTimeout(
        supabase.from('profiles').update({avatar_url:publicUrl,updated_at:new Date().toISOString()}).eq('id',userId).select('*').single(),
        12000,
        'Zeitüberschreitung beim Speichern des Profilbilds.'
      );
      if(!result.error&&result.data?.avatar_url)return result.data;
      lastError=result.error||new Error('Das Profil hat das neue Bild nicht bestätigt.');
      if(!isNetworkError(lastError))throw lastError;
    }catch(error){
      lastError=error;
      if(!isNetworkError(error)||attempt===2)throw Object.assign(error,{__stage:'profile'});
    }
    await sleep(650);
  }
  throw Object.assign(lastError||new Error('Profil konnte nicht aktualisiert werden.'),{__stage:'profile'});
}

function updateVisibleAvatars(publicUrl){
  const cacheBusted=`${publicUrl}${publicUrl.includes('?')?'&':'?'}v=${Date.now()}`;
  document.querySelectorAll([
    '.integrated-avatar-wrap img',
    'img.my-avatar',
    'img[alt="Profil"]',
    '.sidebar-profile img',
    '.ec-dock-avatar'
  ].join(',')).forEach(img=>{img.src=cacheBusted});
}

async function upload(file,input){
  if(busy)return;
  if(!supabase){toast('Profilbild konnte nicht hochgeladen werden: Bildspeicher ist derzeit nicht verfügbar.');return}
  const mime=String(file?.type||'').toLowerCase();
  if(!file||!ALLOWED.has(mime)){toast('Bitte PNG, JPG/JPEG, WebP oder GIF auswählen.');input.value='';return}
  if(file.size>MAX_BYTES){toast('Das Profilbild ist zu groß. Maximal 8 MB.');input.value='';return}

  busy=true;
  input.disabled=true;
  toast('Profilbild wird hochgeladen …',true);
  setInlineStatus('Profilbild wird hochgeladen …');
  let path='';
  try{
    const user=await getUser();
    path=await uploadObject(user.id,file,mime);

    const {data:urlData}=supabase.storage.from('profile-avatars').getPublicUrl(path);
    const publicUrl=urlData?.publicUrl;
    if(!publicUrl)throw new Error('Öffentliche Bildadresse konnte nicht erzeugt werden.');

    let savedProfile;
    try{savedProfile=await saveAvatar(user.id,publicUrl)}catch(error){
      try{await supabase.storage.from('profile-avatars').remove([path])}catch{}
      throw error;
    }

    updateVisibleAvatars(publicUrl);
    setInlineStatus('✓ Profilbild wurde gespeichert.');
    toast('Profilbild wurde gespeichert.',true);
    window.dispatchEvent(new CustomEvent('ec:profile-updated',{detail:savedProfile}));
    window.dispatchEvent(new CustomEvent('ec:profile-media-updated',{detail:{avatar_url:publicUrl}}));
    window.dispatchEvent(new CustomEvent('ec:profile-image-updated',{detail:{avatarUrl:publicUrl}}));
    window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
    path='';
  }catch(error){
    console.error('Profilbild-Upload fehlgeschlagen:',error);
    const message=messageFor(error,error?.__stage||'upload');
    setInlineStatus(`Fehler: ${message}`);
    toast(message);
  }finally{
    busy=false;
    input.disabled=false;
    input.value='';
  }
}

function onChange(event){
  const input=event.target;
  if(!isProfileAvatarInput(input))return;
  const file=input.files?.[0];
  if(!file)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void upload(file,input);
}

document.addEventListener('change',onChange,true);
