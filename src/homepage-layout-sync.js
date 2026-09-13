import { supabase } from './supabaseClient';

function clearLayoutClasses(frame){
  [...frame.classList].forEach((name)=>{
    if(name.startsWith('ec-home-w-')||name.startsWith('ec-home-h-')||['ec-home-left','ec-home-center','ec-home-right'].includes(name))frame.classList.remove(name);
  });
}

function applyLayout(frame,row){
  clearLayoutClasses(frame);
  const width=Number(row.layout_width)||100;
  const align=String(row.layout_align||'CENTER').toLowerCase();
  const height=String(row.layout_height||'AUTO').toLowerCase();
  frame.classList.add(`ec-home-w-${width}`,`ec-home-${align}`,`ec-home-h-${height}`);
  frame.dataset.homepageId=row.id;
}

async function syncHomepageLayout(){
  const home=document.querySelector('.home-page');
  if(!home)return;
  const frames=[...home.querySelectorAll('.homepage-frame')];
  if(!frames.length)return;
  const {data:rows}=await supabase.from('homepage_sections').select('id,title,content,layout_width,layout_align,layout_height,sort_order').eq('is_visible',true).order('sort_order',{ascending:true});
  if(!rows?.length)return;

  let topHost=home.querySelector(':scope > .ec-homepage-top-sections');
  for(const frame of frames){
    const title=frame.querySelector('h2')?.textContent?.trim()||'';
    const text=frame.querySelector('p')?.textContent?.trim()||'';
    const row=rows.find((item)=>String(item.title||'').trim()===title&&String(item.content||'').trim()===text);
    if(!row)continue;
    applyLayout(frame,row);
    if(Number(row.sort_order)<0){
      if(!topHost){
        topHost=document.createElement('div');
        topHost.className='homepage-sections ec-homepage-top-sections';
        const heading=home.querySelector(':scope > .page-heading');
        if(heading)heading.after(topHost);else home.prepend(topHost);
      }
      topHost.appendChild(frame);
    }
  }
  if(topHost&&!topHost.children.length)topHost.remove();
}

function scheduleLayoutSync(){
  void syncHomepageLayout();
  setTimeout(()=>void syncHomepageLayout(),180);
  setTimeout(()=>void syncHomepageLayout(),600);
  setTimeout(()=>void syncHomepageLayout(),1200);
}

window.addEventListener('ec:navigate',scheduleLayoutSync);
window.addEventListener('ec:region-change',scheduleLayoutSync);
window.addEventListener('focus',scheduleLayoutSync);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleLayoutSync,{once:true});else scheduleLayoutSync();
