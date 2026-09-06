import { supabase } from "./supabaseClient";

let userId = null;
let running = false;
let queued = false;
let channel = null;

const getShell = () => document.querySelector(".ec-sidebar-shell");
const getButton = (key) => getShell()?.querySelector(`[data-key="${key}"]`);

function setBadge(button, count) {
  if (!button) return;
  let badge = button.querySelector(".ec-icon-badge");
  if (!count) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "ec-icon-badge";
    button.appendChild(badge);
  }
  badge.textContent = count > 99 ? "99+" : String(count);
}

async function syncBadges() {
  if (!supabase || !userId) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    const [messagesResult, requestsResult] = await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("is_read", false),
      supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .in("status", ["pending", "PENDING"])
    ]);

    if (!messagesResult.error) setBadge(getButton("nachrichten"), messagesResult.count || 0);
    if (!requestsResult.error) setBadge(getButton("anfragen") || getButton("freunde"), requestsResult.count || 0);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      setTimeout(syncBadges, 0);
    }
  }
}

function scheduleBurst() {
  [0, 120, 350, 900, 1800].forEach((delay) => setTimeout(syncBadges, delay));
}

async function init() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  userId = user.id;

  scheduleBurst();

  document.addEventListener("click", (event) => {
    if (event.target.closest('.ec-function-icon[data-key="nachrichten"], .message-preview, .incoming-message-popup button, .chat-box')) {
      scheduleBurst();
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleBurst();
  });
  window.addEventListener("focus", scheduleBurst);

  channel = supabase
    .channel(`ec-sidebar-badges-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${userId}` }, scheduleBurst)
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, scheduleBurst)
    .subscribe();

  window.setInterval(syncBadges, 5000);
}

const observer = new MutationObserver(() => {
  if (userId && getShell()) scheduleBurst();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

init();

window.addEventListener("pagehide", () => {
  observer.disconnect();
  if (channel) supabase.removeChannel(channel);
}, { once: true });
