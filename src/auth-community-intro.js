const items=[
  ['Regional','Regionale Startseite, Termine und Neuigkeiten.'],
  ['Menschen','Mitglieder, Freunde und Nachrichten.'],
  ['Gemeinsam','Forum, Gruppen, Events und gemeinsame Aktivitäten.'],
  ['Sicher','Privatsphäre, Moderation und Profil-Belohnungen.']
];

function mount(){
  const page=document.querySelector('.auth-page');
  const welcome=page?.querySelector('.ec-auth-welcome');
  const intro=welcome?.querySelector('.ec-auth-intro');
  if(!page||!welcome||!intro)return;
  page.classList.add('ec-auth-page-clean');
  if(welcome.querySelector('.ec-auth-community-intro'))return;
  const section=document.createElement('section');
  section.className='ec-auth-community-intro';
  section.innerHTML=`<span class="ec-auth-intro-kicker">ENNSTAL CONNECT COMMUNITY</span><h2>Regional vernetzt. Einfach gemeinsam.</h2><p class="ec-auth-intro-copy">Deine regionale Community für Kontakte, Austausch und gemeinsame Aktivitäten.</p><div class="ec-auth-intro-grid">${items.map(([title,text])=>`<article><strong>${title}</strong><span>${text}</span></article>`).join('')}</div>`;
  const updates=intro.querySelector('.public-auth-updates');
  if(updates)intro.insertBefore(section,updates);else intro.appendChild(section);
}

let queued=false;
const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount()})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
