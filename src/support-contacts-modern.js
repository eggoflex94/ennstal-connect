import { supabase } from "./supabaseClient";
import { roleIdentity,makeRoleIcon } from "./roleIdentity.js";

const SUPPORT_EMAIL="ennstal.connect@gmx.at";
let refreshRunning=false,lastSignature="",realtimeStarted=false,pollTimer=null,lastActiveRegion=null;
const normalizeRole=v=>String(v||"").trim().toUpperCase();
const displayName=p=>p.nickname||"Community-Team";
const arrayValue=v=>Array.isArray(v)?v:[];

function responsibilities(p){
  const role=normalizeRole(p.role);
  const saved=arrayValue(p.admin_responsibilities).map(x=>String(x||"").trim()).filter(Boolean);
  if(role==="HEAD_ADMIN")return[p.head_admin_responsibilities||"Gesamtverantwortung, Sicherheit & Regeln",...saved].filter(Boolean);
  if(role==="ADMIN")return saved.length?saved:["Community-Verwaltung","Support & Sicherheit","Koordination der Community"];
  const items=[...saved];
  if(p.forum_moderator&&!items.some(x=>/forum/i.test(x)))items.push("Forum-Moderation");
  if(p.group_moderator&&!items.some(x=>/gruppe/i.test(x)))items.push("Gruppen-Moderation");
  return [...new Set(items)];
}

function findHostCard(){
  const h=[...document.querySelectorAll("h1,h2,h3,h4")].find(n=>/^Administration(?:\s*&\s*Support)?$/i.test(String(n.textContent||"").trim())||/^Ansprechpartner$/i.test(String(n.textContent||"").trim()));
  return h?.closest("section,article,.card,.dashboard-card,.home-card,.panel")||h?.parentElement||null;
}

function hideLegacyContacts(host,heading,panel){
  [...host.children].forEach(c=>{
    if(c===heading||c===panel||c.classList?.contains("eyebrow"))return;
    const t=String(c.textContent||"").trim();
    if(/Marco|Roland|Zuständig\s+für|Nachrichten verwalten|Profilbesuche|Community-Verwaltung|Technischen Support|Technischer Support|Hauptadmin|Betreiber|Moderation/i.test(t)){
      c.style.display="none";c.dataset.ecLegacyContact="true";
    }
  });
}

function makePerson(p){
  const ident=roleIdentity(p),card=document.createElement("article");
  card.className=`ec-team-person ec-role-${ident.key}`;
  card.style.setProperty("--ec-role-color",ident.color);
  const top=document.createElement("button");top.type="button";top.className="ec-team-person-top";top.dataset.profileId=p.user_id||p.id||"";top.title=`Profil von ${displayName(p)} öffnen`;
  const star=makeRoleIcon(p,"normal");if(star)top.appendChild(star);
  const name=document.createElement("strong");name.className="ec-team-name ec-identity-name";name.textContent=displayName(p);top.appendChild(name);
  top.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("ec:open-profile",{detail:{profileId:p.user_id||p.id,nickname:displayName(p)}})));
  card.appendChild(top);
  const items=responsibilities(p);
  if(items.length){const d=document.createElement("details");d.className="ec-team-details";const s=document.createElement("summary");s.textContent="Zuständigkeiten";const ul=document.createElement("ul");items.forEach(x=>{const li=document.createElement("li");li.textContent=x;ul.appendChild(li)});d.append(s,ul);card.appendChild(d)}
  return card;
}

function renderTeam(profiles){
  const host=findHostCard();if(!host)return;
  const heading=[...host.querySelectorAll("h1,h2,h3,h4")].find(n=>/Administration|Ansprechpartner/i.test(n.textContent||""));if(heading)heading.textContent="Administration & Support";
  let panel=host.querySelector(".ec-team-panel");if(!panel){panel=document.createElement("section");panel.className="ec-team-panel";const old=host.querySelector(".ec-support-panel");if(old)old.replaceWith(panel);else heading?.insertAdjacentElement("afterend",panel)}
  hideLegacyContacts(host,heading,panel);panel.replaceChildren();
  const intro=document.createElement("div");intro.className="ec-team-intro";const copy=document.createElement("div");copy.innerHTML="<strong>Support & Ansprechpartner</strong><p>Hier siehst du die tatsächlich zuständigen Personen. Supporter erscheinen nur mit einer zugeteilten Moderationsaufgabe.</p>";const email=document.createElement("a");email.className="ec-team-email";email.href=`mailto:${SUPPORT_EMAIL}`;email.textContent="✉ E-Mail senden";intro.append(copy,email);panel.appendChild(intro);
  const groups=[["HEAD_ADMIN","Administration"],["ADMIN","Administration"],["SUPPORTER","Moderation"]];
  groups.forEach(([r,label])=>{let members=profiles.filter(p=>normalizeRole(p.role)===r);if(r==="SUPPORTER")members=members.filter(p=>p.forum_moderator||p.group_moderator||responsibilities(p).length);if(!members.length)return;const g=document.createElement("div");g.className="ec-team-group";const title=document.createElement("div");title.className="ec-team-group-title";title.textContent=label;const grid=document.createElement("div");grid.className="ec-team-grid";members.forEach(p=>grid.appendChild(makePerson(p)));g.append(title,grid);panel.appendChild(g)});
}

function inferActiveRegion(regions){
  if(lastActiveRegion?.id)return lastActiveRegion;
  const eyebrow=document.querySelector('.home-page .page-heading .eyebrow');
  const text=String(eyebrow?.textContent||"").replace(/^REGION\s+/i,"").trim().toLowerCase();
  return regions.find(r=>[r.name,r.short_name,r.slug].filter(Boolean).some(v=>String(v).trim().toLowerCase()===text))||null;
}

function roleTitle(p,assignments,activeRegionId){
  const role=normalizeRole(p.role);
  if(role==="HEAD_ADMIN")return"Hauptadmin";
  if(role==="ADMIN"){
    const assigned=assignments.filter(a=>a.user_id===(p.user_id||p.id)&&a.active);
    return assigned.length&&assigned.some(a=>a.region_id===activeRegionId)?"Regional Admin":"Global Admin";
  }
  if(role==="SUPPORTER"){
    if(p.forum_moderator&&p.group_moderator)return"Forum- & Gruppenmoderation";
    if(p.forum_moderator)return"Forum-Moderation";
    if(p.group_moderator)return"Gruppen-Moderation";
    return"Support";
  }
  return"";
}

function shouldShowOnHome(p,assignments,activeRegionId){
  const role=normalizeRole(p.role),id=p.user_id||p.id;
  if(role==="HEAD_ADMIN")return true;
  if(role==="ADMIN"){
    const assigned=assignments.filter(a=>a.user_id===id&&a.active);
    return assigned.length===0||assigned.some(a=>a.region_id===activeRegionId);
  }
  if(role==="SUPPORTER"){
    if(!(p.forum_moderator||p.group_moderator||responsibilities(p).length))return false;
    if(p.home_region_id)return p.home_region_id===activeRegionId;
    const assigned=assignments.filter(a=>a.user_id===id&&a.active);
    return assigned.length?assigned.some(a=>a.region_id===activeRegionId):true;
  }
  return false;
}

function makeHomeResponsibilityCard(p,assignments,activeRegionId){
  const ident=roleIdentity(p),card=document.createElement("article");
  card.className=`ec-home-responsibility-card ec-role-${ident.key}`;card.style.setProperty("--ec-role-color",ident.color);
  const top=document.createElement("button");top.type="button";top.className="ec-home-responsibility-person";
  const avatar=document.createElement("img");avatar.className="ec-home-responsibility-avatar";avatar.src=p.avatar_url||"/community-default-avatar.png";avatar.alt="";top.appendChild(avatar);
  const copy=document.createElement("span");copy.className="ec-home-responsibility-copy";
  const line=document.createElement("span");line.className="ec-home-responsibility-name";const star=makeRoleIcon(p,"normal");if(star)line.appendChild(star);const name=document.createElement("strong");name.textContent=displayName(p);line.appendChild(name);copy.appendChild(line);
  const role=document.createElement("small");role.textContent=roleTitle(p,assignments,activeRegionId);copy.appendChild(role);top.appendChild(copy);
  top.addEventListener("click",()=>window.dispatchEvent(new CustomEvent("ec:open-profile",{detail:{profileId:p.user_id||p.id,nickname:displayName(p)}})));
  card.appendChild(top);
  const items=responsibilities(p);if(items.length){const ul=document.createElement("ul");ul.className="ec-home-responsibility-list";items.forEach(x=>{const li=document.createElement("li");li.textContent=x;ul.appendChild(li)});card.appendChild(ul)}
  return card;
}

function renderHomeResponsibilities(profiles,assignments,regions){
  const home=document.querySelector('.home-page');if(!home)return;
  const active=inferActiveRegion(regions);if(!active?.id)return;
  let section=home.querySelector('.ec-home-responsibilities');
  if(!section){section=document.createElement('section');section.className='ec-home-responsibilities panel';const heading=home.querySelector('.page-heading');if(heading)heading.insertAdjacentElement('afterend',section);else home.prepend(section)}
  section.replaceChildren();
  const head=document.createElement('div');head.className='ec-home-responsibilities-head';head.innerHTML=`<div><span class="eyebrow">ZUSTÄNDIGKEITEN</span><h2>Ansprechpartner für ${active.name}</h2><p>Dieser Bereich ist fix mit den vergebenen Rollen und Moderationsrechten gekoppelt.</p></div>`;section.appendChild(head);
  const visible=profiles.filter(p=>shouldShowOnHome(p,assignments,active.id));
  const grid=document.createElement('div');grid.className='ec-home-responsibilities-grid';visible.forEach(p=>grid.appendChild(makeHomeResponsibilityCard(p,assignments,active.id)));section.appendChild(grid);
  if(!visible.length){const empty=document.createElement('p');empty.className='ec-home-responsibilities-empty';empty.textContent='Für diese Region ist derzeit keine regionale Zuständigkeit hinterlegt.';section.appendChild(empty)}
}

function signature(ps,assignments,regions){return[ps.map(p=>[p.user_id,p.role,p.nickname,p.forum_moderator,p.group_moderator,p.home_region_id,JSON.stringify(p.admin_responsibilities||[])].join("|")).join("::"),assignments.map(a=>[a.user_id,a.region_id,a.active].join("|")).join("::"),regions.map(r=>[r.id,r.slug,r.name].join("|")).join("::"),lastActiveRegion?.id||""] .join("###")}

async function refreshTeam(){
  if(!supabase||refreshRunning||(!findHostCard()&&!document.querySelector('.home-page')))return;refreshRunning=true;
  try{
    const [contactResult,assignmentResult,regionResult,profileResult]=await Promise.all([
      supabase.rpc("community_moderation_contacts"),
      supabase.from("regional_admin_assignments").select("user_id,region_id,active").eq("active",true),
      supabase.from("regions").select("id,slug,name,short_name").eq("is_active",true),
      supabase.from("profiles").select("id,home_region_id,admin_responsibilities,head_admin_responsibilities")
    ]);
    if(contactResult.error)throw contactResult.error;
    const profileExtras=new Map((profileResult.data||[]).map(p=>[p.id,p]));
    const profiles=(contactResult.data||[]).map(p=>({...p,...(profileExtras.get(p.user_id)||{}),id:p.user_id}));
    const assignments=assignmentResult.data||[],regions=regionResult.data||[];
    const sig=signature(profiles,assignments,regions);
    if(sig!==lastSignature||!document.querySelector(".ec-team-panel")||!document.querySelector('.ec-home-responsibilities')){lastSignature=sig;renderTeam(profiles);renderHomeResponsibilities(profiles,assignments,regions)}
  }catch(e){console.error("Administration & Zuständigkeiten konnten nicht synchronisiert werden:",e)}finally{refreshRunning=false}
}

function startRealtime(){if(!supabase||realtimeStarted)return;realtimeStarted=true;const refresh=()=>{lastSignature="";refreshTeam()};supabase.channel("ec-team-role-sync-v7").on("postgres_changes",{event:"*",schema:"public",table:"profiles"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"user_permissions"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"regional_admin_assignments"},refresh).subscribe()}

window.addEventListener('ec:region-change',event=>{lastActiveRegion=event.detail||null;lastSignature="";refreshTeam()});
function boot(){refreshTeam();startRealtime();if(!pollTimer)pollTimer=setInterval(()=>{if(!document.hidden)refreshTeam()},15000)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
const observer=new MutationObserver(()=>{if((findHostCard()&&!document.querySelector(".ec-team-panel"))||(document.querySelector('.home-page')&&!document.querySelector('.ec-home-responsibilities')))refreshTeam()});observer.observe(document.documentElement,{childList:true,subtree:true});
