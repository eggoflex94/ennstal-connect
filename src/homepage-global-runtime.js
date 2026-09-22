import { supabase } from './supabaseClient';
window.__ecHomeSupabase=supabase;

const FONT_FROM_CLASS={
  'ec-home-font-serif':'serif',
  'ec-home-font-rounded':'rounded',
  'ec-home-font-mono':'mono'
};
const COLOR_FROM_CLASS={
  'ec-home-color-blue':'#1d4ed8',
  'ec-home-color-green':'#166534',
  'ec-home-color-red':'#b91c1c',
  'ec-home-color-violet':'#6d28d9',
  'ec-home-color-slate':'#334155'
};
let homepageSubmitBusy=false;

function activeRegionId(){
  const picker=document.querySelector('.ec-region-picker select');
  return picker?.selectedOptions?.[0]?.dataset?.regionId||document.documentElement.dataset.ecRegionId||null;
}

async function resolveRegionId(){
  const direct=activeRegionId();
  if(direct)return direct;
  const slug=document.documentElement.dataset.ecRegion||document.querySelector('.ec-region-picker select')?.value||localStorage.getItem('ec-active-region')||'';
  if(slug){
    const {data}=await supabase.from('regions').select('id').eq('slug',slug).maybeSingle();
    if(data?.id)return data.id;
  }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return null;
  const {data}=await supabase.from('profiles').select('home_region_id').eq('id',user.id).maybeSingle();
  return data?.home_region_id||null;
}

function parseStyle(value){
  const parts=String(value||'standard').split(/\s+/).filter(Boolean);
  const base=['standard','accent','soft','dark'].find((item)=>parts.includes(item))||'standard';
  const width=parts.includes('ec-home-w-120')?120:parts.includes('ec-home-w-33')?33:parts.includes('ec-home-w-50')?50:parts.includes('ec-home-w-75')?75:100;
  const align=parts.includes('ec-home-left')?'LEFT':parts.includes('ec-home-right')?'RIGHT':'CENTER';
  const height=parts.includes('ec-home-h-small')?'SMALL':parts.includes('ec-home-h-medium')?'MEDIUM':parts.includes('ec-home-h-large')?'LARGE':'AUTO';
  const fontClass=Object.keys(FONT_FROM_CLASS).find((key)=>parts.includes(key));
  const colorClass=Object.keys(COLOR_FROM_CLASS).find((key)=>parts.includes(key));
  return {
    base,
    font:fontClass?FONT_FROM_CLASS[fontClass]:'system',
    fontSize:parts.includes('ec-home-text-xlarge')?22:parts.includes('ec-home-text-large')?18:16,
    color:colorClass?COLOR_FROM_CLASS[colorClass]:'#334155',
    width,align,height
  };
}

function addScope(){
  document.querySelectorAll('.homepage-form').forEach((form)=>{
    if(form.querySelector('[name="publication_scope"]'))return;
    const button=form.querySelector('button.primary-button');
    if(!button)return;
    const label=document.createElement('label');
    label.className='ec-home-style-field';
    label.innerHTML='<span>Sichtbarkeit</span><select name="publication_scope"><option value="REGION">Nur diese Region</option><option value="GLOBAL">Global - alle Regionen</option></select>';
    if(button?.parentElement===form) form.insertBefore(label,button);
    else if(form.isConnected) form.appendChild(label);
  });
}

async function submitHomepage(event){
  const form=event.target.closest?.('.homepage-form');
  if(!form)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if(homepageSubmitBusy)return;
  homepageSubmitBusy=true;
  const button=form.querySelector('button.primary-button');
  if(button)button.disabled=true;
  try{
    const fd=new FormData(form);
    const title=String(fd.get('title')||'').trim();
    const content=String(fd.get('content')||'').trim();
    if(title.length<3||content.length<3)throw new Error('Bitte Überschrift und Text ausfüllen.');
    const scope=String(fd.get('publication_scope')||'REGION').toUpperCase()==='GLOBAL'?'GLOBAL':'REGION';
    const regionId=scope==='GLOBAL'?null:await resolveRegionId();
    if(scope==='REGION'&&!regionId)throw new Error('Bitte zuerst eine Region auswählen.');
    const style=parseStyle(fd.get('frame_style'));
    const {error}=await supabase.rpc('create_homepage_section_v2',{
      p_title:title,
      p_content:content,
      p_image_url:String(fd.get('image_url')||'').trim()||null,
      p_frame_style:style.base,
      p_publication_scope:scope,
      p_region_id:regionId,
      p_font_family:style.font,
      p_font_size:style.fontSize,
      p_text_color:style.color,
      p_title_font_size:style.fontSize>=22?38:style.fontSize>=18?30:24,
      p_title_color:style.color,
      p_layout_width:style.width,
      p_layout_align:style.align,
      p_layout_height:style.height
    });
    if(error)throw error;
    form.reset();
    window.location.reload();
  }catch(error){
    homepageSubmitBusy=false;
    if(button)button.disabled=false;
    alert(error?.message||'Startseiten-Beitrag konnte nicht gespeichert werden.');
  }
}

function globalFrame(row){
  const align=String(row.layout_align||'CENTER').toLowerCase();
  const height=String(row.layout_height||'AUTO').toLowerCase();
  const width=Number(row.layout_width)||100;
  const article=document.createElement('article');
  article.className=`homepage-frame ${row.frame_style||'standard'} ec-home-w-${width} ec-home-${align} ec-home-h-${height}`;
  article.dataset.globalHomepage='1';
  article.dataset.homepageId=row.id;
  const body=document.createElement('div');
  if(row.image_url){const img=document.createElement('img');img.src=row.image_url;img.alt='';article.appendChild(img);}
  const kicker=document.createElement('span');kicker.className='frame-kicker';kicker.textContent='GLOBAL · ENNSTAL CONNECT';
  const h2=document.createElement('h2');h2.textContent=row.title||'';
  h2.style.fontFamily=row.title_font_family||row.font_family||'';h2.style.fontSize=`${Number(row.title_font_size)||24}px`;h2.style.color=row.title_color||'';
  const p=document.createElement('p');p.textContent=row.content||'';
  p.style.fontFamily=row.font_family||'';p.style.fontSize=`${Number(row.font_size)||16}px`;p.style.color=row.text_color||'';
  body.append(kicker,h2,p);article.appendChild(body);return article;
}

async function renderGlobals(){
  const home=document.querySelector('.home-page');
  if(!home)return;
  let host=home.querySelector('.homepage-sections');
  if(!host){host=document.createElement('div');host.className='homepage-sections';home.appendChild(host);}
  host.querySelectorAll('[data-global-homepage="1"]').forEach((node)=>node.remove());
  const {data}=await supabase.from('homepage_sections').select('id,title,content,image_url,frame_style,font_family,font_size,text_color,title_font_family,title_font_size,title_color,layout_width,layout_align,layout_height,sort_order').eq('is_visible',true).eq('publication_scope','GLOBAL').order('sort_order',{ascending:true}).order('created_at',{ascending:true});
  (data||[]).forEach((row)=>{
    if(home.querySelector(`[data-homepage-id="${row.id}"]`))return;
    host.appendChild(globalFrame(row));
  });
}

let timer;
function run(){
  clearTimeout(timer);
  timer=setTimeout(()=>{addScope();void renderGlobals();},100);
}
document.addEventListener('submit',submitHomepage,true);
window.addEventListener('ec:navigate',run);
window.addEventListener('ec:region-change',run);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
