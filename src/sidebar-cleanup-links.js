const LABELS_TO_HIDE = [
  "startseite","mitglieder","freunde","anfragen","blockiert","nachrichten","neuigkeiten","community","gruppen","forum","mein profil",
  "meine daten & konto","hilfe & community","admin-zentrale","admin tools","benachrichtigungen","rechtliche beweissicherung"
];

const iconSvg = {
  notifications:'<svg viewBox="0 0 24 24"><path d="M6 17h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V15zM10 20h4"/></svg>',
  legal:'<svg viewBox="0 0 24 24"><path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z"/><path d="M8.5 12.5 11 15l4.5-5"/></svg>'
};

const norm = (value) => String(value || "").replace(/\s+/g," ").trim().toLowerCase();
const allClickable = () => [...document.querySelectorAll("button,a")];
const findOriginal = (label) => allClickable().find((node) => !node.closest(".ec-sidebar-shell") && norm(node.textContent).includes(label));

function addIcon(blockSelector, key, title, source, svg) {
  const block = document.querySelector(blockSelector);
  if (!block || !source || block.querySelector(`[data-key="${key}"]`)) return;
  const grid = block.querySelector(".ec-icon-grid,.ec-admin-icon-grid") || block;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ec-function-icon";
  button.dataset.key = key;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = svg;
  button.addEventListener("click", () => {
    source.click();
    if (window.matchMedia("(max-width: 900px)").matches) {
      setTimeout(() => document.querySelector(".modern-main")?.scrollIntoView({ behavior:"smooth", block:"start" }), 80);
    }
  });
  grid.appendChild(button);
}

function ensureIcons() {
  const notificationSource = findOriginal("benachrichtigungen");
  const legalSource = findOriginal("rechtliche beweissicherung");
  addIcon(".ec-community-block", "benachrichtigungen", "Benachrichtigungen", notificationSource, iconSvg.notifications);
  addIcon(".ec-admin-block", "legal-evidence", "Rechtliche Beweissicherung", legalSource, iconSvg.legal);
}

function hideDuplicates() {
  if (!document.querySelector(".ec-sidebar-shell")) return;
  allClickable().forEach((node) => {
    if (node.closest(".ec-sidebar-shell") || node.classList.contains("sidebar-logout")) return;
    const text = norm(node.textContent);
    if (LABELS_TO_HIDE.some((label) => text === label || text.startsWith(label))) {
      node.classList.add("ec-original-nav-hidden");
    }
  });
}

function openMemberByNickname(nickname) {
  const membersIcon = document.querySelector('.ec-sidebar-shell [data-key="mitglieder"]');
  if (!membersIcon) return false;
  membersIcon.click();
  let tries = 0;
  const targetName = norm(nickname);
  const findAndOpen = () => {
    const card = [...document.querySelectorAll(".member-card")].find((entry) => norm(entry.querySelector(".member-nickname")?.textContent) === targetName);
    if (card) {
      card.click();
      if (window.matchMedia("(max-width: 900px)").matches) setTimeout(() => document.querySelector(".modern-main")?.scrollIntoView({behavior:"smooth",block:"start"}), 80);
      return;
    }
    if (tries++ < 25) setTimeout(findAndOpen, 80);
  };
  setTimeout(findAndOpen, 40);
  return true;
}

document.addEventListener("click", (event) => {
  const link = event.target.closest(".ec-sidebar-shell .ec-profile-link");
  if (!link) return;
  const nickname = link.textContent?.trim();
  if (!nickname) return;
  event.preventDefault();
  event.stopPropagation();
  openMemberByNickname(nickname);
}, true);

function sync() {
  ensureIcons();
  hideDuplicates();
}

let queued = false;
const observer = new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; sync(); });
});
observer.observe(document.documentElement, { childList:true, subtree:true });
window.addEventListener("load", sync);
setTimeout(sync, 150);
setTimeout(sync, 700);
