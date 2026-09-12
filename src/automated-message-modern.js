import { supabase } from "./supabaseClient";

let profiles = [];
let currentUserId = "";
let syncTimer = null;
let observer = null;
let observedRoot = null;

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
  /automatisierte nachricht/i,
  /rolle .* erhalten/i,
  /rechte .* erhalten/i,
  /moderationsrechte/i,
  /regional admin/i,
  /forum.?moderator/i,
  /punkte erhalten/i
];

function normalize(value){ return String(value || "").trim(); }
function roleTheme(profile){
  const role = normalize(profile?.role).toUpperCase();
  if(["HEAD_ADMIN","ADMIN","GLOBAL_ADMIN","REGIONAL_ADMIN"].includes(role)) return "admin";
  if(role === "SUPPORTER") return "supporter";
  if(profile?.account_badge === "BUSINESS") return "business";
  return "member";
}
function starFor(profile){
  const theme = roleTheme(profile);
  return theme === "admin" ? "/role-star-red.svg"
    : theme === "supporter" ? "/supporter-star.svg"
    : theme === "business" ? "/role-star-blue.svg"
    : null;
}

async function loadPeople(){
  if(!supabase) return;
  try{
    const [{ data: authData }, { data, error }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("id,nickname,first_name,last_name,role,account_badge")
    ]);
    if(error) throw error;
    currentUserId = authData?.user?.id || "";
    profiles = data || [];
  }catch(error){
    console.warn("Rollensterne für automatische Nachrichten konnten nicht vorgeladen werden:", error);
  }
}

function profileForName(name){
  const wanted = normalize(name).replace(/^★\s*/, "").toLocaleLowerCase("de-AT");
  if(!wanted) return null;
  return profiles.find(p => normalize(p.nickname).toLocaleLowerCase("de-AT") === wanted)
    || profiles.find(p => normalize([p.first_name,p.last_name].filter(Boolean).join(" ")).toLocaleLowerCase("de-AT") === wanted)
    || null;
}

function extractActor(raw){
  const legacy = raw.match(/^([^\n:]{1,60}?)\s+hat\b/i) || raw.match(/^([^\n:]{1,60}?)\s+bittet\b/i);
  if(legacy?.[1]) return normalize(legacy[1]);

  const fromMessage = raw.match(
    /du hast soeben von\s+★?\s*([^\n(]{1,60}?)(?=\s+(?:eine\s+bestätigung|[+-]?\d+\s+punkte|die\s+rolle|das\s+recht|die\s+rechte|die\s+regionalen|moderationsrechte|forum.?moderator))/i
  );
  if(fromMessage?.[1]) return normalize(fromMessage[1]);

  return "";
}

function profileFromChatDirection(node){
  if(node.classList.contains("mine") && currentUserId){
    return profiles.find(profile => profile.id === currentUserId) || null;
  }

  const chatBox = node.closest(".chat-box");
  const peerName = normalize(chatBox?.querySelector(".chat-header .member-mini strong")?.textContent);
  return peerName ? profileForName(peerName) : null;
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

  const extractedName = extractActor(raw);
  const extractedProfile = extractedName ? profileForName(extractedName) : null;
  const profile = extractedProfile || profileFromChatDirection(node);
  const name = profile?.nickname || extractedName || normalize([profile?.first_name, profile?.last_name].filter(Boolean).join(" "));

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
    const text = document.createElement("span");
    text.className = "ec-automated-identity-copy";
    const nick = document.createElement("strong");
    nick.textContent = name;
    const starSrc = profile ? starFor(profile) : null;
    if(starSrc){
      const star = document.createElement("img");
      star.className = "ec-automated-role-star";
      star.src = starSrc;
      star.alt = "";
      star.setAttribute("aria-hidden", "true");
      identity.append(star);
    }
    text.append(nick);
    identity.append(text);
    header.append(identity);
  }

  node.prepend(header);
}

function sync(){ findMessageNodes().forEach(decorate); }
function observerRoot(){ return document.querySelector(".content-root") || document.querySelector(".modern-main"); }
function ensureObserver(){
  const root = observerRoot();
  if(!root || root === observedRoot) return;
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
      node?.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(".chat-message,.message-bubble,.message-item,.chat-box") || node.querySelector?.(".chat-message,.message-bubble,.message-item,.chat-box"))
    ));
    if(!relevant) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 60);
  });
  observer.observe(root,{childList:true,subtree:true});
  observedRoot = root;
}
function refresh(){ ensureObserver(); sync(); }
function boot(){
  void loadPeople().finally(refresh);
  window.addEventListener("ec:navigate",() => setTimeout(refresh,80));
  window.addEventListener("ec:region-change",() => void loadPeople().finally(refresh));
  window.addEventListener("focus",refresh);
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();