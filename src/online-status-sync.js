import { supabase } from "./supabaseClient";

const FIVE_MINUTES = 5 * 60 * 1000;
const CACHE_TTL_MS = 20_000;
let refreshRunning = false;
let refreshQueued = false;
let lastLoadedAt = 0;
let memberCacheById = new Map();
let memberCacheByNickname = new Map();
let refreshTimer = null;

const parseRows = (rows) => (rows || []).map((row) => typeof row === "string" ? JSON.parse(row) : row);
const isOnline = (member) => Boolean(member?.is_online && member?.last_active_at && Date.now() - new Date(member.last_active_at).getTime() < FIVE_MINUTES);

function updateCard(card, member) {
  if (!card || !member) return;
  let status = card.querySelector(":scope > .member-status");
  const avatarWrap = card.querySelector(".ec-member-avatar-wrap");
  let avatarPresence = avatarWrap?.querySelector(".ec-avatar-presence");

  if (member.hide_online_status) {
    status?.remove();
    avatarPresence?.remove();
    return;
  }

  const online = isOnline(member);
  const onlineLabel = String(member.presence_device || "").toUpperCase() === "MOBILE" ? "Mobil online" : "Online";

  if (!avatarPresence && avatarWrap) {
    avatarPresence = document.createElement("span");
    avatarPresence.className = "ec-avatar-presence";
    avatarPresence.setAttribute("aria-hidden", "true");
    avatarWrap.appendChild(avatarPresence);
  }
  avatarPresence?.classList.toggle("online", online);
  avatarPresence?.classList.toggle("offline", !online);

  if (!status) {
    status = document.createElement("div");
    card.appendChild(status);
  }
  status.className = `member-status ${online ? "online" : "offline"}`;
  status.innerHTML = `<div class="ec-member-presence-line"><span class="ec-member-presence-dot" aria-hidden="true"></span><span class="ec-member-presence-label">${online ? onlineLabel : "Offline"}</span></div>`;
}

function applyCachedStatus() {
  document.querySelectorAll(".member-card").forEach((card) => {
    const memberId = card.dataset.memberId || "";
    const nickname = card.querySelector(".member-nickname")?.textContent?.trim() || "";
    const member = (memberId && memberCacheById.get(memberId)) || (nickname && memberCacheByNickname.get(nickname)) || null;
    if (member) updateCard(card, member);
  });
}

async function refreshOnlineStatus(force = false) {
  if (!supabase) return;
  if (!force && memberCacheById.size && Date.now() - lastLoadedAt < CACHE_TTL_MS) {
    applyCachedStatus();
    return;
  }
  if (refreshRunning) {
    refreshQueued = true;
    return;
  }
  refreshRunning = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase.rpc("community_member_directory");
    if (error) {
      console.warn("Online-Status konnte nicht aktualisiert werden:", error.message);
      return;
    }
    const members = parseRows(data);
    memberCacheById = new Map(members.filter((member) => member?.id).map((member) => [String(member.id), member]));
    memberCacheByNickname = new Map(members.filter((member) => member?.nickname).map((member) => [String(member.nickname).trim(), member]));
    lastLoadedAt = Date.now();
    applyCachedStatus();
    window.dispatchEvent(new CustomEvent("ec:presence-refreshed", { detail: { members } }));
  } finally {
    refreshRunning = false;
    if (refreshQueued) {
      refreshQueued = false;
      setTimeout(() => void refreshOnlineStatus(true), 0);
    }
  }
}

function scheduleRefresh(force = false, delay = 30) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshOnlineStatus(force), delay);
}

window.addEventListener("ec:navigate", () => scheduleRefresh(false, 60));
window.addEventListener("ec:region-change", () => scheduleRefresh(true, 80));
window.addEventListener("focus", () => scheduleRefresh(true, 30));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleRefresh(true, 30); });
new MutationObserver(() => { if (memberCacheById.size) applyCachedStatus(); }).observe(document.documentElement, { childList: true, subtree: true });
window.setInterval(() => scheduleRefresh(true, 0), 20_000);

if (supabase) {
  const channel = supabase.channel("ec-member-online-status-sync")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => scheduleRefresh(true, 80))
    .subscribe();
  window.addEventListener("pagehide", () => supabase.removeChannel(channel), { once: true });
}

scheduleRefresh(true, 0);
