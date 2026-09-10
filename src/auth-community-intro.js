import { supabase } from './supabaseClient';

const items=[
  ['Regional','Regionale Startseite, Termine und Neuigkeiten.'],
  ['Menschen','Mitglieder, Freunde und Nachrichten.'],
  ['Gemeinsam','Forum, Gruppen, Events und gemeinsame Aktivitäten.'],
  ['Sicher','Privatsphäre, Moderation und Profil-Belohnungen.']
];

const CURRENT_NEWS=[
  ['Globale Suche','Mitglieder, Gruppen, Events, Forum und Neuigkeiten lassen sich jetzt über ein gemeinsames Suchfeld finden.'],
  ['Vertrauensprofil erweitert','Bei Profilen siehst du gemeinsame Freunde, gemeinsame Gruppen und gemeinsame aktive Events – transparent und ohne geheime Bewertung.'],
  ['Navigation stabilisiert','Der aktive Bereich in der oberen Navigation bleibt jetzt auch nach Seitenwechseln und Aktualisieren korrekt markiert.'],
  ['Mein Bereich verbessert','Die persönliche Seitenleiste wurde stabiler und übersichtlicher gemacht; Admin-Zugänge werden klarer eingeordnet.'],
  ['Mehr Stabilität','Mehrere unnötige globale DOM-Beobachter wurden entfernt, damit die Community ruhiger und zuverlässiger läuft.'],
  ['Sicherheit verstärkt','Interne Prüfbereiche und sensible Verwaltungsfunktionen wurden weiter abgesichert.']
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
  const html=`<article><strong>Ennstal</strong><span>Für Mitglieder und Themen aus dem Ennstal.</span></article><article><strong>Leoben – Bruck – Mürzzuschlag</strong><span>Regional verbunden in der Obersteiermark.</span></article><article><strong>Überregional</strong><span>Für alle Bundesländer und Regionen – ideal, wenn du regionsübergreifend oder außerhalb der beiden Kernregionen unterwegs bist.</span></article>`;
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
      option.textContent=region.slug==='ueberregional'||region.legacyAlias?'Überregional – für alle Bundesländer und Regionen':region.name;
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
  note.textContent='„Überregional“ gilt für alle Bundesländer und Regionen. Wähle diese Option, wenn du regionsübergreifend sichtbar sein möchtest oder außerhalb der beiden Kernregionen wohnst.';
}

function mountCurrentNews(intro){
  if(!intro)return;
  let news=intro.querySelector('.ec-auth-current-news');
  if(!news){
    news=document.createElement('section');
    news.className='ec-auth-current-news public-auth-updates';
    const updates=intro.querySelector('.public-auth-updates');
    if(updates)intro.insertBefore(news,updates);else intro.appendChild(news);
  }
  news.innerHTML=`<span>NEU BEI ENNSTAL CONNECT · 10. SEPTEMBER 2026</span><h3>Die Community wurde weiter verbessert</h3><p>Schon vor der Anmeldung siehst du, was sich zuletzt geändert hat.</p><div class="ec-auth-news-grid">${CURRENT_NEWS.map(([title,text])=>`<article><strong>${title}</strong><small>${text}</small></article>`).join('')}</div><small>Diese Neuerungen werden nach der ersten Anmeldung zusätzlich einmal kompakt eingeblendet.</small>`;
}

function mountRewardNews(intro){
  if(!intro)return;
  let news=intro.querySelector('.ec-auth-reward-news');
  if(!news){
    news=document.createElement('section');
    news.className='ec-auth-reward-news';
    const updates=intro.querySelector('.public-auth-updates');
    if(updates)intro.insertBefore(news,updates);else intro.appendChild(news);
  }
  news.innerHTML=`<span>COMMUNITY-LEVEL</span><h3>Aktivität wird dauerhaft belohnt</h3><p>Im persönlichen Dashboard siehst du deinen Community-Level, deine aktive Onlinezeit und deinen Prestige-Fortschritt. Ab 300 Punkten geht es mit Bronze, Silber, Gold und Platin weiter.</p><small>Onlinezeit zählt nur bei aktiver Nutzung. Beiträge, Antworten, Freundschaften, Gruppen, Events und regionale Community-Aktivität bringen zusätzliche Punkte.</small>`;
}

function mount(){
  const page=document.querySelector('.auth-page');
  const welcome=page?.querySelector('.ec-auth-welcome');
  const intro=welcome?.querySelector('.ec-auth-intro');
  if(!page||!welcome||!intro)return false;
  page.classList.add('ec-auth-page-clean');
  syncStaticRegionCards();
  if(!welcome.querySelector('.ec-auth-community-intro')){
    const section=document.createElement('section');
    section.className='ec-auth-community-intro';
    section.innerHTML=`<span class="ec-auth-intro-kicker">ENNSTAL CONNECT COMMUNITY</span><h2>Regional vernetzt. Einfach gemeinsam.</h2><p class="ec-auth-intro-copy">Ennstal Connect führt die Kernregionen Ennstal sowie Leoben – Bruck – Mürzzuschlag. „Überregional“ ist für alle Bundesländer und Regionen gedacht und bündelt alle regionsübergreifenden Profile und Themen.</p><div class="ec-auth-intro-grid">${items.map(([title,text])=>`<article><strong>${title}</strong><span>${text}</span></article>`).join('')}</div>`;
    const updates=intro.querySelector('.public-auth-updates');
    if(updates)intro.insertBefore(section,updates);else intro.appendChild(section);
  }
  mountCurrentNews(intro);
  mountRewardNews(intro);
  void syncRegistrationRegions();
  return true;
}

let retryTimer=null;
function schedule(retries=10){
  clearTimeout(retryTimer);
  const run=(left)=>{
    if(mount()||left<=0)return;
    retryTimer=setTimeout(()=>run(left-1),180);
  };
  requestAnimationFrame(()=>run(retries));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(),{once:true});else schedule();
window.addEventListener('focus',()=>schedule(2));
window.addEventListener('ec:navigate',()=>schedule(3));
