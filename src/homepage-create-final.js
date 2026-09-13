import { supabase } from './supabaseClient';

async function role(){const {data:{user}}=await supabase.auth.getUser();if(!user?.id)return '';const {data}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();return String(data?.role||'');}
async function regionId(){const select=document.querySelector('.ec-region-picker select,select[data-region-picker],select[name="region"]');const direct=select?.selectedOptions?.[0]?.dataset?.regionId||document.documentElement.dataset.ecRegionId||'';if(direct)return direct;const slug=select?.value||document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';if(slug){const {data}=await supabase.from('regions').select('id').eq('slug',slug).maybeSingle();if(data?.id)return data.id;}const {data:{user}}=await supabase.auth.getUser();if(!user?.id)return null;const {data}=await supabase.from('profiles').select('home_region_id').eq('id',user.id).maybeSingle();return data?.home_region_id||null;}

function addFields(form){
  const button=form.querySelector('button.primary-button');if(!button)return;
  if(!form.querySelector('[name="publication_scope"]')){const label=document.createElement('label');label.className='ec-home-style-field';label.innerHTML='<span>Sichtbarkeit</span><select name="publication_scope"><option value="REGION">Nur diese Region</option><option value="GLOBAL">Global - alle Regionen</option></select>';button.before(label);}
  if(!form.querySelector('[name="layout_width_final"]')){const label=document.createElement('label');label.className='ec-home-style-field';label.innerHTML='<span>Darstellung</span><select name="layout_width_final"><option value="100">Normal</option><option value="120">Querformat / extra breit</option><option value="75">75 %</option><option value="50">50 %</option><option value="33">33 %</option></select>';button.before(label);}
}

async function bind(){
  if(await role()!=='HEAD_ADMIN')return;
  document.querySelectorAll('.homepage-form').forEach((form)=>{
    addFields(form);if(form.dataset.ecCreateFinal==='1')return;form.dataset.ecCreateFinal='1';
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(form.dataset.ecSaving==='1')return;form.dataset.ecSaving='1';const button=form.querySelector('button.primary-button');if(button)button.disabled=true;
      try{
        const f=new FormData(form);const title=String(f.get('title')||'').trim();const content=String(f.get('content')||'').trim();if(title.length<3||content.length<3)throw new Error('Bitte Überschrift und Text ausfüllen.');
        const scope=String(f.get('publication_scope')||'REGION').toUpperCase()==='GLOBAL'?'GLOBAL':'REGION';const rid=scope==='GLOBAL'?null:await regionId();if(scope==='REGION'&&!rid)throw new Error('Bitte zuerst eine Region auswählen.');
        const raw=String(f.get('frame_style')||'standard');const frameStyle=['standard','accent','soft','dark'].find((x)=>raw.includes(x))||'standard';const width=Number(f.get('layout_width_final'))||100;
        const {error}=await supabase.rpc('create_homepage_section_v2',{p_title:title,p_content:content,p_image_url:String(f.get('image_url')||'').trim()||null,p_frame_style:frameStyle,p_publication_scope:scope,p_region_id:rid,p_layout_width:width,p_layout_align:'CENTER',p_layout_height:'AUTO'});if(error)throw error;
        form.reset();location.reload();
      }catch(e){alert(e?.message||'Beitrag konnte nicht gespeichert werden.');}
      finally{form.dataset.ecSaving='0';if(button)button.disabled=false;}
    },true);
  });
}

function schedule(){setTimeout(()=>void bind(),160);setTimeout(()=>void bind(),700);}
window.addEventListener('ec:navigate',schedule);window.addEventListener('ec:region-change',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
