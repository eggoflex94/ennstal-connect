import { supabase } from './supabaseClient';

const MAX_BYTES=5*1024*1024;
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
const isNetworkError=error=>/failed to fetch|networkerror|network request failed|load failed|zeitüberschreitung|timeout/i.test(String(error?.message||error||''));

function messageFor(error,stage){
  const raw=String(error?.message||error||'').trim();
  if(isNetworkError(error))return 'Profilbild konnte nicht hochgeladen werden: Die Verbindung zum Bildspeicher wurde unterbrochen. Ennstal Connect versucht es automatisch erneut; falls es weiter fehlschlägt, bitte kurz später nochmals probieren.';
  if(/row-level security|policy|permission|not authorized|unauthorized/i.test(raw))return 'Profilbild konnte nicht hochgeladen werden: Keine Speicherberechtigung. Bitte einmal ab- und wieder anmelden.';
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
  window.__ecProfileUploadToast=setTimeout(()=>node.remove(),ok?3200:8000);
}

function isProfileAvatarInput(input){
  if(!(input instanceof HTMLInputElement)||input.type!=='file')return false;
  const label=input.closest('label');
  const text=String(label?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  return label?.classList.contains('profile-upload-field')&&text.startsWith('profilbild');
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

async function uploadObject(path,file,mime){
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt+=1){
    try{
      const result=await withTimeout(
        supabase.storage.from('profile-avatars').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'}),
        18000,
        'Zeitüberschreitung beim Bild-Upload.'
      );
      if(!result.error)return;
      lastError=result.error;
      if(!isNetworkError(lastError))throw lastError;
    }catch(error){
      lastError=error;
      if(!isNetworkError(error))throw error;
    }
    if(attempt<3){
      toast(`Verbindung zum Bildspeicher wird erneut aufgebaut … Versuch ${attempt+1}/3`,true);
      await sleep(700*attempt);
    }
  }
  throw lastError||new Error('Bildspeicher nicht erreichbar.');
}

async function saveAvatar(userId,publicUrl){
  let lastError=null;
  for(let attempt=1;attempt<=2;attempt+=1){
    try{
      const result=await withTimeout(
        supabase.from('profiles').update({avatar_url:publicUrl}).eq('id',userId).select('id,avatar_url').maybeSingle(),
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

async function upload(file,input){
  if(busy)return;
  if(!supabase){toast('Profilbild konnte nicht hochgeladen werden: Bildspeicher ist derzeit nicht verfügbar.');return}
  const mime=String(file?.type||'').toLowerCase();
  if(!file||!ALLOWED.has(mime)){toast('Bitte PNG, JPG/JPEG, WebP oder GIF auswählen.');input.value='';return}
  if(file.size>MAX_BYTES){toast('Das Profilbild ist zu groß. Maximal 5 MB.');input.value='';return}

  busy=true;input.disabled=true;toast('Profilbild wird hochgeladen …',true);
  let path='';
  try{
    const user=await getUser();
    const ext=ALLOWED.get(mime);
    path=`${user.id}/${crypto.randomUUID()}.${ext}`;
    await uploadObject(path,file,mime);

    const {data:urlData}=supabase.storage.from('profile-avatars').getPublicUrl(path);
    const publicUrl=urlData?.publicUrl;
    if(!publicUrl)throw new Error('Öffentliche Bildadresse konnte nicht erzeugt werden.');

    try{await saveAvatar(user.id,publicUrl)}catch(error){
      try{await supabase.storage.from('profile-avatars').remove([path])}catch{}
      throw error;
    }

    const cacheBusted=`${publicUrl}${publicUrl.includes('?')?'&':'?'}v=${Date.now()}`;
    document.querySelectorAll('img.my-avatar,img[alt="Profil"],.sidebar-profile img,.ec-dock-avatar').forEach(img=>{img.src=cacheBusted});
    toast('Profilbild wurde gespeichert.',true);
    window.dispatchEvent(new CustomEvent('ec:profile-image-updated',{detail:{avatarUrl:publicUrl}}));
    window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
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
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void upload(file,input);
}

document.addEventListener('change',onChange,true);
