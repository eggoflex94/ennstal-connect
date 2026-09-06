import { supabase } from "./supabaseClient";

const VISIT_KEY = "ec:last-visit";
const FAVORITES_KEY = "ec:favorites";
let currentUserId = null;
let lastVisit = null;
let refreshBusy = false;

function storageKey() { return currentUserId ? `${FAVORITES_KEY}:${currentUserId}` : FAVORITES_KEY; }
function readFavorites() { try { return JSON.parse(localStorage.getItem(storageKey()) || "[]"); } catch { return []; } }
function writeFavorites(items) { localStorage.setItem(storageKey(), JSON.stringify(items.slice(0, 30))); }
function escapeText(value) { return String(value || "").trim(); }

function navTo(label) {
  const button = [...document.querySelectorAll(".modern-nav button")].find((node) => node.textContent?.trim().includes(label));
  button?.click();
}

function homeRoot() { return document.querySelector(".home-page"); }

function makeStat(label, value, actionLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ec-quick-stat";
  button.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
  if (actionLabel) button.addEventListener("click", () => navTo(actionLabel));
  return button;
}

function renderQuickOverview(data) {
  const home = homeRoot();
  if (!home) return;
  let panel = home.querySelector(".ec-member-overview");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ec-member-overview panel";
    const anchor = home.querySelector(".engagement-grid") || home.querySelector(".page-heading")?.nextElementSibling;
    if (anchor) home.insertBefore(panel, anchor);
    else home.prepend(panel);
  }
  panel.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "ec-member-overview-head";
  heading.innerHTML = '<div><span class="eyebrow">DEIN ÜBERBLICK</span><h2>Auf einen Blick</h2></div><small>Direkt zu den wichtigsten Bereichen</small>';
  const grid = document.createElement("div");
  grid.className = "ec-quick-grid";
  grid.append(
    makeStat("Neue Nachrichten", data.unreadMessages, "Nachrichten"),
    makeStat("Freundschaftsanfragen", data.friendRequests, "Anfragen"),
    makeStat("Neue Inhalte", data.newTotal, "Community"),
    makeStat("Merkliste", readFavorites().length, null)
  );
  if (data.nextEvent) {
    const event = document.createElement("button");
    event.type = "button";
    event.className = "ec-next-event";
    event.innerHTML = `<span>NÄCHSTER TERMIN</span><strong>${escapeText(data.nextEvent.title)}</strong><small>${new Date(data.nextEvent.event_at).toLocaleString("de-AT")}</small>`;
    event.addEventListener("click", () => navTo("Community"));
    grid.appendChild(event);
  }
  panel.append(heading, grid);
}

function renderNewSinceLast(data) {
  const home = homeRoot();
  if (!home) return;
  let panel = home.querySelector(".ec-new-since");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ec-new-since panel";
    const overview = home.querySelector(".ec-member-overview");
    overview?.insertAdjacentElement("afterend", panel);
  }
  if (!panel) return;
  panel.replaceChildren();
  const title = document.createElement("div");
  title.className = "ec-new-since-head";
  title.innerHTML = `<div><span class="eyebrow">SEIT DEINEM LETZTEN BESUCH</span><h2>${data.newTotal ? `${data.newTotal} neue Inhalte` : "Du bist auf dem Laufenden"}</h2></div>`;
  const items = document.createElement("div");
  items.className = "ec-new-since-grid";
  [["Neuigkeiten", data.newsCount, "Neuigkeiten"],["Forum", data.forumCount, "Forum"],["Veranstaltungen", data.eventCount, "Community"],["Gruppen", data.groupCount, "Gruppen"]].forEach(([label,count,nav]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<strong>${count}</strong><span>${label}</span>`;
    button.addEventListener("click", () => navTo(nav));
    items.appendChild(button);
  });
  panel.append(title, items);
}

function itemKey(type, id, title) { return `${type}:${id || title}`; }

function toggleFavorite(item) {
  const items = readFavorites();
  const key = itemKey(item.type, item.id, item.title);
  const exists = items.some((x) => itemKey(x.type, x.id, x.title) === key);
  const next = exists ? items.filter((x) => itemKey(x.type, x.id, x.title) !== key) : [{ ...item, savedAt: new Date().toISOString() }, ...items];
  writeFavorites(next);
  decorateFavorites();
  renderFavoritesPanel();
  refreshOverviewOnly();
}

function addFavoriteButton(card, item) {
  if (!card || card.querySelector(":scope > .ec-favorite-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ec-favorite-button";
  const isSaved = readFavorites().some((x) => itemKey(x.type, x.id, x.title) === itemKey(item.type, item.id, item.title));
  button.textContent = isSaved ? "★ Gemerkt" : "☆ Merken";
  button.classList.toggle("saved", isSaved);
  button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); toggleFavorite(item); });
  card.appendChild(button);
}

function decorateFavorites() {
  document.querySelectorAll(".group-card").forEach((card, index) => {
    const title = card.querySelector("h2")?.textContent?.trim(); if (!title) return;
    addFavoriteButton(card, { type: "Gruppe", id: card.dataset.groupId || `group-${index}-${title}`, title, nav: "Gruppen" });
  });
  document.querySelectorAll(".forum-post").forEach((card, index) => {
    const title = card.querySelector("h2")?.textContent?.trim(); if (!title) return;
    addFavoriteButton(card, { type: "Forum", id: card.dataset.postId || `post-${index}-${title}`, title, nav: "Forum" });
  });
  document.querySelectorAll(".community-hub-grid .hub-row").forEach((row, index) => {
    const title = row.querySelector("strong")?.textContent?.trim(); if (!title) return;
    addFavoriteButton(row, { type: "Veranstaltung", id: row.dataset.eventId || `event-${index}-${title}`, title, nav: "Community" });
  });
}

function renderFavoritesPanel() {
  const home = homeRoot();
  if (!home) return;
  let panel = home.querySelector(".ec-favorites-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "ec-favorites-panel panel";
    const newPanel = home.querySelector(".ec-new-since");
    newPanel?.insertAdjacentElement("afterend", panel);
  }
  if (!panel) return;
  const items = readFavorites();
  panel.replaceChildren();
  const head = document.createElement("div");
  head.className = "ec-favorites-head";
  head.innerHTML = `<div><span class="eyebrow">MEINE MERKLISTE</span><h2>${items.length ? `${items.length} gespeichert` : "Noch nichts gemerkt"}</h2></div>`;
  panel.appendChild(head);
  if (!items.length) {
    const empty = document.createElement("p"); empty.className = "ec-favorites-empty"; empty.textContent = "Mit ☆ Merken kannst du Gruppen, Forenbeiträge und Veranstaltungen hier sammeln."; panel.appendChild(empty); return;
  }
  const list = document.createElement("div"); list.className = "ec-favorites-list";
  items.slice(0, 8).forEach((item) => {
    const row = document.createElement("div");
    const open = document.createElement("button"); open.type = "button"; open.className = "ec-favorite-open"; open.innerHTML = `<small>${escapeText(item.type)}</small><strong>${escapeText(item.title)}</strong>`; open.addEventListener("click", () => navTo(item.nav));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "ec-favorite-remove"; remove.textContent = "×"; remove.title = "Aus Merkliste entfernen"; remove.addEventListener("click", () => toggleFavorite(item));
    row.append(open, remove); list.appendChild(row);
  });
  panel.appendChild(list);
}

async function loadOverviewData() {
  if (!supabase || !currentUserId) return null;
  const since = lastVisit || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const [messages, requests, news, forum, eventsNew, groupsNew, nextEvent] = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("receiver_id", currentUserId).eq("is_read", false),
    supabase.from("friendships").select("id", { count: "exact", head: true }).eq("receiver_id", currentUserId).eq("status", "PENDING"),
    supabase.from("news").select("id", { count: "exact", head: true }).gt("created_at", since),
    supabase.from("forum_posts").select("id", { count: "exact", head: true }).eq("scope", "COMMUNITY").gt("created_at", since),
    supabase.from("community_events").select("id", { count: "exact", head: true }).gt("created_at", since),
    supabase.from("community_groups").select("id", { count: "exact", head: true }).gt("created_at", since),
    supabase.from("community_events").select("id,title,event_at").gte("event_at", now).neq("status", "CANCELLED").order("event_at", { ascending: true }).limit(1).maybeSingle()
  ]);
  const safeCount = (result) => result?.error ? 0 : Number(result?.count || 0);
  const result = {
    unreadMessages: safeCount(messages), friendRequests: safeCount(requests), newsCount: safeCount(news), forumCount: safeCount(forum), eventCount: safeCount(eventsNew), groupCount: safeCount(groupsNew), nextEvent: nextEvent?.error ? null : nextEvent?.data || null
  };
  result.newTotal = result.newsCount + result.forumCount + result.eventCount + result.groupCount;
  return result;
}

async function refreshOverviewOnly() {
  if (!homeRoot()) return;
  const data = await loadOverviewData();
  if (!data) return;
  renderQuickOverview(data);
}

async function refreshAll() {
  if (refreshBusy || !homeRoot()) return;
  refreshBusy = true;
  try {
    const data = await loadOverviewData();
    if (!data) return;
    renderQuickOverview(data);
    renderNewSinceLast(data);
    renderFavoritesPanel();
    decorateFavorites();
  } catch (error) {
    console.warn("Mitglieder-Erweiterungen konnten nicht geladen werden:", error);
  } finally {
    refreshBusy = false;
  }
}

async function boot() {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  currentUserId = user.id;
  lastVisit = localStorage.getItem(`${VISIT_KEY}:${currentUserId}`) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await refreshAll();
  window.setTimeout(() => localStorage.setItem(`${VISIT_KEY}:${currentUserId}`, new Date().toISOString()), 10000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();

const observer = new MutationObserver(() => {
  if (homeRoot()) window.requestAnimationFrame(refreshAll);
  else window.requestAnimationFrame(decorateFavorites);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("focus", refreshAll);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
