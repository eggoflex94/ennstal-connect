const AREAS = [
  { key: "home", label: "Startseite", icon: "⌂", selector: ".home-page" },
  { key: "community", label: "Community", icon: "✦", selector: ".community-hub" },
  { key: "groups", label: "Gruppen", icon: "◉", selector: ".groups-page" },
  { key: "forum", label: "Forum", icon: "▤", selector: ".forum-page" },
];

const sidebarButton = (label) => [...document.querySelectorAll(".modern-nav button")]
  .find((button) => button.querySelector("span")?.textContent?.trim() === label);

function currentArea(root) {
  if (root.querySelector(":scope > .forum-page")?.querySelector("h1")?.textContent?.includes("Admin-Forum")) return null;
  return AREAS.find((area) => root.querySelector(`:scope > ${area.selector}`)) || null;
}

function syncCommunityOverview() {
  const root = document.querySelector(".content-root");
  if (!root) return;
  const area = currentArea(root);
  const existingNav = root.querySelector(":scope > .community-section-nav");
  if (area && existingNav && root.classList.contains(`page-${area.key}`)) {
    sidebarButton(area.label)?.classList.add("active");
    return;
  }
  root.classList.remove(...AREAS.map(({ key }) => `page-${key}`));
  existingNav?.remove();
  document.querySelectorAll(".modern-nav button.active").forEach((button) => button.classList.remove("active"));
  if (!area) return;

  root.classList.add(`page-${area.key}`);
  sidebarButton(area.label)?.classList.add("active");

  const nav = document.createElement("nav");
  nav.className = "community-section-nav";
  nav.setAttribute("aria-label", "Community-Bereiche");
  AREAS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.key === area.key ? "active" : "";
    button.setAttribute("aria-current", item.key === area.key ? "page" : "false");
    button.innerHTML = `<span aria-hidden="true">${item.icon}</span>${item.label}`;
    button.addEventListener("click", () => sidebarButton(item.label)?.click());
    nav.appendChild(button);
  });
  root.prepend(nav);
}

let queued = false;
const observer = new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncCommunityOverview();
  });
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("DOMContentLoaded", syncCommunityOverview, { once: true });
