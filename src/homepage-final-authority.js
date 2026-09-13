import { supabase } from './supabaseClient';

const STYLE_ID='ec-homepage-final-authority-style';
let decorating=false;
let scheduled=0;
let navObserver=null;
let homeObserver=null;

function installStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .ec-home-adminbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid rgba(148,163,184,.25)}
    .ec-home-adminbar button,.ec-home-adminbar select{min-height:38px}
    .ec-home-adminbar select{min-width:150px}
    .ec-home-edit-backdrop{position:fixed;inset:0;z-index:20000;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:20px}
    .ec-home-edit-panel{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 28px 80px rgba(15,23,42,.3)}
    .ec-home-edit-panel h2{margin:0 0 4px}.ec-home-edit-panel>p{margin:0 0 20px;color:#64748b}
    .ec-home-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ec-home-edit-grid label{display:grid;gap:6px;font-weight:700}.ec-home-edit-grid .full{grid-column:1/-1}
    .ec-home-edit-grid input,.ec-home-edit-grid textarea,.ec-home-edit-grid select{width:100%;box-sizing:border-box}.ec-home-edit-grid textarea{min-height:150px;resize:vertical}
    .ec-home-edit-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:8px}
    .homepage-frame.ec-home-wide{width:min(118%,calc(100vw - 36px));max-width:none;margin-left:50%;margin-right:0;transform:translateX(-50%)}
    .homepage-frame.ec-home-wide>img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;max-height:none}
    .homepage-frame[data-ec-width="75"]{width:75%;margin-left:auto;margin-right:auto}.homepage-frame[data-ec-width="50"]{width:50%;margin-left:auto;margin-right:auto}.homepage-frame[data-ec-width="33"]{width:33%;margin-left:auto;margin-right:auto}
    .ec-homepage-top-sections{margin:0 0 18px}.ec-homepage-top-sections .homepage-frame{margin-bottom:14px}
    @media(max-width:760px){.homepage-frame.ec-home-wide,.homepage-frame[data-ec-width="75"],.homepage-frame[data-ec-width="50"],.homepage-frame[data-ec-width="33"]{width:100%;margin-left:0;margin-right:0;transform:none}.ec-home-edit-grid{grid-template-columns:1fr}.ec-home-edit-grid .full{grid-column:auto}}
  `;
  document.head.appendChild(style);
}

function hideNewsNavigation(){
  document.querySelectorAll('nav button,nav a,[role="navigation"] button,[role="navigation"] a').forEach((item)=>{
    if(String(item.textContent||'').trim().includes('Neuigkeiten'))item.style.setProperty('display','none','important');
  });
}

async function currentRole(){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return '';
  const {data}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  return String(data?.role||'');
}

async function resolveRegionId(){
  const select=document.querySelector('.ec-region-picker select,select[data-region-picker],select[name="region"]');
  const direct=select?.selectedOptions?.[0]?.dataset?.regionId||document.documentElement.dataset.ecRegionId||'';
  if(direct)return direct;
  const slug=select?.value||document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
  if(slug){
    const {data}=await supabase.from('regions').select('id').eq('slug',slug).maybeSingle();
    if(data?.id)return data.id;
  }
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id)return null;
  const {data}=await supabase.from('profiles').select('home_region_id').eq('id',user.id).maybeSingle();
  return data?.home_region_id||null;
}

function applyRowLayout(frame,row){
  const width=Number(row.layout_width)||100;
  frame.dataset.ecWidth=String(width);
  frame.classList.toggle('ec-home-wide',width===120);
  frame.style.removeProperty('margin-left');
  frame.style.removeProperty('margin-right');
  if(width!==120){
    const align=String(row.layout_align||'CENTER');
    if(align==='LEFT'){frame.style.marginLeft='0';frame.style.marginRight='auto';}
    if(align==='RIGHT'){frame.style.marginLeft='auto';frame.style.marginRight='0';}
  }
  frame.dataset.homepageId=row.id;
}

function findMatchingRow(frame,rows,used){
  const known=frame.dataset.homepageId;
  if(known){const byId=rows.find((r)=>r.id===known);if(byId)return byId;}
  const title=frame.querySelector('h2')?.textContent?.trim()||'';
  const content=frame.querySelector('p')?.textContent?.trim()||'';
  const row=rows.find((r)=>!used.has(r.id)&&String(r.title||'').trim()===title&&String(r.content||'').trim()===content);
  if(row)used.add(row.id);
  return row||null;
}

function editor(row){
  return new Promise((resolve)=>{
    const overlay=document.createElement('div');overlay.className='ec-home-edit-backdrop';
    const panel=document.createElement('section');panel.className='ec-home-edit-panel';
    panel.innerHTML=`<h2>Startseiten-Beitrag bearbeiten</h2><p>Inhalt, Bild und Darstellung dieses Beitrags.</p><form class="ec-home-edit-grid">
      <label class="full">Überschrift<input name="title" required></label>
      <label class="full">Text<textarea name="content" required></textarea></label>
      <label class="full">Bild-URL<input name="image_url" placeholder="https://..."></label>
      <label>Rahmenstil<select name="frame_style"><option value="standard">Standard</option><option value="accent">Akzent</option><option value="soft">Soft</option><option value="dark">Dunkel</option></select></label>
      <label>Darstellung<select name="layout_width"><option value="120">Querformat / extra breit</option><option value="100">Normal 100 %</option><option value="75">75 %</option><option value="50">50 %</option><option value="33">33 %</option></select></label>
      <label>Position<select name="layout_align"><option value="LEFT">Links</option><option value="CENTER">Mitte</option><option value="RIGHT">Rechts</option></select></label>
      <label>Höhe<select name="layout_height"><option value="AUTO">Automatisch</option><option value="SMALL">Klein</option><option value="MEDIUM">Mittel</option><option value="LARGE">Groß</option></select></label>
      <div class="full ec-home-edit-actions"><button type="button" class="secondary-button" data-cancel>Abbrechen</button><button class="primary-button" type="submit">Speichern</button></div>
    </form>`;
    overlay.appendChild(panel);document.body.appendChild(overlay);
    const form=panel.querySelector('form');
    form.title.value=row.title||'';form.content.value=row.content||'';form.image_url.value=row.image_url||'';form.frame_style.value=row.frame_style||'standard';form.layout_width.value=String(Number(row.layout_width)||100);form.layout_align.value=row.layout_align||'CENTER';form.layout_height.value=row.layout_height||'AUTO';
    const close=(value)=>{overlay.remove();resolve(value);};
    panel.querySelector('[data-cancel]').onclick=()=>close(null);
    overlay.onclick=(e)=>{if(e.target===overlay)close(null);};
    form.onsubmit=(e)=>{e.preventDefault();const f=new FormData(form);const value={title:String(f.get('title')||'').trim(),content:String(f.get('content')||'').trim(),image_url:String(f.get('image_url')||'').trim(),frame_style:String(f.get('frame_style')||'standard'),layout_width:Number(f.get('layout_width'))||100,layout_align:String(f.get('layout_align')||'CENTER'),layout_height:String(f.get('layout_height')||'AUTO')};if(value.title.length<3||value.content.length<3)return alert('Bitte Überschrift und Text vollständig ausfüllen.');close(value);};
  });
}

async function updateRow(row,changes){
  const {error}=await supabase.rpc('admin_update_homepage_frame',{p_id:row.id,p_title:changes.title??row.title,p_content:changes.content??row.content,p_image_url:changes.image_url??row.image_url??'',p_frame_style:changes.frame_style??row.frame_style??'standard',p_layout_width:Number(changes.layout_width??row.layout_width??100),p_layout_align:changes.layout_align??row.layout_align??'CENTER',p_layout_height:changes.layout_height??row.layout_height??'AUTO',p_sort_order:Number(changes.sort_order??row.sort_order??0)});
  if(error)throw error;
}

async function moveRelative(row,rows,direction){
  const ordered=[...rows].sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
  const index=ordered.findIndex((r)=>r.id===row.id);const target=ordered[index+direction];if(!target)return;
  const a=Number(row.sort_order)||0,b=Number(target.sort_order)||0;
  await updateRow(row,{sort_order:b});await updateRow(target,{sort_order:a});
}

function addControls(frame,row,rows){
  frame.querySelectorAll('.content-manage-actions,.ec-home-adminbar').forEach((node)=>node.remove());
  const body=frame.querySelector('div')||frame;
  const bar=document.createElement('div');bar.className='ec-home-adminbar';
  bar.innerHTML=`<button type="button" class="secondary-button" data-home-edit>✎ Bearbeiten</button><button type="button" class="secondary-button" data-home-top>⇧ Ganz oben</button><button type="button" class="secondary-button" data-home-up>↑</button><button type="button" class="secondary-button" data-home-down>↓</button><select data-home-width aria-label="Darstellung"><option value="120">Querformat / extra breit</option><option value="100">100 %</option><option value="75">75 %</option><option value="50">50 %</option><option value="33">33 %</option></select><button type="button" class="danger-button" data-home-delete>🗑 Löschen</button>`;
  bar.querySelector('[data-home-width]').value=String(Number(row.layout_width)||100);
  bar.querySelector('[data-home-edit]').onclick=async()=>{const values=await editor(row);if(!values)return;try{await updateRow(row,values);location.reload();}catch(e){alert(e?.message||'Speichern fehlgeschlagen.');}};
  bar.querySelector('[data-home-top]').onclick=async()=>{try{const min=Math.min(0,...rows.map((r)=>Number(r.sort_order)||0));await updateRow(row,{sort_order:min-100});location.reload();}catch(e){alert(e?.message||'Verschieben fehlgeschlagen.');}};
  bar.querySelector('[data-home-up]').onclick=async()=>{try{await moveRelative(row,rows,-1);location.reload();}catch(e){alert(e?.message||'Verschieben fehlgeschlagen.');}};
  bar.querySelector('[data-home-down]').onclick=async()=>{try{await moveRelative(row,rows,1);location.reload();}catch(e){alert(e?.message||'Verschieben fehlgeschlagen.');}};
  bar.querySelector('[data-home-width]').onchange=async(e)=>{try{await updateRow(row,{layout_width:Number(e.target.value)});location.reload();}catch(err){alert(err?.message||'Breite konnte nicht gespeichert werden.');}};
  bar.querySelector('[data-home-delete]').onclick=async()=>{if(!confirm('Diesen Startseiten-Beitrag wirklich löschen?'))return;const {error}=await supabase.rpc('admin_delete_homepage_frame',{p_id:row.id});if(error)return alert(error.message);location.reload();};
  body.appendChild(bar);
}

function buildGlobalFrame(row){
  const article=document.createElement('article');article.className=`homepage-frame ${row.frame_style||'standard'}`;article.dataset.homepageId=row.id;article.dataset.ecGlobal='1';
  if(row.image_url){const img=document.createElement('img');img.src=row.image_url;img.alt='';article.appendChild(img);}
  const body=document.createElement('div');const kicker=document.createElement('span');kicker.className='frame-kicker';kicker.textContent='GLOBAL · ENNSTAL CONNECT';const h2=document.createElement('h2');h2.textContent=row.title||'';const p=document.createElement('p');p.textContent=row.content||'';body.append(kicker,h2,p);article.appendChild(body);return article;
}

async function bindComposer(){
  const role=await currentRole();if(role!=='HEAD_ADMIN')return;
  document.querySelectorAll('.homepage-form').forEach((form)=>{
    if(!form.querySelector('[name="publication_scope"]')){const label=document.createElement('label');label.className='ec-home-style-field';label.innerHTML='<span>Sichtbarkeit</span><select name="publication_scope"><option value="REGION">Nur diese Region</option><option value="GLOBAL">Global - alle Regionen</option></select>';form.querySelector('button.primary-button')?.before(label);}
    if(!form.querySelector('[name="layout_width_final"]')){const label=document.createElement('label');label.className='ec-home-style-field';label.innerHTML='<span>Darstellung</span><select name="layout_width_final"><option value="100">Normal</option><option value="120">Querformat / extra breit</option><option value="75">75 %</option><option value="50">50 %</option><option value="33">33 %</option></select>';form.querySelector('button.primary-button')?.before(label);}
    if(form.dataset.ecFinalBound==='1')return;form.dataset.ecFinalBound='1';
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(form.dataset.ecSaving==='1')return;form.dataset.ecSaving='1';const button=form.querySelector('button.primary-button');if(button)button.disabled=true;
      try{const fd=new FormData(form);const title=String(fd.get('title')||'').trim(),content=String(fd.get('content')||'').trim();if(title.length<3||content.length<3)throw new Error('Bitte Überschrift und Text ausfüllen.');const scope=String(fd.get('publication_scope')||'REGION').toUpperCase()==='GLOBAL'?'GLOBAL':'REGION';const regionId=scope==='GLOBAL'?null:await resolveRegionId();if(scope==='REGION'&&!regionId)throw new Error('Bitte zuerst eine Region auswählen.');const styleRaw=String(fd.get('frame_style')||'standard');const frameStyle=['standard','accent','soft','dark'].find((x)=>styleRaw.includes(x))||'standard';const width=Number(fd.get('layout_width_final'))||100;const {error}=await supabase.rpc('create_homepage_section_v2',{p_title:title,p_content:content,p_image_url:String(fd.get('image_url')||'').trim()||null,p_frame_style:frameStyle,p_publication_scope:scope,p_region_id:regionId,p_layout_width:width,p_layout_align:'CENTER',p_layout_height:'AUTO'});if(error)throw error;form.reset();location.reload();}catch(e){alert(e?.message||'Beitrag konnte nicht gespeichert werden.');}finally{form.dataset.ecSaving='0';if(button)button.disabled=false;}
    },true);
  });
}

async function decorateHome(){
  if(decorating)return;decorating=true;
  try{
    installStyles();hideNewsNavigation();
    const home=document.querySelector('.home-page');if(!home)return;
    const role=await currentRole();await bindComposer();
    const {data:rows,error}=await supabase.from('homepage_sections').select('id,title,content,image_url,frame_style,layout_width,layout_align,layout_height,sort_order,publication_scope,region_id,is_visible').eq('is_visible',true).order('sort_order',{ascending:true});if(error)return;
    home.querySelectorAll('[data-ec-global="1"]').forEach((node)=>node.remove());
    const regionFrames=[...home.querySelectorAll('.homepage-sections .homepage-frame')].filter((f)=>f.dataset.ecGlobal!=='1');
    const used=new Set();
    for(const frame of regionFrames){const row=findMatchingRow(frame,rows||[],used);if(!row)continue;applyRowLayout(frame,row);if(role==='HEAD_ADMIN')addControls(frame,row,rows||[]);}
    const globals=(rows||[]).filter((r)=>r.publication_scope==='GLOBAL');
    let globalHost=home.querySelector(':scope > .ec-global-final-sections');if(!globalHost&&globals.length){globalHost=document.createElement('div');globalHost.className='homepage-sections ec-global-final-sections';const editorToggle=home.querySelector(':scope > .homepage-editor-toggle');if(editorToggle)editorToggle.after(globalHost);else home.appendChild(globalHost);}if(globalHost){globalHost.innerHTML='';for(const row of globals){const frame=buildGlobalFrame(row);applyRowLayout(frame,row);if(role==='HEAD_ADMIN')addControls(frame,row,rows||[]);globalHost.appendChild(frame);}}
    let topHost=home.querySelector(':scope > .ec-homepage-top-sections');if(topHost)topHost.innerHTML='';const topRows=(rows||[]).filter((r)=>(Number(r.sort_order)||0)<0);if(topRows.length){if(!topHost){topHost=document.createElement('div');topHost.className='homepage-sections ec-homepage-top-sections';const heading=home.querySelector(':scope > .page-heading');if(heading)heading.after(topHost);else home.prepend(topHost);}for(const row of topRows){const frame=home.querySelector(`.homepage-frame[data-homepage-id="${row.id}"]`);if(frame)topHost.appendChild(frame);}}else topHost?.remove();
  }finally{decorating=false;}
}

function schedule(){clearTimeout(scheduled);scheduled=setTimeout(()=>void decorateHome(),120);}
function startObservers(){
  if(!navObserver){navObserver=new MutationObserver(()=>hideNewsNavigation());navObserver.observe(document.body,{childList:true,subtree:true});}
  if(!homeObserver){const root=document.getElementById('root');if(root){homeObserver=new MutationObserver(()=>schedule());homeObserver.observe(root,{childList:true,subtree:true});}}
}

window.addEventListener('ec:navigate',schedule);window.addEventListener('ec:region-change',schedule);window.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{startObservers();schedule();},{once:true});else{startObservers();schedule();}
