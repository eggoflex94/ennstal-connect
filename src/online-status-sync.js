import { supabase } from "./supabaseClient";

const FIVE_MINUTES = 5 * 60 * 1000;
let refreshRunning = false;
let refreshQueued = false;

const parseRows = (rows) => (rows || []).map((row) =>
  typeof row === "string" ? JSON.parse(row) : row
);

const isOnline = (member) => Boolean(
  member?.is_online &&
  member?.last_active_at &&
  Date.now() - new Date(member.last_active_at).getTime() < FIVE_MINUTES
);

const updateCard = (card, member) => {
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
  status.replaceChildren(dot, document.createTextNode(online ? "Online" : "Offline"));

  if (!online && member.last_active_at) {
    const lastActive = document.createElement("small");
    lastActive.textContent = `zuletzt aktiv ${new Date(member.last_active_at).toLocaleString("de-AT", {
      dateStyle: "short",
      timeStyle: "short"
    })}`;
    status.appendChild(lastActive);
  }
};

async function refreshOnlineStatus() {
  if (!supabase) return;
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

    const byNickname = new Map(
      parseRows(data)
        .filter((member) => member?.nickname)
        .map((member) => [String(member.nickname).trim(), member])
    );

    document.querySelectorAll(".member-card").forEach((card) => {
      const nickname = card.querySelector(".member-nickname")?.textContent?.trim();
      if (!nickname) return;
      const member = byNickname.get(nickname);
      if (member) updateCard(card, member);
    });
  } finally {
    refreshRunning = false;
    if (refreshQueued) {
      refreshQueued = false;
      window.setTimeout(() => void refreshOnlineStatus(), 0);
    }
  }
}

const scheduleRefresh = () => window.setTimeout(() => void refreshOnlineStatus(), 0);

const observer = new MutationObserver(() => scheduleRefresh());
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("focus", scheduleRefresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleRefresh();
});

window.setInterval(() => void refreshOnlineStatus(), 30_000);

if (supabase) {
  const channel = supabase
    .channel("ec-member-online-status-sync")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, scheduleRefresh)
    .subscribe();

  window.addEventListener("pagehide", () => {
    supabase.removeChannel(channel);
  }, { once: true });
}

scheduleRefresh();
