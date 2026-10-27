import { supabase } from './supabaseClient';

const TOPICS=['Wandern','Bergsport','Radfahren','Wintersport','Sport','Natur','Freizeit','Events','Musik','Familie','Kulinarik','Fotografie','Vereine','Technik','Regionale Tipps','Mitfahrgelegenheiten','Nachbarschaftshilfe'];
const key='ec-alpenraum-settings';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el};
let editing=false;
let busy=false;
let currentUserId='';
let refreshInFlight=false;
const css=`
.ec-alpenraum-edit{position:fixed;right:18px;bottom:85px;z-index:9998;padding:11px 15px;border:0;border-radius:12px;background:#1269b0;color:#fff;font-weight:800;box-shadow:0 8px 24px #172e4d33;cursor:pointer}
.ec-alpenraum-backdrop{position:fixed;inset:0;z-index:2147483100;background:#081c36bb;display:grid;place-items:center;padding:16px}
.ec-alpenraum-dialog{background:#fff;color:#203b55;width:min(650px,100%);max-height:90vh;overflow:auto;padding:22px;border-radius:18px;display:grid;gap:12px}
.ec-alpenraum-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ec-alpenraum-options label{padding:9px;border:1px solid #dce6ef;border-radius:9px;display:flex;gap:9px;align-items:center}
.ec-alpenraum-actions{display:flex;justify-content:flex-end;gap:10px}.ec-alpenraum-actions button{padding:10px 13px;border:0;border-radius:8px;cursor:pointer}
.ec-alpenraum-save{background:#1269b0;color:white}.ec-alpenraum-error{color:#ac241d}
@media(max-width:550px){.ec-alpenraum-options{grid-template-columns:1fr}.ec-alpenraum-edit{right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 24px);font-size:13px}.ec-alpenraum-dialog{padding:16px;max-height:85dvh}}
`;
function ensureStyle(){if(document.getElementById(key+'-style'))return;const s=node('style');s.id=key+'-style';s.textContent=css;document.head.appendChild(s)}
async function openEditor(){
 if(editing||busy)return;
 editing=true;
 let user;
 try{const auth=await supabase.auth.getUser();user=auth.data?.user;if(!user||user.id!==currentUserId){editing=false;return}}catch{editing=false;return}
 let profile,regions,profileError,regionError;
 try{
  const result=await Promise.all([
   supabase.from('profiles').select('id,interests,home_region_id').eq('id',user.id).maybeSingle(),
   supabase.from('regions').select('id,slug,name').eq('is_active',true).order('name')
  ]);
  ({data:profile,error:profileError}=result[0]);
  ({data:regions,error:regionError}=result[1]);
 }catch(error){
  editing=false;
  console.warn('Alpenraum-Einstellungen konnten nicht geladen werden:',error);
  alert('Einstellungen konnten nicht geladen werden. Bitte versuche es erneut.');
  return;
 }
 if(profileError||regionError||!profile||!document.querySelector('.my-profile-card')){editing=false;if(profileError||regionError)alert('Einstellungen konnten nicht geladen werden.');return}
 ensureStyle();
 const backdrop=node('div','ec-alpenraum-backdrop'),dialog=node('section','ec-alpenraum-dialog');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Meine Alpenregionen und Interessen');
 const heading=node('h2',null,'Meine Alpenregionen & Interessen');heading.style.margin='0';
 dialog.append(heading,node('p',null,'Wähle weitere Regionen, die dich interessieren. Deine Heimatregion bleibt unverändert.'));
 const regionBox=node('div','ec-alpenraum-options');
 const selected=Array.isArray(user.user_metadata?.alpenraum_region_slugs)?user.user_metadata.alpenraum_region_slugs:[];
 for(const r of regions||[]){
  if(r.id===profile.home_region_id)continue;
  const label=node('label'),input=node('input');input.type='checkbox';input.name='alpenraum-region';input.value=r.slug;input.checked=selected.includes(r.slug);
  label.append(input,node('span',null,r.name));regionBox.appendChild(label);
 }
 dialog.append(regionBox,node('h3',null,'Meine Interessen'));
 const topics=node('div','ec-alpenraum-options');
 const existing=String(profile.interests||'').split(/[,;]+/).map(v=>v.trim()).filter(Boolean);
 const chosen=new Set(existing.map(x=>x.toLowerCase()));
 for(const interest of [...new Set([...TOPICS,...existing])]){
  const label=node('label'),input=node('input');input.type='checkbox';input.name='alpenraum-interest';input.value=interest;input.checked=chosen.has(interest.toLowerCase());
  label.append(input,node('span',null,interest));topics.appendChild(label);
 }
 dialog.appendChild(topics);
 const error=node('p','ec-alpenraum-error');error.setAttribute('role','alert');
 const actions=node('div','ec-alpenraum-actions'),cancel=node('button',null,'Abbrechen'),save=node('button','ec-alpenraum-save','Speichern');
 cancel.type='button';save.type='button';
 const close=()=>{backdrop.remove();editing=false;document.removeEventListener('keydown',onKey)};
 const onKey=(event)=>{if(event.key==='Escape'&&!busy)close()};
 document.addEventListener('keydown',onKey);
 cancel.onclick=close;
 backdrop.addEventListener('click',e=>{if(e.target===backdrop&&!busy)close()});
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;cancel.disabled=true;error.textContent='';
  const extra=[...regionBox.querySelectorAll('input:checked')].map(x=>x.value);
  const interests=[...topics.querySelectorAll('input:checked')].map(x=>x.value).join(', ');
  try{
   const {error:authError}=await supabase.auth.updateUser({data:{alpenraum_region_slugs:extra}});
   if(authError)throw authError;
   const {error:updateError}=await supabase.from('profiles').update({interests}).eq('id',user.id);
   if(updateError)throw updateError;
   localStorage.setItem('ec-alpenraum-regions-'+user.id,JSON.stringify(extra));
   window.dispatchEvent(new CustomEvent('ec:alpenraum-preferences-changed'));
   close();
  }catch(e){error.textContent=e?.message||'Speichern fehlgeschlagen.'}
  finally{busy=false;save.disabled=false;cancel.disabled=false}
 };
 actions.append(cancel,save);dialog.append(error,actions);backdrop.appendChild(dialog);document.body.appendChild(backdrop);cancel.focus();
}
async function refresh(){
 if(!supabase||refreshInFlight)return;
 refreshInFlight=true;
 try{
 const own=document.querySelector('.my-profile-card');
 let button=document.getElementById(key+'-button');
 if(!own){button?.remove();currentUserId='';return}
 try{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){button?.remove();currentUserId='';return}
  currentUserId=user.id;
  if(!button){button=node('button','ec-alpenraum-edit','Meine Alpenregionen & Interessen');button.id=key+'-button';button.type='button';button.onclick=()=>void openEditor();document.body.appendChild(button)}
 }catch{button?.remove();currentUserId=''}
 }finally{refreshInFlight=false}
}
if(typeof document!=='undefined'){
 void refresh();
 setInterval(()=>void refresh(),4000);
 window.addEventListener('ec:navigate',()=>setTimeout(()=>void refresh(),400));
 supabase?.auth?.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'){document.getElementById(key+'-button')?.remove();currentUserId=''}});
}
