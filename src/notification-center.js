import { supabase } from "./supabaseClient";

let uid=null,mounted=false,channel=null,opening=false;
const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
const fmt=v=>{try{return new Date(v).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}catch{return""}};
const icon=t=>t==="MESSAGE"?"💬":t==="FRIEND_REQUEST"?"👥":t==="FORUM_REPLY"?"💭":"🔔";
const typeLabel=t=>t==="MESSAGE"?"Nachrichten":t==="FRIEND_REQUEST"?"Freundschaftsanfragen":t==="FORUM_REPLY"?"Antworten":"Benachrichtigungen";

function navigate(type){
  const page=type==="MESSAGE"?"messages":type==="FRIEND_REQUEST"?"requests":type==="FORUM_REPLY"?"forum":"home";
  document.querySelector(".ec-notification-panel")?.remove();
  document.body.classList.remove("ec-notification-open","ec-dock-open");
  window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page}}));
}

async function prefs(){
  try{const {data,error}=await supabase.rpc("member_notification_settings");if(error)throw error;return data?.[0]||{notify_message_popup:true,notify_friend_request_popup:true,notify_forum_reply_popup:true}}
  catch{return{notify_message_popup:true,notify_friend_request_popup:true,notify_forum_reply_popup:true}}
}

async function markRead(id){if(!id)return;try{await supabase.rpc("member_mark_notification_read",{p_notification_id:id})}catch{}}

async function popup(n){
  const p=await prefs();
  const allowed=n.type==="MESSAGE"?p.notify_message_popup:n.type==="FRIEND_REQUEST"?p.notify_friend_request_popup:n.type==="FORUM_REPLY"?p.notify_forum_reply_popup:true;
  if(!allowed)return;
  let host=document.querySelector(".ec-toast-host");
  if(!host){host=el("div","ec-toast-host");host.setAttribute("aria-live","polite");document.body.append(host)}
  const existing=host.querySelector(`[data-type="${CSS.escape(String(n.type||"GENERAL"))}"]`);
  if(existing){const c=Number(existing.dataset.count||1)+1;existing.dataset.count=String(c);existing.querySelector("strong").textContent=`${c} neue ${typeLabel(n.type)}`;existing.querySelector("small").textContent=n.body||n.title||"Neue Aktivität";return}
  const t=el("div","ec-live-toast");t.dataset.type=n.type||"GENERAL";t.dataset.count="1";t.setAttribute("role","status");
  t.innerHTML=`<button type="button" class="ec-live-toast-main"><span class="ec-toast-icon">${icon(n.type)}</span><span><strong></strong><small></small></span></button><button type="button" class="ec-toast-x" aria-label="Schließen">×</button>`;
  t.querySelector("strong").textContent=n.title||typeLabel(n.type);
  t.querySelector("small").textContent=n.body||"Neue Aktivität";
  t.querySelector(".ec-live-toast-main").onclick=async()=>{await markRead(n.id);t.remove();navigate(n.type);await refreshBadge()};
  t.querySelector(".ec-toast-x").onclick=()=>t.remove();
  host.prepend(t);setTimeout(()=>t.remove(),9000);
}

async function refreshBadge(){
  if(!uid)return;
  try{
    const {count,error}=await supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",uid).is("read_at",null);
    if(error)throw error;
    const value=count>99?"99+":String(count||0);
    document.querySelectorAll(".ec-notification-count,.ec-dock-notification-badge").forEach(b=>{b.textContent=value;b.hidden=!count;b.setAttribute("aria-label",`${count||0} ungelesene Benachrichtigungen`)});
  }catch(error){console.warn("Benachrichtigungszähler konnte nicht aktualisiert werden:",error)}
}

function closeCenter(){document.querySelector(".ec-notification-panel")?.remove();document.body.classList.remove("ec-notification-open")}

async function openCenter(){
  if(opening)return;
  if(!uid){await mount();if(!uid)return}
  const existing=document.querySelector(".ec-notification-panel");if(existing){closeCenter();return}
  opening=true;
  try{
    const overlay=el("div","ec-notification-panel");overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Benachrichtigungen");
    const card=el("section","ec-notification-card");
    const head=el("div","ec-notification-head");
    const title=el("div");title.append(el("span","ec-notification-eyebrow","MEIN BEREICH"),el("strong",null,"Benachrichtigungen"));
    const actions=el("div","ec-notification-head-actions");
    const all=el("button",null,"Alle gelesen");all.type="button";all.onclick=async()=>{await supabase.rpc("member_mark_all_notifications_read");await renderList(card);await refreshBadge()};
    const close=el("button","ec-notification-close","×");close.type="button";close.setAttribute("aria-label","Schließen");close.onclick=closeCenter;
    actions.append(all,close);head.append(title,actions);card.append(head);

    const settings=document.createElement("details");settings.className="ec-notification-settings";settings.innerHTML="<summary>Popup-Einstellungen</summary><div></div>";
    const box=settings.lastElementChild,pr=await prefs();
    [["Private Nachrichten","notify_message_popup"],["Freundschaftsanfragen","notify_friend_request_popup"],["Antworten auf meine Forenbeiträge","notify_forum_reply_popup"]].forEach(([label,key])=>{const l=el("label"),c=el("input");c.type="checkbox";c.checked=!!pr[key];l.append(c,document.createTextNode(label));box.append(l)});
    const save=el("button","primary-button","Speichern");save.type="button";save.onclick=async()=>{const c=[...box.querySelectorAll("input")];save.disabled=true;const {error}=await supabase.rpc("member_update_notification_settings",{p_message:c[0].checked,p_friend:c[1].checked,p_forum:c[2].checked});save.disabled=false;if(error)alert(error.message);else settings.open=false};box.append(save);
    card.append(settings,el("div","ec-notification-list","Lade …"));overlay.append(card);document.body.append(overlay);document.body.classList.add("ec-notification-open");
    overlay.onclick=e=>{if(e.target===overlay)closeCenter()};
    await renderList(card);close.focus();
  }finally{opening=false}
}

async function renderList(root){
  const list=root.querySelector(".ec-notification-list");if(!list)return;list.textContent="Lade …";
  const {data,error}=await supabase.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(50);
  list.replaceChildren();
  if(error){list.textContent="Benachrichtigungen konnten nicht geladen werden. Bitte später erneut versuchen.";return}
  if(!data?.length){list.append(el("p","ec-notification-empty","Alles ruhig – noch keine Benachrichtigungen."));return}
  const groups=[];
  for(const n of data){const prev=groups.at(-1);if(prev&&prev.type===n.type&&!prev.read_at&&!n.read_at&&Math.abs(new Date(prev.created_at)-new Date(n.created_at))<3600000)prev.items.push(n);else groups.push({...n,items:[n]})}
  groups.forEach(g=>{const r=el("button",`ec-notification-row${g.read_at?"":" unread"}`);r.type="button";r.append(el("span","ec-notification-icon",icon(g.type)));const txt=el("span"),many=g.items.length>1;txt.append(el("strong",null,many?`${g.items.length} neue ${typeLabel(g.type)}`:(g.title||typeLabel(g.type))),el("small",null,many?"Mehrere neue Hinweise wurden zusammengefasst.":(g.body||"Neue Aktivität")),el("time",null,fmt(g.created_at)));r.append(txt);r.onclick=async()=>{await Promise.all(g.items.map(n=>markRead(n.id)));navigate(g.type);await refreshBadge()};list.append(r)})
}

function ensureOptionalBell(){
  if(document.querySelector(".ec-regional-shell"))return;
  const nav=document.querySelector(".modern-nav,nav");if(!nav||nav.querySelector(".ec-notification-bell-wrap"))return;
  const wrap=el("div","ec-notification-bell-wrap"),btn=el("button","ec-notification-bell","🔔 Benachrichtigungen"),count=el("span","ec-notification-count","0");count.hidden=true;btn.type="button";btn.title="Benachrichtigungen";btn.onclick=e=>{e.stopPropagation();void openCenter()};wrap.append(btn,count);nav.append(wrap);
}

async function mount(){
  if(mounted||!supabase)return;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  uid=user.id;mounted=true;ensureOptionalBell();await refreshBadge();
  channel=supabase.channel(`ec-notification-center-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},payload=>{void refreshBadge();void popup(payload.new)}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},()=>void refreshBadge()).subscribe();
}

window.addEventListener("ec:open-notifications",()=>void openCenter());
window.addEventListener("ec:region-change",()=>{ensureOptionalBell();void refreshBadge()});
window.addEventListener("focus",()=>void refreshBadge());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refreshBadge()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCenter()});
const obs=new MutationObserver(()=>{ensureOptionalBell();if(uid)void refreshBadge()});obs.observe(document.documentElement,{childList:true,subtree:true});
void mount();
window.addEventListener("beforeunload",()=>{if(channel)supabase.removeChannel(channel)});
