const ICONS={
  nachrichten:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H7l-3 3V5z"/><path d="M8 9h8M8 12h5"/></svg>',
  freundschaftsanfragen:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 18c.8-3 2.7-4.5 5.5-4.5S13.7 15 14.5 18M18 7v6M15 10h6"/></svg>',
  inhalte:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></svg>',
  merkliste:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3-5 3z"/></svg>',
  neuigkeiten:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M7 8h6M7 12h10M7 16h7"/></svg>',
  forum:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 3z"/><path d="M8 9h8M8 12h6"/></svg>',
  veranstaltungen:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16"/></svg>',
  gruppen:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c.7-3.1 2.4-4.7 5-4.7s4.3 1.6 5 4.7M14 18c.5-2.2 1.8-3.4 3.8-3.4 1.6 0 2.7.8 3.2 2.4"/></svg>'
};

const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
const keyFor=label=>normalize(label).toLowerCase().replace(/[^a-zäöüß]+/g,'');
const parseButton=button=>{
  const raw=normalize(button.textContent);
  const match=raw.match(/^(\d+)\s*(.*)$/);
  return{count:match?match[1]:'',label:normalize(match?match[2]:raw)};
};
const relevantHeading=section=>{
  const h2=normalize(section.querySelector('h2')?.textContent).toLowerCase();
  return h2==='auf einen blick'||h2==='du bist auf dem laufenden';
};

function decorateButton(button){
  if(button.dataset.ecModernHomeAction==='1')return;
  const {count,label}=parseButton(button);
  if(!label)return;
  const icon=ICONS[keyFor(label)]||ICONS.inhalte;
  button.dataset.ecModernHomeAction='1';
  button.dataset.count=count||'0';
  button.classList.add('ec-home-action-button');
  button.removeAttribute('style');
  button.innerHTML=`<span class="ec-home-action-icon">${icon}</span><span class="ec-home-action-copy"><strong class="ec-home-action-count">${count||'0'}</strong><span class="ec-home-action-label">${label}</span></span>`;
}

function nearestDirectChild(section,node){
  let current=node;
  while(current&&current.parentElement!==section) current=current.parentElement;
  return current&&current.parentElement===section?current:null;
}

function enhanceSection(section){
  if(!relevantHeading(section))return;
  const targets=[...section.querySelectorAll('button')].filter(button=>{
    if(button.closest('.ec-home-action-grid')) return true;
    const text=normalize(button.textContent);
    return /^(\d+\s*)?(Neue Nachrichten|Freundschaftsanfragen|Neue Inhalte|Merkliste|Neuigkeiten|Forum|Veranstaltungen|Gruppen)$/i.test(text);
  });
  if(!targets.length)return;
  section.classList.add('ec-home-action-panel');

  let grid=section.querySelector('.ec-home-action-grid');
  if(!grid){
    const parents=[...new Set(targets.map(button=>button.parentElement).filter(Boolean))];
    if(parents.length===1&&parents[0]!==section){
      grid=parents[0];
      grid.classList.add('ec-home-action-grid');
      grid.removeAttribute('style');
    }else{
      grid=document.createElement('div');
      grid.className='ec-home-action-grid';
      const anchor=nearestDirectChild(section,targets[0]);
      section.insertBefore(grid,anchor||null);
      targets.forEach(button=>grid.appendChild(button));
    }
  }

  grid.removeAttribute('style');
  targets.forEach(button=>{
    decorateButton(button);
    if(button.parentElement!==grid) grid.appendChild(button);
  });
}

function apply(){
  document.querySelectorAll('section,article,div.panel').forEach(enhanceSection);
}
let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
function boot(){apply();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
