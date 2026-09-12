import { supabase } from "./supabaseClient";

let mountedSection = null;
let currentUser = null;
let profiles = [];
let messages = [];
let activePeerId = null;
let mounting = false;
let checkTimer = null;
let observer = null;
let observedRoot = null;
let observerRetry = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const getName = (profile) => profile?.nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mitglied";
const peerFor = (message) => message.sender_id === currentUser?.id ? message.receiver_id : message.sender_id;
const starFor = (profile) => {
  const role = String(profile?.role || "MEMBER").toUpperCase();
  if (["HEAD_ADMIN", "ADMIN", "GLOBAL_ADMIN", "REGIONAL_ADMIN"].includes(role)) return "/role-star-red.svg";
  if (role === "SUPPORTER") return "/supporter-star.svg";
  if (profile?.account_badge === "BUSINESS") return "/role-star-blue.svg";
  return "/role-star-member.svg";
};
const roleLabel = (profile) => {
  const role = String(profile?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN") return "Hauptadmin";
  if (role === "ADMIN" || role === "GLOBAL_ADMIN") return "Admin";
  if (role === "REGIONAL_ADMIN") return "Regional Admin";
  if (role === "SUPPORTER") return "Supporter";
  return "Mitglied";
};
const isAutomated = (message) => ["ROLE", "GROUP_INVITE"].includes(String(message?.message_type || "").toUpperCase()) || /automatisch generierte nachricht|automatisierte nachricht|rolle .* erhalten|rechte .* erhalten|moderationsrechte|regional admin|forum.?moderator|hat dich in die gruppe|punkte erhalten|profilverifizierung|profil-verifizierung|du hast soeben von/i.test(String(message?.content || ""));

function profileById(id) { return profiles.find((profile) => profile.id === id) || null; }
function profileByName(name) {
  const wanted = String(name || "").replace(/^★\s*/, "").trim().toLocaleLowerCase("de-AT");
  if (!wanted) return null;
  return profiles.find((profile) => String(profile?.nickname || "").trim().toLocaleLowerCase("de-AT") === wanted)
    || profiles.find((profile) => [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim().toLocaleLowerCase("de-AT") === wanted)
    || null;
}
function automatedActorName(message) {
  const raw = String(message?.content || "");
  const matches = [
    raw.match(/du hast soeben von\s+★?\s*([^\n(]{1,80}?)(?=\s+(?:eine\s+bestätigung|[+-]?\d+\s+punkte|die\s+rolle|das\s+recht|die\s+rechte|die\s+regionalen|moderationsrechte|forum.?moderator|eine\s+nachricht))/i),
    raw.match(/^★?\s*([^\n:]{1,80}?)\s+hat\b/i),
    raw.match(/^★?\s*([^\n:]{1,80}?)\s+bittet\b/i),
    raw.match(/von\s+★?\s*([^\n(]{1,80}?)(?=\s+(?:eine|[+-]?\d+|die|das|den|dem))/i)
  ];
  return String(matches.find((match) => match?.[1])?.[1] || "").trim();
}
function automatedActorProfile(message, peer) {
  const actorName = automatedActorName(message);
  return profileByName(actorName) || profileById(message?.sender_id) || peer || null;
}

function findMessagesSection() {
  const legacy = document.querySelector(".message-overview, .chat-box");
  if (legacy) return legacy.closest("section");
  return [...document.querySelectorAll("section")].find((node) => String(node.querySelector(".page-heading h1, h1")?.textContent || "").trim() === "Nachrichten") || null;
}

function inferLegacyPeer(section) {
  const name = String(section?.querySelector(".chat-box .member-mini strong")?.textContent || "").trim().toLowerCase();
  if (!name) return null;
  return profiles.find((profile) => getName(profile).trim().toLowerCase() === name)?.id || null;
}

async function loadData() {
  const [{ data: auth }, { data: people, error: peopleError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("id,nickname,first_name,last_name,avatar_url,role,account_badge")
  ]);
  if (peopleError) throw peopleError;
  currentUser = auth?.user || null;
  profiles = people || [];
  if (!currentUser) return;
  const { data, error } = await supabase.from("messages").select("id,sender_id,receiver_id,content,is_read,created_at,message_type").or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).order("created_at", { ascending: true });
  if (error) throw error;
  messages = data || [];
}

function conversationRows() {
  const map = new Map();
  for (const message of messages) {
    const peerId = peerFor(message);
    if (!peerId) continue;
    const existing = map.get(peerId) || { peerId, latest: message, unread: 0 };
    if (new Date(message.created_at).getTime() >= new Date(existing.latest.created_at).getTime()) existing.latest = message;
    if (message.receiver_id === currentUser.id && !message.is_read) existing.unread += 1;
    map.set(peerId, existing);
  }
  return [...map.values()].sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
}

function formatStamp(value, full = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return full ? date.toLocaleString("de-AT") : date.toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderOverview(shell) {
  const rows = conversationRows();
  shell.innerHTML = `<div class="ec-chat-modern-toolbar"><div><strong>Unterhaltungen</strong><small>${rows.length} ${rows.length === 1 ? "Chat" : "Chats"} · neueste Unterhaltung zuerst</small></div></div><div class="ec-chat-modern-list"></div>`;
  const list = shell.querySelector(".ec-chat-modern-list");
  if (!rows.length) { list.innerHTML = `<div class="ec-chat-modern-empty">Noch keine privaten Nachrichten.</div>`; return; }
  rows.forEach((row) => {
    const peer = profileById(row.peerId);
    if (!peer) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ec-chat-modern-conversation";
    button.innerHTML = `<img src="${esc(peer.avatar_url || "/community-default-avatar.png")}" alt=""><span class="ec-chat-modern-conversation-copy"><strong>${esc(getName(peer))}</strong><small>${esc(row.latest.content || "")}</small></span><span class="ec-chat-modern-conversation-meta"><time>${esc(formatStamp(row.latest.created_at))}</time>${row.unread ? `<span class="ec-chat-modern-unread">${row.unread}</span>` : ""}</span>`;
    button.addEventListener("click", () => void openThread(row.peerId));
    list.append(button);
  });
}

function automatedHeader(message, peer) {
  const sender = automatedActorProfile(message, peer);
  const invite = String(message?.message_type || "").toUpperCase() === "GROUP_INVITE";
  return `<div class="ec-chat-modern-auto-head"><span class="ec-chat-modern-auto-label">${invite ? "GRUPPENEINLADUNG" : "AUTOMATISCHE NACHRICHT"}</span><span class="ec-chat-modern-auto-actor"><img src="${esc(starFor(sender))}" alt="Rollenstern"><strong>${esc(getName(sender))}</strong></span></div>`;
}

function automatedMessageContent(message, peer) {
  const raw = String(message?.content || "");
  const sender = automatedActorProfile(message, peer);
  const senderName = getName(sender);
  const actorFromText = automatedActorName(message);
  const aliases = [actorFromText, sender?.nickname, [sender?.first_name, sender?.last_name].filter(Boolean).join(" "), senderName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const star = `<img class="ec-chat-inline-role-star" src="${esc(starFor(sender))}" alt="" aria-hidden="true">`;

  for (const alias of aliases) {
    const index = raw.toLocaleLowerCase("de-AT").indexOf(alias.toLocaleLowerCase("de-AT"));
    if (index < 0) continue;
    const before = raw.slice(0, index);
    const actor = raw.slice(index, index + alias.length).replace(/^★\s*/, "");
    const beforeWithoutLegacyStar = before.replace(/★\s*$/, "");
    const after = raw.slice(index + alias.length);
    return `<p>${esc(beforeWithoutLegacyStar)}<span class="ec-chat-inline-role-identity">${star}<strong>${esc(actor)}</strong></span>${esc(after)}</p>`;
  }

  return `<p><span class="ec-chat-inline-role-identity">${star}<strong>${esc(senderName)}</strong></span> ${esc(raw)}</p>`;
}

function linkifyGroupInvite(text) {
  const raw = String(text || "");
  const match = raw.match(/https:\/\/ennstal-connect\.com\/\?group_invite=[0-9a-f-]+/i);
  if (!match) return `<p>${esc(raw)}</p>`;
  const [url] = match;
  const parts = raw.split(url);
  return `<p>${esc(parts[0])}</p><a class="ec-chat-invite-link" href="${esc(url)}">Einladung öffnen</a>${parts[1] ? `<p>${esc(parts[1])}</p>` : ""}`;
}

async function openThread(peerId) {
  activePeerId = peerId;
  const shell = mountedSection?.querySelector(".ec-chat-modern-shell");
  if (!shell || !currentUser) return;
  const peer = profileById(peerId);
  if (!peer) return;
  const { data, error } = await supabase.from("messages").select("id,sender_id,receiver_id,content,is_read,created_at,message_type").or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUser.id})`).order("created_at", { ascending: true });
  if (error) return alert(`Chat konnte nicht geladen werden: ${error.message}`);
  await supabase.rpc("mark_messages_read", { from_user: peerId });
  const thread = data || [];
  shell.innerHTML = `<div class="ec-chat-modern-thread"><header class="ec-chat-modern-thread-header"><button type="button" class="ec-chat-modern-back">← Chats</button><div class="ec-chat-modern-thread-person"><img src="${esc(peer.avatar_url || "/community-default-avatar.png")}" alt=""><span><strong>${esc(getName(peer))}</strong><small>${esc(roleLabel(peer))}</small></span></div></header><div class="ec-chat-modern-messages"></div><form class="ec-chat-modern-form"><textarea name="message" placeholder="Nachricht schreiben …" required></textarea><button class="ec-chat-modern-send" type="submit">Senden</button></form></div>`;
  shell.querySelector(".ec-chat-modern-back").onclick = async () => { activePeerId = null; await loadData(); renderOverview(shell); };
  const list = shell.querySelector(".ec-chat-modern-messages");
  thread.forEach((message) => {
    const bubble = document.createElement("article");
    const automatic = isAutomated(message);
    const invite = String(message.message_type || "").toUpperCase() === "GROUP_INVITE";
    bubble.className = `ec-chat-modern-bubble${message.sender_id === currentUser.id ? " mine" : ""}${automatic ? " auto-role" : ""}${invite ? " group-invite" : ""}`;
    const body = invite ? linkifyGroupInvite(message.content) : automatic ? automatedMessageContent(message, peer) : `<p>${esc(message.content || "")}</p>`;
    bubble.innerHTML = `${automatic ? automatedHeader(message, peer) : ""}${body}<time>${esc(formatStamp(message.created_at, true))}</time><button type="button" class="ec-chat-modern-delete" aria-label="Nachricht löschen">×</button>`;
    bubble.querySelector(".ec-chat-modern-delete").onclick = async () => {
      if (!confirm("Diese Nachricht für beide Gesprächspartner endgültig löschen?")) return;
      const { error: deleteError } = await supabase.rpc("delete_private_message", { p_message_id: message.id });
      if (deleteError) return alert(deleteError.message);
      bubble.remove();
    };
    list.append(bubble);
  });
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  const form = shell.querySelector(".ec-chat-modern-form");
  const send = form.querySelector(".ec-chat-modern-send");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const textarea = form.elements.message;
    const text = String(textarea.value || "").trim();
    if (!text || send.disabled) return;
    send.disabled = true;
    const { error: sendError } = await supabase.rpc("send_private_message", { target_user: peerId, message_text: text });
    if (sendError) { send.disabled = false; return alert(`Nachricht konnte nicht gesendet werden: ${sendError.message}`); }
    textarea.value = "";
    await openThread(peerId);
  };
}

async function mountIfNeeded() {
  if (mounting) return;
  const section = findMessagesSection();
  if (!section) { mountedSection = null; activePeerId = null; return; }
  const shellExists = section.querySelector(".ec-chat-modern-shell");
  const sameSection = mountedSection === section && shellExists;
  if (sameSection) {
    const legacyPeer = inferLegacyPeer(section);
    if (legacyPeer && legacyPeer !== activePeerId) void openThread(legacyPeer);
    return;
  }
  mounting = true;
  try {
    await loadData();
    mountedSection = section;
    section.classList.add("ec-chat-modern-host");
    let shell = section.querySelector(".ec-chat-modern-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "ec-chat-modern-shell";
      section.append(shell);
    }
    const legacyPeer = inferLegacyPeer(section);
    activePeerId = legacyPeer || null;
    if (activePeerId) await openThread(activePeerId); else renderOverview(shell);
  } catch (error) {
    console.warn("Chat konnte nicht modernisiert werden:", error?.message || error);
  } finally { mounting = false; }
}

function scheduleCheck(delay = 60) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => void mountIfNeeded(), delay);
}

function desiredObserverRoot() {
  return document.querySelector('.content-root') || document.querySelector('.modern-main');
}

function attachObserver() {
  const root = desiredObserverRoot();
  if (!root) {
    if (!observerRetry) observerRetry = window.setTimeout(() => { observerRetry = null; attachObserver(); }, 250);
    return;
  }
  if (observer && observedRoot === root) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    const relevant = records.some((record) => {
      if (record.target?.closest?.('.ec-chat-modern-shell')) return false;
      return [...record.addedNodes, ...record.removedNodes].some((node) =>
        node?.nodeType === Node.ELEMENT_NODE &&
        (node.matches?.('.message-overview,.chat-box,.ec-chat-modern-host') || node.querySelector?.('.message-overview,.chat-box'))
      );
    });
    if (relevant) scheduleCheck(80);
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh(delay = 20) {
  attachObserver();
  scheduleCheck(delay);
}

window.addEventListener("ec:navigate", () => refresh(20));
window.addEventListener("popstate", () => refresh(20));
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(20); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(0), { once: true });
else refresh(0);

export {};
