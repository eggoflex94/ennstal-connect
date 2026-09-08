import { supabase } from './supabaseClient';

const items=[
  ['Regional','Regionale Startseite, Termine und Neuigkeiten.'],
  ['Menschen','Mitglieder, Freunde und Nachrichten.'],
  ['Gemeinsam','Forum, Gruppen, Events und gemeinsame Aktivitäten.'],
  ['Sicher','Privatsphäre, Moderation und Profil-Belohnungen.']
];

let regionPromise=null;
async function loadRegions(){
  if(!supabase)return[];
  if(!regionPromise)regionPromise=supabase.from('regions').select('slug,name,sort_order').eq('is_active',true).order('sort_order').then(({data,error})=>error?[]:(data||[])).catch(()=>[]);
  return regionPromise;
}

function normalizedRegions(rows){
  const list=Array.isArray(rows)?rows:[];
  const realOverregional=list.find(region=>region.slug==='ueberregional');
  const legacySalzkammergut=list.find(region=>region.slug==='salzkammergut');
  const core=list.filter(region=>!['salzkammergut','ueberregional'].includes(region.slug));
  if(realOverregional)return [...core,{...realOverregional,name:'Überregional'}];
  if(legacySalzkammergut)return [...core,{...legacySalzkammergut,name:'Überregional',legacyAlias:true}];
  return [...core,{slug:'ueberregional',name:'Überregional',sort_order:30,frontendOnly:true}];
}

function syncStaticRegionCards(){
  const box=document.querySelector('.auth-page .ec-auth-regions');
  if(!box)return;
  const html=`<article><strong>Ennstal</strong><span>Für Mitglieder und Themen aus dem Ennstal.</span></article><article><strong>Leoben – Bruck – Mürzzuschlag</strong><span>Regional verbunden in der Obersteiermark.</span></article><article><strong>Überregional</strong><span>Für das Salzkammergut und alle Orte außerhalb unserer beiden Kernregionen.</span></article>`;
  if(box.dataset.ecOverregional!=='1'){
    box.innerHTML=html;
    box.dataset.ecOverregional='1';
  }
}

async function syncRegistrationRegions(){
  const select=document.querySelector('select[name="home_region_slug"]');
  if(!select)return;
  const regions=normalizedRegions(await loadRegions());
  if(!regions.length)return;
  const rawCurrent=select.value||'ennstal';
  const selected=rawCurrent==='salzkammergut'?'ueberregional':rawCurrent;
  const signature=regions.map(region=>`${region.slug}:${region.name}:${region.legacyAlias?'legacy':'real'}`).join('|');
  if(select.dataset.ecRegions!==signature){
    select.replaceChildren(...regions.map(region=>{
      const option=document.createElement('option');
      option.value=region.slug;
      option.textContent=region.name;
      if(region.legacyAlias)option.dataset.ecLegacyOverregional='1';
      return option;
    }));
    select.dataset.ecRegions=signature;
  }
  const real=regions.find(region=>region.slug==='ueberregional');
  const legacy=regions.find(region=>region.legacyAlias);
  const wanted=selected==='ueberregional'?(real?.slug||legacy?.slug||'ueberregional'):selected;
  select.value=regions.some(region=>region.slug===wanted)?wanted:(regions.some(region=>region.slug==='ennstal')?'ennstal':regions[0].slug);
  const label=select.closest('.region-register-label');
  if(!label)return;
  let note=label.querySelector('.ec-overregional-note');
  if(!note){
    note=document.createElement('small');
    note.className='ec-overregional-note';
    label.appendChild(note);
  }
  note.textContent='Wohnst du außerhalb von Ennstal oder Leoben – Bruck – Mürzzuschlag, auch im Salzkammergut? Dann wähle „Überregional“.';
}

function mount(){
  const page=document.querySelector('.auth-page');
  const welcome=page?.querySelector('.ec-auth-welcome');
  const intro=welcome?.querySelector('.ec-auth-intro');
  if(!page||!welcome||!intro)return;
  page.classList.add('ec-auth-page-clean');
  syncStaticRegionCards();
  if(!welcome.querySelector('.ec-auth-community-intro')){
    const section=document.createElement('section');
    section.className='ec-auth-community-intro';
    section.innerHTML=`<span class="ec-auth-intro-kicker">ENNSTAL CONNECT COMMUNITY</span><h2>Regional vernetzt. Einfach gemeinsam.</h2><p class="ec-auth-intro-copy">Ennstal Connect führt die Kernregionen Ennstal sowie Leoben – Bruck – Mürzzuschlag. Das Salzkammergut und alle anderen Orte außerhalb dieser Kernregionen werden unter „Überregional“ zusammengefasst.</p><div class="ec-auth-intro-grid">${items.map(([title,text])=>`<article><strong>${title}</strong><span>${text}</span></article>`).join('')}</div>`;
    const updates=intro.querySelector('.public-auth-updates');
    if(updates)intro.insertBefore(section,updates);else intro.appendChild(section);
  }
  void syncRegistrationRegions();
}

let queued=false;
const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
