import { supabase } from './supabaseClient';

let timer=null,run=0;
const activeSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
const home=()=>document.querySelector('.home-page');

function formatDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('de-AT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}

function overviewPanel(){return[...document.querySelectorAll('.home-page section,.home-page article,.home-page .panel')].find(el=>norm(el.querySelector('h2')?.textContent)==='auf einen blick')||null}

function hideLegacyNextEvent(panel){
  const walker=document.createTreeWalker(panel,NodeFilter.SHOW_TEXT);
  const hits=[];let node;
  while((node=walker.nextNode())){if(norm(node.nodeValue).includes('nächster termin')||norm(node.nodeValue).includes('naechster termin'))hits.push(node.parentElement)}
  hits.forEach(label=>{if(!label||label.closest('[data-region-next-event-final]'))return;const target=label.closest('button')||label.parentElement;if(target&&target!==panel)target.style.display='none'});
}

function render(panel,event,region){
  hideLegacyNextEvent(panel);
  let bar=panel.querySelector('[data-region-next-event-final]');
  if(!bar){bar=document.createElement('button');bar.type='button';bar.dataset.regionNextEventFinal='1';bar.className='ec-region-next-event-final';panel.appendChild(bar)}
  const date=event?.event_at?formatDate(event.event_at):'';
  bar.innerHTML=`<span>NÄCHSTER TERMIN · ${region.name}</span><strong>${event?.title||`Derzeit kein kommender Termin in ${region.name}`}</strong><time>${date}</time>`;
  bar.disabled=!event?.id;
  bar.onclick=event?.id?()=>window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'events'}})):null;
}

async function refresh(){
  const id=++run,panel=overviewPanel();if(!supabase||!home()||!panel)return;
  try{
    const {data:region,error:re}=await supabase.from('regions').select('id,slug,name').eq('slug',activeSlug()).eq('is_active',true).maybeSingle();if(re)throw re;if(!region||id!==run)return;
    const {data:events,error}=await supabase.from('community_events').select('id,title,event_at,region_id,status').eq('region_id',region.id).eq('status','ACTIVE').gte('event_at',new Date().toISOString()).order('event_at',{ascending:true}).limit(1);if(error)throw error;if(id!==run)return;
    render(panel,events?.[0]||null,region);
  }catch(e){console.warn('Regionaler nächster Termin konnte nicht geladen werden:',e)}
}
function schedule(delay=100){clearTimeout(timer);timer=setTimeout(()=>void refresh(),delay)}
new MutationObserver(()=>{if(home())schedule(180)}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>schedule(20));window.addEventListener('focus',()=>schedule(80));if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(150),{once:true});else schedule(150);
