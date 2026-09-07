const items=[
  ['Regional verbunden','Regionale Startseiten, Termine, Neuigkeiten und Ansprechpartner.'],
  ['Menschen finden','Mitglieder, Freunde, Nachrichten, Gruppen und Profile an einem Ort.'],
  ['Gemeinsam aktiv','Forum, Veranstaltungen, Gruppen, Mitfahrgelegenheiten und gemeinsame Aktivitäten.'],
  ['Sicher & persönlich','Privatsphäre, Rollen, Moderation, Meldungen und automatische Profil-Belohnungen.']
];

function mount(){
  const page=document.querySelector('.auth-page');
  const box=document.querySelector('.auth-box');
  if(!page||!box||page.querySelector('.ec-auth-community-intro'))return;
  const section=document.createElement('section');
  section.className='ec-auth-community-intro';
  section.innerHTML=`<span class="ec-auth-intro-kicker">ENNSTAL CONNECT COMMUNITY</span><h2>Regional vernetzt. Einfach gemeinsam.</h2><p class="ec-auth-intro-copy">Ennstal Connect verbindet Menschen aus deiner Region – für Austausch, Freundschaften, Gruppen, Veranstaltungen und gemeinsame Aktivitäten. Deine Community bleibt regional, übersichtlich und direkt erreichbar.</p><div class="ec-auth-intro-grid">${items.map(([title,text])=>`<article><strong>${title}</strong><span>${text}</span></article>`).join('')}</div>`;
  box.insertAdjacentElement('afterend',section);
}

let queued=false;
const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
