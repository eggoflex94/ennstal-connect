import { supabase } from "./supabaseClient";

const FIVE_MINUTES = 5 * 60 * 1000;
let refreshRunning = false;
let refreshQueued = false;
let lastLoadedAt = 0;
let memberCache = new Map();
let refreshTimer = null;

const parseRows = (rows) => (rows || []).map((row) => typeof row === "string" ? JSON.parse(row) : row);
const isOnline = (member) => Boolean(member?.is_online && member?.last_active_at && Date.now() - new Date(member.last_active_at).getTime() < FIVE_MINUTES);

function updateCard(card, member) {
  if (!card || !member) return;
  let status = card.querySelector(".member-status");
  if (member.hide_online_status) {
    status?.remove();
    return;
  }
  if (!status) {
    status = document.createElement("div");
    const messageButton = card.querySelector(".member-message");
    if (messageButton) card.insertBefore(status, messageButton);
    else card.appendChild(status);
  }
  const online = isOnline(member);
  status.className = `member-status ${online ? "online" : "offline"}`;
  const dot = document.createElement("span");
  const onlineLabel = String(member.presence_device || '').toUpperCase() === "MOBILE" ? "Mobil online" : "Online";
  status.replaceChildren(dot, document.createTextNode(online ? onlineLabel : "Offline"));
  if (!online && member.last_active_at) {
    const lastActive = document.createElement("small");
    lastActive.textContent = `zuletzt aktiv ${new Date(member.last_active_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}`;
    status.appendChild(lastActive);
  }
}

function applyCachedStatus() {
  document.querySelectorAll(".member-card").forEach((card) => {
    const nickname = card.querySelector(".member-nickname")?.textContent?.trim();
    const member = nickname ? memberCache.get(nickname) : null;
    if (member) updateCard(card, member);
  });
}

async function refreshOnlineStatus(force = false) {
  if (!supabase) return;
  if (!force && memberCache.size && Date.now() - lastLoadedAt < 120000) {
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
    memberCache = new Map(parseRows(data).filter((member) => member?.nickname).map((member) => [String(member.nickname).trim(), member]));
    lastLoadedAt = Date.now();
    applyCachedStatus();
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
window.addEventListener("focus", () => scheduleRefresh(Date.now() - lastLoadedAt > 120000, 30));
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleRefresh(Date.now() - lastLoadedAt > 120000, 30); });
window.setInterval(applyCachedStatus, 60_000);

if (supabase) {
  const channel = supabase.channel("ec-member-online-status-sync")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => scheduleRefresh(true, 120))
    .subscribe();
  window.addEventListener("pagehide", () => supabase.removeChannel(channel), { once: true });
}

scheduleRefresh(true, 0);
