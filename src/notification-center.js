import { supabase } from "./supabaseClient";

let uid=null,mounted=false,channel=null,opening=false,badgeTimer=null;
const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
const fmt=v=>{try{return new Date(v).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}catch{return""}};
const icon=t=>t==="MESSAGE"?"💬":t==="FRIEND_REQUEST"?"👥":t==="FORUM_REPLY"?"💭":"🔔";
const typeLabel=t=>t==="MESSAGE"?"Nachrichten":t==="FRIEND_REQUEST"?"Freundschaftsanfragen":t==="FORUM_REPLY"?"Antworten":"Benachrichtigungen";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const withTimeout=(promise,ms=9000,message="Zeitüberschreitung")=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)})});
const isNetworkError=e=>/failed to fetch|networkerror|network request failed|load failed|timeout|zeitüberschreitung/i.test(String(e?.message||e||""));

async function retry(task,attempts=2){
  let last;
  for(let i=0;i<attempts;i+=1){
    try{return await task()}catch(error){last=error;if(!isNetworkError(error)||i===attempts-1)throw error;await sleep(450*(i+1))}
  }
  throw last;
}

function cleanupPanels(){
  document.querySelectorAll(".ec-notification-panel").forEach((node,index)=>{if(index>0)node.remove()});
  if(!document.querySelector(".ec-notification-panel"))document.body.classList.remove("ec-notification-open");
}

function navigate(type){
  const page=type==="MESSAGE"?"messages":type==="FRIEND_REQUEST"?"requests":type==="FORUM_REPLY"?"forum":"home";
  closeCenter();
  document.body.classList.remove("ec-dock-open");
  window.dispatchEvent(new CustomEvent("ec:navigate",{detail:{page}}));
}

async function prefs(){
  try{
    const result=await retry(()=>withTimeout(supabase.rpc("member_notification_settings"),7000,"Benachrichtigungseinstellungen antworten nicht."));
    if(result.error)throw result.error;
    return result.data?.[0]||{notify_message_popup:true,notify_friend_request_popup:true,notify_forum_reply_popup:true};
  }catch{return{notify_message_popup:true,notify_friend_request_popup:true,notify_forum_reply_popup:true}}
}

async function markRead(id){
  if(!id)return;
  try{await withTimeout(supabase.rpc("member_mark_notification_read",{p_notification_id:id}),7000)}catch{}
}

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
  t.querySelector(".ec-live-toast-main").onclick=async()=>{await markRead(n.id);t.remove();navigate(n.type);scheduleBadge()};
  t.querySelector(".ec-toast-x").onclick=()=>t.remove();
  host.prepend(t);setTimeout(()=>t.remove(),9000);
}

async function refreshBadge(){
  if(!uid||!supabase)return;
  try{
    const result=await retry(()=>withTimeout(supabase.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",uid).is("read_at",null),7000,"Benachrichtigungszähler antwortet nicht."));
    if(result.error)throw result.error;
    const count=result.count||0,value=count>99?"99+":String(count);
    document.querySelectorAll(".ec-notification-count,.ec-dock-notification-badge").forEach(b=>{b.textContent=value;b.hidden=!count;b.setAttribute("aria-label",`${count} ungelesene Benachrichtigungen`)});
  }catch(error){console.warn("Benachrichtigungszähler konnte nicht aktualisiert werden:",error?.message||error)}
}
function scheduleBadge(){clearTimeout(badgeTimer);badgeTimer=setTimeout(()=>void refreshBadge(),180)}

function closeCenter(){
  document.querySelectorAll(".ec-notification-panel").forEach(node=>node.remove());
  document.body.classList.remove("ec-notification-open");
  opening=false;
}

function renderError(list,text,onRetry){
  list.replaceChildren();
  const box=el("div","ec-notification-error");
  box.append(el("p",null,text));
  const retryButton=el("button","secondary-button","Erneut versuchen");retryButton.type="button";retryButton.onclick=onRetry;
  box.append(retryButton);list.append(box);
}

async function renderList(root){
  const list=root.querySelector(".ec-notification-list");if(!list)return;
  list.textContent="Lade …";
  try{
    const result=await retry(()=>withTimeout(supabase.from("notifications").select("id,title,body,type,read_at,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(50),9000,"Benachrichtigungen antworten nicht."));
    if(result.error)throw result.error;
    const data=result.data||[];
    list.replaceChildren();
    if(!data.length){list.append(el("p","ec-notification-empty","Alles ruhig – noch keine Benachrichtigungen."));return}
    const groups=[];
    for(const n of data){const prev=groups.at(-1);if(prev&&prev.type===n.type&&!prev.read_at&&!n.read_at&&Math.abs(new Date(prev.created_at)-new Date(n.created_at))<3600000)prev.items.push(n);else groups.push({...n,items:[n]})}
    groups.forEach(g=>{const r=el("button",`ec-notification-row${g.read_at?"":" unread"}`);r.type="button";r.append(el("span","ec-notification-icon",icon(g.type)));const txt=el("span"),many=g.items.length>1;txt.append(el("strong",null,many?`${g.items.length} neue ${typeLabel(g.type)}`:(g.title||typeLabel(g.type))),el("small",null,many?"Mehrere neue Hinweise wurden zusammengefasst.":(g.body||"Neue Aktivität")),el("time",null,fmt(g.created_at)));r.append(txt);r.onclick=async()=>{r.disabled=true;await Promise.all(g.items.map(n=>markRead(n.id)));navigate(g.type);scheduleBadge()};list.append(r)});
  }catch(error){
    console.warn("Benachrichtigungen konnten nicht geladen werden:",error?.message||error);
    renderError(list,isNetworkError(error)?"Verbindung zu den Benachrichtigungen unterbrochen.":"Benachrichtigungen konnten nicht geladen werden.",()=>void renderList(root));
  }
}

async function openCenter(){
  cleanupPanels();
  if(opening)return;
  if(document.querySelector(".ec-notification-panel")){closeCenter();return}
  opening=true;
  try{
    if(!uid){await mount();if(!uid)throw new Error("Keine aktive Anmeldung gefunden.")}
    const overlay=el("div","ec-notification-panel");overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","Benachrichtigungen");
    const card=el("section","ec-notification-card");
    const head=el("div","ec-notification-head");
    const title=el("div");title.append(el("span","ec-notification-eyebrow","MEIN BEREICH"),el("strong",null,"Benachrichtigungen"));
    const actions=el("div","ec-notification-head-actions");
    const all=el("button",null,"Alle gelesen");all.type="button";all.onclick=async()=>{all.disabled=true;try{const r=await withTimeout(supabase.rpc("member_mark_all_notifications_read"),8000);if(r.error)throw r.error;await renderList(card);scheduleBadge()}catch(error){renderError(card.querySelector(".ec-notification-list"),"Alle Benachrichtigungen konnten nicht als gelesen markiert werden.",()=>void renderList(card))}finally{all.disabled=false}};
    const close=el("button","ec-notification-close","×");close.type="button";close.setAttribute("aria-label","Schließen");close.onclick=closeCenter;
    actions.append(all,close);head.append(title,actions);card.append(head);

    const settings=document.createElement("details");settings.className="ec-notification-settings";settings.innerHTML="<summary>Popup-Einstellungen</summary><div></div>";
    const box=settings.lastElementChild,pr=await prefs();
    [["Private Nachrichten","notify_message_popup"],["Freundschaftsanfragen","notify_friend_request_popup"],["Antworten auf meine Forenbeiträge","notify_forum_reply_popup"]].forEach(([label,key])=>{const l=el("label"),c=el("input");c.type="checkbox";c.checked=!!pr[key];l.append(c,document.createTextNode(label));box.append(l)});
    const save=el("button","primary-button","Speichern");save.type="button";save.onclick=async()=>{const c=[...box.querySelectorAll("input")];save.disabled=true;try{const r=await withTimeout(supabase.rpc("member_update_notification_settings",{p_message:c[0].checked,p_friend:c[1].checked,p_forum:c[2].checked}),8000);if(r.error)throw r.error;settings.open=false}catch(error){window.alert(isNetworkError(error)?"Einstellungen konnten wegen einer Verbindungsunterbrechung nicht gespeichert werden.":error.message)}finally{save.disabled=false}};box.append(save);
    card.append(settings,el("div","ec-notification-list","Lade …"));overlay.append(card);document.body.append(overlay);document.body.classList.add("ec-notification-open");
    overlay.onclick=e=>{if(e.target===overlay)closeCenter()};
    void renderList(card);
    close.focus();
  }catch(error){
    closeCenter();
    console.warn("Benachrichtigungscenter konnte nicht geöffnet werden:",error?.message||error);
  }finally{opening=false}
}

function ensureOptionalBell(){
  if(document.querySelector(".ec-regional-shell"))return;
  const nav=document.querySelector(".modern-nav,nav");if(!nav||nav.querySelector(".ec-notification-bell-wrap"))return;
  const wrap=el("div","ec-notification-bell-wrap"),btn=el("button","ec-notification-bell","🔔 Benachrichtigungen"),count=el("span","ec-notification-count","0");count.hidden=true;btn.type="button";btn.title="Benachrichtigungen";btn.onclick=e=>{e.preventDefault();e.stopPropagation();void openCenter()};wrap.append(btn,count);nav.append(wrap);
}

async function mount(){
  if(mounted||!supabase)return;
  try{
    const result=await withTimeout(supabase.auth.getUser(),7000,"Anmeldung antwortet nicht.");
    const user=result.data?.user;if(!user)return;
    uid=user.id;mounted=true;ensureOptionalBell();scheduleBadge();
    if(channel)try{await supabase.removeChannel(channel)}catch{}
    channel=supabase.channel(`ec-notification-center-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},payload=>{scheduleBadge();void popup(payload.new)}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},scheduleBadge).subscribe();
  }catch(error){console.warn("Benachrichtigungscenter konnte nicht initialisiert werden:",error?.message||error)}
}

window.addEventListener("ec:open-notifications",()=>void openCenter());
window.addEventListener("ec:region-change",()=>{ensureOptionalBell();scheduleBadge()});
window.addEventListener("ec:network-restored",()=>{scheduleBadge();if(!mounted)void mount()});
window.addEventListener("focus",scheduleBadge);
document.addEventListener("visibilitychange",()=>{if(!document.hidden){cleanupPanels();scheduleBadge()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCenter()});
const obs=new MutationObserver(()=>{clearTimeout(window.__ecNotificationDom);window.__ecNotificationDom=setTimeout(()=>{ensureOptionalBell();cleanupPanels()},120)});obs.observe(document.documentElement,{childList:true,subtree:true});
void mount();
window.addEventListener("beforeunload",()=>{if(channel)supabase.removeChannel(channel)});
