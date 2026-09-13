import { supabase } from './supabaseClient';

async function rowFor(frame){
  const id=frame?.dataset?.homepageId;
  if(!id)return null;
  const {data,error}=await supabase.from('homepage_sections').select('id,title,content,image_url,frame_style,layout_width,layout_align,layout_height,sort_order').eq('id',id).maybeSingle();
  if(error)throw error;
  return data;
}

async function uploadImage(file){
  if(!file?.size)return null;
  if(file.size>8*1024*1024)throw new Error('Das Bild darf maximal 8 MB groß sein.');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)throw new Error('Bitte neu anmelden.');
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const path=`homepage/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const {error}=await supabase.storage.from('profile-avatars').upload(path,file,{upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  const {data}=supabase.storage.from('profile-avatars').getPublicUrl(path);
  if(!data?.publicUrl)throw new Error('Bild-URL konnte nicht erstellt werden.');
  return data.publicUrl;
}

function openEditor(row){
  return new Promise((resolve)=>{
    const overlay=document.createElement('div');overlay.className='ec-home-edit-backdrop';
    const panel=document.createElement('section');panel.className='ec-home-edit-panel';
    panel.innerHTML='<h2>Startseiten-Beitrag bearbeiten</h2><p>Text, Bild und Darstellung ändern.</p><form class="ec-home-edit-grid"><label class="full">Überschrift<input name="title" required></label><label class="full">Text<textarea name="content" required></textarea></label><label class="full">Bild-URL<input name="image_url"></label><label class="full">Neues Bild hochladen<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><label>Stil<select name="frame_style"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select></label><label>Darstellung<select name="layout_width"><option value="120">Querformat · volle Startseitenbreite</option><option value="100">Normal · volle Breite</option><option value="75">75 %</option><option value="50">50 %</option><option value="33">33 %</option></select></label><label>Position<select name="layout_align"><option value="LEFT">Links</option><option value="CENTER">Mitte</option><option value="RIGHT">Rechts</option></select></label><label>Höhe<select name="layout_height"><option value="AUTO">Automatisch</option><option value="SMALL">Klein</option><option value="MEDIUM">Mittel</option><option value="LARGE">Groß</option></select></label><div class="full ec-home-edit-actions"><button type="button" class="secondary-button" data-remove>Bild entfernen</button><button type="button" class="secondary-button" data-cancel>Abbrechen</button><button type="submit" class="primary-button">Speichern</button></div></form>';
    overlay.appendChild(panel);document.body.appendChild(overlay);
    const form=panel.querySelector('form');
    form.title.value=row.title||'';form.content.value=row.content||'';form.image_url.value=row.image_url||'';form.frame_style.value=row.frame_style||'standard';form.layout_width.value=String(Number(row.layout_width)||100);form.layout_align.value=row.layout_align||'CENTER';form.layout_height.value=row.layout_height||'AUTO';
    let remove=false;
    const close=(v)=>{overlay.remove();resolve(v);};
    panel.querySelector('[data-cancel]').onclick=()=>close(null);
    panel.querySelector('[data-remove]').onclick=()=>{remove=true;form.image_url.value='';form.image_file.value='';};
    overlay.onclick=(e)=>{if(e.target===overlay)close(null);};
    form.onsubmit=async(e)=>{e.preventDefault();const submit=form.querySelector('button[type="submit"]');submit.disabled=true;try{const f=new FormData(form);const values={title:String(f.get('title')||'').trim(),content:String(f.get('content')||'').trim(),image_url:remove?'':String(f.get('image_url')||'').trim(),frame_style:String(f.get('frame_style')||'standard'),layout_width:Number(f.get('layout_width'))||100,layout_align:String(f.get('layout_align')||'CENTER'),layout_height:String(f.get('layout_height')||'AUTO')};if(values.title.length<3||values.content.length<3)throw new Error('Bitte Überschrift und Text ausfüllen.');const file=f.get('image_file');if(file?.size)values.image_url=await uploadImage(file);close(values);}catch(err){alert(err?.message||'Bearbeiten fehlgeschlagen.');submit.disabled=false;}};
  });
}

async function persist(row,v){
  const payload={title:v.title,content:v.content,image_url:v.image_url||null,frame_style:v.frame_style,layout_width:v.layout_width,layout_align:v.layout_align,layout_height:v.layout_height,sort_order:Number(row.sort_order)||0,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('homepage_sections').update(payload).eq('id',row.id);
  if(!error)return;
  const fallback=await supabase.rpc('admin_update_homepage_frame',{p_id:row.id,p_title:v.title,p_content:v.content,p_image_url:v.image_url||'',p_frame_style:v.frame_style,p_layout_width:v.layout_width,p_layout_align:v.layout_align,p_layout_height:v.layout_height,p_sort_order:Number(row.sort_order)||0});
  if(fallback.error)throw fallback.error;
}

document.addEventListener('click',async(event)=>{
  const edit=event.target.closest('.ec-home-layoutbar [data-edit]');
  if(!edit)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  try{const frame=edit.closest('.homepage-frame');const row=await rowFor(frame);if(!row)throw new Error('Beitrag wurde nicht gefunden.');const values=await openEditor(row);if(!values)return;await persist(row,values);location.reload();}catch(err){alert(err?.message||'Der Beitrag konnte nicht bearbeitet werden.');}
},true);
