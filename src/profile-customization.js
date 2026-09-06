import { supabase } from "./supabaseClient";

const REWARD_LAYOUTS = [
  ["standard", "Standard – Ennstal", 0],
  ["alpine", "Alpen – Berggrün", 2],
  ["aurora", "Aurora – Violett", 5],
  ["ocean", "Ozean – Tiefblau", 10],
  ["slate", "Schiefer – Anthrazit", 15],
  ["ember", "Ember – Warmes Orange", 20],
  ["redwood", "Bergrot – Alpinrot", 25],
  ["lavender", "Lavendel – Sanftes Violett", 30],
  ["midnight", "Mitternacht – Nachtblau", 35],
  ["sunrise", "Sonnenaufgang – Goldrosa", 40],
  ["neon", "Neon Connect – Leuchtfarben", 50]
];

const OLD_LAYOUT_HOURS = {
  standard: 0,
  alpine: 5,
  aurora: 20,
  ocean: 35,
  slate: 50,
  ember: 70,
  redwood: 90,
  lavender: 110,
  midnight: 130,
  sunrise: 150,
  neon: 180
};

const NEW_LAYOUT_HOURS = Object.fromEntries(REWARD_LAYOUTS.map(([value, , hours]) => [value, hours]));

function onlineHoursFrom(section) {
  const match = section?.textContent?.match(/Onlinezeit:\s*(\d+)\s*Stunden/i);
  return match ? Number(match[1]) : null;
}

function enhanceProfileRewards() {
  const select = document.querySelector('select[name="profile_layout"]');
  if (!select) return;
  const section = select.closest(".layout-rewards");
  if (!section) return;

  const currentValue = select.value || "standard";
  const hours = onlineHoursFrom(section);
  const freeLayouts = hours === null;

  select.innerHTML = "";
  REWARD_LAYOUTS.forEach(([value, label, requiredHours]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${label}${freeLayouts || hours >= requiredHours ? "" : ` · ab ${requiredHours} Stunden`}`;
    option.disabled = !freeLayouts && hours < requiredHours;
    select.appendChild(option);
  });
  select.value = currentValue;

  const paragraph = section.querySelector("p");
  if (paragraph && hours !== null) {
    paragraph.textContent = `Onlinezeit: ${hours} Stunden · Neue Designs werden jetzt schneller freigeschaltet. Neon Connect ist ab 50 Stunden verfügbar.`;
  }
  section.dataset.rewardThresholds = "fast";
}

function enhanceAuthPage() {
  const list = document.querySelector(".auth-feature-list");
  if (!list) return;

  const first = list.firstElementChild;
  const firstTitle = first?.querySelector("b");
  const firstText = first?.querySelector("span");
  if (firstTitle && /Head Admin/i.test(firstTitle.textContent || "")) firstTitle.textContent = "♛ Betreiber";
  if (firstText && /Verantwortlich|Sicherheit|Regeln|Unterstützung/i.test(firstText.textContent || "")) firstText.textContent = "Ennstal Connect.";

  if (!list.querySelector("[data-auth-rewards]")) {
    const reward = document.createElement("div");
    reward.dataset.authRewards = "true";
    reward.innerHTML = "<b>🎨 Schnellere Profil-Belohnungen</b><span>Neue Community-Layouts werden schon nach wenigen Online-Stunden freigeschaltet. Neon Connect gibt es bereits ab 50 Stunden.</span>";
    list.appendChild(reward);
  }
}

async function saveNewlyUnlockedLayout(layout) {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  const { error } = await supabase.from("profiles").update({ profile_layout: layout }).eq("id", user.id);
  if (error) {
    console.error("Neues Profil-Layout konnte nicht gespeichert werden:", error);
    return;
  }
  const select = document.querySelector('select[name="profile_layout"]');
  if (select) select.value = layout;
}

function handleProfileSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const select = form.querySelector('select[name="profile_layout"]');
  if (!select) return;

  const section = select.closest(".layout-rewards");
  const hours = onlineHoursFrom(section);
  if (hours === null) return;

  const requested = select.value;
  const newRequired = NEW_LAYOUT_HOURS[requested] ?? 0;
  const oldRequired = OLD_LAYOUT_HOURS[requested] ?? 0;
  if (hours < newRequired || hours >= oldRequired) return;

  const fallback = [...REWARD_LAYOUTS]
    .map(([value]) => value)
    .filter((value) => (OLD_LAYOUT_HOURS[value] ?? 0) <= hours)
    .pop() || "standard";

  // App.jsx still validates the original thresholds during its own submit
  // handler. Save all regular profile fields through that existing flow with
  // a currently valid fallback and persist the newly unlocked layout right
  // afterwards.
  select.value = fallback;
  window.setTimeout(() => saveNewlyUnlockedLayout(requested), 1200);
}

function applyEnhancements() {
  enhanceProfileRewards();
  enhanceAuthPage();
}

document.addEventListener("submit", handleProfileSubmit, true);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyEnhancements, { once: true });
} else {
  applyEnhancements();
}

const observer = new MutationObserver(() => applyEnhancements());
observer.observe(document.documentElement, { childList: true, subtree: true });
