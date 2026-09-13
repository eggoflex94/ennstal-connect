import { supabase } from "./supabaseClient";

const FIVE_MINUTES = 5 * 60 * 1000;
let cache = new Map();
let timer = null;
let running = false;

const parseRows = (rows) => (rows || []).map((row) => typeof row === "string" ? JSON.parse(row) : row);
const isOnline = (member) => Boolean(member?.is_online && member?.last_active_at && Date.now() - new Date(member.last_active_at).getTime() < FIVE_MINUTES);

function paintCard(card, member) {
  if (!card || !member || member.hide_online_status) return;
  const online = isOnline(member);
  const status = card.querySelector(":scope > .member-status");
  if (status) {
    status.classList.toggle("online", online);
    status.classList.toggle("offline", !online);
    const label = status.querySelector(".ec-member-presence-label");
    if (label) label.textContent = online ? "Online" : "Offline";
  }
  const dot = card.querySelector(".ec-avatar-presence");
  if (dot) {
    dot.classList.toggle("online", online);
    dot.classList.toggle("offline", !online);
  }
}

function apply() {
  document.querySelectorAll(".member-card[data-member-id]").forEach((card) => {
    const member = cache.get(card.dataset.memberId);
    if (member) paintCard(card, member);
  });
}

async function refresh() {
  if (!supabase || running) return;
  running = true;
  try {
    const { data, error } = await supabase.rpc("community_member_directory");
    if (error) return;
    cache = new Map(parseRows(data).filter((member) => member?.id).map((member) => [String(member.id), member]));
    apply();
  } finally {
    running = false;
  }
}

function schedule(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), delay);
}

window.addEventListener("ec:navigate", () => schedule());
window.addEventListener("ec:region-change", () => schedule());
window.addEventListener("focus", () => schedule(20));
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(20); });
window.setInterval(() => void refresh(), 20000);

if (supabase) {
  const channel = supabase.channel("ec-member-online-status-sync")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => schedule(40))
    .subscribe();
  window.addEventListener("pagehide", () => supabase.removeChannel(channel), { once: true });
}

void refresh();
