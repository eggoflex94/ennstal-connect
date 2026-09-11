import { supabase } from "./supabaseClient";

let profiles = [];
let assignments = [];
let syncTimer = null;

const automatedPatterns = [
  /hat deine Freundschaftsanfrage angenommen/i,
  /ihr seid jetzt befreundet/i,
  /profil(?:-| )verifizierung/i,
  /profil wurde verifiziert/i,
  /hat dein profil verifiziert/i,
  /verifizierung.*freigegeben/i,
  /verifizierung.*nicht freigegeben/i,
  /bittet dich, dein profil/i,
  /du hast soeben von/i,
  /automatisch generierte nachricht/i,
  /rolle .* erhalten/i,
  /rechte .* erhalten/i,
  /moderationsrechte/i,
  /regional admin/i,
  /forum.?moderator/i
];

function normalize(value){ return String(value || "").trim(); }
function roleTheme(profile){
  const role = normalize(profile?.role).toUpperCase();
  if(role === "HEAD_ADMIN" || role === "ADMIN") return "admin";
  if(role === "SUPPORTER" || assignments.some(a => a.user_id === profile?.id && a.active)) return "supporter";
  if(profile?.account_badge === "BUSINESS") return "business";
  return "member";
}
function roleLabel(profile){
  const role = normalize(profile?.role).toUpperCase();
  if(role === "HEAD_ADMIN") return "Hauptadmin";
  if(role === "ADMIN") return "Admin";
  if(role === "SUPPORTER") return "Supporter";
  if(profile?.account_badge === "BUSINESS") return "Unternehmen";
  if(assignments.some(a => a.user_id === profile?.id && a.active)) return "Regional";
  return "Mitglied";
}
function starFor(profile){
  const theme = roleTheme(profile);
  return theme === "admin" ? "/role-star-red.svg" : theme === "supporter" ? "/supporter-star.svg" : theme === "business" ? "/role-star-blue.svg" : "/role-star-member.svg";
}

async function loadPeople(){
  if(!supabase) return;
  try{
    const [{data: ps},{data: ra}] = await Promise.all([
      supabase.from("profiles").select("id,nickname,first_name,last_name,role,account_badge"),
      supabase.from("regional_admin_assignments").select("user_id,active").eq("active",true)
    ]);
    profiles = ps || [];
    assignments = ra || [];
  }catch(error){
    console.warn("Rollensterne für automatische Nachrichten konnten nicht vorgeladen werden:", error);
  }
}

function profileForName(name){
  const wanted = normalize(name).replace(/^★\s*/, "").toLocaleLowerCase("de-AT");
  return profiles.find(p => normalize(p.nickname).toLocaleLowerCase("de-AT") === wanted)
    || profiles.find(p => normalize([p.first_name,p.last_name].filter(Boolean).join(" ")).toLocaleLowerCase("de-AT") === wanted)
    || null;
}

function extractActor(raw){
  const legacy = raw.match(/^([^\n:]{1,60}?)\s+hat\b/i) || raw.match(/^([^\n:]{1,60}?)\s+bittet\b/i);
  if(legacy?.[1]) return normalize(legacy[1]);
  const roleMessage = raw.match(/du hast soeben von\s+★?\s*([^\n(]{1,60}?)(?:\s*\(|\s+die\s+rolle|\s+das\s+recht|\s+die\s+rechte|\s+die\s+regionalen)/i);
  return normalize(roleMessage?.[1]);
}

function findMessageNodes(){
  const selectors = [
    ".message-bubble",
    ".chat-message",
    ".message-item",
    ".messages-thread .message",
    ".messages-thread [class*='bubble']",
    ".chat-thread [class*='message']",
    ".conversation [class*='message']"
  ];
  return [...new Set(selectors.flatMap(sel => [...document.querySelectorAll(sel)]))];
}

function decorate(node){
  if(node.dataset.ecAutomatedModern === "1") return;
  const raw = normalize(node.textContent);
  if(!raw || !automatedPatterns.some(pattern => pattern.test(raw))) return;

  const name = extractActor(raw);
  const profile = name ? profileForName(name) : null;

  node.dataset.ecAutomatedModern = "1";
  node.classList.add("ec-automated-message-modern");

  let content = node.querySelector(".ec-automated-content");
  if(content) return;

  const originalNodes = [...node.childNodes];
  content = document.createElement("span");
  content.className = "ec-automated-content";
  originalNodes.forEach(child => content.append(child));
  node.append(content);

  const header = document.createElement("span");
  header.className = "ec-automated-message-header";
  const badge = document.createElement("span");
  badge.className = "ec-automated-label";
  badge.textContent = "AUTOMATISCHE NACHRICHT";
  header.append(badge);

  if(name){
    const identity = document.createElement("span");
    identity.className = "ec-automated-identity";
    const star = document.createElement("img");
    star.className = "ec-automated-role-star";
    star.src = starFor(profile || {});
    star.alt = `${roleLabel(profile || {})} Rollenstern`;
    const text = document.createElement("span");
    text.className = "ec-automated-identity-copy";
    const nick = document.createElement("strong");
    nick.textContent = profile?.nickname || name;
    const role = document.createElement("small");
    role.textContent = roleLabel(profile || {});
    text.append(nick, role);
    identity.append(star, text);
    header.append(identity);
  }

  node.prepend(header);
}

function sync(){ findMessageNodes().forEach(decorate); }
function boot(){
  void loadPeople().finally(sync);
  const observer = new MutationObserver(() => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 60);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("ec:navigate",() => setTimeout(sync,80));
  window.addEventListener("ec:region-change",() => void loadPeople().finally(sync));
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();