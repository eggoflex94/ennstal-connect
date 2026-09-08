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

async function syncRegistrationRegions(){
  const select=document.querySelector('select[name="home_region_slug"]');
  if(!select)return;
  const regions=(await loadRegions()).filter(region=>region.slug!=='salzkammergut');
  if(!regions.length)return;
  const current=select.value==='salzkammergut'?'ueberregional':(select.value||'ennstal');
  const signature=regions.map(region=>`${region.slug}:${region.name}`).join('|');
  if(select.dataset.ecRegions===signature)return;
  select.replaceChildren(...regions.map(region=>{
    const option=document.createElement('option');
    option.value=region.slug;
    option.textContent=region.name;
    return option;
  }));
  select.dataset.ecRegions=signature;
  select.value=regions.some(region=>region.slug===current)?current:(regions.some(region=>region.slug==='ennstal')?'ennstal':regions[0].slug);
  const label=select.closest('.region-register-label');
  if(!label)return;
  let note=label.querySelector('.ec-overregional-note');
  const hasOverregional=regions.some(region=>region.slug==='ueberregional');
  if(hasOverregional){
    if(!note){
      note=document.createElement('small');
      note.className='ec-overregional-note';
      label.appendChild(note);
    }
    note.textContent='Wohnst du außerhalb von Ennstal oder Leoben – Bruck – Mürzzuschlag, auch im Salzkammergut? Dann wähle „Überregional“.';
  }else note?.remove();
}

function mount(){
  const page=document.querySelector('.auth-page');
  const welcome=page?.querySelector('.ec-auth-welcome');
  const intro=welcome?.querySelector('.ec-auth-intro');
  if(!page||!welcome||!intro)return;
  page.classList.add('ec-auth-page-clean');
  if(!welcome.querySelector('.ec-auth-community-intro')){
    const section=document.createElement('section');
    section.className='ec-auth-community-intro';
    section.innerHTML=`<span class="ec-auth-intro-kicker">ENNSTAL CONNECT COMMUNITY</span><h2>Regional vernetzt. Einfach gemeinsam.</h2><p class="ec-auth-intro-copy">Ennstal Connect führt die Kernregionen Ennstal sowie Leoben – Bruck – Mürzzuschlag. Mitglieder aus dem Salzkammergut und allen anderen Orten werden unter „Überregional“ geführt.</p><div class="ec-auth-intro-grid">${items.map(([title,text])=>`<article><strong>${title}</strong><span>${text}</span></article>`).join('')}</div>`;
    const updates=intro.querySelector('.public-auth-updates');
    if(updates)intro.insertBefore(section,updates);else intro.appendChild(section);
  }
  void syncRegistrationRegions();
}

let queued=false;
const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
