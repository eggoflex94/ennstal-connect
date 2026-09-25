import { supabase } from './supabaseClient';

const PANEL_ID = 'ec-help-now';
let activeRegion = null;
let timer = null;
let requestVersion = 0;

const clean = (value) => String(value ?? '').trim();
const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function navigate(page){
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
}

function currentRegionSlug(){
  return clean(document.querySelector('.ec-region-picker select')?.value || localStorage.getItem('ec-active-region'));
}

async function resolveRegion(){
  if(activeRegion?.id) return activeRegion;
  const slug=currentRegionSlug();
  if(!slug || !supabase) return null;
  const {data}=await supabase.from('regions').select('id,name,slug').eq('slug',slug).maybeSingle();
  return data||null;
}

function categoryLabel(category){
  const key=clean(category).replace(/_/g,' ').toLowerCase();
  if(!key) return 'Gesuch';
  return key.replace(/w/g,(letter)=>letter.toUpperCase());
}

function requestCard(item){
  const button=document.createElement('button');
  button.type='button';
  button.className='ec-help-now-card';
  button.innerHTML =
    '<span class="ec-help-now-category">' + esc(categoryLabel(item.category)) + '</span>' +
    '<strong>' + esc(item.title || 'Community-Gesuch') + '</strong>' +
    '<small>' + esc((item.content || 'Mehr dazu in der Community.').slice(0,170)) + '</small>' +
    '<em>Gesuch ansehen →</em>';
  button.addEventListener('click',()=>navigate('community'));
  return button;
}

function render(region, items){
  document.getElementById(PANEL_ID)?.remove();
  const anchor=document.getElementById('ec-local-opportunities')
    || document.getElementById('ec-member-suggestions')
    || document.querySelector('#ec-home-activation .ec-weekly-goals')
    || document.querySelector('#ec-home-activation .ec-weekly-region-recap');
  if(!anchor) return;

  const panel=document.createElement('section');
  panel.id=PANEL_ID;
  panel.className='ec-help-now';

  if(items.length){
    panel.innerHTML =
      '<div class="ec-help-now-head">' +
        '<div><span class="eyebrow">JETZT HELFEN</span><h2>Wo deine Region gerade Unterstützung sucht</h2><p>Offene Gesuche aus ' + esc(region.name) + ' – direkt aus der Community.</p></div>' +
        '<button type="button" data-ec-help-all>Alle Gesuche →</button>' +
      '</div>' +
      '<div class="ec-help-now-grid"></div>';
    const grid=panel.querySelector('.ec-help-now-grid');
    items.slice(0,3).map(requestCard).forEach((card)=>grid.appendChild(card));
  }else{
    panel.classList.add('is-empty');
    panel.innerHTML =
      '<div class="ec-help-now-empty">' +
        '<span aria-hidden="true">🤝</span>' +
        '<div><span class="eyebrow">JETZT HELFEN</span><h2>Gerade keine offenen Gesuche</h2><p>In ' + esc(region.name) + ' wartet aktuell niemand auf Unterstützung. Du kannst trotzdem ein Gesuch starten oder in der Community mithelfen.</p></div>' +
        '<button type="button" data-ec-help-all>Community öffnen →</button>' +
      '</div>';
  }

  panel.querySelector('[data-ec-help-all]')?.addEventListener('click',()=>navigate('community'));
  anchor.after(panel);
}

async function refresh(){
  if(!supabase || !document.querySelector('.home-page')) return;
  const region=await resolveRegion();
  if(!region?.id) return;
  const version=++requestVersion;

  const {data,error}=await supabase
    .from('community_requests')
    .select('id,author_id,category,title,content,status,created_at,region_id')
    .eq('region_id',region.id)
    .neq('status','CLOSED')
    .order('created_at',{ascending:false})
    .limit(6);

  if(version!==requestVersion || (activeRegion?.id && activeRegion.id!==region.id)) return;
  render(region,error?[]:(data||[]));
}

function schedule(delay=180){
  clearTimeout(timer);
  timer=setTimeout(()=>void refresh(),delay);
}

window.addEventListener('ec:region-change',(event)=>{
  activeRegion=event.detail||null;
  requestVersion+=1;
  schedule(140);
});
window.addEventListener('ec:navigate',()=>schedule(220));
window.addEventListener('focus',()=>schedule(100));

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(360),{once:true});
else schedule(360);
