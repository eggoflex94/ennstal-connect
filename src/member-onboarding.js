import { supabase } from "./supabaseClient";
let shown=false;
const steps=[
 {icon:"👤",title:"Dein Profil",text:"Vervollständige dein Profil und entscheide selbst, was andere Mitglieder sehen dürfen."},
 {icon:"🔐",title:"Privatsphäre",text:"Unter „Meine Daten & Konto“ findest du Datenschutz, Datenexport und die sichere Kontolöschung."},
 {icon:"🔔",title:"Benachrichtigungen",text:"Über die Glocke bestimmst du selbst, welche Popups du für Nachrichten, Freundschaftsanfragen und Forum-Antworten möchtest."},
 {icon:"❓",title:"Hilfe & Community",text:"In „Hilfe & Community“ findest du Erklärungen zu Gruppen, Veranstaltungen, Forum, Online-Zeit, Sicherheit und Support."}
];
const el=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;};
async function finish(w){const {error}=await supabase.rpc("member_complete_onboarding");if(error){alert(error.message);return}w.remove();}
function show(){if(shown||document.querySelector(".ec-onboarding"))return;shown=true;let i=0;const w=el("div","ec-onboarding"),b=el("div","ec-onboarding-box"),progress=el("div","ec-onboarding-progress"),body=el("div","ec-onboarding-body"),actions=el("div","ec-onboarding-actions"),skip=el("button","secondary-button","Später"),next=el("button","primary-button","Weiter");const render=()=>{body.replaceChildren();const s=steps[i];body.append(el("div","ec-onboarding-icon",s.icon),el("span","eyebrow",`SCHRITT ${i+1} VON ${steps.length}`),el("h2",null,s.title),el("p",null,s.text));progress.style.setProperty("--progress",`${((i+1)/steps.length)*100}%`);next.textContent=i===steps.length-1?"Los geht’s":"Weiter";};skip.onclick=()=>w.remove();next.onclick=()=>{if(i<steps.length-1){i++;render()}else finish(w)};actions.append(skip,next);b.append(progress,body,actions);w.append(b);document.body.append(w);render();}
async function start(){const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {data:p}=await supabase.from("profiles").select("account_status").eq("id",user.id).maybeSingle();if(p?.account_status!=="ACTIVE")return;const {data,error}=await supabase.rpc("member_onboarding_status");if(!error&&!data?.[0]?.completed)setTimeout(show,900);}
void start();