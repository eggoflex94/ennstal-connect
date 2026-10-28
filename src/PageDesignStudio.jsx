import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {isOperatorProfile} from './operator-identity.js';
import {normalizeBlock,discoverPageBlocks,moveBlock} from './operatorPageDesign.js';
import {loadPageBlocks,savePageBlock,appendEditStamp} from './operatorContentStore.js';

const fonts={system:'system-ui, sans-serif',serif:'Georgia, serif',mono:'ui-monospace, monospace'};
function applyBlock(node,value,row) {
 const s=normalizeBlock(value);node.classList.add('ec-designed-block');
 const values={'--ec-block-color':s.color,'--ec-block-size':`${s.fontSize}px`,'--ec-block-font':fonts[s.fontFamily],color:s.color,background:s.background,'border-color':s.borderColor,'border-width':'1px','border-style':'solid','border-radius':`${s.radius}px`,padding:`${s.padding}px`,'min-height':`${s.minHeight}px`,'text-align':s.align,'box-sizing':'border-box',order:String(s.order),width:`${s.width}%`,'flex-basis':`calc(${s.width}% - ${s.width<100?8:0}px)`,'max-width':'100%'};
 Object.entries(values).forEach(([key,val])=>node.style.setProperty(key,val,'important'));
 const heading=node.querySelector('h1,h2,h3,h4');
 if(s.title&&heading&&heading.textContent!==s.title&&!heading.closest('.member-card,.member-profile-hero'))heading.textContent=s.title;
 let text=node.querySelector(':scope > .ec-designed-text')||(s.textOverride?node.querySelector(':scope > p'):null);
 if(s.textOverride||s.custom){if(!text){text=document.createElement('p');text.className='ec-designed-text';node.append(text);}if(text.textContent!==s.text)text.textContent=s.text;}
 appendEditStamp(node,row);
}
function scopeBlocks() { return discoverPageBlocks(document.querySelector('.modern-main > .content-root')); }
export default function PageDesignStudio({page,regionId,profile}) {
 const canEdit=isOperatorProfile(profile)&&profile?.account_status==='ACTIVE';
 const region=regionId||'global';
 const [opened,setOpened]=useState(false),[blocks,setBlocks]=useState([]),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[contact,setContact]=useState(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const records=useRef(new Map()),runtime=useRef({}),blockList=useRef([]),dirty=useRef(false);
 const [customRows,setCustomRows]=useState([]);
 const touched=useRef(new Map()),parents=useRef(new Set());
 const scan=()=>{
  const found=scopeBlocks();blockList.current=found;
  for(const b of found){
   const row=records.current.get(b.key);const value=runtime.current[b.key]||row?.content;
   if(value&&Object.keys(value).length){
    if(!touched.current.has(b.node))touched.current.set(b.node,b.node.getAttribute('style'));
    parents.current.add(b.node.parentElement);b.node.parentElement.classList.add('ec-designed-container');applyBlock(b.node,value,row);
   }
  }
  return found;
 };
 useEffect(()=>{
  let cancelled=false,queued=false;
  setOpened(false);setSelected(null);setDraft(null);setStatus('');runtime.current={};dirty.current=false;records.current=new Map();setCustomRows([]);
  const refresh=async()=>{
   try {const rows=await loadPageBlocks(page,region);if(cancelled||dirty.current)return;records.current=new Map(rows.map(r=>[r.block_key,r]));setCustomRows(rows.filter(r=>r.content.custom));scan();}
   catch(error){if(!cancelled&&canEdit)setStatus(`Seitengestaltung konnte nicht geladen werden: ${error.message}`);}
  };
  void refresh();
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!cancelled)scan();});});
  const root=document.querySelector('.modern-main > .content-root');if(root)observer.observe(root,{childList:true,subtree:true});
  const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},30000);
  window.addEventListener('focus',refresh);
  return()=>{cancelled=true;observer.disconnect();window.clearInterval(timer);
   for(const [node,style] of touched.current){if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);node.classList.remove('ec-designed-block');}
   for(const parent of parents.current)parent.classList.remove('ec-designed-container');
   touched.current.clear();parents.current.clear();window.removeEventListener('focus',refresh);document.querySelectorAll('.ec-design-selected').forEach(n=>n.classList.remove('ec-design-selected'));};
 },[page,region,profile?.id]);
 useEffect(()=>{
  if(!canEdit)return;
  const edit=e=>{setContact(e.detail);setOpened(true);setSelected(null);setDraft({text:e.detail.text});setStatus('');};
  window.addEventListener('ec:edit-contact',edit);return()=>window.removeEventListener('ec:edit-contact',edit);
 },[canEdit]);
 const choose=b=>{
  document.querySelectorAll('.ec-design-selected').forEach(n=>n.classList.remove('ec-design-selected'));
  b.node.classList.add('ec-design-selected');b.node.scrollIntoView({block:'center',behavior:'smooth'});
  setSelected(b.key);setContact(null);setDraft(normalizeBlock(runtime.current[b.key]||records.current.get(b.key)?.content||{title:b.node.querySelector('h1,h2,h3,h4')?.textContent||'',text:b.node.querySelector(':scope > p')?.textContent||''}));setStatus('');
 };
 const change=(key,value)=>{
  const next={...draft,[key]:value,...(key==='text'?{textOverride:true}:{})};setDraft(next);dirty.current=true;
  if(contact){setContact({...contact,text:next.text});return;}
  runtime.current[selected]=next;scan();
 };
 const shift=(key,direction)=>{
  const target=blockList.current.find(b=>b.key===key);if(!target)return;
  const siblings=blockList.current.filter(b=>b.node.parentElement===target.node.parentElement).map((b,i)=>({key:b.key,order:runtime.current[b.key]?.order??records.current.get(b.key)?.content.order??i}));
  for(const b of moveBlock(siblings,key,direction))runtime.current[b.key]={...normalizeBlock(runtime.current[b.key]||records.current.get(b.key)?.content),order:b.order};
  dirty.current=true;target.node.parentElement.classList.add('ec-designed-container');scan();setBlocks([...blockList.current]);
 };
 const save=async()=>{
  setBusy(true);setStatus('');
  try{
   if(contact){const row=await savePageBlock('__support__','global',contact.id,{responsibilities:draft.text},contact.record);setContact({...contact,record:row});}
   else {
    if(selected&&draft)runtime.current[selected]={...draft,order:runtime.current[selected]?.order??draft.order};
    for(const [key,content]of Object.entries(runtime.current)){const row=await savePageBlock(page,region,key,normalizeBlock(content),records.current.get(key));records.current.set(key,row);delete runtime.current[key];}
   }
   dirty.current=false;scan();setStatus('Gespeichert und veröffentlicht.');
  }catch(error){setStatus(`Speichern fehlgeschlagen: ${error.message}`);}finally{setBusy(false);}
 };
 const add=()=>{
  const key=`custom:${crypto.randomUUID()}`,row={block_key:key,content:normalizeBlock({custom:true,title:'Neuer Bereich',text:'Hier deinen Text eintragen.'})};
  runtime.current[key]=row.content;dirty.current=true;setCustomRows(current=>[...current,row]);setSelected(key);setDraft(row.content);setContact(null);
  requestAnimationFrame(()=>{const found=scan();setBlocks(found);const b=found.find(b=>b.key===key);if(b)choose(b);});
 };
 const close=()=>{
  if(dirty.current&&!window.confirm('Ungespeicherte Änderungen verwerfen?'))return;
  if(dirty.current){runtime.current={};dirty.current=false;window.location.reload();return;}
  setOpened(false);setContact(null);document.querySelectorAll('.ec-design-selected').forEach(n=>n.classList.remove('ec-design-selected'));
 };
 const toggle=()=>{setOpened(true);setContact(null);setBlocks(scan());};
 return <>
  {customRows.length>0&&document.querySelector('.modern-main > .content-root')&&createPortal(<div className="ec-page-custom-blocks">{customRows.map(row=><section key={row.block_key} data-page-block={row.block_key} className="panel ec-page-custom-block"><h2>{row.content.title}</h2></section>)}</div>,document.querySelector('.modern-main > .content-root'))}
  {canEdit&&createPortal(<div className="ec-design-studio">
   {!opened?<button type="button" className="ec-design-launch" onClick={toggle}>✎ Seite gestalten</button>:<aside className="ec-design-inspector" aria-label="Seite gestalten">
    <header><div><small>BETREIBER · {page==='home'?'STARTSEITE':page.toUpperCase()}</small><h2>{contact?`Zuständigkeiten · ${contact.name}`:'Seite gestalten'}</h2></div><button type="button" onClick={close} aria-label="Editor schließen">×</button></header>
    {!contact&&<><p>Bereich auswählen, verschieben und gestalten. Änderungen gelten für diese Seite und Region.</p><div className="ec-design-block-list">{blocks.map(b=><div key={b.key}><button type="button" onClick={()=>choose(b)} aria-pressed={selected===b.key}>{b.label}</button><button type="button" onClick={()=>shift(b.key,-1)} aria-label={`${b.label} nach oben`}>↑</button><button type="button" onClick={()=>shift(b.key,1)} aria-label={`${b.label} nach unten`}>↓</button></div>)}</div><button type="button" onClick={add}>＋ Grauen Inhaltsrahmen hinzufügen</button></>}
    {draft&&<div className="ec-design-fields">
     {!contact&&<><label>Überschrift<input value={draft.title} onChange={e=>change('title',e.target.value)} maxLength={180}/></label>
     <label>Breite: {draft.width}%<input type="range" min="25" max="100" step="5" value={draft.width} onChange={e=>change('width',+e.target.value)}/></label>
     <label>Mindesthöhe: {draft.minHeight}px<input type="range" min="0" max="1200" step="10" value={draft.minHeight} onChange={e=>change('minHeight',+e.target.value)}/></label>
     <label>Schriftgröße: {draft.fontSize}px<input type="range" min="10" max="48" value={draft.fontSize} onChange={e=>change('fontSize',+e.target.value)}/></label>
     <label>Schriftart<select value={draft.fontFamily} onChange={e=>change('fontFamily',e.target.value)}><option value="system">Modern</option><option value="serif">Klassisch</option><option value="mono">Monospace</option></select></label>
     <label>Ausrichtung<select value={draft.align} onChange={e=>change('align',e.target.value)}><option value="left">Links</option><option value="center">Mittig</option><option value="right">Rechts</option></select></label>
     {['color','background','borderColor'].map((key,i)=><label key={key}>{['Schriftfarbe','Hintergrund','Rahmenfarbe'][i]}<input type="color" value={draft[key]} onChange={e=>change(key,e.target.value)}/></label>)}
     <label>Innenabstand<input type="range" min="0" max="60" value={draft.padding} onChange={e=>change('padding',+e.target.value)}/></label>
     <label>Rundung<input type="range" min="0" max="40" value={draft.radius} onChange={e=>change('radius',+e.target.value)}/></label></>}
     <label>{contact?'Zuständigkeiten (eine pro Zeile)':'Inhalt / Ergänzung'}<textarea aria-label={contact?'Zuständigkeiten (eine pro Zeile)':'Inhalt / Ergänzung'} rows={6} value={draft.text} onChange={e=>change('text',e.target.value)} maxLength={12000}/></label>
    </div>}
    <footer><p role="status">{status}</p><button type="button" disabled={busy||(!draft&&!Object.keys(runtime.current).length)} onClick={()=>void save()}>{busy?'Speichert …':'Speichern & veröffentlichen'}</button></footer>
   </aside>}
  </div>,document.body)}
 </>;
}
