import { supabase } from "./supabaseClient";

let mountedRoot = null;
let currentUser = null;
let profiles = [];
let messages = [];
let activePeerId = null;
let syncing = false;
let observer = null;
let refreshTimer = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const getName = (profile) => profile?.nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mitglied";
const peerFor = (message) => message.sender_id === currentUser?.id ? message.receiver_id : message.sender_id;
const starFor = (profile) => {
  const role = String(profile?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN" || role === "ADMIN") return "/role-star-red.svg";
  if (role === "SUPPORTER") return "/supporter-star.svg";
  if (profile?.account_badge === "BUSINESS") return "/role-star-blue.svg";
  return "/role-star-member.svg";
};
const roleLabel = (profile) => {
  const role = String(profile?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN") return "Hauptadmin";
  if (role === "ADMIN") return "Admin";
  if (role === "SUPPORTER") return "Supporter";
  return "Mitglied";
};
const isAutomatedRoleMessage = (message) => String(message?.message_type || "").toUpperCase() === "ROLE" || /automatisch generierte nachricht|rolle .* erhalten|rechte .* erhalten|moderationsrechte|regional admin|forum.?moderator/i.test(String(message?.content || ""));

function profileById(id) { return profiles.find((profile) => profile.id === id) || null; }

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

async function loadOverviewData() {
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
  for (const row of rows) {
    const peer = profileById(row.peerId);
    if (!peer) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ec-chat-modern-conversation";
    button.innerHTML = `<img src="${esc(peer.avatar_url || "/community-default-avatar.png")}" alt=""><span class="ec-chat-modern-conversation-copy"><strong>${esc(getName(peer))}</strong><small>${esc(row.latest.content || "")}</small></span><span class="ec-chat-modern-conversation-meta"><time>${esc(formatStamp(row.latest.created_at))}</time>${row.unread ? `<span class="ec-chat-modern-unread">${row.unread}</span>` : ""}</span>`;
    button.onclick = () => openThread(row.peerId);
    list.append(button);
  }
}

function automatedHeader(message, peer) {
  const sender = profileById(message.sender_id) || peer;
  return `<div class="ec-chat-modern-auto-head"><span class="ec-chat-modern-auto-label">AUTOMATISCHE NACHRICHT</span><span class="ec-chat-modern-auto-actor"><img src="${esc(starFor(sender))}" alt="Rollenstern"><strong>${esc(getName(sender))}</strong></span></div>`;
}

async function openThread(peerId) {
  activePeerId = peerId;
  const shell = document.querySelector(".ec-chat-modern-shell");
  if (!shell || !currentUser) return;
  const peer = profileById(peerId);
  if (!peer) return;
  const { data, error } = await supabase.from("messages").select("id,sender_id,receiver_id,content,is_read,created_at,message_type").or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${currentUser.id})`).order("created_at", { ascending: true });
  if (error) { alert(`Chat konnte nicht geladen werden: ${error.message}`); return; }
  messages = [...messages.filter((message) => peerFor(message) !== peerId), ...(data || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  await supabase.rpc("mark_messages_read", { from_user: peerId });
  shell.innerHTML = `<div class="ec-chat-modern-thread"><header class="ec-chat-modern-thread-header"><button type="button" class="ec-chat-modern-back">← Chats</button><div class="ec-chat-modern-thread-person"><img src="${esc(peer.avatar_url || "/community-default-avatar.png")}" alt=""><span><strong>${esc(getName(peer))}</strong><small>${esc(roleLabel(peer))}</small></span></div></header><div class="ec-chat-modern-messages"></div><form class="ec-chat-modern-form"><textarea name="message" placeholder="Nachricht schreiben …" required></textarea><button class="ec-chat-modern-send" type="submit">Senden</button></form></div>`;
  shell.querySelector(".ec-chat-modern-back").onclick = async () => { activePeerId = null; await loadOverviewData(); renderOverview(shell); };
  const list = shell.querySelector(".ec-chat-modern-messages");
  for (const message of (data || [])) {
    const bubble = document.createElement("article");
    const automatic = isAutomatedRoleMessage(message);
    bubble.className = `ec-chat-modern-bubble${message.sender_id === currentUser.id ? " mine" : ""}${automatic ? " auto-role" : ""}`;
    bubble.innerHTML = `${automatic ? automatedHeader(message, peer) : ""}<p>${esc(message.content || "")}</p><time>${esc(formatStamp(message.created_at, true))}</time><button type="button" class="ec-chat-modern-delete" aria-label="Nachricht löschen">×</button>`;
    bubble.querySelector(".ec-chat-modern-delete").onclick = async () => {
      if (!confirm("Diese Nachricht für beide Gesprächspartner endgültig löschen?")) return;
      const { error: deleteError } = await supabase.rpc("delete_private_message", { p_message_id: message.id });
      if (deleteError) return alert(deleteError.message);
      bubble.remove(); messages = messages.filter((item) => item.id !== message.id);
    };
    list.append(bubble);
  }
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  const form = shell.querySelector(".ec-chat-modern-form");
  const send = form.querySelector(".ec-chat-modern-send");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const textarea = form.elements.message; const text = String(textarea.value || "").trim(); if (!text) return;
    send.disabled = true;
    const { error: sendError } = await supabase.rpc("send_private_message", { target_user: peerId, message_text: text });
    send.disabled = false;
    if (sendError) return alert(`Nachricht konnte nicht gesendet werden: ${sendError.message}`);
    textarea.value = ""; await openThread(peerId);
  };
}

async function mountMessages() {
  if (syncing) return;
  const section = findMessagesSection();
  if (!section) { mountedRoot = null; return; }
  syncing = true;
  try {
    await loadOverviewData();
    const legacyPeer = inferLegacyPeer(section);
    if (legacyPeer && (!activePeerId || mountedRoot !== section)) activePeerId = legacyPeer;
    mountedRoot = section;
    section.classList.add("ec-chat-modern-host");
    let shell = section.querySelector(".ec-chat-modern-shell");
    if (!shell) { shell = document.createElement("div"); shell.className = "ec-chat-modern-shell"; section.append(shell); }
    if (activePeerId) await openThread(activePeerId); else renderOverview(shell);
  } catch (error) {
    console.warn("Chat konnte nicht modernisiert werden:", error?.message || error);
  } finally { syncing = false; }
}

function scheduleMount() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void mountMessages(), 40); }
function boot() {
  observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("ec:navigate", scheduleMount);
  window.addEventListener("popstate", scheduleMount);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleMount(); });
  document.addEventListener("click", (event) => { if (event.target.closest("button,a")) setTimeout(scheduleMount, 0); }, true);
  scheduleMount();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();

export {};
